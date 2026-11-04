# FeedDoctor MCP (`feed-doctor-mcp`)

> **Suggested public GitHub repository:** `anthonymorey/feed-doctor-mcp` *(not created yet)*

**FeedDoctor MCP** is a **read-only, stateless [Model Context Protocol (MCP)](https://modelcontextprotocol.io) connector** that combines **Google Merchant Center (Merchant API v1)**, **Microsoft Merchant Center (Bing Shopping Content API v9.1)**, and **optional live product landing-page `JSON-LD` / `<meta>` checks** into a single normalized schema to diagnose Shopping feed disapprovals.

---

## What It Is & Why It Exists

Most open-source Shopping MCP servers wrap a single API and dump raw JSON status codes. E-commerce PPC managers, feed specialists, and agency operators still have to cross-reference Google and Bing spreadsheets manually to figure out why a SKU is disapproved.

**FeedDoctor MCP** wins on two fronts:

1. **Multi-Source Synthesis in One Answer:**
   - **Google Merchant API v1** (the successor to Content API for Shopping): accounts, account-level policy/trust issues, primary/supplemental `dataSources` upload health, item-level `productStatus.itemLevelIssues`, and `priceCompetitiveness` benchmarks.
   - **Microsoft Merchant Center (Bing Content API v9.1)**: stores, catalog feed processing status, and offer-level disapproval diagnostics.
   - **Optional Live Landing-Page Schema Auditor**: fetches **only** the merchant's own public product URL (`[link]`) to compare live `schema.org/Product` / `Offer` JSON-LD and OpenGraph `<meta>` price, currency, availability, and GTIN against what Google and Microsoft feeds hold.
2. **Actionable Disapproval Diagnostics & Cross-Feed Diffing:**
   - Maps every Google and Microsoft issue code (`price_mismatch`, `availability_mismatch`, `invalid_gtin`, `missing_gtin`, `promotional_overlay_on_image`, `bing_missing_gtin_or_mpn`, `bing_price_mismatch`, etc.) to:
     - **Plain-English cause**
     - **Affected feed attribute** (`price`, `availability`, `gtin`, `brand`, `image_link`, `link`, `shipping`)
     - **Example & actual offending value**
     - **Step-by-step fix instructions**
     - **Official Google / Microsoft documentation URL** *(URLs verified in local workspace docs are marked `verified-in-local-docs`; unverified deep-link help URLs are explicitly marked `TODO-verify`)*.
   - **Cross-Platform Checks:** automatically flags SKUs that are **approved on Google but disapproved on Microsoft** (or vice versa), identifies missing GTIN/brand attributes that can be backfilled directly from your other feed, and generates copy-ready supplemental feed patch previews.

---

## Privacy & Read-Only Statement

- **100% Read-Only (`readOnlyHint: true`, `destructiveHint: false`):** Every tool registered by `feed-doctor-mcp` is strictly read-only. The server only issues `GET` requests to Google Merchant API v1, Microsoft Content API, and (when explicitly opted in) the merchant's own public product URL. It **never** creates, mutates, overwrites, or deletes products, feeds, or merchant settings.
- **100% Stateless (Zero Customer Data Stored):** No merchant product feeds, account IDs, diagnostics, or OAuth tokens are ever written to disk or a database. Credentials live strictly in memory for the duration of a single MCP request and are discarded immediately when the response finishes.
- **SSRF & Domain-Restricted Landing-Page Check:** When `checkLandingPage: true` is passed, the server refuses private/loopback IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `localhost`) and verifies that the URL hostname matches the merchant's own store domain.

---

## Free Self-Host Quick Start

### Requirements
- **Node.js** `>= 22.0.0`

### 1. Clone & Build

```bash
git clone https://github.com/anthonymorey/feed-doctor-mcp.git
cd feed-doctor-mcp
npm install
npm run build
npm test
```

### 2. Run over `stdio` (Claude Desktop, Cursor, Claude Code)

Add `feed-doctor-mcp` to your `claude_desktop_config.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "feed-doctor": {
      "command": "node",
      "args": ["/absolute/path/to/feed-doctor-mcp/dist/cli.js", "stdio"],
      "env": {
        "GOOGLE_ACCESS_TOKEN": "ya29.your_google_oauth_access_token",
        "GOOGLE_MERCHANT_ACCOUNT_ID": "123456789",
        "MICROSOFT_ACCESS_TOKEN": "EwB4A8l6BAA.your_microsoft_oauth_token",
        "MICROSOFT_DEVELOPER_TOKEN": "YOUR_BING_ADS_DEV_TOKEN",
        "MICROSOFT_MERCHANT_ID": "987654"
      }
    }
  }
}
```

### 3. Run over Stateless `Streamable HTTP`

Start the HTTP server:

```bash
node dist/cli.js http --port 3000 --host 127.0.0.1
```

Connect any Streamable HTTP MCP client to `http://127.0.0.1:3000/mcp` and pass credentials per request via HTTP headers:

- `Authorization: Bearer <google_access_token_or_encrypted_bundle>`
- `x-google-access-token: <google_oauth_token>`
- `x-google-merchant-account-id: <google_merchant_id>`
- `x-microsoft-access-token: <microsoft_oauth_token>`
- `x-microsoft-developer-token: <microsoft_developer_token>`
- `x-microsoft-merchant-id: <microsoft_store_id>`

---

## Tools & Examples

All 6 tools expose JSON Schemas and carry MCP annotations `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`.

### 1. `list_accounts`
Lists accessible Google Merchant Center accounts and Microsoft Merchant Center stores normalized to one schema.

- **Input:**
  ```json
  {
    "platform": "both"
  }
  ```
- **Example Output:**
  ```json
  {
    "readOnly": true,
    "stateless": true,
    "totalAccounts": 2,
    "accounts": [
      {
        "platform": "google",
        "accountId": "77889900",
        "name": "Acme Outdoor Gear US",
        "domain": "https://shop.acme-outdoor.example",
        "status": "active",
        "adultContent": false
      },
      {
        "platform": "microsoft",
        "accountId": "554433",
        "name": "Acme Outdoor Gear Bing Store",
        "domain": "https://shop.acme-outdoor.example",
        "status": "active",
        "adultContent": false
      }
    ],
    "warnings": []
  }
  ```

### 2. `feed_health_summary`
Combines account-level policy/trust issues, feed/dataSource upload health (`itemsTotal`, `itemsValid`, `itemsWithErrors`, `lastUploadTime`), product approval counts, and top disapproval issue codes across both platforms.

- **Input:**
  ```json
  {
    "platform": "both",
    "googleAccountId": "77889900",
    "microsoftMerchantId": "554433"
  }
  ```

### 3. `list_disapprovals`
Lists disapproved, demoted, or warning-flagged products with full plain-English diagnostics, offending attribute values, fix steps, and official help links.

- **Input:**
  ```json
  {
    "platform": "both",
    "severity": "disapproval",
    "attribute": "price",
    "limit": 50
  }
  ```
- **Example Diagnostic Item in Output:**
  ```json
  {
    "code": "price_mismatch",
    "platform": "google",
    "severity": "disapproval",
    "attribute": "price",
    "diagnostic": {
      "code": "price_mismatch",
      "platform": "google",
      "severity": "disapproval",
      "title": "Price mismatch between feed and landing page",
      "plainEnglishCause": "Google crawled the product landing page and found a visible price or JSON-LD Offer price that differs from the price submitted in your Merchant Center feed.",
      "affectedAttribute": "price",
      "exampleOffendingValue": "Feed price: \"49.99 USD\" vs. Landing page JSON-LD price: \"59.99 USD\"",
      "actualOffendingValue": "199.00 USD",
      "fixSteps": [
        "Inspect the product landing page HTML and JSON-LD (@type: Product -> offers.price) to confirm the exact variant price shown to users.",
        "Ensure variant URLs (e.g., ?variant=12345) pre-select the exact variant and output that variant price in server-rendered JSON-LD and OpenGraph meta tags.",
        "Update your primary feed or apply a supplemental feed patch so [price] and [sale_price] match the live storefront price and currency.",
        "Enable Automatic Item Updates for price in Google Merchant Center while feed sync latency is being resolved."
      ],
      "helpUrl": "https://support.google.com/merchants/answer/6098334 (TODO-verify)",
      "helpUrlVerification": "TODO-verify"
    }
  }
  ```

### 4. `diagnose_product`
Deep-dives into a single SKU across Google Merchant Center, Microsoft Merchant Center, and (optionally) fetches the merchant's own public landing page URL to compare live `JSON-LD` / `<meta>` price and availability against both feeds.

- **Input:**
  ```json
  {
    "sku": "SKU-102",
    "checkLandingPage": true
  }
  ```
- **What It Detects:**
  - Side-by-side normalized Google product (`199.00 USD`), Microsoft product (`209.00 USD`), and live landing-page JSON-LD snapshot (`219.00 USD`, `in_stock`).
  - All item-level disapprovals (`price_mismatch`, `promotional_overlay_on_image`, `bing_price_mismatch`) and immediate SKU-level fix steps.

### 5. `compare_platforms`
Runs a full cross-feed audit across Google and Microsoft product catalogs:
- **`approval_asymmetry`**: SKUs approved on Google (`approved`) but disapproved on Microsoft (`disapproved`), or vice versa.
- **`missing_on_platform`**: SKUs present in one feed but absent from the other.
- **`price_mismatch` & `availability_mismatch`**: Feed-to-feed drift on the same SKU.
- **`attribute_backfill_opportunity`**: SKUs disapproved for missing `gtin` or `brand` on one platform where the exact same SKU already has a verified `gtin` or `brand` on the other platform.
- **`landing_page_price_mismatch` & `landing_page_availability_mismatch`**: Live landing-page drift (when `checkLandingPagesForDiscrepancies: true`).

- **Input:**
  ```json
  {
    "checkLandingPagesForDiscrepancies": true,
    "maxLandingPageChecks": 5
  }
  ```

### 6. `fix_plan`
Produces a prioritized remediation plan ranked by impact:
1. **Account-level blockers** (e.g. missing return policy / unverified domain)
2. **Cross-feed attribute backfills** (copying existing verified GTINs/brands between Google and Microsoft feeds)
3. **Landing-page price & availability sync patches**
4. **Feed attribute & image fixes**
5. **Policy review items**

Includes a `supplementalFeedPatchPreview` array (`sku`, `targetPlatform`, `attribute`, `currentValue`, `suggestedValue`, `note`) that merchants can export directly into a Google Supplemental Feed or Microsoft Feed Rule without giving any third-party app write access.

- **Input:**
  ```json
  {
    "platform": "both",
    "checkLandingPages": true
  }
  ```

---

## Credentials Needed

| Platform | Credential / Env Var | Scope / Details |
| --- | --- | --- |
| **Google Merchant Center** | `GOOGLE_ACCESS_TOKEN` (or `Authorization: Bearer` / `x-google-access-token`) | OAuth 2.0 access token with scope `https://www.googleapis.com/auth/content` (Google Merchant API v1 enabled on your GCP project). |
| **Google Merchant Center** | `GOOGLE_MERCHANT_ACCOUNT_ID` *(optional)* | Numeric Merchant Center account ID (auto-discovered via `list_accounts` if omitted). |
| **Microsoft Merchant Center** | `MICROSOFT_ACCESS_TOKEN` (or `x-microsoft-access-token`) | Microsoft Identity Platform OAuth 2.0 token with scope `https://ads.microsoft.com/msads.manage`. |
| **Microsoft Merchant Center** | `MICROSOFT_DEVELOPER_TOKEN` (or `x-microsoft-developer-token`) | Microsoft Advertising Developer Token. |
| **Microsoft Merchant Center** | `MICROSOFT_MERCHANT_ID` *(optional)* | Microsoft Merchant Center Store ID (auto-discovered via `/stores` if omitted). |

---

## Limits

1. **Strictly Read-Only:** This connector cannot push product writes or mutate feeds directly; instead, `fix_plan` outputs ready-to-import supplemental feed patch rows.
2. **Static HTML Landing-Page Parser:** The optional landing-page checker parses server-rendered HTML (`<script type="application/ld+json">` and OpenGraph/microdata `<meta>` tags) without running a headless browser. Storefronts that inject JSON-LD exclusively via client-side JavaScript after page load may show `extractionSource: "none"`.
3. **Landing-Page Check Cap:** `compare_platforms` and `fix_plan` cap live landing-page fetches to `maxLandingPageChecks` (default `5`, max `25` per tool call) to avoid rate-limiting the merchant's storefront and keep MCP tool latency low.
4. **Help URL Verification Markers:** Official documentation links that could not be verified offline against local workspace docs carry an explicit `(TODO-verify)` marker and `helpUrlVerification: "TODO-verify"`.

---

## License

Released under the [MIT License](LICENSE).

## Hosted Cloudflare Pages app

Public site: https://feeds.theownersdesk.net · MCP endpoint: https://feeds.theownersdesk.net/mcp

Free hosted tools: `list_accounts`, `feed_health_summary`. Pro: $29/month through Stripe,
including `list_disapprovals`, `diagnose_product`, `compare_platforms`, and `fix_plan`.
Cancel anytime through `/billing`. Diagnostics are rules-based; no model is wired in.

Run `npm run build:pages` with the existing dependencies. This runs TypeScript, copies
runtime JS into `pages/functions/_lib/fd/`, verifies imports with Node, and stages
`pages/functions/` at root `functions/` where Cloudflare discovers it. Generated copies
are gitignored. The source of truth is `src/` plus `pages/functions/`.

Cloudflare Pages configuration (do not deploy until configured):

- Repository root: repository root; build command: `npm run build:pages`; output: `pages`.
- Node 22.8+ for building/testing. `wrangler.toml` enables `nodejs_compat`.
- Bind custom domain `feeds.theownersdesk.net` to the Pages project.
- Set secrets in Pages settings; never commit `.dev.vars` or `.env*`.
- Configure the Stripe Payment Link for a $29 USD monthly subscription and redirect
  after checkout to `https://feeds.theownersdesk.net/pro/success?session_id={CHECKOUT_SESSION_ID}`.
- Use a dedicated Stripe account/product context: entitlement accepts any active
  subscription for the bound customer in that Stripe account. The checkout success
  URL is an activation capability: keep it private.
- Configure a Stripe hosted customer portal login link for `/billing`.

Environment variable names:

| Variable | Purpose |
| --- | --- |
| `FEED_DOCTOR_TOKEN_SECRET` | Required shared encryption/HMAC secret; generate at least 32 random bytes. Rotation invalidates all bundles/state. |
| `FEED_DOCTOR_HOSTED` | Set to `1` for standalone hosted HTTP; Pages always forces hosted mode. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth app credentials. |
| `MICROSOFT_DEVELOPER_TOKEN` | Microsoft app developer credential, embedded only during OAuth connection; never used as MCP request fallback. |
| `STRIPE_SECRET_KEY` | Server-side checkout/subscription verification. |
| `STRIPE_PAYMENT_LINK` | Fixed `https://buy.stripe.com/…` payment link. |
| `STRIPE_PORTAL_URL` | Optional Stripe hosted portal login URL; otherwise support email. |
| `BEACON_URL`, `BEACON_SITE_PREFIX`, `BEACON_DISABLED` | Optional shared counter configuration; set disabled to `1` for local tests. Keep prefix `feeddoctor` when using the copied funnel keys. |

Register exact OAuth callback URLs:

- `https://feeds.theownersdesk.net/oauth/google/callback`
- `https://feeds.theownersdesk.net/oauth/microsoft/callback`

Google scope is **only** `https://www.googleapis.com/auth/content` (no `openid` or
`email`). Google has no read-only Merchant scope, so the code only issues GET/list
calls to merchant APIs. Microsoft scopes are exactly
`https://ads.microsoft.com/msads.manage offline_access`. OAuth token exchange and
refresh use POST to identity endpoints, separately from read-only merchant calls.
The offline test suite asserts every merchant operation uses GET.

Hosted mode (`hosted: true` or `FEED_DOCTOR_HOSTED=1`) accepts only authenticated
`fdmcp_enc_` bundles. Raw OAuth tokens, base64 bundles, tool credential overrides,
and ambient credential headers/environment fallbacks are disabled. Self-hosted
credential resolution is otherwise unchanged. Newly encrypted bundles always have
`v: 1`, audience `feeds.theownersdesk.net`, and expiration within 30 days. Legacy
encrypted bundles without these claims must be reminted.

OAuth state is HMAC-signed, expires in 10 minutes, and must match a provider-specific
Secure HttpOnly `__Host-` cookie. Callback/token pages are no-store and noindex.
Tokens and upstream error bodies are never intentionally logged. Do not enable
request logging that captures Authorization headers, callback query strings,
checkout references, or token response headers/bodies. Cloudflare may retain
operational metadata according to the account's configured logging policies.

Access tokens refresh in-request. For providers that rotate refresh tokens, the
response includes `X-FeedDoctor-Token`; clients that support this should replace
their saved bearer with it. Standard MCP clients may not persist this header and
may need to reconnect when an old refresh token is retired. Bundle expiry is never
extended by refresh. No server-side token database exists.

Each hosted OAuth connection currently contains one provider; reconnecting replaces
that connection. Cross-platform comparison requires a bundle containing both
provider credentials (available to self-hosted users). The hosted site discloses
this limitation. Pro status is checked against Stripe and cached in isolate memory
for up to 10 minutes; Stripe failures deny Pro access. Payment cancellation does not
revoke OAuth consent; users revoke it through their provider settings.

`npm test` builds and verifies core imports, runs existing tool/transport tests,
and exercises hosted OAuth, CSRF, billing, gating, refresh, and credential security
with mocked fetch. No live OAuth, Stripe, or Cloudflare deployment is exercised.
