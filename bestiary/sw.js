// Network-first service worker: every load with a connection fetches the
// latest index.html straight from GitHub Pages (which redeploys within
// ~1 minute of a push to this repo), so the installed app picks up
// changes on its next open. Falls back to the last cached copy when
// offline. Bump CACHE_NAME when the app-shell file list changes so old
// caches get cleaned up on activate.
//
// {cache: 'no-store'} on the fetch below is load-bearing: without it,
// "network-first" still isn't a freshness guarantee - a plain fetch()
// happily answers from the browser's own HTTP cache (governed by GitHub
// Pages' Cache-Control headers) without ever making a real request, which
// is how this quietly stopped updating.
var CACHE_NAME = 'bestiary-shell-v2';
var APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(APP_SHELL); }));
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n !== CACHE_NAME; }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return; // let cross-origin (GitHub API/raw) requests pass through untouched

  event.respondWith(
    fetch(event.request, {cache: 'no-store'}).then(function(response){
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
      return response;
    }).catch(function(){
      return caches.match(event.request).then(function(cached){ return cached || caches.match('./index.html'); });
    })
  );
});
