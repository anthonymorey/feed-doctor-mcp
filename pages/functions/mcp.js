import { decryptStatelessTokenBundle, encryptStatelessTokenBundle, handleStatelessStreamableHttpRequest } from './_lib/core.js';
import { refresh } from './_lib/oauth.js';
import { isPro } from './_lib/stripe.js';
import { securityHeaders } from './_lib/security.js';
export async function onRequest({request,env}) {
  const origin=request.headers.get('origin');
  if (origin && origin!=='https://feeds.theownersdesk.net') return new Response('Origin not allowed',{status:403,headers:securityHeaders});
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  let payload;
  try { payload=decryptStatelessTokenBundle(token || '',env.FEED_DOCTOR_TOKEN_SECRET); }
  catch { return Response.json({error:'A valid encrypted bearer token is required. Reconnect at https://feeds.theownersdesk.net.'},{status:401,headers:{...securityHeaders,'WWW-Authenticate':'Bearer'}}); }
  try {
    const active=await isPro(env,payload.pro);
    // Avoid refreshing or contacting merchants when a free user requests a gated tool.
    let current;
    const response=await handleStatelessStreamableHttpRequest(request,{
      hosted:true,env:{FEED_DOCTOR_HOSTED:'1',FEED_DOCTOR_TOKEN_SECRET:env.FEED_DOCTOR_TOKEN_SECRET},
      bearerToken:token,
      authorizeTool:async name=>active || ['list_accounts','feed_health_summary'].includes(name),
      fetchFn:async (input,init)=>{
        current ??= await refresh(payload,env);
        const headers=new Headers(init?.headers);
        const host=new URL(String(input)).hostname;
        if (host==='merchantapi.googleapis.com') headers.set('Authorization','Bearer '+current.googleAccessToken);
        if (host==='content.api.bingads.microsoft.com') headers.set('Authorization','Bearer '+current.microsoftAccessToken);
        return fetch(input,{...init,headers});
      }
    });
    const headers=new Headers(response.headers);
    for (const [k,v] of Object.entries(securityHeaders)) headers.set(k,v);
    // Persist rotating refresh tokens without a server database. Clients should replace their bearer
    // with this response header when supported; otherwise reconnect when the provider retires it.
    if (current) headers.set('X-FeedDoctor-Token',encryptStatelessTokenBundle(current,env.FEED_DOCTOR_TOKEN_SECRET));
    return new Response(response.body,{status:response.status,headers});
  } catch { return Response.json({error:'Internal server error'},{status:500,headers:securityHeaders}); }
}
