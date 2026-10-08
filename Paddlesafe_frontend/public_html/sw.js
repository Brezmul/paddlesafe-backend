// ==============================================================================
// PADDLESAFE - SERVICE WORKER v8
//
// REGLAS DE ORO (app de seguridad: un dato viejo mostrado como actual es un riesgo)
//  1. Clima, Supabase (API/Auth/Realtime), backend y geocoding: NUNCA se interceptan
//     ni se cachean → el navegador los gestiona tal cual.
//  2. Navegación y JS propio: red primero (con precarga de navegación y timeout);
//     la caché solo es respaldo OFFLINE / red lenta / error 5xx.
//  3. Nada se cachea si no es una respuesta 200 válida y sin "Cache-Control: no-store".
//  4. Imágenes, tiles y librerías CDN: stale-while-revalidate / cache-first con tope.
//
// OTA: sube VERSION en cada despliegue (junto con version.json). Al activarse,
// el SW borra TODAS las cachés de versiones anteriores.
// ==============================================================================
const VERSION = 'paddlesafe-v8';
const SHELL   = `${VERSION}-shell`;   // HTML + JS propio
const STATIC  = `${VERSION}-static`;  // iconos, css, fuentes, manifest
const IMGS    = `${VERSION}-img`;     // avatares, logos, marcadores (inmutables)
const TILES   = `${VERSION}-tiles`;   // mapa
const LIBS    = `${VERSION}-libs`;    // leaflet, supabase-js, tailwind… (CDN)
const KEEP    = [SHELL, STATIC, IMGS, TILES, LIBS];

const MAX = { shell: 24, static: 80, imgs: 200, tiles: 400, libs: 24 };
const NET_TIMEOUT = 4000;             // ms antes de caer a la caché (red lenta en el mar)

// ---------- Clasificación de hosts ----------
const hostIs = (h, d) => h === d || h.endsWith('.' + d);   // evita "evilsupabase.co"

// NUNCA interceptar:
const LIVE_HOSTS = [
  'supabase.co', 'supabase.in',          // API, Auth, Storage privado, Realtime
  'open-meteo.com',                      // api. y marine-api.
  'vercel.app',                          // backend (StormGlass / AEMET)
  'nominatim.openstreetmap.org'
];
const TILE_HOSTS = ['tile.openstreetmap.org', 'tiles.openseamap.org'];
const LIB_HOSTS  = ['unpkg.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'cdn.tailwindcss.com'];
const IMG_HOSTS  = ['api.dicebear.com', 'raw.githubusercontent.com'];   // deterministas / estáticos

function isLive(url, req) {
  const h = url.hostname;
  return (
    LIVE_HOSTS.some(d => hostIs(h, d)) && !isPublicStorage(url) ||
    url.pathname === '/version.json' ||     // el OTA lo pide con cache:'no-store'
    url.pathname === '/sw.js' ||
    req.cache === 'no-store' ||
    req.headers.has('authorization') ||
    req.headers.has('range')
  );
}
// Objetos PÚBLICOS de Storage: su nombre lleva Date.now() → inmutables → cacheables.
const isPublicStorage = url =>
  hostIs(url.hostname, 'supabase.co') && url.pathname.startsWith('/storage/v1/object/public/');

const isTile = url => TILE_HOSTS.some(d => hostIs(url.hostname, d));
const isLib  = url => LIB_HOSTS.some(d => hostIs(url.hostname, d));
const isImgHost = url => IMG_HOSTS.some(d => hostIs(url.hostname, d)) || isPublicStorage(url);

// ---------- Utilidades ----------
const timeoutReject = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

/** ¿Es seguro guardar esta respuesta? */
function cacheable(res) {
  if (!res || res.status !== 200) return false;
  if (res.type !== 'basic' && res.type !== 'cors') return false;      // nada de opaque (no se puede verificar)
  if (res.redirected) return false;                                    // un redirect no se puede servir a navigate
  const cc = (res.headers.get('cache-control') || '').toLowerCase();
  if (cc.includes('no-store')) return false;   // ("private" no impide la caché del navegador/SW)
  return true;
}

/** Guarda sin romper nunca la petición (cuota llena, Vary:*, etc.). */
async function putSafe(cache, key, res, max) {
  try {
    await cache.put(key, res);
    if (max) await trim(cache, max);
  } catch (e) {
    try { await trim(cache, Math.floor((max || 40) / 2)); } catch (_) {}
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);   // FIFO
}

/** Borra versiones anteriores del mismo recurso (app.js?v=viejo) al guardar el nuevo. */
async function dropOldVersions(cache, url) {
  const keys = await cache.keys();
  await Promise.all(keys
    .filter(k => { const u = new URL(k.url); return u.pathname === url.pathname && u.search !== url.search; })
    .map(k => cache.delete(k)));
}

/**
 * Re-pide en modo CORS para poder CACHEAR respuestas de <img>/<script> de otros
 * orígenes (en no-cors la respuesta es "opaque" y no se puede guardar).
 * Si el servidor no soporta CORS, cae a la petición original.
 */
async function fetchCors(req) {
  try {
    return await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit', cache: 'default' }));
  } catch (_) {
    return fetch(req);
  }
}

// ---------- Estrategias ----------

/**
 * Red primero. Si la red tarda > NET_TIMEOUT, falla o devuelve 5xx → caché.
 * La descarga NO se cancela por el timeout: sigue en segundo plano y deja la
 * caché fresca para la próxima vez.
 */
async function networkFirst(event, req, cacheName, { key, preload, max, versioned } = {}) {
  const cache = await caches.open(cacheName);
  const url = new URL(req.url);

  const net = (preload ? Promise.resolve(preload).then(r => r || fetch(req)) : fetch(req))
    .then(async res => {
      if (cacheable(res)) {
        if (versioned) await dropOldVersions(cache, url);
        await putSafe(cache, key || req, res.clone(), max);
      }
      return res;
    });
  net.catch(() => {});                       // evita "unhandled rejection" si pierde el timeout
  event.waitUntil(net.catch(() => {}));      // mantiene vivo el SW hasta guardar

  const fallback = async () =>
    (await cache.match(req)) ||                                  // 1º coincidencia EXACTA (?v=hash)
    (await cache.match(req, { ignoreSearch: true })) ||          // 2º cualquier versión (solo offline)
    (key ? await cache.match(key) : undefined);

  try {
    const res = await Promise.race([net, timeoutReject(NET_TIMEOUT)]);
    if (res.status >= 500) {                 // servidor caído → mejor la copia buena
      const hit = await fallback();
      if (hit) return hit;
    }
    return res;
  } catch (err) {
    const hit = await fallback();
    if (hit) return hit;
    return net;                              // sin caché: espera la red real o falla con su error nativo
  }
}

/** Sirve la copia y refresca en segundo plano. */
async function staleWhileRevalidate(event, req, cacheName, max, { cors = false } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const update = (cors ? fetchCors(req) : fetch(req))
    .then(async res => {
      if (cacheable(res)) await putSafe(cache, req, res.clone(), max);
      return res;
    })
    .catch(() => undefined);
  event.waitUntil(update);
  return hit || (await update) || Response.error();
}

/** Contenido inmutable (nombre con timestamp / semilla fija): caché primero. */
async function cacheFirst(event, req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetchCors(req);
    if (cacheable(res)) event.waitUntil(putSafe(cache, req, res.clone(), max));
    return res;
  } catch (_) {
    return Response.error();
  }
}

// ---------- Ciclo de vida ----------
self.addEventListener('install', event => {
  self.skipWaiting();                        // OTA: la versión nueva toma el control YA
  event.waitUntil((async () => {
    // allSettled: un recurso que falle no aborta la instalación completa
    await Promise.allSettled([
      caches.open(SHELL).then(async c => {
        const res = await fetch(new Request('/', { cache: 'reload' }));   // salta la caché HTTP
        if (cacheable(res)) await c.put('/', res);
      }),
      caches.open(STATIC).then(c => c.add(new Request('/manifest.json', { cache: 'reload' })))
    ]);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('paddlesafe-') && !KEEP.includes(k)).map(k => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
    // Aviso opcional a las pestañas abiertas (por si quieres mostrar «Actualizado»)
    const all = await self.clients.matchAll({ type: 'window' });
    all.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// ---------- Fetch ----------
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                                   // POST/RPC/PATCH: directo a red
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;   // bug de DevTools/Chrome
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (isLive(url, req)) return;                                       // sin respondWith → navegador

  const sameOrigin = url.origin === self.location.origin;

  // 1) Navegación (SPA: /user/…, /club/… comparten el shell "/")
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, req, SHELL, { key: '/', preload: event.preloadResponse, max: MAX.shell }));
    return;
  }

  if (sameOrigin) {
    // 2) JS propio: /app.js?v=<hash> → red primero; al guardar, tira las versiones viejas
    if (url.pathname.endsWith('.js')) {
      event.respondWith(networkFirst(event, req, SHELL, { max: MAX.shell, versioned: true }));
      return;
    }
    // 3) manifest, css, iconos, fuentes… → SWR
    if (url.pathname === '/manifest.json' || /\.(png|jpe?g|svg|gif|webp|ico|css|woff2?)$/i.test(url.pathname) ||
        ['image', 'style', 'font'].includes(req.destination)) {
      event.respondWith(staleWhileRevalidate(event, req, STATIC, MAX.static));
    }
    return;
  }

  // 4) Tiles de mapa
  if (isTile(url)) {
    event.respondWith(staleWhileRevalidate(event, req, TILES, MAX.tiles, { cors: true }));
    return;
  }
  // 5) Avatares (dicebear), logos/fotos de ruta (Storage público), marcadores
  if (isImgHost(url)) {
    event.respondWith(cacheFirst(event, req, IMGS, MAX.imgs));
    return;
  }
  // 6) Librerías de CDN (leaflet, supabase-js, html2canvas, tailwind)
  if (isLib(url)) {
    event.respondWith(staleWhileRevalidate(event, req, LIBS, MAX.libs, { cors: true }));
    return;
  }
  // El resto lo resuelve el navegador.
});

// ---------- Mensajes desde la página ----------
self.addEventListener('message', event => {
  const t = event.data && event.data.type;
  if (t === 'SKIP_WAITING') self.skipWaiting();
  else if (t === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
  else if (t === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then(ks =>
      Promise.all(ks.filter(k => k.startsWith('paddlesafe-')).map(k => caches.delete(k)))));
  }
});
