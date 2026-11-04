import { ORIGIN, sign, verify, nonce, cleanSrc, page, esc, soon } from './security.js';
import { encryptStatelessTokenBundle } from './core.js';
export const providers = {
  google:{prefix:'GOOGLE', scope:'https://www.googleapis.com/auth/content', authorize:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token'},
  microsoft:{prefix:'MICROSOFT', scope:'https://ads.microsoft.com/msads.manage offline_access', authorize:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token:'https://login.microsoftonline.com/common/oauth2/v2.0/token'}
};
const cookieName = p => `__Host-fd-${p}`;
const cookie = (p,v,age=600) => `${cookieName(p)}=${v}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
export async function connect(context, provider) {
  const {env,request} = context, p=providers[provider];
  if (!env[p.prefix+'_CLIENT_ID']) return soon();
  const u=new URL(request.url);
  let pro;
  if (u.searchParams.has('pro')) pro=verify(u.searchParams.get('pro'),env.FEED_DOCTOR_TOKEN_SECRET,'pro').customer;
  const state=sign({purpose:'oauth',provider,src:cleanSrc(u.searchParams.get('src')),nonce:nonce(),exp:Math.floor(Date.now()/1000)+600,pro},env.FEED_DOCTOR_TOKEN_SECRET);
  const url=new URL(p.authorize);
  for (const [k,v] of Object.entries({client_id:env[p.prefix+'_CLIENT_ID'],redirect_uri:`${ORIGIN}/oauth/${provider}/callback`,response_type:'code',scope:p.scope,state})) url.searchParams.set(k,v);
  if (provider==='google') { url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent'); }
  return new Response(null,{status:302,headers:{Location:url.href,'Set-Cookie':cookie(provider,state),'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'}});
}
export async function exchange(env, provider, fields) {
  const p=providers[provider];
  const body=new URLSearchParams({client_id:env[p.prefix+'_CLIENT_ID'],client_secret:env[p.prefix+'_CLIENT_SECRET'],...fields});
  const response=await fetch(p.token,{method:'POST',body});
  if (!response.ok) throw new Error('OAuth request failed');
  const data=await response.json();
  if (typeof data.access_token!=='string' || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in)<=0) throw new Error('Invalid OAuth response');
  return data;
}
export async function callback(context, provider) {
  const {request,env}=context, url=new URL(request.url), token=url.searchParams.get('state');
  const stored=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName(provider)+'='))?.slice(cookieName(provider).length+1);
  let state;
  try {
    if (!token || stored!==token) throw new Error();
    state=verify(token,env.FEED_DOCTOR_TOKEN_SECRET,'oauth');
    if (state.provider!==provider || !state.nonce || !url.searchParams.get('code') || url.searchParams.has('error')) throw new Error();
  } catch { return page('Connection could not be verified','<p>Please start connecting again.</p>',400,{'Set-Cookie':cookie(provider,'',0)}); }
  const data=await exchange(env,provider,{grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:`${ORIGIN}/oauth/${provider}/callback`});
  const payload={pro:state.pro,[provider+'AccessToken']:data.access_token,[provider+'RefreshToken']:data.refresh_token,[provider+'ExpiresAt']:Math.floor(Date.now()/1000)+Number(data.expires_in)};
  // The app developer credential is provisioned only at connection time, inside the encrypted bundle.
  if (provider==='microsoft') payload.microsoftDeveloperToken=env.MICROSOFT_DEVELOPER_TOKEN;
  const bearer=encryptStatelessTokenBundle(payload,env.FEED_DOCTOR_TOKEN_SECRET);
  const cursor=JSON.stringify({mcpServers:{feeddoctor:{url:ORIGIN+'/mcp',headers:{Authorization:'Bearer '+bearer}}}},null,2);
  const claude=JSON.stringify({mcpServers:{feeddoctor:{command:'npx',args:['-y','mcp-remote',ORIGIN+'/mcp','--header','Authorization: Bearer '+bearer]}}},null,2);
  return page('Your connection is ready',`<p>Save this bearer token now. It is shown only in this response and expires in 30 days. Treat it like a password. Reconnect to renew or switch providers. Each connection contains one provider.</p><p>MCP URL: <code>${ORIGIN}/mcp</code></p><label for="bearer">Bearer token</label><textarea id="bearer" readonly rows="5">${esc(bearer)}</textarea><button data-copy="bearer">Copy bearer token</button><p role="status" id="copy-status"></p><h2>Cursor</h2><p>Add to .cursor/mcp.json:</p><pre>${esc(cursor)}</pre><h2>Claude Desktop</h2><p>For Desktop versions using local server configuration, install Node.js and add this configuration. The mcp-remote bridge is a third-party package downloaded by npx on your computer.</p><pre>${esc(claude)}</pre><p>Clients with remote HTTP support can use the URL and Authorization bearer header directly.</p>`,200,{'Set-Cookie':cookie(provider,'',0)});
}
export async function refresh(payload,env) {
  const updated={...payload};
  for (const provider of Object.keys(providers)) {
    if (!payload[provider+'AccessToken']) continue;
    if (payload[provider+'ExpiresAt'] > Date.now()/1000+60) continue;
    if (!payload[provider+'RefreshToken']) throw new Error('Reconnect required');
    const data=await exchange(env,provider,{grant_type:'refresh_token',refresh_token:payload[provider+'RefreshToken'],...(provider==='microsoft'?{scope:providers.microsoft.scope}:{})});
    updated[provider+'AccessToken']=data.access_token;
    updated[provider+'RefreshToken']=data.refresh_token || payload[provider+'RefreshToken'];
    updated[provider+'ExpiresAt']=Math.floor(Date.now()/1000)+Number(data.expires_in);
  }
  return updated;
}
