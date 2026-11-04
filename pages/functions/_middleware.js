import { page, securityHeaders, cleanSrc } from './_lib/security.js';
import { count } from './_lib/funnel.js';
export async function onRequest(context) {
  try {
    const response=await context.next();
    const url=new URL(context.request.url);
    if (context.request.method==='GET' && response.status===200 && ['/', '/pro', '/privacy', '/terms'].includes(url.pathname)) {
      const src=cleanSrc(url.searchParams.get('src'));
      context.waitUntil(count(context.request,['feeddoctor'+(url.pathname==='/'?'/home':url.pathname),('feeddoctor-src:'+src).slice(0,64)],'feeddoctor',src,context.env));
    }
    const headers=new Headers(response.headers);
    for (const [k,v] of Object.entries(securityHeaders)) {
      if (['Cache-Control','X-Robots-Tag'].includes(k)) continue;
      headers.set(k,v);
    }
    return new Response(response.body,{status:response.status,headers});
  } catch { return page('Something went wrong','<p>Please try again or email support@theownersdesk.net.</p>',500); }
}
