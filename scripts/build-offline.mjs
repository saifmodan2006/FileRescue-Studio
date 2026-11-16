import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const base = resolve('dist');
const entries = await readdir(base,{recursive:true,withFileTypes:true});
const resources = entries.filter(item => item.isFile() && item.name !== 'sw.js')
  .map(item => '/' + relative(base,join(item.parentPath,item.name)).replaceAll('\\','/'))
  .sort();
const hash = createHash('sha256');
for (const resource of resources) hash.update(await readFile('dist'+resource));
const version = hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',`
const prefix = 'filerescue-';
const cacheName = prefix + '${version}';
const resources = ${JSON.stringify(resources)};
const known = new Set(resources);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(resources)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match('/index.html')));
  } else if (known.has(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(url.pathname)).then(hit => hit ?? fetch(request)));
  }
});
`);
