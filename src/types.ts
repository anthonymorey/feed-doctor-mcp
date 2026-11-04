export type Platform = 'google' | 'microsoft';

export type ApprovalStatus = 'approved' | 'disapproved' | 'limited' | 'pending';

export type AvailabilityStatus =
  | 'in_stock'
  | 'out_of_stock'
  | 'preorder'
  | 'backorder'
  | 'unknown';

export type IssueSeverity = 'disapproval' | 'warning' | 'demotion';

export type HelpUrlVerification = 'verified-in-local-docs' | 'TODO-verify';

export interface MoneyAmount {
  amount: number;
  currency: string;
  formatted: string;
}

export interface DisapprovalDiagnostic {
  code: string;
  platform: Platform | 'cross_platform';
  severity: IssueSeverity;
  title: string;
  plainEnglishCause: string;
  affectedAttribute: string;
  exampleOffendingValue: string;
  actualOffendingValue?: string;
  fixSteps: string[];
  helpUrl: string;
  helpUrlVerification: HelpUrlVerification;
}

export interface NormalizedProductIssue {
  code: string;
  platform: Platform;
  severity: IssueSeverity;
  attribute?: string;
  destination?: string;
  rawDescription?: string;
  applicableCountries?: string[];
  diagnostic: DisapprovalDiagnostic;
}

export interface NormalizedProduct {
  sku: string;
  platform: Platform;
  platformProductId: string;
  title: string;
  link: string;
  imageLink?: string;
  price?: MoneyAmount;
  salePrice?: MoneyAmount;
  availability: AvailabilityStatus;
  gtin?: string;
  mpn?: string;
  brand?: string;
  condition?: 'new' | 'refurbished' | 'used' | 'unknown';
  contentLanguage?: string;
  targetCountry?: string;
  channel?: string;
  approvalStatus: ApprovalStatus;
  issues: NormalizedProductIssue[];
  priceCompetitiveness?: {
    benchmarkPrice?: MoneyAmount;
    priceDeltaPct?: number;
  };
  lastUpdated?: string;
}

export interface NormalizedAccount {
  platform: Platform;
  accountId: string;
  name: string;
  domain?: string;
  aggregatorId?: string;
  status: 'active' | 'suspended' | 'warning' | 'unknown';
  adultContent?: boolean;
}

export interface NormalizedDataSource {
  platform: Platform;
  accountId: string;
  dataSourceId: string;
  name: string;
  feedType: 'primary' | 'supplemental' | 'auto' | 'catalog';
  processingStatus: 'success' | 'in_progress' | 'failed' | 'warning';
  itemsTotal: number;
  itemsValid: number;
  itemsWithErrors: number;
  lastUploadTime?: string;
  fetchScheduleUrl?: string;
}

export interface NormalizedAccountIssue {
  platform: Platform;
  accountId: string;
  code: string;
  title: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
  affectedDestinations: string[];
  detail?: string;
  documentationUrl?: string;
  diagnostic: DisapprovalDiagnostic;
}

export interface LandingPageSnapshot {
  url: string;
  fetchedAt: string;
  httpStatus: number;
  title?: string;
  price?: MoneyAmount;
  availability: AvailabilityStatus;
  gtin?: string;
  sku?: string;
  brand?: string;
  currency?: string;
  extractionSource: 'json-ld' | 'meta-tags' | 'combined' | 'none';
  rawNotices: string[];
}

export interface CrossFeedDiscrepancy {
  sku: string;
  type:
    | 'approval_asymmetry'
    | 'missing_on_platform'
    | 'price_mismatch'
    | 'availability_mismatch'
    | 'attribute_backfill_opportunity'
    | 'landing_page_price_mismatch'
    | 'landing_page_availability_mismatch';
  severity: 'high' | 'medium' | 'low';
  summary: string;
  googleValue?: string;
  microsoftValue?: string;
  landingPageValue?: string;
  recommendedAction: string;
}

export interface FixPlanItem {
  priority: number;
  category:
    | 'account_blocker'
    | 'landing_page_sync'
    | 'cross_feed_backfill'
    | 'feed_attribute_fix'
    | 'policy_review';
  title: string;
  affectedPlatform: Platform | 'both';
  affectedAttribute: string;
  issueCodes: string[];
  affectedSkuCount: number;
  affectedSkus: string[];
  plainEnglishCause: string;
  steps: string[];
  helpUrls: Array<{
    url: string;
    verification: HelpUrlVerification;
  }>;
  supplementalFeedPatchPreview: Array<{
    sku: string;
    targetPlatform: Platform;
    attribute: string;
    currentValue: string | null;
    suggestedValue: string;
    note: string;
  }>;
}

export interface RequestCredentials {
  googleAccessToken?: string;
  googleMerchantAccountId?: string;
  microsoftAccessToken?: string;
  microsoftDeveloperToken?: string;
  microsoftMerchantId?: string;
  microsoftCustomerId?: string;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;
