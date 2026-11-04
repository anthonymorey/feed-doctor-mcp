import type { FetchLike } from '../types.js';

export interface MicrosoftStoreRaw {
  id?: string | number;
  name?: string;
  domain?: string;
  status?: 'Active' | 'Suspended' | 'PendingVerification' | string;
  adultContent?: boolean;
  issues?: Array<{
    code?: string;
    title?: string;
    severity?: string;
    detail?: string;
    documentationUrl?: string;
  }>;
}

export interface MicrosoftCatalogRaw {
  id?: string | number;
  name?: string;
  feedType?: string;
  processingStatus?: 'Success' | 'InProgress' | 'Failed' | 'Warning' | string;
  itemsTotal?: number;
  itemsValid?: number;
  itemsWithErrors?: number;
  lastUploadTime?: string;
  fetchUrl?: string;
}

export interface MicrosoftOfferIssueRaw {
  code: string;
  severity?: 'Error' | 'Warning' | 'Disapproved' | string;
  attribute?: string;
  description?: string;
  destination?: string;
  documentationUrl?: string;
}

export interface MicrosoftOfferRaw {
  id?: string;
  offerId?: string;
  title?: string;
  link?: string;
  imageLink?: string;
  price?: {
    value?: string | number;
    currency?: string;
  };
  salePrice?: {
    value?: string | number;
    currency?: string;
  };
  availability?: string;
  condition?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  contentLanguage?: string;
  targetCountry?: string;
  channel?: string;
  status?: 'Approved' | 'Disapproved' | 'Limited' | 'Pending' | string;
  itemLevelIssues?: MicrosoftOfferIssueRaw[];
  lastUpdated?: string;
}

const BING_CONTENT_API_BASE =
  'https://content.api.bingads.microsoft.com/shopping/v9.1/bmc';

export class MicrosoftMerchantClient {
  private readonly accessToken: string;
  private readonly developerToken: string;
  private readonly customerId?: string;
  private readonly fetchFn: FetchLike;

  constructor(options: {
    accessToken: string;
    developerToken?: string;
    customerId?: string;
    fetchFn?: FetchLike;
  }) {
    if (!options.accessToken) {
      throw new Error(
        'Missing Microsoft OAuth access token. Provide x-microsoft-access-token header, token bundle, or MICROSOFT_ACCESS_TOKEN env var.'
      );
    }
    this.accessToken = options.accessToken;
    this.developerToken = options.developerToken || 'BING_DEV_TOKEN_DEFAULT';
    this.customerId = options.customerId;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${BING_CONTENT_API_BASE}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      DeveloperToken: this.developerToken,
      Accept: 'application/json'
    };
    if (this.customerId) {
      headers['CustomerId'] = this.customerId;
    }

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error('Merchant service request failed.');
    }

    return (await response.json()) as T;
  }

  async listStores(): Promise<MicrosoftStoreRaw[]> {
    const data = await this.getJson<{ resources?: MicrosoftStoreRaw[]; stores?: MicrosoftStoreRaw[] }>(
      '/stores'
    );
    return data.resources ?? data.stores ?? [];
  }

  async listCatalogs(merchantId: string): Promise<MicrosoftCatalogRaw[]> {
    const data = await this.getJson<{ resources?: MicrosoftCatalogRaw[]; catalogs?: MicrosoftCatalogRaw[] }>(
      `/${encodeURIComponent(merchantId)}/catalogs`
    );
    return data.resources ?? data.catalogs ?? [];
  }

  async listProducts(merchantId: string): Promise<MicrosoftOfferRaw[]> {
    const data = await this.getJson<{ resources?: MicrosoftOfferRaw[]; products?: MicrosoftOfferRaw[] }>(
      `/${encodeURIComponent(merchantId)}/products`
    );
    return data.resources ?? data.products ?? [];
  }
}
