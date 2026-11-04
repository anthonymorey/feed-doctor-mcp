// Pro waitlist (Builder, 2026-11-04). Stores email + src in MailerLite group "FeedDoctor waitlist"; beacon feeddoctor-waitlist:src:<src>.
import { cleanSrc } from '../_lib/security.js';
import { count } from '../_lib/funnel.js';
const GROUP='203206605857096945';
export async function onRequestPost(context){
  const {request,env}=context; const isJson=(request.headers.get('content-type')||'').includes('application/json');
  let b={}; try{ b=isJson?await request.json():Object.fromEntries(await request.formData()); }catch{ return reply(isJson,400,{error:'Invalid request'}); }
  if(String(b.company||'')) return reply(isJson,200,{ok:true});
  const email=String(b.email||'').trim().slice(0,254); const src=cleanSrc(b.src);
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(isJson,422,{error:'Please enter a valid email address.'});
  if(!env.MAILERLITE_TOKEN) return reply(isJson,503,{error:'Sign-up is not available right now.'});
  const r=await fetch('https://connect.mailerlite.com/api/subscribers',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+env.MAILERLITE_TOKEN},body:JSON.stringify({email,groups:[GROUP],fields:{signup_source:('feeddoctor-'+src).slice(0,64)}})});
  if(!r.ok) return reply(isJson,502,{error:'Sign-up failed. Please try again later.'});
  context.waitUntil(count(request,[('feeddoctor-waitlist:src:'+src).slice(0,64)],'feeddoctor',src,env));
  return reply(isJson,200,{ok:true});
}
function reply(isJson,status,obj){
  if(!isJson) return obj.ok?new Response(null,{status:303,headers:{Location:'/pro?joined=1#waitlist','Cache-Control':'no-store'}}):new Response(obj.error,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
