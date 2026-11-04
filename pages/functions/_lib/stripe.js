const cache=new Map();
export async function stripe(env,path) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Billing unavailable');
  const res=await fetch('https://api.stripe.com/v1/'+path,{method:'GET',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY}});
  if (!res.ok) throw new Error('Billing unavailable');
  return res.json();
}
export async function isPro(env, customer) {
  if (!/^cus_[a-zA-Z0-9]+$/.test(customer || '') || !env.STRIPE_SECRET_KEY) return false;
  // Cache is scoped to the secret as well as the customer (separate test/live accounts).
  const key=env.STRIPE_SECRET_KEY+':'+customer, now=Date.now(), saved=cache.get(key);
  if (saved?.until>now) return saved.active;
  try {
    const data=await stripe(env,'subscriptions?'+new URLSearchParams({customer,status:'active',limit:'100'}));
    const active=Array.isArray(data.data) && data.data.some(s=>s.status==='active' && (s.customer===customer || s.customer?.id===customer));
    if (cache.size>=1000) cache.delete(cache.keys().next().value);
    cache.set(key,{active,until:now+600000});return active;
  } catch { return false; }
}
