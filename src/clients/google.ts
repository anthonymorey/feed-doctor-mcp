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
  severity?: 'DISAPPROVED' | 'DEMOTED' | 'UNAFFECTED' | 'WARNING' | string;
  resolution?: string;
  attribute?: string;
  reportingContext?: string;
  description?: string;
  detail?: string;
  documentation?: string;
  applicableCountries?: string[];
}

export interface GoogleProductRaw {
  name?: string; // "accounts/123456789/products/en~US~SKU-101"
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  channel?: string;
  attributes?: {
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
  };
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
      throw new Error('Merchant service request failed.');
    }

    return (await response.json()) as T;
  }

  async listAccounts(): Promise<GoogleAccountRaw[]> {
    const data = await this.getJson<{ accounts?: GoogleAccountRaw[] }>(
      '/accounts/v1beta/accounts'
    );
    return data.accounts ?? [];
  }

  async listAccountIssues(accountId: string): Promise<GoogleAccountIssueRaw[]> {
    const cleanId = accountId.replace(/^accounts\//, '');
    const data = await this.getJson<{ accountIssues?: GoogleAccountIssueRaw[] }>(
      `/accounts/v1beta/accounts/${encodeURIComponent(cleanId)}/issues`
    );
    return data.accountIssues ?? [];
  }

  async listDataSources(accountId: string): Promise<GoogleDataSourceRaw[]> {
    const cleanId = accountId.replace(/^accounts\//, '');
    const data = await this.getJson<{ dataSources?: GoogleDataSourceRaw[] }>(
      `/datasources/v1beta/accounts/${encodeURIComponent(cleanId)}/dataSources`
    );
    return data.dataSources ?? [];
  }

  async listProducts(accountId: string): Promise<GoogleProductRaw[]> {
    const cleanId = accountId.replace(/^accounts\//, '');
    const data = await this.getJson<{ products?: GoogleProductRaw[] }>(
      `/products/v1beta/accounts/${encodeURIComponent(cleanId)}/products`
    );
    return data.products ?? [];
  }
}
