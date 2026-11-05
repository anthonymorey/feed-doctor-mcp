import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { resolveRequestCredentials } from './auth.js';
import { GoogleMerchantClient, MerchantApiError } from './clients/google.js';
import { fetchAndCheckLandingPage } from './clients/landing-page.js';
import { MicrosoftMerchantClient } from './clients/microsoft.js';
import {
  comparePlatforms,
  generateFixPlan,
  normalizeGoogleAccount,
  normalizeGoogleAccountIssue,
  normalizeGoogleDataSource,
  normalizeGoogleProduct,
  normalizeMicrosoftCatalog,
  normalizeMicrosoftProduct,
  normalizeMicrosoftStore,
  normalizeMicrosoftStoreIssues
} from './normalizer.js';
import type {
  FetchLike,
  LandingPageSnapshot,
  NormalizedAccount,
  NormalizedAccountIssue,
  NormalizedDataSource,
  NormalizedProduct,
  RequestCredentials
} from './types.js';

export interface FeedDoctorServerOptions {
  hosted?: boolean;
  authorizeTool?: (name: string) => Promise<boolean>;
  requestHeaders?: Headers | Record<string, string | string[] | undefined>;
  bearerToken?: string;
  env?: NodeJS.ProcessEnv;
  fetchFn?: FetchLike;
}

const CredentialsOverrideSchema = z
  .object({
    googleAccessToken: z
      .string()
      .optional()
      .describe('Optional per-request Google OAuth 2.0 access token (scope: https://www.googleapis.com/auth/content).'),
    googleMerchantAccountId: z
      .string()
      .optional()
      .describe('Optional Google Merchant Center account ID (e.g., "123456789").'),
    microsoftAccessToken: z
      .string()
      .optional()
      .describe('Optional per-request Microsoft Advertising OAuth 2.0 access token (scope: https://ads.microsoft.com/msads.manage).'),
    microsoftDeveloperToken: z
      .string()
      .optional()
      .describe('Optional Microsoft Advertising Developer Token.'),
    microsoftMerchantId: z
      .string()
      .optional()
      .describe('Optional Microsoft Merchant Center Store ID (e.g., "987654").'),
    microsoftCustomerId: z
      .string()
      .optional()
      .describe('Optional Microsoft Advertising Customer ID.')
  })
  .optional()
  .describe(
    'Optional per-call credential overrides. If omitted, credentials are resolved from the HTTP Authorization Bearer token / headers or self-host environment variables.'
  );

function jsonToolResponse(payload: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
}

const GENERIC_TOOL_ERROR =
  'Unable to complete the request. Check your connection and try again.';
const NO_GOOGLE_ACCOUNTS_WARNING =
  'No Merchant Center account is linked to this Google login.';

/**
 * Maps a tool failure to a safe, actionable message. Only the HTTP status and
 * Google's status/reason codes are inspected; tokens, bodies and URLs are never echoed.
 */
function toolErrorMessage(err: unknown): string {
  if (!(err instanceof MerchantApiError)) return GENERIC_TOOL_ERROR;
  const codes = [err.status, err.reason];
  if (err.httpStatus === 401 || codes.includes('UNAUTHENTICATED')) {
    return 'Google rejected the connection. Reconnect at https://feeds.theownersdesk.net/connect/google.';
  }
  if (err.httpStatus === 403) {
    if (codes.includes('SERVICE_DISABLED')) {
      return 'The Merchant API is not enabled for this FeedDoctor deployment. The operator has been notified.';
    }
    return 'This Google login does not have access to that Merchant Center account.';
  }
  if (err.httpStatus === 404) return 'Merchant Center resource not found.';
  return `${GENERIC_TOOL_ERROR} (Google HTTP ${err.httpStatus})`;
}

function toolErrorResponse(err: unknown) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: toolErrorMessage(err) }]
  };
}

async function loadPlatformData(params: {
  creds: RequestCredentials;
  platformFilter?: 'google' | 'microsoft' | 'both';
  googleAccountId?: string;
  microsoftMerchantId?: string;
  fetchFn?: FetchLike;
  includeDataSources?: boolean;
  includeAccountIssues?: boolean;
  includeProducts?: boolean;
}) {
  const target = params.platformFilter ?? 'both';
  const wantGoogle =
    (target === 'google' || target === 'both') &&
    Boolean(params.creds.googleAccessToken);
  const wantMicrosoft =
    (target === 'microsoft' || target === 'both') &&
    Boolean(params.creds.microsoftAccessToken);

  if (!wantGoogle && !wantMicrosoft) {
    throw new Error(
      'No merchant credentials resolved for the requested platform(s). Pass an OAuth Bearer token / x-google-access-token / x-microsoft-access-token header, per-call credentials, or set GOOGLE_ACCESS_TOKEN / MICROSOFT_ACCESS_TOKEN in self-host mode.'
    );
  }

  const accounts: NormalizedAccount[] = [];
  const accountIssues: NormalizedAccountIssue[] = [];
  const dataSources: NormalizedDataSource[] = [];
  const googleProducts: NormalizedProduct[] = [];
  const microsoftProducts: NormalizedProduct[] = [];
  const warnings: string[] = [];

  if (wantGoogle && params.creds.googleAccessToken) {
    const gClient = new GoogleMerchantClient({
      accessToken: params.creds.googleAccessToken,
      fetchFn: params.fetchFn
    });

    const rawAccounts = await gClient.listAccounts();
    for (const acc of rawAccounts) {
      accounts.push(normalizeGoogleAccount(acc));
    }
    if (rawAccounts.length === 0) {
      warnings.push(NO_GOOGLE_ACCOUNTS_WARNING);
    }

    const effectiveGoogleAccountId =
      params.googleAccountId ||
      params.creds.googleMerchantAccountId ||
      accounts.find((a) => a.platform === 'google')?.accountId;

    if (effectiveGoogleAccountId) {
      if (params.includeAccountIssues) {
        const rawIssues = await gClient.listAccountIssues(effectiveGoogleAccountId);
        for (const iss of rawIssues) {
          accountIssues.push(
            normalizeGoogleAccountIssue(effectiveGoogleAccountId, iss)
          );
        }
      }
      if (params.includeDataSources) {
        const rawDs = await gClient.listDataSources(effectiveGoogleAccountId);
        for (const ds of rawDs) {
          dataSources.push(
            normalizeGoogleDataSource(effectiveGoogleAccountId, ds)
          );
        }
      }
      if (params.includeProducts) {
        const rawProds = await gClient.listProducts(effectiveGoogleAccountId);
        for (const p of rawProds) {
          googleProducts.push(normalizeGoogleProduct(p));
        }
      }
    } else if (
      rawAccounts.length > 0 &&
      (params.includeAccountIssues ||
        params.includeDataSources ||
        params.includeProducts)
    ) {
      warnings.push(
        'No Google Merchant Center account ID found or specified.'
      );
    }
  } else if (target === 'google') {
    throw new Error(
      'Google platform requested, but no Google OAuth access token was provided.'
    );
  }

  if (wantMicrosoft && params.creds.microsoftAccessToken) {
    const mClient = new MicrosoftMerchantClient({
      accessToken: params.creds.microsoftAccessToken,
      developerToken: params.creds.microsoftDeveloperToken,
      customerId: params.creds.microsoftCustomerId,
      fetchFn: params.fetchFn
    });

    const rawStores = await mClient.listStores();
    for (const store of rawStores) {
      accounts.push(normalizeMicrosoftStore(store));
      if (params.includeAccountIssues) {
        accountIssues.push(...normalizeMicrosoftStoreIssues(store));
      }
    }

    const effectiveMsMerchantId =
      params.microsoftMerchantId ||
      params.creds.microsoftMerchantId ||
      accounts.find((a) => a.platform === 'microsoft')?.accountId;

    if (effectiveMsMerchantId) {
      if (params.includeDataSources) {
        const rawCats = await mClient.listCatalogs(effectiveMsMerchantId);
        for (const cat of rawCats) {
          dataSources.push(
            normalizeMicrosoftCatalog(effectiveMsMerchantId, cat)
          );
        }
      }
      if (params.includeProducts) {
        const rawOffers = await mClient.listProducts(effectiveMsMerchantId);
        for (const offer of rawOffers) {
          microsoftProducts.push(normalizeMicrosoftProduct(offer));
        }
      }
    } else if (params.includeDataSources || params.includeProducts) {
      warnings.push(
        'No Microsoft Merchant Center store ID found or specified.'
      );
    }
  } else if (target === 'microsoft') {
    throw new Error(
      'Microsoft platform requested, but no Microsoft OAuth access token was provided.'
    );
  }

  return {
    accounts,
    accountIssues,
    dataSources,
    googleProducts,
    microsoftProducts,
    warnings
  };
}

/**
 * Creates a stateless, read-only `feed-doctor-mcp` McpServer instance.
 */
export function createFeedDoctorServer(
  options: FeedDoctorServerOptions = {}
): McpServer {
  const server = new McpServer(
    {
      name: 'feed-doctor-mcp',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      },
      instructions:
        'FeedDoctor MCP is a strictly read-only, stateless diagnostics connector for Google Merchant Center (Merchant API v1) and Microsoft Merchant Center (Bing Shopping Content API). It never writes to or mutates merchant accounts.'
    }
  );

  // 1. list_accounts
  server.registerTool(
    'list_accounts',
    {
      title: 'List Merchant Center Accounts & Stores',
      description:
        'Lists accessible Google Merchant Center accounts (Merchant API v1) and Microsoft Merchant Center stores (Bing Content API) normalized to one schema. Read-only and stateless.',
      inputSchema: z.object({
        platform: z
          .enum(['google', 'microsoft', 'both'])
          .default('both')
          .describe('Which platform(s) to query: "google", "microsoft", or "both".'),
        credentials: CredentialsOverrideSchema
      }),
      annotations: {
        title: 'List Merchant Center Accounts & Stores',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        if (options.authorizeTool && !await options.authorizeTool('list_accounts')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'This tool needs FeedDoctor Pro: https://feeds.theownersdesk.net/pro' }]
          };
        }
        const creds = resolveRequestCredentials({
          toolOverride: args.credentials,
          requestHeaders: options.requestHeaders,
          bearerToken: options.bearerToken,
          hosted: options.hosted,
          env: options.env
        });

        const data = await loadPlatformData({
          creds,
          platformFilter: args.platform,
          fetchFn: options.fetchFn
        });

        return jsonToolResponse({
          readOnly: true,
          stateless: true,
          totalAccounts: data.accounts.length,
          accounts: data.accounts,
          warnings: data.warnings
        });
      } catch (err) {
        return toolErrorResponse(err);
      }
    }
  );

  // 2. feed_health_summary
  server.registerTool(
    'feed_health_summary',
    {
      title: 'Feed & Account Health Summary',
      description:
        'Combines Google Merchant API v1 and Microsoft Merchant Center account issues, feed/dataSource upload status, product approval counts, and top disapproval causes into a single normalized summary.',
      inputSchema: z.object({
        platform: z
          .enum(['google', 'microsoft', 'both'])
          .default('both')
          .describe('Platform scope: "google", "microsoft", or "both".'),
        googleAccountId: z
          .string()
          .optional()
          .describe('Google Merchant Center account ID (defaults to primary resolved account).'),
        microsoftMerchantId: z
          .string()
          .optional()
          .describe('Microsoft Merchant Center store ID (defaults to primary resolved store).'),
        credentials: CredentialsOverrideSchema
      }),
      annotations: {
        title: 'Feed & Account Health Summary',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        if (options.authorizeTool && !await options.authorizeTool('feed_health_summary')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'This tool needs FeedDoctor Pro: https://feeds.theownersdesk.net/pro' }]
          };
        }
        const creds = resolveRequestCredentials({
          toolOverride: args.credentials,
          requestHeaders: options.requestHeaders,
          bearerToken: options.bearerToken,
          hosted: options.hosted,
          env: options.env
        });

        const data = await loadPlatformData({
          creds,
          platformFilter: args.platform,
          googleAccountId: args.googleAccountId,
          microsoftMerchantId: args.microsoftMerchantId,
          fetchFn: options.fetchFn,
          includeAccountIssues: true,
          includeDataSources: true,
          includeProducts: true
        });

        const summarizeProducts = (prods: NormalizedProduct[]) => {
          const counts = {
            total: prods.length,
            approved: 0,
            disapproved: 0,
            limited: 0,
            pending: 0
          };
          const issueCounts = new Map<
            string,
            { code: string; title: string; severity: string; count: number }
          >();

          for (const p of prods) {
            counts[p.approvalStatus]++;
            for (const iss of p.issues) {
              const cur = issueCounts.get(iss.code);
              if (cur) {
                cur.count++;
              } else {
                issueCounts.set(iss.code, {
                  code: iss.code,
                  title: iss.diagnostic.title,
                  severity: iss.severity,
                  count: 1
                });
              }
            }
          }

          const topIssues = [...issueCounts.values()].sort(
            (a, b) => b.count - a.count
          );
          return { counts, topIssues };
        };

        const crossDiscrepancies =
          data.googleProducts.length > 0 && data.microsoftProducts.length > 0
            ? comparePlatforms({
                googleProducts: data.googleProducts,
                microsoftProducts: data.microsoftProducts
              })
            : [];

        return jsonToolResponse({
          readOnly: true,
          stateless: true,
          accounts: data.accounts,
          accountIssues: data.accountIssues,
          dataSources: data.dataSources,
          productHealth: {
            google: summarizeProducts(data.googleProducts),
            microsoft: summarizeProducts(data.microsoftProducts)
          },
          crossPlatformDiscrepancyCount: crossDiscrepancies.length,
          warnings: data.warnings
        });
      } catch (err) {
        return toolErrorResponse(err);
      }
    }
  );

  // 3. list_disapprovals
  server.registerTool(
    'list_disapprovals',
    {
      title: 'List Disapprovals & Item Issues with Diagnostics',
      description:
        'Lists disapproved, demoted, or warning-flagged products across Google Merchant Center and Microsoft Merchant Center, mapping every issue code to plain-English cause, affected attribute, offending value, fix steps, and official help page link.',
      inputSchema: z.object({
        platform: z
          .enum(['google', 'microsoft', 'both'])
          .default('both')
          .describe('Platform filter: "google", "microsoft", or "both".'),
        severity: z
          .enum(['all', 'disapproval', 'demotion', 'warning'])
          .default('all')
          .describe('Filter by issue severity.'),
        issueCode: z
          .string()
          .optional()
          .describe('Optional filter for a specific issue code (e.g., "price_mismatch", "invalid_gtin").'),
        attribute: z
          .string()
          .optional()
          .describe('Optional filter by affected feed attribute (e.g., "price", "gtin", "image_link").'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe('Maximum number of affected product records to return.'),
        googleAccountId: z.string().optional(),
        microsoftMerchantId: z.string().optional(),
        credentials: CredentialsOverrideSchema
      }),
      annotations: {
        title: 'List Disapprovals & Item Issues with Diagnostics',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        if (options.authorizeTool && !await options.authorizeTool('list_disapprovals')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'This tool needs FeedDoctor Pro: https://feeds.theownersdesk.net/pro' }]
          };
        }
        const creds = resolveRequestCredentials({
          toolOverride: args.credentials,
          requestHeaders: options.requestHeaders,
          bearerToken: options.bearerToken,
          hosted: options.hosted,
          env: options.env
        });

        const data = await loadPlatformData({
          creds,
          platformFilter: args.platform,
          googleAccountId: args.googleAccountId,
          microsoftMerchantId: args.microsoftMerchantId,
          fetchFn: options.fetchFn,
          includeProducts: true
        });

        const allProducts = [...data.googleProducts, ...data.microsoftProducts];
        const filtered: NormalizedProduct[] = [];

        for (const prod of allProducts) {
          if (prod.issues.length === 0 && prod.approvalStatus === 'approved') {
            continue;
          }

          const matchingIssues = prod.issues.filter((iss) => {
            if (args.severity !== 'all' && iss.severity !== args.severity) {
              return false;
            }
            if (
              args.issueCode &&
              iss.code.toLowerCase() !== args.issueCode.toLowerCase()
            ) {
              return false;
            }
            if (
              args.attribute &&
              (iss.attribute || iss.diagnostic.affectedAttribute).toLowerCase() !==
                args.attribute.toLowerCase()
            ) {
              return false;
            }
            return true;
          });

          if (matchingIssues.length > 0) {
            filtered.push({
              ...prod,
              issues: matchingIssues
            });
          }
        }

        const limited = filtered.slice(0, args.limit);

        return jsonToolResponse({
          readOnly: true,
          stateless: true,
          totalMatchingProducts: filtered.length,
          returnedProducts: limited.length,
          disapprovals: limited
        });
      } catch (err) {
        return toolErrorResponse(err);
      }
    }
  );

  // 4. diagnose_product
  server.registerTool(
    'diagnose_product',
    {
      title: 'Diagnose Single Product SKU Across Feeds & Landing Page',
      description:
        'Deep-dives into a single SKU / offerId across Google Merchant Center, Microsoft Merchant Center, and (optionally) fetches the merchant’s own public landing page URL to check JSON-LD / meta price and availability mismatches.',
      inputSchema: z.object({
        sku: z
          .string()
          .min(1)
          .describe('The merchant SKU / offerId to diagnose (e.g., "SKU-101").'),
        checkLandingPage: z
          .boolean()
          .default(false)
          .describe(
            'When true, fetches the merchant’s own public product URL (link) to compare live JSON-LD / meta price and availability against the feeds.'
          ),
        googleAccountId: z.string().optional(),
        microsoftMerchantId: z.string().optional(),
        credentials: CredentialsOverrideSchema
      }),
      annotations: {
        title: 'Diagnose Single Product SKU Across Feeds & Landing Page',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        if (options.authorizeTool && !await options.authorizeTool('diagnose_product')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'This tool needs FeedDoctor Pro: https://feeds.theownersdesk.net/pro' }]
          };
        }
        const creds = resolveRequestCredentials({
          toolOverride: args.credentials,
          requestHeaders: options.requestHeaders,
          bearerToken: options.bearerToken,
          hosted: options.hosted,
          env: options.env
        });

        const data = await loadPlatformData({
          creds,
          platformFilter: 'both',
          googleAccountId: args.googleAccountId,
          microsoftMerchantId: args.microsoftMerchantId,
          fetchFn: options.fetchFn,
          includeProducts: true
        });

        const targetSkuUpper = args.sku.trim().toUpperCase();
        const googleProduct =
          data.googleProducts.find(
            (p) => p.sku.toUpperCase() === targetSkuUpper
          ) ?? null;
        const microsoftProduct =
          data.microsoftProducts.find(
            (p) => p.sku.toUpperCase() === targetSkuUpper
          ) ?? null;

        if (!googleProduct && !microsoftProduct) {
          return jsonToolResponse({
            readOnly: true,
            stateless: true,
            sku: args.sku,
            found: false,
            message: `SKU "${args.sku}" was not found in either Google Merchant Center or Microsoft Merchant Center feeds.`
          });
        }

        let landingPage: LandingPageSnapshot | null = null;
        const landingUrl = googleProduct?.link || microsoftProduct?.link;
        if (args.checkLandingPage && landingUrl) {
          const allowedDomains = data.accounts
            .map((a) => a.domain)
            .filter((d): d is string => Boolean(d));
          landingPage = await fetchAndCheckLandingPage({
            url: landingUrl,
            allowedMerchantDomains: allowedDomains,
            fetchFn: options.fetchFn
          });
        }

        const landingPagesBySku = new Map<string, LandingPageSnapshot>();
        if (landingPage) {
          landingPagesBySku.set(
            googleProduct?.sku || microsoftProduct?.sku || args.sku,
            landingPage
          );
        }

        const discrepancies = comparePlatforms({
          googleProducts: googleProduct ? [googleProduct] : [],
          microsoftProducts: microsoftProduct ? [microsoftProduct] : [],
          landingPagesBySku
        });

        const fixPlan = generateFixPlan({
          accountIssues: [],
          googleProducts: googleProduct ? [googleProduct] : [],
          microsoftProducts: microsoftProduct ? [microsoftProduct] : [],
          landingPagesBySku
        });

        return jsonToolResponse({
          readOnly: true,
          stateless: true,
          sku: googleProduct?.sku || microsoftProduct?.sku || args.sku,
          found: true,
          google: googleProduct,
          microsoft: microsoftProduct,
          landingPage,
          crossFeedAndLandingPageDiscrepancies: discrepancies,
          recommendedFixes: fixPlan
        });
      } catch (err) {
        return toolErrorResponse(err);
      }
    }
  );

  // 5. compare_platforms
  server.registerTool(
    'compare_platforms',
    {
      title: 'Compare Google vs. Microsoft Product Feeds',
      description:
        'Cross-checks Google Merchant Center and Microsoft Merchant Center feeds for the same SKUs: detects SKUs approved on one platform but disapproved on the other, price/availability mismatches between feeds and landing pages, and missing GTIN/brand backfill opportunities.',
      inputSchema: z.object({
        checkLandingPagesForDiscrepancies: z
          .boolean()
          .default(false)
          .describe(
            'When true, fetches the merchant’s public product landing page for SKUs that have disapprovals or price/availability discrepancies.'
          ),
        maxLandingPageChecks: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(5)
          .describe('Maximum number of public product URLs to fetch when checkLandingPagesForDiscrepancies is true.'),
        googleAccountId: z.string().optional(),
        microsoftMerchantId: z.string().optional(),
        credentials: CredentialsOverrideSchema
      }),
      annotations: {
        title: 'Compare Google vs. Microsoft Product Feeds',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        if (options.authorizeTool && !await options.authorizeTool('compare_platforms')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'This tool needs FeedDoctor Pro: https://feeds.theownersdesk.net/pro' }]
          };
        }
        const creds = resolveRequestCredentials({
          toolOverride: args.credentials,
          requestHeaders: options.requestHeaders,
          bearerToken: options.bearerToken,
          hosted: options.hosted,
          env: options.env
        });

        const data = await loadPlatformData({
          creds,
          platformFilter: 'both',
          googleAccountId: args.googleAccountId,
          microsoftMerchantId: args.microsoftMerchantId,
          fetchFn: options.fetchFn,
          includeProducts: true
        });

        const landingPagesBySku = new Map<string, LandingPageSnapshot>();

        if (args.checkLandingPagesForDiscrepancies) {
          const allowedDomains = data.accounts
            .map((a) => a.domain)
            .filter((d): d is string => Boolean(d));

          const candidateProducts = [
            ...data.googleProducts,
            ...data.microsoftProducts
          ].filter((p) => p.approvalStatus !== 'approved' && Boolean(p.link));

          const checkedSkus = new Set<string>();
          for (const prod of candidateProducts) {
            if (checkedSkus.size >= args.maxLandingPageChecks) break;
            if (checkedSkus.has(prod.sku.toUpperCase())) continue;
            checkedSkus.add(prod.sku.toUpperCase());
            try {
              const snapshot = await fetchAndCheckLandingPage({
                url: prod.link,
                allowedMerchantDomains: allowedDomains,
                fetchFn: options.fetchFn
              });
              landingPagesBySku.set(prod.sku, snapshot);
            } catch (err) {
              data.warnings.push(
                `Landing page check skipped for ${prod.sku}: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }
        }

        const discrepancies = comparePlatforms({
          googleProducts: data.googleProducts,
          microsoftProducts: data.microsoftProducts,
          landingPagesBySku
        });

        const byType = {
          approval_asymmetry: discrepancies.filter(
            (d) => d.type === 'approval_asymmetry'
          ).length,
          missing_on_platform: discrepancies.filter(
            (d) => d.type === 'missing_on_platform'
          ).length,
          price_mismatch: discrepancies.filter((d) => d.type === 'price_mismatch')
            .length,
          availability_mismatch: discrepancies.filter(
            (d) => d.type === 'availability_mismatch'
          ).length,
          attribute_backfill_opportunity: discrepancies.filter(
            (d) => d.type === 'attribute_backfill_opportunity'
          ).length,
          landing_page_price_mismatch: discrepancies.filter(
            (d) => d.type === 'landing_page_price_mismatch'
          ).length,
          landing_page_availability_mismatch: discrepancies.filter(
            (d) => d.type === 'landing_page_availability_mismatch'
          ).length
        };

        return jsonToolResponse({
          readOnly: true,
          stateless: true,
          googleSkuCount: data.googleProducts.length,
          microsoftSkuCount: data.microsoftProducts.length,
          landingPagesChecked: landingPagesBySku.size,
          totalDiscrepancies: discrepancies.length,
          countsByType: byType,
          discrepancies,
          warnings: data.warnings
        });
      } catch (err) {
        return toolErrorResponse(err);
      }
    }
  );

  // 6. fix_plan
  server.registerTool(
    'fix_plan',
    {
      title: 'Generate Prioritized Feed Fix Plan & Supplemental Patch Preview',
      description:
        'Generates a prioritized, step-by-step remediation plan across Google Merchant Center and Microsoft Merchant Center, complete with copy-ready supplemental feed patch rows and official documentation links.',
      inputSchema: z.object({
        platform: z
          .enum(['google', 'microsoft', 'both'])
          .default('both')
          .describe('Platform scope: "google", "microsoft", or "both".'),
        checkLandingPages: z
          .boolean()
          .default(false)
          .describe(
            'When true, fetches public landing pages for disapproved SKUs to populate exact live prices/availabilities in the supplemental patch preview.'
          ),
        maxLandingPageChecks: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(5)
          .describe('Maximum number of public product URLs to fetch when checkLandingPages is true.'),
        googleAccountId: z.string().optional(),
        microsoftMerchantId: z.string().optional(),
        credentials: CredentialsOverrideSchema
      }),
      annotations: {
        title: 'Generate Prioritized Feed Fix Plan & Supplemental Patch Preview',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        if (options.authorizeTool && !await options.authorizeTool('fix_plan')) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'This tool needs FeedDoctor Pro: https://feeds.theownersdesk.net/pro' }]
          };
        }
        const creds = resolveRequestCredentials({
          toolOverride: args.credentials,
          requestHeaders: options.requestHeaders,
          bearerToken: options.bearerToken,
          hosted: options.hosted,
          env: options.env
        });

        const data = await loadPlatformData({
          creds,
          platformFilter: args.platform,
          googleAccountId: args.googleAccountId,
          microsoftMerchantId: args.microsoftMerchantId,
          fetchFn: options.fetchFn,
          includeAccountIssues: true,
          includeProducts: true
        });

        const landingPagesBySku = new Map<string, LandingPageSnapshot>();
        if (args.checkLandingPages) {
          const allowedDomains = data.accounts
            .map((a) => a.domain)
            .filter((d): d is string => Boolean(d));
          const candidates = [
            ...data.googleProducts,
            ...data.microsoftProducts
          ].filter((p) => p.approvalStatus !== 'approved' && Boolean(p.link));
          const seen = new Set<string>();
          for (const prod of candidates) {
            if (seen.size >= args.maxLandingPageChecks) break;
            if (seen.has(prod.sku.toUpperCase())) continue;
            seen.add(prod.sku.toUpperCase());
            try {
              const snap = await fetchAndCheckLandingPage({
                url: prod.link,
                allowedMerchantDomains: allowedDomains,
                fetchFn: options.fetchFn
              });
              landingPagesBySku.set(prod.sku, snap);
            } catch (err) {
              data.warnings.push(
                `Landing page check skipped for ${prod.sku}: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }
        }

        const items = generateFixPlan({
          accountIssues: data.accountIssues,
          googleProducts: data.googleProducts,
          microsoftProducts: data.microsoftProducts,
          landingPagesBySku
        });

        return jsonToolResponse({
          readOnly: true,
          stateless: true,
          totalFixItems: items.length,
          fixPlan: items,
          warnings: data.warnings
        });
      } catch (err) {
        return toolErrorResponse(err);
      }
    }
  );

  return server;
}
