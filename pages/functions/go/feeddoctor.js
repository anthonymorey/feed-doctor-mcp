import { cleanSrc, securityHeaders } from '../_lib/security.js';
import { count } from '../_lib/funnel.js';
// Checkout opens when STRIPE_PAYMENT_LINK is set in Cloudflare; until then /go/feeddoctor keeps sending people to the Pro waitlist.
export async function onRequestGet(context) {
  const {request,env}=context;
  const src=cleanSrc(new URL(request.url).searchParams.get('src'));
  // HEAD (link checkers) gets the same redirect but is not counted.
  const track=f=>{ if (request.method==='GET') context.waitUntil(f()); };
  if (!env.STRIPE_PAYMENT_LINK) {
    track(()=>count(request,['feeddoctor-click:/waitlist-go',('feeddoctor-go-src:'+src).slice(0,64)],'feeddoctor',src,env));
    return new Response(null,{status:302,headers:{...securityHeaders,Location:'/pro?src='+encodeURIComponent(src)+'#waitlist'}});
  }
  const url=new URL(env.STRIPE_PAYMENT_LINK);
  if (url.protocol!=='https:' || url.hostname!=='buy.stripe.com') throw new Error('Invalid payment configuration');
  url.searchParams.set('client_reference_id',src);
  let same=request.headers.get('sec-fetch-site')==='same-origin';
  try { same ||= new URL(request.headers.get('referer')).host===new URL(request.url).host; } catch {}
  const keys=same?['feeddoctor-click:/checkout-start',('feeddoctor-checkout-src:'+src).slice(0,64)]:['feeddoctor-click:/offsite'];
  track(()=>count(request,keys,'feeddoctor',src,env));
  return new Response(null,{status:302,headers:{...securityHeaders,Location:url.href}});
}
// Link checkers send HEAD; answer with the same redirect (no beacon count).
export const onRequestHead=onRequestGet;
