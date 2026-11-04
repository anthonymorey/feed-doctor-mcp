# FeedDoctor directory listing copy

Name: FeedDoctor MCP (`feed-doctor-mcp`)

One-liner (86 characters): Read-only Google and Microsoft merchant feed diagnostics, disapprovals, and fix plans.

Description: Inspect Merchant Center accounts, feed health, disapproved products,
and product-level issues from an MCP client. FeedDoctor applies diagnostic rules,
checks optional public landing-page price and availability, and returns prioritized
fix suggestions. It never writes to merchant accounts. Stateless encrypted bearer
tokens hold OAuth credentials; connect at https://feeds.theownersdesk.net first.
Hosted OAuth connects one provider per token. Cross-platform comparison requires
both providers in a bundle, supported by self-hosted configuration.

Tags: ecommerce, merchant-center, google-shopping, microsoft-advertising,
product-feeds, diagnostics, read-only, mcp

Tools:

- `list_accounts` — accessible accounts and stores (free).
- `feed_health_summary` — account issues, feed processing, approval counts (free).
- `list_disapprovals` — affected products and plain-English issue diagnostics (Pro).
- `diagnose_product` — inspect one SKU and optionally its landing page (Pro).
- `compare_platforms` — compare attributes across connected providers (Pro).
- `fix_plan` — prioritized suggestions and supplemental feed patch previews (Pro).

Pricing note: Free tier includes two tools. Hosted Pro is $29 USD/month through
Stripe, cancel anytime. Self-hosted source is available under the MIT license.
No model integration; diagnostics are rules-based.

| Directory | Name / identifier | Remote install URL (Streamable HTTP) |
| --- | --- | --- |
| Smithery | FeedDoctor MCP / feed-doctor-mcp | https://feeds.theownersdesk.net/mcp?src=smithery |
| Glama | FeedDoctor MCP / feed-doctor-mcp | https://feeds.theownersdesk.net/mcp?src=glama |
| Official MCP Registry | net.theownersdesk.feeds/feed-doctor-mcp | https://feeds.theownersdesk.net/mcp?src=mcp-reg |

Use the one-liner, description, tags, tools, and pricing note above for each listing.
Authentication: `Authorization: Bearer <encrypted bundle>`; obtain the bundle via
the website's OAuth connection flow. Landing page attribution URLs use
`https://feeds.theownersdesk.net/?src=smithery`, `?src=glama`, or `?src=mcp-reg`.
Directory submission, namespace verification, and live endpoint testing remain
launch tasks; nothing has been published by this build.
