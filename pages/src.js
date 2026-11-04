const src=new URL(location.href).searchParams.get('src');
if(src) for(const a of document.querySelectorAll('a[href]')) {
  const url=new URL(a.href,location.href);
  if(url.origin===location.origin && !a.getAttribute('href').startsWith('#')) {url.searchParams.set('src',src);a.href=url.href;}
}
for(const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click',async()=>{
  const input=document.getElementById(button.dataset.copy), status=document.getElementById('copy-status');
  try {await navigator.clipboard.writeText(input.value);status.textContent='Copied. Save your token securely.';}
  catch {input.focus();input.select();status.textContent='Select and copy the token with your keyboard.';}
});

const wl=document.getElementById('waitlist');
if(wl){wl.elements.src.value=src||'';wl.addEventListener('submit',async e=>{e.preventDefault();const st=wl.querySelector('.wl-status');st.textContent='Sending…';
try{const r=await fetch('/api/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(wl)))});const d=await r.json();st.textContent=d.ok?'You’re on the list. We’ll email you when Pro opens.':(d.error||'Something went wrong.');if(d.ok)wl.reset();}catch{st.textContent='Something went wrong. Please try again.';}});
if(new URL(location.href).searchParams.get('joined'))wl.querySelector('.wl-status').textContent='You’re on the list. We’ll email you when Pro opens.';}
