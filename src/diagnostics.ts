import type {
  DisapprovalDiagnostic,
  HelpUrlVerification,
  IssueSeverity,
  Platform
} from './types.js';

export interface IssueCatalogEntry {
  code: string;
  aliases?: string[];
  platform: Platform | 'cross_platform';
  severity: IssueSeverity;
  title: string;
  plainEnglishCause: string;
  affectedAttribute: string;
  exampleOffendingValue: string;
  fixSteps: string[];
  helpUrl: string;
  helpUrlVerification: HelpUrlVerification;
}

const VERIFIED_LOCAL_DOC_URLS = new Set<string>([
  'https://developers.google.com/merchant/api',
  'https://ssl.bing.com/webmaster/api.svc/json'
]);

/**
 * Comprehensive issue catalog for Google Merchant Center (Merchant API v1)
 * and Microsoft Merchant Center (Bing Shopping Content API).
 */
export const ISSUE_CATALOG: IssueCatalogEntry[] = [
  // === GOOGLE MERCHANT CENTER ITEM-LEVEL ISSUES ===
  {
    code: 'price_mismatch',
    aliases: ['price_mismatch_crawl', 'inaccurate_price', 'landing_page_price_mismatch'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Price mismatch between feed and landing page',
    plainEnglishCause:
      'Google crawled the product landing page and found a visible price or JSON-LD Offer price that differs from the price submitted in your Merchant Center feed.',
    affectedAttribute: 'price',
    exampleOffendingValue: 'Feed price: "49.99 USD" vs. Landing page JSON-LD price: "59.99 USD"',
    fixSteps: [
      'Inspect the product landing page HTML and JSON-LD (@type: Product -> offers.price) to confirm the exact variant price shown to users.',
      'Ensure variant URLs (e.g., ?variant=12345) pre-select the exact variant and output that variant price in server-rendered JSON-LD and OpenGraph meta tags.',
      'Update your primary feed or apply a supplemental feed patch so [price] and [sale_price] match the live storefront price and currency.',
      'Enable Automatic Item Updates for price in Google Merchant Center while feed sync latency is being resolved.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6098334 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'availability_mismatch',
    aliases: ['availability_mismatch_crawl', 'inaccurate_availability'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Availability mismatch between feed and landing page',
    plainEnglishCause:
      'The availability value in your Google feed (e.g., "in_stock") conflicts with the availability shown on the landing page or inside schema.org/Offer structured data (e.g., "OutOfStock").',
    affectedAttribute: 'availability',
    exampleOffendingValue: 'Feed availability: "in_stock" vs. Landing page schema: "https://schema.org/OutOfStock"',
    fixSteps: [
      'Check the landing page JSON-LD Offer.availability property and button state ("Add to Cart" vs "Sold Out").',
      'Increase feed fetch frequency or connect the Merchant API v1 products endpoint to push inventory changes in real time.',
      'Enable Automatic Item Updates for availability in Google Merchant Center.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6098329 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'invalid_gtin',
    aliases: ['invalid_upc', 'invalid_ean', 'gtin_check_digit_invalid', 'reserved_gtin'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Invalid or restricted GTIN (UPC/EAN/ISBN)',
    plainEnglishCause:
      'The GTIN submitted for this product fails GS1 modulo-10 check-digit validation, uses a restricted internal/coupon prefix (02, 04, 20-29), or does not match the GS1 length rules (8, 12, 13, or 14 digits).',
    affectedAttribute: 'gtin',
    exampleOffendingValue: 'gtin: "020000123456" (restricted internal GS1 prefix 02) or "123456789012" (bad check digit)',
    fixSteps: [
      'Verify the manufacturer barcode printed on the product packaging against the GS1 check-digit calculator.',
      'Remove internal warehouse SKUs or restricted prefixes (02, 04, 20-29) from the [gtin] field.',
      'If the product is custom-made or has no manufacturer GTIN, clear [gtin] and set [identifier_exists] to "false" (or provide [brand] + [mpn]).'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6239388 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'missing_gtin',
    aliases: ['missing_required_gtin', 'limited_performance_missing_gtin', 'missing_identifiers'],
    platform: 'google',
    severity: 'demotion',
    title: 'Missing required GTIN for known brand item',
    plainEnglishCause:
      'Google identified this product as a mass-produced item with a manufacturer-assigned GS1 barcode, but no [gtin] was provided in the feed, causing item disapproval or severe impression demotion.',
    affectedAttribute: 'gtin',
    exampleOffendingValue: 'gtin: "" (empty) while brand="Nike" and identifier_exists="true"',
    fixSteps: [
      'Check if the same SKU in your Microsoft Merchant Center feed or ERP catalog already has a valid 12/13/14-digit GTIN and backfill it.',
      'Populate the [gtin] attribute with the official UPC (12 digits) or EAN (13 digits) from the manufacturer.',
      'Only set [identifier_exists] to "false" if the product genuinely has no GS1 barcode (e.g., vintage, handmade, or private-label goods without barcodes).'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6324461 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'missing_required_attribute_brand',
    aliases: ['missing_brand', 'invalid_brand'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Missing required attribute: [brand]',
    plainEnglishCause:
      'The product is marked with [identifier_exists]="true", which requires a valid manufacturer or store brand name in the [brand] attribute, but [brand] is blank or placeholder text.',
    affectedAttribute: 'brand',
    exampleOffendingValue: 'brand: "" or "N/A"',
    fixSteps: [
      'Populate the [brand] attribute with the official brand or manufacturer name (or your own store brand for private-label products).',
      'Do not use values like "N/A", "Generic", "None", or "Unknown".',
      'If the item truly has no brand or identifier, set [identifier_exists] to "false".'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6324351 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'promotional_overlay_on_image',
    aliases: ['image_overlay', 'watermarked_image'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Promotional text, badge, or watermark on product image',
    plainEnglishCause:
      'The main product image ([image_link]) contains overlaid promotional text (e.g., "FREE SHIPPING", "20% OFF"), retailer logos, watermarks, or borders, which violates Google Shopping image guidelines.',
    affectedAttribute: 'image_link',
    exampleOffendingValue: 'image_link: "https://cdn.example.com/products/sku-104-sale-badge.jpg"',
    fixSteps: [
      'Replace [image_link] with a clean, unobstructed photo of the product on a white or neutral background without badges, text, or watermarks.',
      'Enable Automatic Image Improvements in Google Merchant Center to automatically strip simple promotional overlays.',
      'Use [sale_price] or Merchant Promotions feeds to advertise discounts instead of baking badges into the image.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6324350 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'image_too_small',
    aliases: ['image_resolution_too_low', 'invalid_image_size'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Product image resolution is below minimum requirements',
    plainEnglishCause:
      'The image at [image_link] is smaller than Google Shopping minimums (100x100 px for non-apparel; 250x250 px for apparel products).',
    affectedAttribute: 'image_link',
    exampleOffendingValue: 'image_link: "https://cdn.example.com/thumbs/sku-80x80.jpg" (80x80 px)',
    fixSteps: [
      'Point [image_link] to the full-size master product image (recommended at least 800x800 px) rather than a thumbnail URL.',
      'Remove URL resize query parameters such as ?width=100 or _small.jpg from the feed mapper.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6324350 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'landing_page_error',
    aliases: ['desktop_landing_page_error', 'mobile_landing_page_error', 'http_404_error', 'page_not_found'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Landing page unavailable (HTTP 4xx/5xx or redirect error)',
    plainEnglishCause:
      'Googlebot could not load the product [link] URL on desktop or mobile (returned HTTP 404, 500, timeout, or redirected to a generic homepage/error page).',
    affectedAttribute: 'link',
    exampleOffendingValue: 'link: "https://shop.example.com/products/discontinued-item" (HTTP 404)',
    fixSteps: [
      'Verify that the [link] URL returns HTTP 200 OK from all geographic regions and does not geo-block or bot-block Googlebot.',
      'Remove unpublished or deleted products from the primary feed, or update [link] to the canonical live product URL.',
      'Ensure the page does not redirect to a generic category or homepage when out of stock.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/4752265 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'robots_txt_blocked',
    aliases: ['page_not_crawlable_robots_txt', 'image_not_crawlable_robots_txt'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Page or image blocked by robots.txt',
    plainEnglishCause:
      'Your site robots.txt file blocks Googlebot or Googlebot-Image from crawling the product landing page ([link]) or main image ([image_link]).',
    affectedAttribute: 'link',
    exampleOffendingValue: 'Disallow: /products/ or User-agent: Googlebot Disallow: /',
    fixSteps: [
      'Update robots.txt on your storefront domain to allow User-agent: Googlebot and User-agent: Googlebot-Image on product and CDN paths.',
      'Test the URL in Google Search Console URL Inspection tool to confirm crawlability.',
      'Request a re-crawl in Google Merchant Center once robots.txt is updated.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6098185 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'missing_shipping',
    aliases: ['missing_shipping_cost', 'incomplete_shipping'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Missing shipping rate for target country',
    plainEnglishCause:
      'Neither account-level shipping settings nor item-level [shipping] attributes specify a valid shipping rate for the target country, or carrier-calculated shipping is missing [shipping_weight].',
    affectedAttribute: 'shipping',
    exampleOffendingValue: 'shipping: "" (no account-level shipping service configured for US)',
    fixSteps: [
      'Configure an account-level shipping policy in Google Merchant Center covering the target country and currency, OR',
      'Provide item-level [shipping] (e.g., "US:::5.99 USD") via a supplemental feed or feed rule.',
      'If using carrier-calculated rates, ensure every product includes [shipping_weight] and dimensions.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6324484 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'policy_violation_healthcare_misleading_claims',
    aliases: ['unapproved_pharmaceuticals_and_supplements', 'misleading_health_claims', 'policy_violation_supplements'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Policy violation: Unapproved healthcare or misleading medical claims',
    plainEnglishCause:
      'The product title, description, or landing page contains prohibited medical/disease-cure claims (e.g., "cures insomnia", "FDA-approved weight loss") or restricted supplement ingredients.',
    affectedAttribute: 'description',
    exampleOffendingValue: 'description: "Clinically proven to cure joint arthritis in 7 days"',
    fixSteps: [
      'Remove disease-treatment, cure, or unverified clinical claims from both the feed [title]/[description] AND the live product landing page.',
      'Include standard FDA disclaimer copy on supplement landing pages where applicable.',
      'After updating both feed and landing page text, request a manual policy review in Merchant Center.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6150127 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'policy_violation_adult',
    aliases: ['adult_content_violation', 'missing_adult_attribute'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Policy violation: Undeclared adult-oriented merchandise',
    plainEnglishCause:
      'Google classified the product or imagery as adult-oriented, but the [adult] attribute is not set to "yes" or account-level adult content settings are disabled.',
    affectedAttribute: 'adult',
    exampleOffendingValue: 'adult: "no" on adult-oriented item',
    fixSteps: [
      'If the item is adult-oriented, set [adult] to "yes" in the feed and enable adult content in Merchant Center account settings.',
      'If the item is mainstream apparel/wellness flagged by mistake, replace suggestive imagery at [image_link] and request a review.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6150138 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },

  // === MICROSOFT MERCHANT CENTER (BING CONTENT API) ITEM-LEVEL ISSUES ===
  {
    code: 'bing_price_mismatch',
    aliases: ['microsoft_price_mismatch', 'OfferPriceMismatch', 'PriceMismatch'],
    platform: 'microsoft',
    severity: 'disapproval',
    title: 'Microsoft Merchant Center: Price mismatch with landing page',
    plainEnglishCause:
      'Bing crawled the product URL and detected a price in the page microdata/JSON-LD that does not match the price submitted in your Microsoft Merchant Center catalog.',
    affectedAttribute: 'price',
    exampleOffendingValue: 'Catalog price: "49.99 USD" vs. Page price: "54.99 USD"',
    fixSteps: [
      'Verify that the Microsoft catalog feed sync runs on the same schedule as your Google feed and storefront price updates.',
      'Ensure schema.org/Offer price on the landing page matches the exact variant linked by the offer URL.',
      'Re-upload or trigger an immediate feed fetch in Microsoft Merchant Center.'
    ],
    helpUrl: 'https://help.ads.microsoft.com/#apex/ads/en/51084/1 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'bing_missing_gtin_or_mpn',
    aliases: ['MissingProductIdentifiers', 'microsoft_missing_gtin', 'InvalidGtin'],
    platform: 'microsoft',
    severity: 'disapproval',
    title: 'Microsoft Merchant Center: Missing or invalid product identifiers (GTIN / Brand+MPN)',
    plainEnglishCause:
      'Microsoft Shopping requires a valid GTIN (UPC/EAN/ISBN) or a valid Brand + MPN pair for manufactured goods, and rejected this offer because the identifier is missing or invalid.',
    affectedAttribute: 'gtin',
    exampleOffendingValue: 'gtin: null, mpn: null, brand: "Acme"',
    fixSteps: [
      'Copy the verified [gtin] and [brand]/[mpn] values from your approved Google Merchant Center feed if present for the same SKU.',
      'Ensure UPCs are 12 digits (pad leading zero if Excel stripped it, e.g., 11-digit string -> 12-digit string).',
      'For custom goods without identifiers, set identifier_exists to FALSE in the Microsoft feed.'
    ],
    helpUrl: 'https://help.ads.microsoft.com/#apex/ads/en/51105/1 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'bing_landing_page_unavailable',
    aliases: ['LandingPageError', 'UrlNotFound', 'DestinationUrlDown'],
    platform: 'microsoft',
    severity: 'disapproval',
    title: 'Microsoft Merchant Center: Destination URL unavailable or broken',
    plainEnglishCause:
      'Bingbot received an HTTP 404/500 error, redirect loop, or firewall block (e.g., Cloudflare WAF blocking Bingbot) when requesting the product link.',
    affectedAttribute: 'link',
    exampleOffendingValue: 'link: "https://shop.example.com/products/sku-202" (HTTP 403/404 to Bingbot)',
    fixSteps: [
      'Test the URL with a Bingbot user-agent and verify Cloudflare/WAF rules allow verified Bingbot IPs.',
      'Ensure the product URL returns HTTP 200 OK and matches the verified domain in Microsoft Merchant Center.',
      'Use Bing Webmaster Tools URL Inspection to verify Bing can crawl and index the product page.'
    ],
    helpUrl: 'https://help.ads.microsoft.com/#apex/ads/en/51084/1 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'bing_image_watermark',
    aliases: ['ImagePromotionalText', 'ImageTooSmall', 'InvalidImageUrl'],
    platform: 'microsoft',
    severity: 'disapproval',
    title: 'Microsoft Merchant Center: Image quality or watermark violation',
    plainEnglishCause:
      'The product image submitted to Microsoft Merchant Center is smaller than 220x220 px, unreachable, or contains promotional text/watermarks.',
    affectedAttribute: 'image_link',
    exampleOffendingValue: 'image_link: "https://cdn.example.com/products/sku-150x150-promo.jpg"',
    fixSteps: [
      'Provide a clean, high-resolution product image (at least 800x800 px recommended; Microsoft minimum is 220x220 px, which is stricter than Google non-apparel 100x100 px).',
      'Remove watermarks, sale stickers, and framing borders from the primary image URL.'
    ],
    helpUrl: 'https://help.ads.microsoft.com/#apex/ads/en/51084/1 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'bing_policy_trademark',
    aliases: ['EditorialRestricted', 'TrademarkViolation', 'ProhibitedContent'],
    platform: 'microsoft',
    severity: 'disapproval',
    title: 'Microsoft Merchant Center: Editorial or policy restriction',
    plainEnglishCause:
      'The offer triggered a Microsoft Advertising editorial or restricted-category check (such as restricted health claims, weapon accessories, or excessive ALL-CAPS / punctuation in the title).',
    affectedAttribute: 'title',
    exampleOffendingValue: 'title: "*** BEST SALE EVER!! *** Keto Gummies 100% Pure"',
    fixSteps: [
      'Remove excessive capitalization, symbols (***, !!!), and promotional phrases ("Free Shipping", "Best Sale") from [title] and [description].',
      'Ensure the product complies with Microsoft Advertising Shopping policies and request an editorial exception review if flagged in error.'
    ],
    helpUrl: 'https://about.ads.microsoft.com/en-us/resources/policies/microsoft-advertising-shopping-policies (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },

  // === ACCOUNT-LEVEL ISSUES ===
  {
    code: 'account_misrepresentation_warning',
    aliases: ['misrepresentation', 'unverified_website', 'missing_return_policy'],
    platform: 'google',
    severity: 'disapproval',
    title: 'Account-level issue: Website trust, contact info, or return policy incomplete',
    plainEnglishCause:
      'Google flagged the Merchant Center account because the storefront is missing clear business contact details (physical address, email, phone), transparent shipping/return policies, or consistent branding.',
    affectedAttribute: 'account_level',
    exampleOffendingValue: 'Footer missing physical address and /policies/refund-policy returns 404',
    fixSteps: [
      'Publish clear Shipping Policy, Refund/Return Policy, Contact Us (with at least two contact methods: email, phone, or physical address), and Terms of Service links in the storefront footer.',
      'Ensure the business address and phone number in Google Merchant Center Business Info match the website footer exactly.',
      'Fix all item-level price and availability mismatches before clicking "Request review" in Merchant Center.'
    ],
    helpUrl: 'https://support.google.com/merchants/answer/6150127 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  },
  {
    code: 'bing_domain_not_verified',
    aliases: ['DomainNotVerified', 'StoreSuspended'],
    platform: 'microsoft',
    severity: 'disapproval',
    title: 'Account-level issue: Microsoft Merchant Center store domain unverified or mismatched',
    plainEnglishCause:
      'The store domain in Microsoft Merchant Center is not verified via Bing Webmaster Tools or UET tag, or product links point to a different domain.',
    affectedAttribute: 'account_level',
    exampleOffendingValue: 'Store domain: example.com vs. Feed links: shop.example-store.com',
    fixSteps: [
      'Verify ownership of the exact storefront domain in Bing Webmaster Tools using the same Microsoft account.',
      'Ensure all product [link] URLs in your catalog use the verified store domain.'
    ],
    helpUrl: 'https://help.ads.microsoft.com/#apex/ads/en/51084/1 (TODO-verify)',
    helpUrlVerification: 'TODO-verify'
  }
];

const CATALOG_INDEX = new Map<string, IssueCatalogEntry>();
for (const entry of ISSUE_CATALOG) {
  CATALOG_INDEX.set(entry.code.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) {
    CATALOG_INDEX.set(alias.toLowerCase(), entry);
  }
}

export function normalizeHelpUrl(rawUrl?: string): {
  helpUrl: string;
  helpUrlVerification: HelpUrlVerification;
} {
  if (!rawUrl) {
    return {
      helpUrl: 'https://developers.google.com/merchant/api',
      helpUrlVerification: 'verified-in-local-docs'
    };
  }
  const clean = rawUrl.replace(/\s*\(TODO-verify\)\s*$/i, '').trim();
  if (VERIFIED_LOCAL_DOC_URLS.has(clean)) {
    return {
      helpUrl: clean,
      helpUrlVerification: 'verified-in-local-docs'
    };
  }
  return {
    helpUrl: `${clean} (TODO-verify)`,
    helpUrlVerification: 'TODO-verify'
  };
}

/**
 * Maps any Google Merchant Center or Microsoft Merchant Center issue code
 * to a complete plain-English diagnostic with affected attribute, example offending value,
 * actionable fix steps, and verified/TODO-verify help URL.
 */
export function diagnoseIssueCode(params: {
  code: string;
  platform: Platform;
  rawSeverity?: string;
  rawAttribute?: string;
  rawDescription?: string;
  actualOffendingValue?: string;
  rawDocumentationUrl?: string;
}): DisapprovalDiagnostic {
  const key = params.code.trim().toLowerCase();
  const match = CATALOG_INDEX.get(key);

  if (match) {
    return {
      code: params.code,
      platform: params.platform,
      severity: mapRawSeverity(params.rawSeverity, match.severity),
      title: match.title,
      plainEnglishCause: match.plainEnglishCause,
      affectedAttribute: params.rawAttribute || match.affectedAttribute,
      exampleOffendingValue: match.exampleOffendingValue,
      ...(params.actualOffendingValue
        ? { actualOffendingValue: params.actualOffendingValue }
        : {}),
      fixSteps: [...match.fixSteps],
      helpUrl: match.helpUrl,
      helpUrlVerification: match.helpUrlVerification
    };
  }

  // Fallback for unknown or newly introduced platform issue codes
  const fallbackUrl =
    params.rawDocumentationUrl ||
    (params.platform === 'google'
      ? 'https://developers.google.com/merchant/api'
      : 'https://help.ads.microsoft.com/#apex/ads/en/51084/1');
  const { helpUrl, helpUrlVerification } = normalizeHelpUrl(fallbackUrl);
  const attribute = params.rawAttribute || 'feed_record';

  return {
    code: params.code,
    platform: params.platform,
    severity: mapRawSeverity(params.rawSeverity, 'disapproval'),
    title: params.rawDescription || `Feed issue: ${params.code}`,
    plainEnglishCause:
      params.rawDescription ||
      `The ${params.platform === 'google' ? 'Google Merchant Center' : 'Microsoft Merchant Center'} feed validator reported issue code "${params.code}" on attribute [${attribute}].`,
    affectedAttribute: attribute,
    exampleOffendingValue:
      params.actualOffendingValue || `Invalid or missing value for [${attribute}]`,
    ...(params.actualOffendingValue
      ? { actualOffendingValue: params.actualOffendingValue }
      : {}),
    fixSteps: [
      `Inspect the [${attribute}] field for this SKU in your ${params.platform === 'google' ? 'Google' : 'Microsoft'} feed payload.`,
      'Compare the attribute value against the live product landing page and your other platform feed.',
      'Apply a feed rule or supplemental feed override and trigger a re-fetch.'
    ],
    helpUrl,
    helpUrlVerification
  };
}

function mapRawSeverity(
  rawSeverity: string | undefined,
  defaultSeverity: IssueSeverity
): IssueSeverity {
  if (!rawSeverity) return defaultSeverity;
  const norm = rawSeverity.toLowerCase();
  if (
    norm.includes('disapprov') ||
    norm === 'error' ||
    norm === 'critical' ||
    norm === 'rejected'
  ) {
    return 'disapproval';
  }
  if (norm.includes('demot') || norm === 'unaffected') {
    return 'demotion';
  }
  if (norm.includes('warn') || norm.includes('suggestion')) {
    return 'warning';
  }
  return defaultSeverity;
}
