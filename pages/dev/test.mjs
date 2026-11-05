import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { connect, callback, providers, refresh } from '../functions/_lib/oauth.js';
import { sign, verify } from '../functions/_lib/security.js';
import { encryptStatelessTokenBundle as encrypt, decryptStatelessTokenBundle as decrypt } from '../functions/_lib/core.js';
import { onRequestGet as go, onRequestHead as goHead } from '../functions/go/feeddoctor.js';
import { onRequestGet as success } from '../functions/pro/success.js';
import { onRequestPost as waitlist } from '../functions/api/waitlist.js';
import { onRequest as mcp } from '../functions/mcp.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { isPro } from '../functions/_lib/stripe.js';
const secret='test-only-secret-not-a-production-credential';
const env={FEED_DOCTOR_TOKEN_SECRET:secret,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',BEACON_DISABLED:'1'};
const ctx=(path,extra={})=>({request:new Request('https://feeds.theownersdesk.net'+path),env,waitUntil:()=>{},...extra});
async function mockFetch(fn,work) {const original=globalThis.fetch;globalThis.fetch=fn;try{return await work();}finally{globalThis.fetch=original;}}
async function rpc(name,payload={},args={}) {
  const bearer=encrypt({googleAccessToken:'test-access',googleExpiresAt:Date.now()/1000+3600,...payload},secret);
  return mcp(ctx('/mcp',{request:new Request('https://feeds.theownersdesk.net/mcp',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})})}));
}
test('OAuth returns friendly noindex 503 with no client ID',async()=>{
  for(const p of ['google','microsoft']) {const res=await connect(ctx('/connect/'+p,{env:{}}),p);assert.equal(res.status,503);assert.match(await res.text(),/Connecting is opening soon/);assert.match(res.headers.get('X-Robots-Tag'),/noindex/);}
});
test('OAuth state is signed, provider-bound, expires, and matches a secure cookie',async()=>{
  const res=await connect(ctx('/connect/google?src=glama'),'google');
  const url=new URL(res.headers.get('location')),state=url.searchParams.get('state');
  assert.equal(url.searchParams.get('scope'),providers.google.scope);assert.ok(!url.searchParams.get('scope').includes('openid'));
  assert.match(res.headers.get('set-cookie'),/__Host-.*Secure; HttpOnly; SameSite=Lax/);
  assert.equal(verify(state,secret,'oauth').src,'glama');
  assert.throws(()=>verify(state+'x',secret,'oauth'));
  assert.throws(()=>verify(sign({purpose:'oauth',exp:1},secret),secret,'oauth'));
  for(const cookie of ['', '__Host-fd-google=wrong', '__Host-fd-microsoft='+state]) {
    const response=await callback(ctx('/oauth/google/callback?state='+state+'&code=test',{request:new Request('https://feeds.theownersdesk.net/oauth/google/callback?state='+state+'&code=test',{headers:{cookie}})}),'google');assert.equal(response.status,400);
  }
  assert.equal(providers.microsoft.scope,'https://ads.microsoft.com/msads.manage offline_access');
});
test('OAuth callback exchanges code and returns a private encrypted bundle with Pro claim',async()=>{
  await mockFetch(async(url,init)=>{assert.equal(url,providers.google.token);assert.equal(init.method,'POST');assert.equal(init.body.get('grant_type'),'authorization_code');return Response.json({access_token:'sensitive-access',refresh_token:'sensitive-refresh',expires_in:3600});},async()=>{
    const pro=sign({purpose:'pro',customer:'cus_test',exp:Math.floor(Date.now()/1000)+600},secret);
    const start=await connect(ctx('/connect/google?pro='+pro),'google'),state=new URL(start.headers.get('location')).searchParams.get('state');
    const res=await callback(ctx('/oauth/google/callback',{request:new Request('https://feeds.theownersdesk.net/oauth/google/callback?state='+state+'&code=test',{headers:{cookie:'__Host-fd-google='+state}})}),'google');
    assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
    const html=await res.text();assert.ok(!html.includes('sensitive-access'));assert.ok(!html.includes('sensitive-refresh'));
    const token=html.match(/fdmcp_enc_[\w.-]+/)[0],bundle=decrypt(token,secret);assert.equal(bundle.pro,'cus_test');assert.equal(bundle.googleRefreshToken,'sensitive-refresh');assert.match(res.headers.get('set-cookie'),/Max-Age=0/);
  });
});
test('refresh happens only for expired access tokens and preserves bundle expiration',async()=>{
  let calls=0;
  await mockFetch(async(url,init)=>{calls++;assert.equal(init.body.get('grant_type'),'refresh_token');return Response.json({access_token:'new-access',refresh_token:'rotated',expires_in:3600});},async()=>{
    const p={googleAccessToken:'old',googleRefreshToken:'refresh',googleExpiresAt:1,exp:123};
    const r=await refresh(p,env);assert.equal(r.googleAccessToken,'new-access');assert.equal(r.googleRefreshToken,'rotated');assert.equal(r.exp,123);await refresh(r,env);assert.equal(calls,1);
  });
});
test('go with STRIPE_PAYMENT_LINK forwards cleaned src as client_reference_id to Stripe (GET and HEAD)',async()=>{
  const stripeEnv={...env,STRIPE_PAYMENT_LINK:'https://buy.stripe.com/test_x'};
  for(const [handler,method] of [[go,'GET'],[goHead,'HEAD']]) {
    const res=await handler(ctx('/go/feeddoctor?src=test-qa',{env:stripeEnv,request:new Request('https://feeds.theownersdesk.net/go/feeddoctor?src=test-qa',{method})}));
    assert.equal(res.status,302,method);const loc=new URL(res.headers.get('location'));assert.equal(loc.hostname,'buy.stripe.com',method);assert.equal(loc.searchParams.get('client_reference_id'),'test-qa',method);
  }
  const cleaned=await go(ctx('/go/feeddoctor?src=GLaMa!_a-b',{env:stripeEnv}));assert.equal(new URL(cleaned.headers.get('location')).searchParams.get('client_reference_id'),'glama_a-b');
  const direct=await go(ctx('/go/feeddoctor',{env:stripeEnv}));assert.equal(new URL(direct.headers.get('location')).searchParams.get('client_reference_id'),'direct');
  await assert.rejects(go(ctx('/go/feeddoctor',{env:{...env,STRIPE_PAYMENT_LINK:'https://evil.example/pay'}})));
});
test('go without STRIPE_PAYMENT_LINK still sends to the waitlist with cleaned src (GET and HEAD)',async()=>{
  for(const handler of [go,goHead]) {const res=await handler(ctx('/go/feeddoctor?src=GLaMa!_a-b'));assert.equal(res.status,302);assert.equal(res.headers.get('location'),'/pro?src=glama_a-b#waitlist');}
});
test('checkout success redirects to the waitlist until STRIPE_PAYMENT_LINK is set',async()=>{
  const res=await success(ctx('/pro/success?session_id=cs_test_123'));assert.equal(res.status,302);assert.match(res.headers.get('location'),/waitlist/);
});
test('checkout activation requires paid subscription and offers Google reconnect only',async()=>{
  const openEnv={...env,STRIPE_SECRET_KEY:'test-stripe',STRIPE_PAYMENT_LINK:'https://buy.stripe.com/test_x'};
  await mockFetch(async()=>Response.json({payment_status:'paid',mode:'subscription',subscription:'sub_test',customer:'cus_test'}),async()=>{
    const res=await success(ctx('/pro/success?session_id=cs_test_123',{env:openEnv}));assert.equal(res.status,200);const html=await res.text();
    assert.match(html,/Reconnect Google to activate Pro/);assert.ok(!html.includes('/connect/microsoft'));assert.match(html,/Microsoft Merchant Center support is coming soon\./);
  });
  await mockFetch(async()=>Response.json({payment_status:'unpaid'}),async()=>assert.equal((await success(ctx('/pro/success?session_id=cs_test_123',{env:openEnv}))).status,400));
});
test('open-checkout HTML: $29 Pro via /go/feeddoctor, no waitlist, Microsoft only as coming soon',async()=>{
  for(const name of ['index.html','pro.html']) {
    const html=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.ok(html.includes('$29'),name);assert.ok(html.includes('href="/go/feeddoctor"'),name);assert.ok(html.includes('href="/billing"'),name);
    assert.ok(!/waitlist|opening soon/i.test(html),name);assert.ok(!html.includes('href="/connect/microsoft"'),name);
    assert.match(html,/Microsoft[^<]{0,80}coming soon/i,name);
  }
  for(const name of ['terms.html','privacy.html']) {const html=await readFile(new URL('../'+name,import.meta.url),'utf8');assert.ok(html.includes('href="/billing"'),name);assert.ok(!html.includes('href="/connect/microsoft"'),name);}
});
test('waitlist stores email+src in MailerLite and fires feeddoctor-waitlist beacon',async()=>{
  const pending=[],calls=[];
  await mockFetch(async(url,init)=>{calls.push({url:String(url),body:init&&init.body});return Response.json({data:{}});},async()=>{
    const req=new Request('https://feeds.theownersdesk.net/api/waitlist',{method:'POST',headers:{'content-type':'application/json','user-agent':'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0 Safari/537.36','accept-language':'en-US','sec-fetch-mode':'cors','sec-ch-ua':'Chromium'},body:JSON.stringify({email:'a@b.co',src:'glama'})});
    const res=await waitlist({request:req,env:{MAILERLITE_TOKEN:'x'},waitUntil:p=>pending.push(p)});
    assert.equal(res.status,200);await Promise.all(pending);
    const ml=calls.find(c=>c.url.includes('mailerlite'));assert.match(ml.body,/203206605857096945/);assert.match(ml.body,/feeddoctor-glama/);
    assert.ok(calls.some(c=>c.url.includes('feeddoctor-waitlist%3Asrc%3Aglama')));
  });
});
test('hosted MCP rejects base64 and raw tokens, and gates all four Pro tools without fetching',async()=>{
  for(const token of ['fdmcp_b64_e30','raw-token']) {
    const res=await mcp(ctx('/mcp',{request:new Request('https://feeds.theownersdesk.net/mcp',{headers:{Authorization:'Bearer '+token}})}));assert.equal(res.status,401);
  }
  await mockFetch(async()=>{throw new Error('Must not fetch');},async()=>{
    for(const name of ['list_disapprovals','diagnose_product','compare_platforms','fix_plan']) {const res=await rpc(name,{},name==='diagnose_product'?{sku:'a'}:{});assert.equal(res.status,200);assert.match(await res.text(),/This tool needs FeedDoctor Pro: https:\/\/feeds.theownersdesk.net\/pro/);}
  });
});
test('free tool uses refreshed credentials; tool argument overrides are rejected',async()=>{
  await mockFetch(async(url,init)=>{assert.equal(init.method,'GET');assert.equal(new Headers(init.headers).get('authorization'),'Bearer test-access');return Response.json({accounts:[]});},async()=>{
    const res=await rpc('list_accounts');assert.equal(res.status,200);assert.match(await res.text(),/totalAccounts/);
    const blocked=await rpc('list_accounts',{}, {credentials:{googleAccessToken:'injected'}});assert.match(await blocked.text(),/isError/);
  });
});
test('Stripe active subscriptions are verified and cached; failures fail closed',async()=>{
  let calls=0;
  await mockFetch(async(url,init)=>{calls++;assert.equal(init.method,'GET');assert.match(String(url),/subscriptions\?customer=cus_cached&status=active/);return Response.json({data:[{status:'active',customer:'cus_cached'}]});},async()=>{
    assert.equal(await isPro({STRIPE_SECRET_KEY:'test-stripe'},'cus_cached'),true);assert.equal(await isPro({STRIPE_SECRET_KEY:'test-stripe'},'cus_cached'),true);assert.equal(calls,1);
  });
  await mockFetch(async()=>new Response('secret',{status:500}),async()=>assert.equal(await isPro({STRIPE_SECRET_KEY:'test-stripe'},'cus_fail'),false));
});
test('middleware hides internal messages in generic 500 responses',async()=>{
  const res=await middleware(ctx('/',{next:async()=>{throw new Error('sensitive-token');}}));assert.equal(res.status,500);assert.ok(!(await res.text()).includes('sensitive-token'));
});
test('pages tree has no private keys or production secret literals',async()=>{
  async function scan(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+item.name;if(item.isDirectory())await scan(p);else {assert.ok(!/^\.env|^\.dev\.vars$/.test(item.name),p);const text=await readFile(p,'utf8');assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk_live_[A-Za-z0-9]{12,}|AIza[A-Za-z0-9_-]{30,}/.test(text),p);}}}
  await scan(new URL('..',import.meta.url).pathname);
});
test('expired MCP credentials refresh before merchant GET and emit a replacement bundle',async()=>{
  let tokenCalls=0,merchantCalls=0;
  await mockFetch(async(url,init)=>{
    if(String(url)===providers.google.token) {tokenCalls++;assert.equal(init.method,'POST');return Response.json({access_token:'refreshed-access',refresh_token:'rotated-refresh',expires_in:3600});}
    merchantCalls++;assert.equal(init.method,'GET');assert.equal(new Headers(init.headers).get('authorization'),'Bearer refreshed-access');return Response.json({accounts:[]});
  },async()=>{
    const res=await rpc('list_accounts',{googleExpiresAt:1,googleRefreshToken:'old-refresh'});
    assert.equal(res.status,200);assert.match(await res.text(),/totalAccounts/);
    const replacement=decrypt(res.headers.get('X-FeedDoctor-Token'),secret);assert.equal(replacement.googleRefreshToken,'rotated-refresh');assert.equal(tokenCalls,1);assert.equal(merchantCalls,1);
  });
});
test('paid subscription unlocks a Pro tool; invalid Origin is refused',async()=>{
  const paidEnv={...env,STRIPE_SECRET_KEY:'test-paid-stripe'};
  const bearer=encrypt({pro:'cus_paid',googleAccessToken:'test-access',googleExpiresAt:Date.now()/1000+3600},secret);
  const request=()=>new Request('https://feeds.theownersdesk.net/mcp',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'list_disapprovals',arguments:{}}})});
  await mockFetch(async url=>String(url).startsWith('https://api.stripe.com/')?Response.json({data:[{status:'active',customer:'cus_paid'}]}):Response.json({accounts:[]}),async()=>{
    const res=await mcp({request:request(),env:paidEnv});assert.equal(res.status,200);assert.match(await res.text(),/totalMatchingProducts/);
  });
  const hostile=request();hostile.headers.set('Origin','https://other.invalid');assert.equal((await mcp({request:hostile,env:paidEnv})).status,403);
});

test('beacon click keeps the shared endpoint and bv daily-hash header format',async()=>{
  const pending=[],calls=[];
  await mockFetch(async(url,init)=>{calls.push({url:String(url),ua:init.headers['user-agent']});return new Response('ok');},async()=>{
    await go(ctx('/go/feeddoctor?src=glama',{env:{STRIPE_PAYMENT_LINK:'https://buy.stripe.com/test'},waitUntil:p=>pending.push(p),request:new Request('https://feeds.theownersdesk.net/go/feeddoctor?src=glama',{headers:{'sec-fetch-site':'same-origin','user-agent':'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0 Safari/537.36','accept-language':'en-US','sec-fetch-mode':'navigate','sec-ch-ua':'Chromium'}})}));
    await Promise.all(pending);assert.ok(calls.some(c=>c.url.includes('site=feeddoctor-click%3A%2Fcheckout-start')));assert.ok(calls.every(c=>/^bv:[0-9a-f]{16}$/.test(c.ua)));
  });
});
