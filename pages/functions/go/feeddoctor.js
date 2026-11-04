import { cleanSrc, securityHeaders } from '../_lib/security.js';
import { count } from '../_lib/funnel.js';
// Checkout closed until OAuth E2E passes (Chief, 2026-11-04): /go/feeddoctor now sends people to the Pro waitlist.
export async function onRequestGet(context) {
  const {request,env}=context;
  const src=cleanSrc(new URL(request.url).searchParams.get('src'));
  context.waitUntil(count(request,['feeddoctor-click:/waitlist-go',('feeddoctor-go-src:'+src).slice(0,64)],'feeddoctor',src,env));
  return new Response(null,{status:302,headers:{...securityHeaders,Location:'/pro?src='+encodeURIComponent(src)+'#waitlist'}});
}
