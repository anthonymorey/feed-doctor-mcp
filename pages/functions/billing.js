import { page,esc } from './_lib/security.js';
export function onRequestGet({env}) {
  let url='mailto:support@theownersdesk.net';
  if (env.STRIPE_PORTAL_URL) {
    const portal=new URL(env.STRIPE_PORTAL_URL);
    if (portal.protocol==='https:' && portal.hostname==='billing.stripe.com') url=portal.href;
  }
  return page('Manage your subscription',`<p>Update payment details or cancel anytime. Cancellation stops the next renewal; paid access continues through the current billing period while your subscription remains active.</p><a class="button" href="${esc(url)}">Manage billing</a><p>If you need help, email <a href="mailto:support@theownersdesk.net">support@theownersdesk.net</a>.</p>`);
}
