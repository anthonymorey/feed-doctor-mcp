import { cleanSrc, soon, securityHeaders } from '../_lib/security.js';
import { count } from '../_lib/funnel.js';
export async function onRequestGet(context) {
  const {request,env}=context;
  if (!env.STRIPE_PAYMENT_LINK) return soon();
  const src=cleanSrc(new URL(request.url).searchParams.get('src'));
  const url=new URL(env.STRIPE_PAYMENT_LINK);
  if (url.protocol!=='https:' || url.hostname!=='buy.stripe.com') throw new Error('Invalid payment configuration');
  url.searchParams.set('client_reference_id',src);
  let same=request.headers.get('sec-fetch-site')==='same-origin';
  try { same ||= new URL(request.headers.get('referer')).host===new URL(request.url).host; } catch {}
  const keys=same?['feeddoctor-click:/checkout-start',('feeddoctor-checkout-src:'+src).slice(0,64)]:['feeddoctor-click:/offsite'];
  context.waitUntil(count(request,keys,'feeddoctor',src,env));
  return new Response(null,{status:302,headers:{...securityHeaders,Location:url.href}});
}
