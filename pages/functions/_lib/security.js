import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
export const ORIGIN = 'https://feeds.theownersdesk.net';
export const cleanSrc = v => String(v || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0,64) || 'direct';
export const nonce = () => randomBytes(24).toString('base64url');
export function sign(payload, secret) {
  if (!secret || secret.length < 16) throw new Error('Configuration unavailable');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + createHmac('sha256',secret).update(body).digest('base64url');
}
export function verify(token, secret, purpose) {
  const [body, mac, extra] = String(token || '').split('.');
  if (!body || !mac || extra) throw new Error('Invalid reference');
  const expected = sign(JSON.parse(Buffer.from(body,'base64url').toString()), secret).split('.')[1];
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac),Buffer.from(expected))) throw new Error('Invalid reference');
  const value = JSON.parse(Buffer.from(body,'base64url').toString());
  const now = Math.floor(Date.now()/1000);
  if (value.purpose !== purpose || !Number.isFinite(value.exp) || value.exp <= now || value.exp > now+600) throw new Error('Expired reference');
  return value;
}
export const securityHeaders = {
  'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow',
  'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff',
  'Strict-Transport-Security':'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Frame-Options':'DENY'
};
export const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function page(title, body, status=200, headers={}) {
  return new Response(`<!doctype html><html lang="en-US"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} — FeedDoctor</title><link rel="stylesheet" href="/style.css"><script src="/src.js" defer></script><header><a href="/">FeedDoctor</a></header><main><h1>${esc(title)}</h1>${body}</main><footer>© 2026 AUSSIE-AI LTD · Company no. 17193460 · ICO reg. ZC277836 <a href="/privacy">Privacy</a> <a href="/terms">Terms</a></footer></html>`, {status,headers:{...securityHeaders,'Content-Type':'text/html; charset=utf-8',...headers}});
}
export const soon = () => page('Connecting is opening soon', '<p>Connecting is opening soon — email <a href="mailto:support@theownersdesk.net">support@theownersdesk.net</a></p>',503);
