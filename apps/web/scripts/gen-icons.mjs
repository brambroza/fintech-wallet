// Needs devDeps: @iconify/utils @iconify-json/solar @iconify-json/eva @iconify-json/mingcute (npx -p ...). Run from apps/web.
import fs from 'node:fs';
import { getIcons } from '@iconify/utils';
const names = fs.readFileSync('scripts/icons.txt', 'utf8').trim().split('\n');
const out = [];
for (const prefix of [...new Set(names.map((n) => n.split(':')[0]))]) {
  const set = JSON.parse(fs.readFileSync(`node_modules/@iconify-json/${prefix}/icons.json`, 'utf8'));
  const want = names.filter((n) => n.startsWith(prefix + ':')).map((n) => n.split(':')[1]);
  const sub = getIcons(set, want);
  const missing = want.filter((w) => !sub.icons[w] && !(sub.aliases ?? {})[w]);
  if (missing.length) console.error('missing', prefix, missing);
  out.push(sub);
}
fs.writeFileSync('src/lib/icons.json', JSON.stringify(out));
console.log('ok', out.map((s) => s.prefix + ':' + Object.keys(s.icons).length).join(' '));
