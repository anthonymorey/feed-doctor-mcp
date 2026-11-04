import type {
  GoogleAccountIssueRaw,
  GoogleAccountRaw,
  GoogleDataSourceRaw,
  GoogleProductRaw
} from '../clients/google.js';
import type {
  MicrosoftCatalogRaw,
  MicrosoftOfferRaw,
  MicrosoftStoreRaw
} from '../clients/microsoft.js';
import type { FetchLike } from '../types.js';

export const MOCK_GOOGLE_ACCOUNTS: GoogleAccountRaw[] = [
  {
    name: 'accounts/77889900',
    accountId: '77889900',
    accountName: 'Acme Outdoor Gear US',
    homepage: 'https://shop.acme-outdoor.example',
    adultContent: false
  }
];

export const MOCK_GOOGLE_ACCOUNT_ISSUES: GoogleAccountIssueRaw[] = [
  {
    name: 'accounts/77889900/issues/account_misrepresentation_warning',
    code: 'account_misrepresentation_warning',
    title: 'Missing return policy details on storefront footer',
    severity: 'WARNING',
    detail: 'Ensure return window and restocking fee policy are linked in the footer.',
    documentation: 'https://support.google.com/merchants/answer/6150127',
    impactedDestinations: [
      {
        reportingContext: 'SHOPPING_ADS',
        impacts: [{ regionCode: 'US', severity: 'WARNING' }]
      }
    ]
  }
];

export const MOCK_GOOGLE_DATASOURCES: GoogleDataSourceRaw[] = [
  {
    name: 'accounts/77889900/dataSources/1001',
    dataSourceId: '1001',
    displayName: 'Primary US Shopping Feed (API/XML)',
    primaryProductDataSource: {
      channel: 'ONLINE',
      feedLabel: 'US',
      contentLanguage: 'en',
      countries: ['US']
    },
    fileInput: {
      fileName: 'google-us-feed.xml',
      fetchSettings: {
        enabled: true,
        fetchUri: 'https://shop.acme-outdoor.example/feeds/google-us.xml'
      }
    },
    latestFileUpload: {
      processingState: 'SUCCEEDED',
      itemsTotal: 4,
      itemsCreated: 4,
      itemsUpdated: 4,
      uploadTime: '2026-11-01T06:00:00Z',
      issues: [
        {
          code: 'price_mismatch',
          title: 'Price mismatch',
          count: 1,
          severity: 'ERROR'
        },
        {
          code: 'invalid_gtin',
          title: 'Invalid GTIN',
          count: 1,
          severity: 'ERROR'
        }
      ]
    }
  }
];

export const MOCK_GOOGLE_PRODUCTS: GoogleProductRaw[] = [
  {
    name: 'accounts/77889900/products/en~US~SKU-101',
    offerId: 'SKU-101',
    contentLanguage: 'en',
    feedLabel: 'US',
    channel: 'ONLINE',
    attributes: {
      title: 'TrailRunner Pro GTX Shoe',
      link: 'https://shop.acme-outdoor.example/products/trailrunner-pro',
      imageLink: 'https://shop.acme-outdoor.example/images/sku-101.jpg',
      availability: 'in_stock',
      condition: 'new',
      brand: 'AcmeOutdoor',
      gtin: ['00881234567891'],
      mpn: 'TR-GTX-101',
      price: { amountMicros: '49990000', currencyCode: 'USD' }
    },
    productStatus: {
      destinationStatuses: [
        {
          reportingContext: 'SHOPPING_ADS',
          approvedCountries: ['US']
        }
      ],
      itemLevelIssues: [],
      lastUpdateDate: '2026-11-01T06:00:00Z'
    },
    priceCompetitiveness: {
      benchmarkPriceMicros: '45000000',
      benchmarkPriceCurrencyCode: 'USD'
    }
  },
  {
    name: 'accounts/77889900/products/en~US~SKU-102',
    offerId: 'SKU-102',
    contentLanguage: 'en',
    feedLabel: 'US',
    channel: 'ONLINE',
    attributes: {
      title: "Alpine Down Jacket - Men's",
      link: 'https://shop.acme-outdoor.example/products/alpine-down-jacket',
      imageLink: 'https://shop.acme-outdoor.example/images/sku-102-sale-badge.jpg',
      availability: 'in_stock',
      condition: 'new',
      brand: 'AcmeOutdoor',
      gtin: ['00881234567228'],
      mpn: 'ADJ-202',
      price: { amountMicros: '199000000', currencyCode: 'USD' }
    },
    productStatus: {
      destinationStatuses: [
        {
          reportingContext: 'SHOPPING_ADS',
          disapprovedCountries: ['US']
        }
      ],
      itemLevelIssues: [
        {
          code: 'price_mismatch',
          severity: 'DISAPPROVED',
          attribute: 'price',
          reportingContext: 'SHOPPING_ADS',
          description: 'Inaccurate price (due to inconsistent prices between your feed and your landing page)',
          applicableCountries: ['US']
        },
        {
          code: 'promotional_overlay_on_image',
          severity: 'DISAPPROVED',
          attribute: 'image_link',
          reportingContext: 'SHOPPING_ADS',
          description: 'Promotional overlay on image [image_link]',
          applicableCountries: ['US']
        }
      ],
      lastUpdateDate: '2026-11-01T06:00:00Z'
    }
  },
  {
    name: 'accounts/77889900/products/en~US~SKU-103',
    offerId: 'SKU-103',
    contentLanguage: 'en',
    feedLabel: 'US',
    channel: 'ONLINE',
    attributes: {
      title: 'Ultralight Carbon Trekking Poles',
      link: 'https://shop.acme-outdoor.example/products/trekking-poles',
      imageLink: 'https://shop.acme-outdoor.example/images/sku-103.jpg',
      availability: 'in_stock',
      condition: 'new',
      brand: 'AcmeOutdoor',
      gtin: ['020000999888'],
      mpn: 'UCTP-103',
      price: { amountMicros: '89990000', currencyCode: 'USD' }
    },
    productStatus: {
      destinationStatuses: [
        {
          reportingContext: 'SHOPPING_ADS',
          disapprovedCountries: ['US']
        }
      ],
      itemLevelIssues: [
        {
          code: 'invalid_gtin',
          severity: 'DISAPPROVED',
          attribute: 'gtin',
          reportingContext: 'SHOPPING_ADS',
          description: 'Invalid value [gtin]: restricted prefix 02',
          applicableCountries: ['US']
        },
        {
          code: 'availability_mismatch',
          severity: 'DISAPPROVED',
          attribute: 'availability',
          reportingContext: 'SHOPPING_ADS',
          description: 'Inaccurate availability between feed and landing page',
          applicableCountries: ['US']
        }
      ],
      lastUpdateDate: '2026-11-01T06:00:00Z'
    }
  },
  {
    name: 'accounts/77889900/products/en~US~SKU-104',
    offerId: 'SKU-104',
    contentLanguage: 'en',
    feedLabel: 'US',
    channel: 'ONLINE',
    attributes: {
      title: 'Titanium Camp Stove',
      link: 'https://shop.acme-outdoor.example/products/titanium-camp-stove',
      imageLink: 'https://shop.acme-outdoor.example/images/sku-104.jpg',
      availability: 'in_stock',
      condition: 'new',
      brand: 'AcmeOutdoor',
      gtin: ['00881234567006'],
      mpn: 'TCS-104',
      price: { amountMicros: '39990000', currencyCode: 'USD' }
    },
    productStatus: {
      destinationStatuses: [
        {
          reportingContext: 'SHOPPING_ADS',
          approvedCountries: ['US']
        }
      ],
      itemLevelIssues: [],
      lastUpdateDate: '2026-11-01T06:00:00Z'
    }
  }
];

export const MOCK_MICROSOFT_STORES: MicrosoftStoreRaw[] = [
  {
    id: '554433',
    name: 'Acme Outdoor Gear Bing Store',
    domain: 'https://shop.acme-outdoor.example',
    status: 'Active',
    adultContent: false,
    issues: []
  }
];

export const MOCK_MICROSOFT_CATALOGS: MicrosoftCatalogRaw[] = [
  {
    id: '9901',
    name: 'Bing US Primary Catalog',
    feedType: 'Primary',
    processingStatus: 'Warning',
    itemsTotal: 3,
    itemsValid: 1,
    itemsWithErrors: 2,
    lastUploadTime: '2026-11-01T05:30:00Z',
    fetchUrl: 'https://shop.acme-outdoor.example/feeds/bing-us.tsv'
  }
];

export const MOCK_MICROSOFT_OFFERS: MicrosoftOfferRaw[] = [
  {
    id: 'ms:SKU-101',
    offerId: 'SKU-101',
    title: 'TrailRunner Pro GTX Shoe',
    link: 'https://shop.acme-outdoor.example/products/trailrunner-pro',
    imageLink: 'https://shop.acme-outdoor.example/images/sku-101.jpg',
    price: { value: '49.99', currency: 'USD' },
    availability: 'in_stock',
    condition: 'new',
    // Missing gtin and brand on Microsoft even though Google has both!
    gtin: undefined,
    brand: undefined,
    mpn: 'TR-GTX-101',
    status: 'Disapproved',
    itemLevelIssues: [
      {
        code: 'bing_missing_gtin_or_mpn',
        severity: 'Disapproved',
        attribute: 'gtin',
        description: 'Offer is missing required GTIN or Brand+MPN identifier.',
        destination: 'MICROSOFT_SHOPPING'
      }
    ],
    lastUpdated: '2026-11-01T05:30:00Z'
  },
  {
    id: 'ms:SKU-102',
    offerId: 'SKU-102',
    title: "Alpine Down Jacket - Men's",
    link: 'https://shop.acme-outdoor.example/products/alpine-down-jacket',
    imageLink: 'https://shop.acme-outdoor.example/images/sku-102-clean.jpg',
    price: { value: '209.00', currency: 'USD' },
    availability: 'in_stock',
    condition: 'new',
    brand: 'AcmeOutdoor',
    gtin: '00881234567228',
    mpn: 'ADJ-202',
    status: 'Disapproved',
    itemLevelIssues: [
      {
        code: 'bing_price_mismatch',
        severity: 'Disapproved',
        attribute: 'price',
        description: 'Catalog price (209.00 USD) does not match landing page price (219.00 USD).',
        destination: 'MICROSOFT_SHOPPING'
      }
    ],
    lastUpdated: '2026-11-01T05:30:00Z'
  },
  {
    id: 'ms:SKU-103',
    offerId: 'SKU-103',
    title: 'Ultralight Carbon Trekking Poles',
    link: 'https://shop.acme-outdoor.example/products/trekking-poles',
    imageLink: 'https://shop.acme-outdoor.example/images/sku-103.jpg',
    price: { value: '89.99', currency: 'USD' },
    availability: 'out_of_stock',
    condition: 'new',
    brand: 'AcmeOutdoor',
    // Valid GTIN on Microsoft that can backfill Google's invalid 02 prefix GTIN!
    gtin: '00881234567112',
    mpn: 'UCTP-103',
    status: 'Approved',
    itemLevelIssues: [],
    lastUpdated: '2026-11-01T05:30:00Z'
  }
];

export const MOCK_LANDING_PAGES: Record<string, string> = {
  'https://shop.acme-outdoor.example/products/alpine-down-jacket': `
    <!doctype html>
    <html>
      <head>
        <title>Alpine Down Jacket - Men's | Acme Outdoor</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Alpine Down Jacket - Men's",
            "sku": "SKU-102",
            "gtin14": "00881234567228",
            "brand": { "@type": "Brand", "name": "AcmeOutdoor" },
            "offers": {
              "@type": "Offer",
              "price": "219.00",
              "priceCurrency": "USD",
              "availability": "https://schema.org/InStock"
            }
          }
        </script>
      </head>
      <body><h1>Alpine Down Jacket</h1><p>$219.00</p></body>
    </html>
  `,
  'https://shop.acme-outdoor.example/products/trekking-poles': `
    <!doctype html>
    <html>
      <head>
        <title>Ultralight Carbon Trekking Poles | Acme Outdoor</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Ultralight Carbon Trekking Poles",
            "sku": "SKU-103",
            "gtin14": "00881234567112",
            "brand": "AcmeOutdoor",
            "offers": {
              "@type": "Offer",
              "price": "89.99",
              "priceCurrency": "USD",
              "availability": "https://schema.org/OutOfStock"
            }
          }
        </script>
      </head>
      <body><h1>Ultralight Carbon Trekking Poles</h1><p>Sold Out</p></body>
    </html>
  `,
  'https://shop.acme-outdoor.example/products/trailrunner-pro': `
    <!doctype html>
    <html>
      <head>
        <meta property="og:title" content="TrailRunner Pro GTX Shoe" />
        <meta property="product:price:amount" content="49.99" />
        <meta property="product:price:currency" content="USD" />
        <meta property="product:availability" content="in stock" />
      </head>
      <body><h1>TrailRunner Pro GTX Shoe</h1></body>
    </html>
  `
};

/**
 * Deterministic, zero-network mock `fetch` implementation for tests.
 */
export function createMockFetch(): FetchLike {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (
      init?.method ||
      (typeof input === 'object' && 'method' in input ? input.method : 'GET')
    ).toUpperCase();

    if (method !== 'GET') {
      return new Response(
        JSON.stringify({ error: `Disallowed non-readonly HTTP method: ${method}` }),
        { status: 405 }
      );
    }

    // Google Merchant API v1 routes
    if (url === 'https://merchantapi.googleapis.com/accounts/v1beta/accounts') {
      return new Response(JSON.stringify({ accounts: MOCK_GOOGLE_ACCOUNTS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (
      url ===
      'https://merchantapi.googleapis.com/accounts/v1beta/accounts/77889900/issues'
    ) {
      return new Response(
        JSON.stringify({ accountIssues: MOCK_GOOGLE_ACCOUNT_ISSUES }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (
      url ===
      'https://merchantapi.googleapis.com/datasources/v1beta/accounts/77889900/dataSources'
    ) {
      return new Response(
        JSON.stringify({ dataSources: MOCK_GOOGLE_DATASOURCES }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (
      url ===
      'https://merchantapi.googleapis.com/products/v1beta/accounts/77889900/products'
    ) {
      return new Response(JSON.stringify({ products: MOCK_GOOGLE_PRODUCTS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Microsoft Merchant Center Content API v9.1 routes
    if (
      url === 'https://content.api.bingads.microsoft.com/shopping/v9.1/bmc/stores'
    ) {
      return new Response(JSON.stringify({ resources: MOCK_MICROSOFT_STORES }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (
      url ===
      'https://content.api.bingads.microsoft.com/shopping/v9.1/bmc/554433/catalogs'
    ) {
      return new Response(
        JSON.stringify({ resources: MOCK_MICROSOFT_CATALOGS }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (
      url ===
      'https://content.api.bingads.microsoft.com/shopping/v9.1/bmc/554433/products'
    ) {
      return new Response(
        JSON.stringify({ resources: MOCK_MICROSOFT_OFFERS }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Merchant public landing page HTML fixtures
    if (url in MOCK_LANDING_PAGES) {
      return new Response(MOCK_LANDING_PAGES[url], {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return new Response(JSON.stringify({ error: `Unmocked URL: ${url}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}
