// Product funnel counters (Builder 2026-11-01, reused from S2 quarterly-tax).
// Shared Hermes beacon (beacon.moneyyoureowed.com/b): unique visitors per key per day from a salted day|ip|ua hash. No cookies, no PII.
// Site key prefix: "samefight" (or env.BEACON_SITE_PREFIX). Beacon URL from env.BEACON_URL or default.
// Keys per product <id> (see funnel-products.js):
//   samefight/home, samefight/<subpage>          page view, counted server-side
//   samefight-src:<src>                          page view that arrived with ?src
//   samefight-click:/checkout-start              buy-button click, counted by the /go/<id> redirect before Stripe
//   samefight-checkout-src:<src|none>            same click, by source (src=qa*/test* are QA; routed to test bucket)
//   samefight-test:view/<page>, samefight-test:src:<src>, samefight-test:click:/checkout-start, samefight-test:checkout-src:<src>
import { uaKeys, classify, testKey, isTestSrc } from "./qa-traffic.js";
export { isTestSrc };

const DEFAULT_BEACON = "https://beacon.moneyyoureowed.com/b?site=";
const UTM = ["utm_source", "utm_medium", "utm_campaign"];

export const cleanSrc = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
const k64 = (k) => k.slice(0, 64);

export const beaconUrl = (env) => (env && env.BEACON_URL) || DEFAULT_BEACON;
export const sitePrefix = (env, fallback = "samefight") => (env && env.BEACON_SITE_PREFIX) || fallback;

export const productFor = (products, path) =>
  products.find((p) => path === p.prefix || path.startsWith(p.prefix + "/")) || null;

export function viewKeys(p, path, src) {
  const id = p.canonicalId || p.id;
  const sub = path.slice(p.prefix.length).replace(/\.html$/, "").replace(/(^|\/)index$/, "").replace(/\/+$/, "");
  const page = sub ? (sub.startsWith("/") ? sub : "/" + sub) : "/home";
  const keys = [k64(id + page)];
  if (src) keys.push(k64(id + "-src:" + src));
  return keys;
}

export const clickKeys = (p, src) => {
  const id = p.canonicalId || p.id;
  return [id + "-click:/checkout-start", k64(id + "-checkout-src:" + (src || "none"))];
};

// Real keys -> null (crawler: not counted), the same keys (real), or their <prefix>-test:* twins (our own traffic).
export async function routeKeys(keys, prefix, { src, ua, ip }) {
  if (!ua) return null;
  const cls = await classify({ src, ua, ip });
  if (cls === "crawler") return null;
  return cls === "test" ? keys.map((k) => testKey(prefix, k)) : keys;
}

export async function count(req, keys, prefix, src, env) {
  if (env && env.BEACON_DISABLED === "1") return;
  const pfx = sitePrefix(env, prefix);
  const bUrl = beaconUrl(env);
  const ua = req.headers.get("user-agent") || "";
  keys = await routeKeys(keys, pfx, { src, ua, ip: req.headers.get("cf-connecting-ip") || "" });
  const traffic = keys === null ? "crawler" : keys.some((k) => k.includes("-test:")) ? "test" : "real";
  keys = uaKeys(req, keys || [], pfx, traffic);
  const day = new Date().toISOString().slice(0, 10);
  const raw = new TextEncoder().encode(`${day}|${req.headers.get("cf-connecting-ip") || ""}|${ua}`);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  await Promise.all(keys.map((k) => fetch(bUrl + encodeURIComponent(k), { headers: { "user-agent": "bv:" + hash } }).catch(() => {})));
}

// /go/<id>?src=… plus any landing utm_* (cleaned).
export function goUrl(p, src, params) {
  const id = p.canonicalId || p.id;
  const q = new URLSearchParams();
  if (src) q.set("src", src);
  for (const k of UTM) { const v = cleanSrc(params.get(k)); if (v) q.set(k, v); }
  const s = q.toString();
  return "/go/" + id + (s ? "?" + s : "");
}

// Fixed Payment Link per product (no open redirect). client_reference_id from the site's crid(src) rule;
// utm_* forwarded; utm_source defaults to src.
export function stripeTarget(p, src, params, crid, env) {
  const linkUrl = (env && env.STRIPE_PAYMENT_LINK_URL) || p.link;
  const url = new URL(linkUrl);
  const ref = crid(src);
  if (ref) url.searchParams.set("client_reference_id", ref.slice(0, 200));
  for (const k of UTM) { const v = cleanSrc(params.get(k)); if (v && !url.searchParams.has(k)) url.searchParams.set(k, v); }
  if (src && !url.searchParams.has("utm_source")) url.searchParams.set("utm_source", src);
  return url.toString();
}

export function goHandler(products, crid) {
  return async (context) => {
    const p = products.find((x) => x.id === context.params.product);
    if (!p) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const id = p.canonicalId || p.id;
    const url = new URL(context.request.url);
    const src = cleanSrc(url.searchParams.get("src"));
    context.waitUntil(count(context.request, clickKeys(p, src), id, src, context.env));
    return new Response(null, {
      status: 302,
      headers: {
        Location: stripeTarget(p, src, url.searchParams, crid, context.env),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
    });
  };
}

const withSrc = (href, src) => {
  const [base, hash = ""] = href.split("#");
  const u = new URL(base || "./", "https://x.invalid/a/");
  u.searchParams.set("src", src);
  const out = (base.startsWith("/") ? u.pathname : base.split("?")[0]) + u.search;
  return out + (hash ? "#" + hash : "");
};

export function productPage(context, res, p) {
  try {
    const type = res.headers.get("content-type") || "";
    if (context.request.method !== "GET" || res.status !== 200 || !type.includes("text/html")) return res;
    const id = p.canonicalId || p.id;
    const url = new URL(context.request.url);
    const src = cleanSrc(url.searchParams.get("src"));
    context.waitUntil(count(context.request, viewKeys(p, url.pathname, src), id, src, context.env));
    const go = goUrl(p, src, url.searchParams);
    let rw = new HTMLRewriter()
      .on(`a[href^="${p.link}"]`, { element(el) { el.setAttribute("href", go); } })
      .on(`a[href^="/go/${id}"]`, { element(el) { el.setAttribute("href", go); } });
    if (src) rw = rw.on("a[href]", { element(el) {
      const h = el.getAttribute("href") || "";
      if (h.startsWith("/go/")) return;
      const own = h === p.prefix || h.startsWith(p.prefix + "/") || (!/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(h) && h !== "");
      if (own) el.setAttribute("href", withSrc(h, src));
    } });
    return rw.transform(res);
  } catch (_) {
    return res;
  }
}
