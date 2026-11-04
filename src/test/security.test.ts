import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { encryptStatelessTokenBundle as encrypt, decryptStatelessTokenBundle as decrypt, resolveRequestCredentials as resolve, encodeBase64TokenBundle } from '../auth.js';
import { GoogleMerchantClient } from '../clients/google.js';
import { MicrosoftMerchantClient } from '../clients/microsoft.js';
import { createFeedDoctorServer } from '../server.js';
const secret='test-only-secret-not-a-production-credential';
const env={FEED_DOCTOR_TOKEN_SECRET:secret,GOOGLE_ACCESS_TOKEN:'environment-google',MICROSOFT_ACCESS_TOKEN:'environment-ms',MICROSOFT_DEVELOPER_TOKEN:'environment-dev'};
it('hosted mode requires encryption, blocks all overrides and ignores ambient credential headers and env',()=>{
  for(const mode of [{hosted:true,env},{env:{...env,FEED_DOCTOR_HOSTED:'1'}}]) {
    for(const bearerToken of [undefined,'raw',encodeBase64TokenBundle({googleAccessToken:'raw'})]) assert.throws(()=>resolve({...mode,bearerToken}));
    const bearerToken=encrypt({googleAccessToken:'bound'},secret);
    assert.throws(()=>resolve({...mode,bearerToken,toolOverride:{googleAccessToken:'override'}}));
    const creds=resolve({...mode,bearerToken,requestHeaders:new Headers({'x-google-access-token':'header','x-microsoft-access-token':'header'})});
    assert.equal(creds.googleAccessToken,'bound');assert.equal(creds.microsoftAccessToken,undefined);assert.equal(creds.microsoftDeveloperToken,undefined);
  }
  assert.equal(resolve({env}).googleAccessToken,'environment-google');
  assert.equal(resolve({env,bearerToken:'raw'}).googleAccessToken,'raw');
});
it('encrypted bundles have a version, audience and mandatory expiry capped at 30 days',()=>{
  const now=Math.floor(Date.now()/1000), p=decrypt(encrypt({},secret),secret);
  assert.equal(p.v,1);assert.equal(p.aud,'feeds.theownersdesk.net');assert.ok(p.exp!>=now+30*86400);
  assert.ok(decrypt(encrypt({exp:now+90*86400},secret),secret).exp!<=now+30*86400+1);
  assert.throws(()=>decrypt(encrypt({exp:now-1},secret),secret));
  assert.throws(()=>decrypt(encrypt({},secret)+'x',secret));
  // Independently encrypt malformed claims to verify validation, not just minting defaults.
  const raw=(payload:object)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);const b=Buffer.concat([c.update(JSON.stringify(payload)),c.final()]);return `fdmcp_enc_${iv.toString('base64url')}.${b.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;};
  for(const claims of [{v:1,aud:'feeds.theownersdesk.net'},{v:2,aud:'feeds.theownersdesk.net',exp:now+10},{v:1,aud:'other',exp:now+10},{v:1,aud:'feeds.theownersdesk.net',exp:now+31*86400}]) assert.throws(()=>decrypt(raw(claims),secret));
});
it('every merchant upstream operation uses GET and upstream bodies are never echoed',async()=>{
  const methods:string[]=[];
  const fetchFn=async (_input:unknown,init?:RequestInit)=>{methods.push(init?.method || 'GET');return Response.json({});};
  const google=new GoogleMerchantClient({accessToken:'sensitive',fetchFn}), ms=new MicrosoftMerchantClient({accessToken:'sensitive',fetchFn});
  await google.listAccounts();await google.listAccountIssues('1');await google.listDataSources('1');await google.listProducts('1');await ms.listStores();await ms.listCatalogs('1');await ms.listProducts('1');
  assert.equal(methods.length,7);assert.ok(methods.every(m=>m==='GET'));
  for(const C of [GoogleMerchantClient,MicrosoftMerchantClient]) {
    const client=new C({accessToken:'sensitive',fetchFn:async()=>new Response('sensitive error details',{status:500})});
    await assert.rejects(()=>client instanceof GoogleMerchantClient?client.listAccounts():client.listStores(),e=>e instanceof Error && !e.message.includes('sensitive'));
  }
});
it('tool errors sanitize thrown internal messages',async()=>{
  const server=createFeedDoctorServer({env:{GOOGLE_ACCESS_TOKEN:'token'},fetchFn:async()=>{throw new Error('sensitive internal token');}});
  const client=new Client({name:'security-test',version:'1'}), [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(b);await client.connect(a);
  try {const result=await client.callTool({name:'list_accounts',arguments:{}});assert.equal(result.isError,true);assert.ok(!JSON.stringify(result).includes('sensitive'));}
  finally {await client.close();await server.close();}
});
