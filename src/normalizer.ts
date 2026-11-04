import type {
  GoogleAccountIssueRaw,
  GoogleAccountRaw,
  GoogleDataSourceRaw,
  GooglePriceRaw,
  GoogleProductRaw
} from './clients/google.js';
import type {
  MicrosoftCatalogRaw,
  MicrosoftOfferRaw,
  MicrosoftStoreRaw
} from './clients/microsoft.js';
import { diagnoseIssueCode } from './diagnostics.js';
import type {
  ApprovalStatus,
  AvailabilityStatus,
  CrossFeedDiscrepancy,
  FixPlanItem,
  LandingPageSnapshot,
  MoneyAmount,
  NormalizedAccount,
  NormalizedAccountIssue,
  NormalizedDataSource,
  NormalizedProduct,
  NormalizedProductIssue
} from './types.js';

export function parseGoogleMoney(raw?: GooglePriceRaw): MoneyAmount | undefined {
  if (!raw) return undefined;
  const currency = (raw.currencyCode || raw.currency || 'USD').toUpperCase();
  if (raw.amountMicros !== undefined) {
    const micros = Number(raw.amountMicros);
    if (!Number.isNaN(micros)) {
      const amount = Number((micros / 1_000_000).toFixed(2));
      return {
        amount,
        currency,
        formatted: `${amount.toFixed(2)} ${currency}`
      };
    }
  }
  if (raw.value !== undefined) {
    const amount = Number(Number(raw.value).toFixed(2));
    if (!Number.isNaN(amount)) {
      return {
        amount,
        currency,
        formatted: `${amount.toFixed(2)} ${currency}`
      };
    }
  }
  return undefined;
}

export function normalizeAvailability(raw?: string): AvailabilityStatus {
  if (!raw) return 'unknown';
  const norm = raw.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (norm === 'in_stock' || norm === 'instock') return 'in_stock';
  if (norm === 'out_of_stock' || norm === 'outofstock') return 'out_of_stock';
  if (norm === 'preorder' || norm === 'pre_order') return 'preorder';
  if (norm === 'backorder' || norm === 'back_order') return 'backorder';
  return 'unknown';
}

export function normalizeCondition(
  raw?: string
): 'new' | 'refurbished' | 'used' | 'unknown' {
  if (!raw) return 'unknown';
  const norm = raw.toLowerCase().trim();
  if (norm === 'new') return 'new';
  if (norm === 'refurbished') return 'refurbished';
  if (norm === 'used') return 'used';
  return 'unknown';
}

export function normalizeGoogleAccount(raw: GoogleAccountRaw): NormalizedAccount {
  const accountId =
    raw.accountId || (raw.name ? raw.name.replace(/^accounts\//, '') : 'unknown');
  return {
    platform: 'google',
    accountId: String(accountId),
    name: raw.accountName || `Google Merchant ${accountId}`,
    domain: raw.homepage,
    aggregatorId: raw.aggregatorId,
    status: 'active',
    adultContent: Boolean(raw.adultContent)
  };
}

export function normalizeMicrosoftStore(
  raw: MicrosoftStoreRaw
): NormalizedAccount {
  const statusNorm = (raw.status || 'Active').toLowerCase();
  const status = statusNorm.includes('suspend')
    ? 'suspended'
    : statusNorm.includes('warn') || statusNorm.includes('pending')
      ? 'warning'
      : 'active';
  return {
    platform: 'microsoft',
    accountId: String(raw.id ?? 'unknown'),
    name: raw.name || `Microsoft Store ${raw.id ?? ''}`.trim(),
    domain: raw.domain,
    status,
    adultContent: Boolean(raw.adultContent)
  };
}

export function normalizeGoogleAccountIssue(
  accountId: string,
  raw: GoogleAccountIssueRaw
): NormalizedAccountIssue {
  const code =
    raw.code ||
    (raw.name ? raw.name.split('/').pop() || 'account_issue' : 'account_issue');
  const sevNorm = (raw.severity || 'ERROR').toUpperCase();
  const severity: NormalizedAccountIssue['severity'] =
    sevNorm === 'CRITICAL'
      ? 'critical'
      : sevNorm === 'WARNING'
        ? 'warning'
        : sevNorm === 'INFO'
          ? 'info'
          : 'error';
  const destinations = (raw.impactedDestinations ?? [])
    .map((d) => d.reportingContext || 'SHOPPING_ADS')
    .filter(Boolean);

  const diagnostic = diagnoseIssueCode({
    code,
    platform: 'google',
    rawSeverity: raw.severity,
    rawAttribute: 'account_level',
    rawDescription: raw.detail || raw.title,
    rawDocumentationUrl: raw.documentation
  });

  return {
    platform: 'google',
    accountId,
    code,
    title: raw.title || diagnostic.title,
    severity,
    affectedDestinations:
      destinations.length > 0 ? destinations : ['SHOPPING_ADS'],
    detail: raw.detail,
    documentationUrl: raw.documentation,
    diagnostic
  };
}

export function normalizeMicrosoftStoreIssues(
  store: MicrosoftStoreRaw
): NormalizedAccountIssue[] {
  const accountId = String(store.id ?? 'unknown');
  return (store.issues ?? []).map((issue) => {
    const code = issue.code || 'bing_domain_not_verified';
    const sevNorm = (issue.severity || 'Error').toLowerCase();
    const severity: NormalizedAccountIssue['severity'] = sevNorm.includes('crit')
      ? 'critical'
      : sevNorm.includes('warn')
        ? 'warning'
        : 'error';
    const diagnostic = diagnoseIssueCode({
      code,
      platform: 'microsoft',
      rawSeverity: issue.severity,
      rawAttribute: 'account_level',
      rawDescription: issue.detail || issue.title,
      rawDocumentationUrl: issue.documentationUrl
    });

    return {
      platform: 'microsoft',
      accountId,
      code,
      title: issue.title || diagnostic.title,
      severity,
      affectedDestinations: ['MICROSOFT_SHOPPING'],
      detail: issue.detail,
      documentationUrl: issue.documentationUrl,
      diagnostic
    };
  });
}

export function normalizeGoogleDataSource(
  accountId: string,
  raw: GoogleDataSourceRaw
): NormalizedDataSource {
  const dataSourceId =
    raw.dataSourceId ||
    (raw.name ? raw.name.split('/').pop() || 'unknown' : 'unknown');
  const feedType: NormalizedDataSource['feedType'] =
    raw.supplementalProductDataSource
      ? 'supplemental'
      : raw.primaryProductDataSource
        ? 'primary'
        : 'auto';

  const upload = raw.latestFileUpload;
  const state = (upload?.processingState || 'SUCCEEDED').toUpperCase();
  const processingStatus: NormalizedDataSource['processingStatus'] =
    state === 'FAILED'
      ? 'failed'
      : state === 'IN_PROGRESS'
        ? 'in_progress'
        : state === 'PARTIAL_FAILURE'
          ? 'warning'
          : 'success';

  const itemsTotal = Number(upload?.itemsTotal ?? 0);
  const issueCount = (upload?.issues ?? []).reduce(
    (sum, item) => sum + Number(item.count ?? 1),
    0
  );
  const itemsWithErrors = Math.min(itemsTotal, issueCount);
  const itemsValid = Math.max(0, itemsTotal - itemsWithErrors);

  return {
    platform: 'google',
    accountId,
    dataSourceId: String(dataSourceId),
    name: raw.displayName || raw.fileInput?.fileName || `DataSource ${dataSourceId}`,
    feedType,
    processingStatus,
    itemsTotal,
    itemsValid,
    itemsWithErrors,
    lastUploadTime: upload?.uploadTime,
    fetchScheduleUrl: raw.fileInput?.fetchSettings?.fetchUri
  };
}

export function normalizeMicrosoftCatalog(
  merchantId: string,
  raw: MicrosoftCatalogRaw
): NormalizedDataSource {
  const state = (raw.processingStatus || 'Success').toLowerCase();
  const processingStatus: NormalizedDataSource['processingStatus'] =
    state.includes('fail')
      ? 'failed'
      : state.includes('progress')
        ? 'in_progress'
        : state.includes('warn')
          ? 'warning'
          : 'success';
  const itemsTotal = Number(raw.itemsTotal ?? 0);
  const itemsWithErrors = Number(raw.itemsWithErrors ?? 0);
  const itemsValid =
    raw.itemsValid !== undefined
      ? Number(raw.itemsValid)
      : Math.max(0, itemsTotal - itemsWithErrors);

  return {
    platform: 'microsoft',
    accountId: merchantId,
    dataSourceId: String(raw.id ?? 'unknown'),
    name: raw.name || `Catalog ${raw.id ?? ''}`.trim(),
    feedType: 'catalog',
    processingStatus,
    itemsTotal,
    itemsValid,
    itemsWithErrors,
    lastUploadTime: raw.lastUploadTime,
    fetchScheduleUrl: raw.fetchUrl
  };
}

function getOffendingValueFromGoogleAttributes(
  attrName: string | undefined,
  attrs: GoogleProductRaw['attributes']
): string | undefined {
  if (!attrName || !attrs) return undefined;
  const key = attrName.toLowerCase();
  if (key === 'price') {
    const p = parseGoogleMoney(attrs.price);
    return p ? p.formatted : undefined;
  }
  if (key === 'availability') return attrs.availability;
  if (key === 'gtin') {
    if (Array.isArray(attrs.gtin)) return attrs.gtin.join(', ') || '(empty)';
    return attrs.gtin ?? '(empty)';
  }
  if (key === 'brand') return attrs.brand ?? '(empty)';
  if (key === 'link') return attrs.link;
  if (key === 'image_link' || key === 'imagelink') return attrs.imageLink;
  if (key === 'title') return attrs.title;
  if (key === 'description') return attrs.description;
  return undefined;
}

export function normalizeGoogleProduct(raw: GoogleProductRaw): NormalizedProduct {
  const attrs = raw.attributes ?? {};
  const sku =
    raw.offerId ||
    (raw.name ? raw.name.split('~').pop() || raw.name : 'UNKNOWN-SKU');
  const price = parseGoogleMoney(attrs.price);
  const salePrice = parseGoogleMoney(attrs.salePrice);
  const gtin = Array.isArray(attrs.gtin) ? attrs.gtin[0] : attrs.gtin;

  const rawIssues = raw.productStatus?.itemLevelIssues ?? [];
  const issues: NormalizedProductIssue[] = rawIssues.map((issue) => {
    const actualOffendingValue = getOffendingValueFromGoogleAttributes(
      issue.attribute,
      attrs
    );
    const diagnostic = diagnoseIssueCode({
      code: issue.code,
      platform: 'google',
      rawSeverity: issue.severity,
      rawAttribute: issue.attribute,
      rawDescription: issue.detail || issue.description,
      actualOffendingValue,
      rawDocumentationUrl: issue.documentation
    });

    return {
      code: issue.code,
      platform: 'google',
      severity: diagnostic.severity,
      attribute: issue.attribute || diagnostic.affectedAttribute,
      destination: issue.reportingContext || 'SHOPPING_ADS',
      rawDescription: issue.detail || issue.description,
      applicableCountries: issue.applicableCountries,
      diagnostic
    };
  });

  // Determine overall approvalStatus
  const destStatuses = raw.productStatus?.destinationStatuses ?? [];
  const hasDisapprovedDest = destStatuses.some(
    (d) => (d.disapprovedCountries?.length ?? 0) > 0
  );
  const hasPendingDest = destStatuses.some(
    (d) =>
      (d.pendingCountries?.length ?? 0) > 0 &&
      (d.approvedCountries?.length ?? 0) === 0
  );
  const hasDisapprovalIssue = issues.some((i) => i.severity === 'disapproval');
  const hasDemotionOrWarning = issues.some(
    (i) => i.severity === 'demotion' || i.severity === 'warning'
  );

  let approvalStatus: ApprovalStatus = 'approved';
  if (hasDisapprovedDest || hasDisapprovalIssue) {
    approvalStatus = 'disapproved';
  } else if (hasPendingDest) {
    approvalStatus = 'pending';
  } else if (hasDemotionOrWarning) {
    approvalStatus = 'limited';
  }

  let priceCompetitiveness: NormalizedProduct['priceCompetitiveness'];
  if (raw.priceCompetitiveness?.benchmarkPriceMicros !== undefined) {
    const benchmark = parseGoogleMoney({
      amountMicros: raw.priceCompetitiveness.benchmarkPriceMicros,
      currencyCode:
        raw.priceCompetitiveness.benchmarkPriceCurrencyCode ||
        price?.currency ||
        'USD'
    });
    const effectivePrice = salePrice ?? price;
    if (benchmark && effectivePrice && benchmark.amount > 0) {
      const deltaPct = Number(
        (
          ((effectivePrice.amount - benchmark.amount) / benchmark.amount) *
          100
        ).toFixed(2)
      );
      priceCompetitiveness = {
        benchmarkPrice: benchmark,
        priceDeltaPct: deltaPct
      };
    }
  }

  return {
    sku,
    platform: 'google',
    platformProductId: raw.name || `google:${sku}`,
    title: attrs.title || sku,
    link: attrs.link || '',
    imageLink: attrs.imageLink,
    price,
    salePrice,
    availability: normalizeAvailability(attrs.availability),
    gtin: gtin || undefined,
    mpn: attrs.mpn || undefined,
    brand: attrs.brand || undefined,
    condition: normalizeCondition(attrs.condition),
    contentLanguage: raw.contentLanguage || 'en',
    targetCountry: raw.feedLabel || 'US',
    channel: raw.channel || 'ONLINE',
    approvalStatus,
    issues,
    priceCompetitiveness,
    lastUpdated: raw.productStatus?.lastUpdateDate
  };
}

export function normalizeMicrosoftProduct(
  raw: MicrosoftOfferRaw
): NormalizedProduct {
  const sku = raw.offerId || raw.id || 'UNKNOWN-SKU';
  const parseMsMoney = (m?: {
    value?: string | number;
    currency?: string;
  }): MoneyAmount | undefined => {
    if (!m || m.value === undefined) return undefined;
    const amount = Number(Number(m.value).toFixed(2));
    if (Number.isNaN(amount)) return undefined;
    const currency = (m.currency || 'USD').toUpperCase();
    return {
      amount,
      currency,
      formatted: `${amount.toFixed(2)} ${currency}`
    };
  };

  const price = parseMsMoney(raw.price);
  const salePrice = parseMsMoney(raw.salePrice);

  const issues: NormalizedProductIssue[] = (raw.itemLevelIssues ?? []).map(
    (issue) => {
      const attr = issue.attribute;
      let actualOffendingValue: string | undefined;
      if (attr === 'price' && price) actualOffendingValue = price.formatted;
      else if (attr === 'gtin') actualOffendingValue = raw.gtin ?? '(empty)';
      else if (attr === 'brand') actualOffendingValue = raw.brand ?? '(empty)';
      else if (attr === 'link') actualOffendingValue = raw.link;
      else if (attr === 'image_link') actualOffendingValue = raw.imageLink;
      else if (attr === 'title') actualOffendingValue = raw.title;

      const diagnostic = diagnoseIssueCode({
        code: issue.code,
        platform: 'microsoft',
        rawSeverity: issue.severity,
        rawAttribute: issue.attribute,
        rawDescription: issue.description,
        actualOffendingValue,
        rawDocumentationUrl: issue.documentationUrl
      });

      return {
        code: issue.code,
        platform: 'microsoft',
        severity: diagnostic.severity,
        attribute: issue.attribute || diagnostic.affectedAttribute,
        destination: issue.destination || 'MICROSOFT_SHOPPING',
        rawDescription: issue.description,
        diagnostic
      };
    }
  );

  const statusNorm = (raw.status || 'Approved').toLowerCase();
  const hasDisapprovalIssue = issues.some((i) => i.severity === 'disapproval');
  const hasWarningIssue = issues.some(
    (i) => i.severity === 'warning' || i.severity === 'demotion'
  );

  let approvalStatus: ApprovalStatus = 'approved';
  if (
    statusNorm.includes('disapprov') ||
    statusNorm.includes('reject') ||
    hasDisapprovalIssue
  ) {
    approvalStatus = 'disapproved';
  } else if (statusNorm.includes('pend')) {
    approvalStatus = 'pending';
  } else if (statusNorm.includes('limit') || hasWarningIssue) {
    approvalStatus = 'limited';
  }

  return {
    sku,
    platform: 'microsoft',
    platformProductId: raw.id || `microsoft:${sku}`,
    title: raw.title || sku,
    link: raw.link || '',
    imageLink: raw.imageLink,
    price,
    salePrice,
    availability: normalizeAvailability(raw.availability),
    gtin: raw.gtin || undefined,
    mpn: raw.mpn || undefined,
    brand: raw.brand || undefined,
    condition: normalizeCondition(raw.condition),
    contentLanguage: raw.contentLanguage || 'en',
    targetCountry: raw.targetCountry || 'US',
    channel: raw.channel || 'online',
    approvalStatus,
    issues,
    lastUpdated: raw.lastUpdated
  };
}

/**
 * Performs cross-feed and landing-page checks across Google Merchant Center
 * and Microsoft Merchant Center products.
 */
export function comparePlatforms(params: {
  googleProducts: NormalizedProduct[];
  microsoftProducts: NormalizedProduct[];
  landingPagesBySku?: Map<string, LandingPageSnapshot>;
}): CrossFeedDiscrepancy[] {
  const discrepancies: CrossFeedDiscrepancy[] = [];
  const googleBySku = new Map<string, NormalizedProduct>();
  const microsoftBySku = new Map<string, NormalizedProduct>();

  for (const p of params.googleProducts) {
    googleBySku.set(p.sku.toUpperCase(), p);
  }
  for (const p of params.microsoftProducts) {
    microsoftBySku.set(p.sku.toUpperCase(), p);
  }

  const allSkuKeys = new Set<string>([
    ...googleBySku.keys(),
    ...microsoftBySku.keys()
  ]);

  for (const skuKey of [...allSkuKeys].sort()) {
    const g = googleBySku.get(skuKey);
    const m = microsoftBySku.get(skuKey);
    const canonicalSku = g?.sku || m?.sku || skuKey;
    const lp =
      params.landingPagesBySku?.get(canonicalSku) ??
      params.landingPagesBySku?.get(skuKey);

    if (g && !m) {
      discrepancies.push({
        sku: canonicalSku,
        type: 'missing_on_platform',
        severity: 'medium',
        summary: `SKU "${canonicalSku}" exists in Google Merchant Center (${g.approvalStatus}) but is missing from Microsoft Merchant Center.`,
        googleValue: g.approvalStatus,
        microsoftValue: 'missing',
        recommendedAction:
          'Import or sync this SKU into your Microsoft Merchant Center catalog so approved Shopping inventory runs on Bing.'
      });
    } else if (!g && m) {
      discrepancies.push({
        sku: canonicalSku,
        type: 'missing_on_platform',
        severity: 'medium',
        summary: `SKU "${canonicalSku}" exists in Microsoft Merchant Center (${m.approvalStatus}) but is missing from Google Merchant Center.`,
        googleValue: 'missing',
        microsoftValue: m.approvalStatus,
        recommendedAction:
          'Add this SKU to your primary Google Merchant Center dataSource.'
      });
    } else if (g && m) {
      // 1. Approval asymmetry (approved on one platform, disapproved on the other)
      if (g.approvalStatus !== m.approvalStatus) {
        const gIssues = g.issues.map((i) => i.code).join(', ') || 'none';
        const mIssues = m.issues.map((i) => i.code).join(', ') || 'none';
        const isHigh =
          g.approvalStatus === 'disapproved' ||
          m.approvalStatus === 'disapproved';
        discrepancies.push({
          sku: canonicalSku,
          type: 'approval_asymmetry',
          severity: isHigh ? 'high' : 'medium',
          summary: `SKU "${canonicalSku}" is ${g.approvalStatus.toUpperCase()} on Google (issues: ${gIssues}) but ${m.approvalStatus.toUpperCase()} on Microsoft (issues: ${mIssues}).`,
          googleValue: `${g.approvalStatus} (${gIssues})`,
          microsoftValue: `${m.approvalStatus} (${mIssues})`,
          recommendedAction:
            g.approvalStatus === 'approved'
              ? `Copy validated attributes (GTIN/brand/image/price) from Google feed to resolve Microsoft issues (${mIssues}).`
              : `Address Google issues (${gIssues}) or copy missing identifiers from Microsoft feed.`
        });
      }

      // 2. Price mismatch between feeds
      const gEffectivePrice = g.salePrice ?? g.price;
      const mEffectivePrice = m.salePrice ?? m.price;
      if (
        gEffectivePrice &&
        mEffectivePrice &&
        (gEffectivePrice.amount !== mEffectivePrice.amount ||
          gEffectivePrice.currency !== mEffectivePrice.currency)
      ) {
        discrepancies.push({
          sku: canonicalSku,
          type: 'price_mismatch',
          severity: 'high',
          summary: `Feed price mismatch for SKU "${canonicalSku}": Google feed has ${gEffectivePrice.formatted}, while Microsoft feed has ${mEffectivePrice.formatted}.`,
          googleValue: gEffectivePrice.formatted,
          microsoftValue: mEffectivePrice.formatted,
          ...(lp?.price ? { landingPageValue: lp.price.formatted } : {}),
          recommendedAction: lp?.price
            ? `Sync both feeds to match the live landing page price (${lp.price.formatted}).`
            : 'Synchronize feed export schedules so Google and Microsoft receive identical pricing.'
        });
      }

      // 3. Availability mismatch between feeds
      if (g.availability !== m.availability) {
        discrepancies.push({
          sku: canonicalSku,
          type: 'availability_mismatch',
          severity: 'high',
          summary: `Feed availability mismatch for SKU "${canonicalSku}": Google feed is "${g.availability}", while Microsoft feed is "${m.availability}".`,
          googleValue: g.availability,
          microsoftValue: m.availability,
          ...(lp ? { landingPageValue: lp.availability } : {}),
          recommendedAction:
            'Align inventory status across both feeds and trigger an immediate feed fetch.'
        });
      }

      // 4. Attribute backfill opportunity (GTIN or Brand present on one platform, missing on the other)
      if (g.gtin && !m.gtin) {
        discrepancies.push({
          sku: canonicalSku,
          type: 'attribute_backfill_opportunity',
          severity: m.approvalStatus !== 'approved' ? 'high' : 'low',
          summary: `SKU "${canonicalSku}" has GTIN "${g.gtin}" in Google Merchant Center, but GTIN is missing in Microsoft Merchant Center.`,
          googleValue: g.gtin,
          microsoftValue: '(missing)',
          recommendedAction: `Backfill [gtin] = "${g.gtin}" into Microsoft Merchant Center for SKU "${canonicalSku}".`
        });
      } else if (!g.gtin && m.gtin) {
        discrepancies.push({
          sku: canonicalSku,
          type: 'attribute_backfill_opportunity',
          severity: g.approvalStatus !== 'approved' ? 'high' : 'low',
          summary: `SKU "${canonicalSku}" has GTIN "${m.gtin}" in Microsoft Merchant Center, but GTIN is missing in Google Merchant Center.`,
          googleValue: '(missing)',
          microsoftValue: m.gtin,
          recommendedAction: `Backfill [gtin] = "${m.gtin}" into Google Merchant Center for SKU "${canonicalSku}".`
        });
      }

      if (g.brand && !m.brand) {
        discrepancies.push({
          sku: canonicalSku,
          type: 'attribute_backfill_opportunity',
          severity: m.approvalStatus !== 'approved' ? 'high' : 'low',
          summary: `SKU "${canonicalSku}" has brand "${g.brand}" in Google Merchant Center, but brand is missing in Microsoft Merchant Center.`,
          googleValue: g.brand,
          microsoftValue: '(missing)',
          recommendedAction: `Backfill [brand] = "${g.brand}" into Microsoft Merchant Center for SKU "${canonicalSku}".`
        });
      } else if (!g.brand && m.brand) {
        discrepancies.push({
          sku: canonicalSku,
          type: 'attribute_backfill_opportunity',
          severity: g.approvalStatus !== 'approved' ? 'high' : 'low',
          summary: `SKU "${canonicalSku}" has brand "${m.brand}" in Microsoft Merchant Center, but brand is missing in Google Merchant Center.`,
          googleValue: '(missing)',
          microsoftValue: m.brand,
          recommendedAction: `Backfill [brand] = "${m.brand}" into Google Merchant Center for SKU "${canonicalSku}".`
        });
      }
    }

    // 5. Landing page vs. feeds check (if landingPageSnapshot is provided for this SKU)
    if (lp) {
      const gPrice = g ? (g.salePrice ?? g.price) : undefined;
      const mPrice = m ? (m.salePrice ?? m.price) : undefined;

      if (lp.price) {
        const gDiff =
          gPrice &&
          (gPrice.amount !== lp.price.amount ||
            gPrice.currency !== lp.price.currency);
        const mDiff =
          mPrice &&
          (mPrice.amount !== lp.price.amount ||
            mPrice.currency !== lp.price.currency);

        if (gDiff || mDiff) {
          discrepancies.push({
            sku: canonicalSku,
            type: 'landing_page_price_mismatch',
            severity: 'high',
            summary: `Live landing page price (${lp.price.formatted}) for SKU "${canonicalSku}" does not match ${
              gDiff && mDiff
                ? 'both Google and Microsoft feeds'
                : gDiff
                  ? `Google feed (${gPrice?.formatted})`
                  : `Microsoft feed (${mPrice?.formatted})`
            }.`,
            googleValue: gPrice?.formatted ?? 'N/A',
            microsoftValue: mPrice?.formatted ?? 'N/A',
            landingPageValue: lp.price.formatted,
            recommendedAction: `Update ${
              gDiff && mDiff
                ? 'both Google and Microsoft feeds'
                : gDiff
                  ? 'Google feed'
                  : 'Microsoft feed'
            } price to "${lp.price.formatted}" (or fix the JSON-LD Offer price on ${lp.url}).`
          });
        }
      }

      if (lp.availability !== 'unknown') {
        const gAvailDiff = g && g.availability !== lp.availability;
        const mAvailDiff = m && m.availability !== lp.availability;
        if (gAvailDiff || mAvailDiff) {
          discrepancies.push({
            sku: canonicalSku,
            type: 'landing_page_availability_mismatch',
            severity: 'high',
            summary: `Live landing page availability ("${lp.availability}") for SKU "${canonicalSku}" conflicts with ${
              gAvailDiff && mAvailDiff
                ? 'both Google and Microsoft feeds'
                : gAvailDiff
                  ? `Google feed ("${g?.availability}")`
                  : `Microsoft feed ("${m?.availability}")`
            }.`,
            googleValue: g?.availability ?? 'N/A',
            microsoftValue: m?.availability ?? 'N/A',
            landingPageValue: lp.availability,
            recommendedAction: `Sync feed [availability] to "${lp.availability}" to match the live storefront page (${lp.url}).`
          });
        }
      }
    }
  }

  return discrepancies;
}

/**
 * Builds a prioritized, read-only remediation plan with supplemental feed patch rows.
 */
export function generateFixPlan(params: {
  accountIssues: NormalizedAccountIssue[];
  googleProducts: NormalizedProduct[];
  microsoftProducts: NormalizedProduct[];
  landingPagesBySku?: Map<string, LandingPageSnapshot>;
}): FixPlanItem[] {
  const plan: FixPlanItem[] = [];
  let priorityCounter = 1;

  // 1. Account-level blockers first
  for (const accIssue of params.accountIssues) {
    plan.push({
      priority: priorityCounter++,
      category: 'account_blocker',
      title: `[Account Blocker - ${accIssue.platform.toUpperCase()}] ${accIssue.title}`,
      affectedPlatform: accIssue.platform,
      affectedAttribute: 'account_level',
      issueCodes: [accIssue.code],
      affectedSkuCount:
        accIssue.platform === 'google'
          ? params.googleProducts.length
          : params.microsoftProducts.length,
      affectedSkus: ['ALL_ACCOUNT_SKUS'],
      plainEnglishCause: accIssue.diagnostic.plainEnglishCause,
      steps: accIssue.diagnostic.fixSteps,
      helpUrls: [
        {
          url: accIssue.diagnostic.helpUrl,
          verification: accIssue.diagnostic.helpUrlVerification
        }
      ],
      supplementalFeedPatchPreview: []
    });
  }

  const googleBySku = new Map<string, NormalizedProduct>();
  const microsoftBySku = new Map<string, NormalizedProduct>();
  for (const p of params.googleProducts) googleBySku.set(p.sku.toUpperCase(), p);
  for (const p of params.microsoftProducts)
    microsoftBySku.set(p.sku.toUpperCase(), p);

  // 2. Cross-feed backfill patches (e.g., GTIN or Brand available in one feed or landing page, missing in the other)
  const crossBackfillPatches: FixPlanItem['supplementalFeedPatchPreview'] = [];
  const crossBackfillSkus = new Set<string>();
  const allSkus = new Set<string>([
    ...googleBySku.keys(),
    ...microsoftBySku.keys()
  ]);

  for (const skuKey of [...allSkus].sort()) {
    const g = googleBySku.get(skuKey);
    const m = microsoftBySku.get(skuKey);
    const canonicalSku = g?.sku || m?.sku || skuKey;
    const lp =
      params.landingPagesBySku?.get(canonicalSku) ??
      params.landingPagesBySku?.get(skuKey);

    const bestGtin = g?.gtin || m?.gtin || lp?.gtin;
    if (bestGtin) {
      if (g && !g.gtin) {
        crossBackfillSkus.add(canonicalSku);
        crossBackfillPatches.push({
          sku: canonicalSku,
          targetPlatform: 'google',
          attribute: 'gtin',
          currentValue: null,
          suggestedValue: bestGtin,
          note: `Copied verified GTIN from ${m?.gtin ? 'Microsoft Merchant Center feed' : 'landing page JSON-LD'}`
        });
      }
      if (m && !m.gtin) {
        crossBackfillSkus.add(canonicalSku);
        crossBackfillPatches.push({
          sku: canonicalSku,
          targetPlatform: 'microsoft',
          attribute: 'gtin',
          currentValue: null,
          suggestedValue: bestGtin,
          note: `Copied verified GTIN from ${g?.gtin ? 'Google Merchant Center feed' : 'landing page JSON-LD'}`
        });
      }
    }

    const bestBrand = g?.brand || m?.brand || lp?.brand;
    if (bestBrand) {
      if (g && !g.brand) {
        crossBackfillSkus.add(canonicalSku);
        crossBackfillPatches.push({
          sku: canonicalSku,
          targetPlatform: 'google',
          attribute: 'brand',
          currentValue: null,
          suggestedValue: bestBrand,
          note: `Copied brand from ${m?.brand ? 'Microsoft Merchant Center feed' : 'landing page JSON-LD'}`
        });
      }
      if (m && !m.brand) {
        crossBackfillSkus.add(canonicalSku);
        crossBackfillPatches.push({
          sku: canonicalSku,
          targetPlatform: 'microsoft',
          attribute: 'brand',
          currentValue: null,
          suggestedValue: bestBrand,
          note: `Copied brand from ${g?.brand ? 'Google Merchant Center feed' : 'landing page JSON-LD'}`
        });
      }
    }
  }

  if (crossBackfillPatches.length > 0) {
    plan.push({
      priority: priorityCounter++,
      category: 'cross_feed_backfill',
      title:
        'Backfill missing GTIN and Brand attributes across platforms using existing feed/schema values',
      affectedPlatform: 'both',
      affectedAttribute: 'gtin, brand',
      issueCodes: [
        'missing_gtin',
        'missing_required_attribute_brand',
        'bing_missing_gtin_or_mpn'
      ],
      affectedSkuCount: crossBackfillSkus.size,
      affectedSkus: [...crossBackfillSkus],
      plainEnglishCause:
        'One shopping feed is missing required product identifiers (GTIN or Brand) that are already present and approved in your other shopping feed or landing page JSON-LD.',
      steps: [
        'Apply the generated supplemental feed patch rows below to populate missing [gtin] and [brand] values without manual lookup.',
        'Re-process the supplemental feed or catalog in Google/Microsoft Merchant Center.'
      ],
      helpUrls: [
        {
          url: 'https://support.google.com/merchants/answer/6324461 (TODO-verify)',
          verification: 'TODO-verify'
        },
        {
          url: 'https://help.ads.microsoft.com/#apex/ads/en/51105/1 (TODO-verify)',
          verification: 'TODO-verify'
        }
      ],
      supplementalFeedPatchPreview: crossBackfillPatches
    });
  }

  // 3. Group remaining item-level issues by (platform + issueCode)
  const groupedIssues = new Map<
    string,
    {
      platform: 'google' | 'microsoft';
      issue: NormalizedProductIssue;
      products: NormalizedProduct[];
    }
  >();

  for (const product of [...params.googleProducts, ...params.microsoftProducts]) {
    for (const issue of product.issues) {
      const key = `${product.platform}:${issue.code}`;
      const existing = groupedIssues.get(key);
      if (existing) {
        if (!existing.products.some((p) => p.sku === product.sku)) {
          existing.products.push(product);
        }
      } else {
        groupedIssues.set(key, {
          platform: product.platform,
          issue,
          products: [product]
        });
      }
    }
  }

  const sortedGroups = [...groupedIssues.values()].sort((a, b) => {
    const sevWeight = (s: string) =>
      s === 'disapproval' ? 3 : s === 'demotion' ? 2 : 1;
    const diffSev =
      sevWeight(b.issue.severity) - sevWeight(a.issue.severity);
    if (diffSev !== 0) return diffSev;
    return b.products.length - a.products.length;
  });

  for (const group of sortedGroups) {
    const { platform, issue, products } = group;
    const patches: FixPlanItem['supplementalFeedPatchPreview'] = [];

    for (const p of products) {
      const lp = params.landingPagesBySku?.get(p.sku);
      const otherFeed =
        platform === 'google'
          ? microsoftBySku.get(p.sku.toUpperCase())
          : googleBySku.get(p.sku.toUpperCase());

      const attr = issue.diagnostic.affectedAttribute;
      if (attr === 'price') {
        const currentPrice = (p.salePrice ?? p.price)?.formatted ?? null;
        const suggested =
          lp?.price?.formatted ??
          (otherFeed?.approvalStatus === 'approved'
            ? (otherFeed.salePrice ?? otherFeed.price)?.formatted
            : undefined) ??
          'Match live landing page Offer.price';
        patches.push({
          sku: p.sku,
          targetPlatform: platform,
          attribute: 'price',
          currentValue: currentPrice,
          suggestedValue: suggested,
          note: lp?.price
            ? `Synced from live landing page (${lp.url})`
            : 'Align feed price with storefront JSON-LD Offer.price'
        });
      } else if (attr === 'availability') {
        const suggested =
          lp && lp.availability !== 'unknown'
            ? lp.availability
            : otherFeed?.approvalStatus === 'approved'
              ? otherFeed.availability
              : 'out_of_stock';
        patches.push({
          sku: p.sku,
          targetPlatform: platform,
          attribute: 'availability',
          currentValue: p.availability,
          suggestedValue: suggested,
          note: 'Align feed availability with live landing page schema.org/Offer'
        });
      } else if (attr === 'gtin') {
        const suggested =
          lp?.gtin ||
          (otherFeed?.approvalStatus === 'approved' ? otherFeed.gtin : undefined) ||
          'VERIFY_GS1_BARCODE_OR_SET_IDENTIFIER_EXISTS_FALSE';
        patches.push({
          sku: p.sku,
          targetPlatform: platform,
          attribute: 'gtin',
          currentValue: p.gtin ?? null,
          suggestedValue: suggested,
          note: 'Replace invalid/missing GTIN with verified 12/13/14-digit GS1 barcode'
        });
      } else {
        patches.push({
          sku: p.sku,
          targetPlatform: platform,
          attribute: attr,
          currentValue: issue.diagnostic.actualOffendingValue ?? null,
          suggestedValue: `Fix [${attr}] per ${platform} spec`,
          note: issue.diagnostic.title
        });
      }
    }

    const category: FixPlanItem['category'] =
      issue.diagnostic.affectedAttribute === 'price' ||
      issue.diagnostic.affectedAttribute === 'availability'
        ? 'landing_page_sync'
        : issue.code.includes('policy') || issue.code.includes('trademark')
          ? 'policy_review'
          : 'feed_attribute_fix';

    plan.push({
      priority: priorityCounter++,
      category,
      title: `[${platform.toUpperCase()}] ${issue.diagnostic.title}`,
      affectedPlatform: platform,
      affectedAttribute: issue.diagnostic.affectedAttribute,
      issueCodes: [issue.code],
      affectedSkuCount: products.length,
      affectedSkus: products.map((p) => p.sku),
      plainEnglishCause: issue.diagnostic.plainEnglishCause,
      steps: issue.diagnostic.fixSteps,
      helpUrls: [
        {
          url: issue.diagnostic.helpUrl,
          verification: issue.diagnostic.helpUrlVerification
        }
      ],
      supplementalFeedPatchPreview: patches
    });
  }

  return plan;
}
