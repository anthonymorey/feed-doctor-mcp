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
