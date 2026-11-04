import { cp, mkdir, readdir, rm } from 'node:fs/promises';
const target = 'pages/functions/_lib/fd';
await rm(target, {recursive:true, force:true});
await mkdir(target, {recursive:true});
for (const entry of await readdir('dist', {withFileTypes:true})) {
  if (entry.name === 'test' || ['cli.js','stdio.js','index.js'].includes(entry.name)) continue;
  if (entry.isDirectory() || entry.name.endsWith('.js'))
    await cp(`dist/${entry.name}`, `${target}/${entry.name}`, {recursive:true, filter:p=>!p.endsWith('.map') && !p.endsWith('.ts')});
}
await import('../pages/functions/_lib/core.js');
console.log('Pages core imports resolve.');

// Cloudflare discovers Functions at the repository root, alongside its output directory.
await rm('functions', {recursive:true, force:true});
await cp('pages/functions', 'functions', {recursive:true});
console.log('Pages Functions staged at repository root.');
