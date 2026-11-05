import type { FetchLike } from '../types.js';

export interface GoogleAccountRaw {
  name?: string; // e.g. "accounts/123456789"
  accountId?: string;
  accountName?: string;
  homepage?: string;
  adultContent?: boolean;
  aggregatorId?: string;
}

export interface GoogleAccountIssueRaw {
  name?: string;
  title?: string;
  code?: string;
  severity?: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | string;
  detail?: string;
  documentation?: string;
  impactedDestinations?: Array<{
    reportingContext?: string;
    impacts?: Array<{
      regionCode?: string;
      severity?: string;
    }>;
  }>;
}

export interface GoogleDataSourceRaw {
  name?: string; // e.g. "accounts/123456789/dataSources/98765"
  dataSourceId?: string;
  displayName?: string;
  primaryProductDataSource?: {
    channel?: string;
    feedLabel?: string;
    contentLanguage?: string;
    countries?: string[];
  };
  supplementalProductDataSource?: {
    feedLabel?: string;
    contentLanguage?: string;
  };
  fileInput?: {
    fileName?: string;
    fetchSettings?: {
      enabled?: boolean;
      fetchUri?: string;
    };
  };
  latestFileUpload?: {
    processingState?: 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED' | 'PARTIAL_FAILURE' | string;
    itemsTotal?: number | string;
    itemsCreated?: number | string;
    itemsUpdated?: number | string;
    uploadTime?: string;
    issues?: Array<{
      title?: string;
      description?: string;
      code?: string;
      count?: number;
      severity?: string;
    }>;
  };
}

export interface GooglePriceRaw {
  amountMicros?: string | number;
  value?: string | number;
  currencyCode?: string;
  currency?: string;
}

export interface GoogleItemLevelIssueRaw {
  code: string;
  // v1: NOT_IMPACTED | DEMOTED | DISAPPROVED (legacy fixtures may use UNAFFECTED / WARNING)
  severity?: 'NOT_IMPACTED' | 'DISAPPROVED' | 'DEMOTED' | 'UNAFFECTED' | 'WARNING' | string;
  resolution?: string;
  attribute?: string;
  reportingContext?: string;
  description?: string;
  detail?: string;
  documentation?: string;
  applicableCountries?: string[];
}

export interface GoogleProductAttributesRaw {
  title?: string;
  description?: string;
  link?: string;
  imageLink?: string;
  availability?: string;
  condition?: string;
  brand?: string;
  gtin?: string | string[];
  mpn?: string;
  price?: GooglePriceRaw;
  salePrice?: GooglePriceRaw;
  shippingWeight?: {
    value?: number;
    unit?: string;
  };
}

export interface GoogleProductRaw {
  name?: string; // "accounts/123456789/products/en~US~SKU-101"
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  /** Legacy (pre-v1) only; v1 products have no channel field. */
  channel?: string;
  /** Merchant API v1 product attributes. */
  productAttributes?: GoogleProductAttributesRaw;
  /** Legacy (pre-v1) attribute container, kept for backward compatibility. */
  attributes?: GoogleProductAttributesRaw;
  productStatus?: {
    destinationStatuses?: Array<{
      reportingContext?: string;
      approvedCountries?: string[];
      pendingCountries?: string[];
      disapprovedCountries?: string[];
    }>;
    itemLevelIssues?: GoogleItemLevelIssueRaw[];
    lastUpdateDate?: string;
  };
  priceCompetitiveness?: {
    benchmarkPriceMicros?: string | number;
    benchmarkPriceCurrencyCode?: string;
  };
}

const GOOGLE_MERCHANT_API_BASE = 'https://merchantapi.googleapis.com';
const PAGE_SIZE = 250;
const MAX_ACCOUNT_PAGES = 5;
const MAX_PRODUCT_PAGES = 4;

/**
 * Non-2xx response from a merchant API. Carries only the HTTP status and
 * Google's machine-readable status / reason codes, never the raw body, URL or token.
 */
export class MerchantApiError extends Error {
  readonly httpStatus: number;
  readonly status?: string;
  readonly reason?: string;

  constructor(httpStatus: number, status?: string, reason?: string) {
    super('Merchant service request failed.');
    this.name = 'MerchantApiError';
    this.httpStatus = httpStatus;
    this.status = status;
    this.reason = reason;
  }
}

/** Parses Google's `{error:{status, details:[{reason}]}}` body when present. */
export async function merchantApiErrorFromResponse(
  response: Response
): Promise<MerchantApiError> {
  let status: string | undefined;
  let reason: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: { status?: unknown; message?: unknown; details?: Array<{ reason?: unknown }> };
    };
    // Operational log: HTTP status, Google status/reason and Google's own message only (no token, URL or body).
    const msg = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 300) : '';
    console.warn('merchant_api_error', response.status, body?.error?.status ?? '', msg);
    if (typeof body?.error?.status === 'string') status = body.error.status;
    const first = body?.error?.details?.find((d) => typeof d?.reason === 'string');
    if (first) reason = first.reason as string;
    // Merchant API rejects calls from a Cloud project that has not done the one-time developer registration (registerGcp).
    if (/not registered with the merchant account/i.test(msg)) reason = 'GCP_NOT_REGISTERED';
  } catch {
    // Non-JSON body (e.g. HTML 404); status code alone is enough.
  }
  return new MerchantApiError(response.status, status, reason);
}

export class GoogleMerchantClient {
  private readonly accessToken: string;
  private readonly fetchFn: FetchLike;

  constructor(options: { accessToken: string; fetchFn?: FetchLike }) {
    if (!options.accessToken) {
      throw new Error(
        'Missing Google OAuth access token. Provide Authorization: Bearer <token>, x-google-access-token header, or GOOGLE_ACCESS_TOKEN env var.'
      );
    }
    this.accessToken = options.accessToken;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${GOOGLE_MERCHANT_API_BASE}${path}`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw await merchantApiErrorFromResponse(response);
    }

    return (await response.json()) as T;
  }

  private async listPaged<T>(
    path: string,
    key: string,
    maxPages: number
  ): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (pageToken) query.set('pageToken', pageToken);
      const data = await this.getJson<Record<string, unknown>>(`${path}?${query}`);
      const pageItems = data?.[key];
      if (Array.isArray(pageItems)) items.push(...(pageItems as T[]));
      pageToken =
        typeof data?.nextPageToken === 'string' && data.nextPageToken
          ? data.nextPageToken
          : undefined;
      if (!pageToken) break;
    }
    return items;
  }

  async listAccounts(): Promise<GoogleAccountRaw[]> {
    return this.listPaged<GoogleAccountRaw>(
      '/accounts/v1/accounts',
      'accounts',
      MAX_ACCOUNT_PAGES
    );
  }

  async listAccountIssues(accountId: string): Promise<GoogleAccountIssueRaw[]> {
    const cleanId = accountId.replace(/^accounts\//, '');
    const data = await this.getJson<{ accountIssues?: GoogleAccountIssueRaw[] }>(
      `/accounts/v1/accounts/${encodeURIComponent(cleanId)}/issues`
    );
    return data.accountIssues ?? [];
  }

  async listDataSources(accountId: string): Promise<GoogleDataSourceRaw[]> {
    const cleanId = accountId.replace(/^accounts\//, '');
    const data = await this.getJson<{ dataSources?: GoogleDataSourceRaw[] }>(
      `/datasources/v1/accounts/${encodeURIComponent(cleanId)}/dataSources`
    );
    return data.dataSources ?? [];
  }

  async listProducts(accountId: string): Promise<GoogleProductRaw[]> {
    const cleanId = accountId.replace(/^accounts\//, '');
    return this.listPaged<GoogleProductRaw>(
      `/products/v1/accounts/${encodeURIComponent(cleanId)}/products`,
      'products',
      MAX_PRODUCT_PAGES
    );
  }
}
