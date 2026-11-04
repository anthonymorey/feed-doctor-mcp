# FeedDoctor transfer dossier

Launch date: **TBD**. Prepared November 4, 2026. Not deployed by this build.

FeedDoctor provides rules-based, read-only Google and Microsoft Merchant Center
feed diagnostics over MCP. Site: https://feeds.theownersdesk.net.
Remote endpoint: https://feeds.theownersdesk.net/mcp.
Repository: https://github.com/anthonymorey/feed-doctor-mcp (configured repository URL;
remote publication has not been verified offline).

Pricing: free account discovery and health summaries; Pro is **$29 USD/month**,
Stripe only, cancel anytime. Six tools; no model integration. Hosted OAuth connects
one provider per bearer token; cross-platform comparison needs both providers.

Stack: TypeScript MCP server, plain HTML/CSS/JS, Cloudflare Pages Functions with
`nodejs_compat`, AES-256-GCM stateless credential bundles, OAuth, Stripe subscriptions.
No merchant-data database. Source and build instructions are in the root README.

Costs: domain renewal, Cloudflare usage/plan, Stripe payment fees, and shared beacon
hosting allocation. Actual bills and unit costs: TBD. No model inference spend.
Google/Microsoft quotas and account requirements need operational confirmation.

Analytics: copied shared beacon format, daily pseudonymous visitor hashes, page/view
and checkout event keys prefixed `feeddoctor`. `src` is carried into CTAs and Stripe
`client_reference_id` (cleaned to 64 lowercase letters, digits, hyphens/underscores).
QA and crawler classification follows the shared funnel implementation. No analytics
cookies; OAuth uses a temporary security cookie.

| Metric | As of | Value / evidence |
| --- | --- | --- |
| Launch date | 2026-11-04 | TBD |
| Monthly recurring revenue | 2026-11-04 | TBD; Stripe export required |
| Active paid subscriptions | 2026-11-04 | TBD; Stripe export required |
| Monthly visitors | 2026-11-04 | TBD; beacon report required |
| Checkout conversion by src | 2026-11-04 | TBD; beacon + Stripe reconciliation |
| Monthly operating costs | 2026-11-04 | TBD; invoices required |

Transfer sequence:

1. Transfer repository access and run `npm test` in the buyer's environment.
2. Agree Stripe account/product/subscription transfer with Stripe; do not assume
   subscriptions can simply move between accounts. Preserve or remap customer IDs,
   then configure the payment link, portal login, and success redirect.
3. Transfer/recreate the Cloudflare Pages project, custom domain binding, build
   settings, and secrets. Confirm `nodejs_compat` and operational log redaction.
4. Transfer Google and Microsoft OAuth applications as supported, update ownership
   and consent branding, and preserve exact callbacks. Complete required provider
   verification and API enablement. Transfer the Microsoft developer credential.
5. Transfer domain/DNS control and beacon reporting access, confirm certificate and
   health checks, and update controller/privacy/support details appropriately.
6. Transfer the token secret securely if existing bundles must survive. Rotating it
   invalidates bundles and in-flight OAuth/activation state; plan user reconnection.
7. Verify checkout, activation, cancellation, revocation, refresh, and all tools with
   consenting test accounts before launch. Confirm provider refresh-token rotation
   behavior with intended clients; some clients require reconnection.

Seller diligence pack to attach: ownership evidence, Stripe exports, Cloudflare
invoices, source analytics, provider approvals, domain renewal record, and support
history. None of these metrics or approvals are claimed by this offline build.
