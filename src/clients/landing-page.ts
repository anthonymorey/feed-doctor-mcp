import type {
  AvailabilityStatus,
  FetchLike,
  LandingPageSnapshot,
  MoneyAmount
} from '../types.js';

const PRIVATE_OR_LOCAL_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i
];

/**
 * Validates that a landing-page URL is a safe public HTTP(S) URL and, if
 * `allowedMerchantDomains` is non-empty, belongs to the merchant's own domain.
 */
export function assertSafeMerchantUrl(
  rawUrl: string,
  allowedMerchantDomains: string[] = []
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid landing page URL: "${rawUrl}"`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Unsupported URL protocol "${parsed.protocol}". Only http: and https: merchant URLs are allowed.`
    );
  }

  const host = parsed.hostname.toLowerCase();
  for (const pattern of PRIVATE_OR_LOCAL_HOST_PATTERNS) {
    if (pattern.test(host)) {
      throw new Error(
        `Refusing to fetch private, loopback, or internal host "${host}".`
      );
    }
  }

  const normalizedAllowed = allowedMerchantDomains
    .map((d) => {
      try {
        return d.includes('://')
          ? new URL(d).hostname.toLowerCase().replace(/^www\./, '')
          : d.toLowerCase().trim().replace(/^www\./, '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  if (normalizedAllowed.length > 0) {
    const cleanHost = host.replace(/^www\./, '');
    const matchesMerchant = normalizedAllowed.some(
      (domain) => cleanHost === domain || cleanHost.endsWith(`.${domain}`)
    );
    if (!matchesMerchant) {
      throw new Error(
        `URL host "${host}" does not match the merchant's own domain(s): ${normalizedAllowed.join(', ')}`
      );
    }
  }

  return parsed;
}

function mapSchemaAvailability(raw: string | undefined): AvailabilityStatus {
  if (!raw) return 'unknown';
  const norm = raw.toLowerCase().replace(/^https?:\/\/schema\.org\//, '');
  if (
    norm === 'instock' ||
    norm === 'in_stock' ||
    norm === 'in stock' ||
    norm === 'instoreonly' ||
    norm === 'onlineonly' ||
    norm === 'limitedavailability'
  ) {
    return 'in_stock';
  }
  if (
    norm === 'outofstock' ||
    norm === 'out_of_stock' ||
    norm === 'out of stock' ||
    norm === 'soldout' ||
    norm === 'discontinued'
  ) {
    return 'out_of_stock';
  }
  if (norm === 'preorder' || norm === 'pre_order' || norm === 'presale') {
    return 'preorder';
  }
  if (norm === 'backorder' || norm === 'back_order') {
    return 'backorder';
  }
  return 'unknown';
}

function formatMoney(amount: number, currency: string): MoneyAmount {
  const cur = currency.toUpperCase() || 'USD';
  return {
    amount: Number(amount.toFixed(2)),
    currency: cur,
    formatted: `${amount.toFixed(2)} ${cur}`
  };
}

function extractProductNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractProductNode(item);
      if (found) return found;
    }
    return null;
  }

  const obj = node as Record<string, unknown>;
  const typeVal = obj['@type'];
  const types = Array.isArray(typeVal)
    ? typeVal.map((t) => String(t).toLowerCase())
    : typeof typeVal === 'string'
      ? [typeVal.toLowerCase()]
      : [];

  if (types.some((t) => t === 'product' || t.endsWith('/product'))) {
    return obj;
  }

  if (Array.isArray(obj['@graph'])) {
    return extractProductNode(obj['@graph']);
  }

  return null;
}

/**
 * Parses HTML string from a merchant landing page to extract JSON-LD Product/Offer
 * and OpenGraph / microdata meta tags without executing any page scripts.
 */
export function parseLandingPageHtml(
  html: string,
  url: string,
  httpStatus = 200
): LandingPageSnapshot {
  const rawNotices: string[] = [];
  let title: string | undefined;
  let price: MoneyAmount | undefined;
  let availability: AvailabilityStatus = 'unknown';
  let gtin: string | undefined;
  let sku: string | undefined;
  let brand: string | undefined;
  let currency: string | undefined;
  let usedJsonLd = false;
  let usedMeta = false;

  // 1. Parse <script type="application/ld+json">
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const jsonText = match[1]?.trim();
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText);
      const product = extractProductNode(parsed);
      if (!product) continue;

      usedJsonLd = true;
      if (typeof product.name === 'string') title = product.name;
      if (typeof product.sku === 'string') sku = product.sku;
      const gtinCandidate =
        product.gtin ||
        product.gtin12 ||
        product.gtin13 ||
        product.gtin14 ||
        product.gtin8;
      if (typeof gtinCandidate === 'string') gtin = gtinCandidate;
      if (typeof product.brand === 'string') {
        brand = product.brand;
      } else if (
        product.brand &&
        typeof product.brand === 'object' &&
        typeof (product.brand as Record<string, unknown>).name === 'string'
      ) {
        brand = (product.brand as Record<string, unknown>).name as string;
      }

      const offersRaw = product.offers;
      const firstOffer = Array.isArray(offersRaw)
        ? (offersRaw[0] as Record<string, unknown> | undefined)
        : (offersRaw as Record<string, unknown> | undefined);

      if (firstOffer && typeof firstOffer === 'object') {
        const rawPrice = firstOffer.price ?? firstOffer.lowPrice;
        const rawCurrency =
          (typeof firstOffer.priceCurrency === 'string'
            ? firstOffer.priceCurrency
            : undefined) || 'USD';
        currency = rawCurrency;
        if (rawPrice !== undefined && rawPrice !== null) {
          const num = Number(String(rawPrice).replace(/[^0-9.-]/g, ''));
          if (!Number.isNaN(num)) {
            price = formatMoney(num, rawCurrency);
          }
        }
        if (typeof firstOffer.availability === 'string') {
          availability = mapSchemaAvailability(firstOffer.availability);
        }
        if (!gtin && typeof firstOffer.gtin === 'string') {
          gtin = firstOffer.gtin;
        }
        if (!sku && typeof firstOffer.sku === 'string') {
          sku = firstOffer.sku;
        }
      }
    } catch {
      rawNotices.push('Malformed application/ld+json block encountered on page.');
    }
  }

  // 2. Parse fallback OpenGraph / product meta tags
  const metaTagRegex = /<meta\s+([^>]+)>/gi;
  const metaMap = new Map<string, string>();
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaTagRegex.exec(html)) !== null) {
    const attrs = metaMatch[1] || '';
    const propMatch =
      /(?:property|name|itemprop)=["']([^"']+)["']/i.exec(attrs);
    const contentMatch = /content=["']([^"']*)["']/i.exec(attrs);
    if (propMatch && contentMatch) {
      metaMap.set(propMatch[1].toLowerCase(), contentMatch[1].trim());
    }
  }

  const metaPrice =
    metaMap.get('product:price:amount') ??
    metaMap.get('og:price:amount') ??
    metaMap.get('price');
  const metaCurrency =
    metaMap.get('product:price:currency') ??
    metaMap.get('og:price:currency') ??
    metaMap.get('pricecurrency') ??
    currency ??
    'USD';
  const metaAvailability =
    metaMap.get('product:availability') ??
    metaMap.get('og:availability') ??
    metaMap.get('availability');

  if (!price && metaPrice) {
    const num = Number(metaPrice.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(num)) {
      price = formatMoney(num, metaCurrency);
      currency = metaCurrency;
      usedMeta = true;
    }
  }

  if (availability === 'unknown' && metaAvailability) {
    availability = mapSchemaAvailability(metaAvailability);
    usedMeta = true;
  }

  if (!title) {
    const ogTitle = metaMap.get('og:title');
    if (ogTitle) {
      title = ogTitle;
      usedMeta = true;
    } else {
      const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
      if (titleMatch) title = titleMatch[1].trim();
    }
  }

  const extractionSource =
    usedJsonLd && usedMeta
      ? 'combined'
      : usedJsonLd
        ? 'json-ld'
        : usedMeta
          ? 'meta-tags'
          : 'none';

  if (extractionSource === 'none') {
    rawNotices.push(
      'No schema.org/Product JSON-LD or OpenGraph product price/availability meta tags found on landing page.'
    );
  }

  return {
    url,
    fetchedAt: new Date().toISOString(),
    httpStatus,
    title,
    price,
    availability,
    gtin,
    sku,
    brand,
    currency,
    extractionSource,
    rawNotices
  };
}

/**
 * Fetches and parses the merchant's own public landing page URL.
 */
export async function fetchAndCheckLandingPage(options: {
  url: string;
  allowedMerchantDomains?: string[];
  fetchFn?: FetchLike;
}): Promise<LandingPageSnapshot> {
  const safeUrl = assertSafeMerchantUrl(
    options.url,
    options.allowedMerchantDomains ?? []
  );
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const response = await fetchFn(safeUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'FeedDoctorMCP/0.1 (Read-Only Merchant Feed Auditor)'
    }
  });

  const html = await response.text().catch(() => '');
  const snapshot = parseLandingPageHtml(html, safeUrl.toString(), response.status);
  if (!response.ok) {
    snapshot.rawNotices.unshift(
      `Landing page returned non-200 HTTP status: ${response.status}`
    );
  }
  return snapshot;
}
