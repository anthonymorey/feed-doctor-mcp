import { stripe } from '../_lib/stripe.js';
import { sign, page, esc } from '../_lib/security.js';
// Checkout opens when STRIPE_PAYMENT_LINK is set; until then this route keeps redirecting to the Pro waitlist.
export async function onRequestGet({request,env}) {
  if (!env.STRIPE_PAYMENT_LINK) return new Response(null,{status:302,headers:{Location:'/pro#waitlist','Cache-Control':'no-store'}});
  const id=new URL(request.url).searchParams.get('session_id');
  if (!/^cs_[a-zA-Z0-9_]+$/.test(id || '')) return page('Checkout could not be verified','<p>Use the success link from your Stripe checkout.</p>',400);
  const session=await stripe(env,'checkout/sessions/'+encodeURIComponent(id));
  if (session.payment_status!=='paid' || session.mode!=='subscription' || !session.subscription || !/^cus_[a-zA-Z0-9]+$/.test(session.customer || '')) return page('Payment is not complete','<p>Please complete your subscription checkout first.</p>',400);
  const ref=sign({purpose:'pro',customer:session.customer,nonce:id,exp:Math.floor(Date.now()/1000)+600},env.FEED_DOCTOR_TOKEN_SECRET);
  return page('Activate FeedDoctor Pro',`<p>Your subscription is ready. This activation link expires in 10 minutes. Keep your checkout success URL private: it grants access to your subscription.</p><p><a class="button" href="/connect/google?pro=${esc(encodeURIComponent(ref))}">Reconnect Google to activate Pro</a></p><p>Microsoft Merchant Center support is coming soon.</p>`);
}
