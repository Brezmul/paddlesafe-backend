// ==============================================================================
// PADDLESAFE - SERVICE WORKER v8.1
//
// REGLAS DE ORO (Plataforma náutica de seguridad: un dato meteorológico o estado
// de alerta desactualizado representa un riesgo en el mar):
//  1. Supabase (Auth, REST, RPC, Realtime) y backend (/api/*, api/backend.js):
//     Estrictamente NetworkOnly. NUNCA se interceptan ni se guardan en caché.
//  2. Open-Meteo (api. y marine-api.open-meteo.com):
//     Estrictamente NetworkFirst con timeout corto (2.5s). NUNCA CacheFirst,
//     para impedir que el palista visualice condiciones de viento u olas caducadas.
//  3. Navegación SPA y JS modular: Red primero (con precarga de navegación y timeout);
//     la caché actúa exclusivamente como respaldo ante pérdida de cobertura.
//  4. Tiles cartográficos, CSS y librerías CDN: Stale-While-Revalidate con cuota máxima.
//  5. Limpieza automática en 'activate' de todas las cachés anteriores a VERSION.
// ==============================================================================

const VERSION       = 'paddlesafe-v604';
const SHELL         = `${VERSION}-shell`;       // HTML + JS propio de la app
const STATIC        = `${VERSION}-static`;      // Iconos, CSS, tipografías, manifest
const IMGS          = `${VERSION}-img`;         // Avatares, fotos de ruta inmutables
const TILES         = `${VERSION}-tiles`;       // Teselas náuticas y satélite (OSM, CartoDB, ArcGis)
const LIBS          = `${VERSION}-libs`;        // CDN (Leaflet, Tailwind, Supabase JS)
const WEATHER_CACHE = `${VERSION}-weather`;     // Respaldo efímero offline para Open-Meteo
const KEEP          = [SHELL, STATIC, IMGS, TILES, LIBS, WEATHER_CACHE];

const MAX = { shell: 48, static: 80, imgs: 200, tiles: 1000, libs: 24, weather: 24 };
const NET_TIMEOUT       = 4000;  // ms antes de caer a caché en shell/navegación
const SHORT_API_TIMEOUT = 2500;  // ms timeout corto para Open-Meteo (frescura estricta)

// Pre-caché offline de los submódulos del mapa modular (Strangler Fig)
const MAP_MODULES_PRECACHE = [
  '/js/map/map.state.js',
  '/js/map/map.core.js',
  '/js/map/map.weather.js',
  '/js/map/map.bento.js',
  '/js/map/map.tracker.js',
  '/js/map/map.poster.js',
  '/js/map/map.routes.js',
  '/js/map/map.coach.js',
  '/js/map/map.spots.js',
  '/js/map/map.radar.js'
];

// ---------- Clasificación de hosts ----------
const hostIs = (h, d) => h === d || h.endsWith('.' + d);

// Hosts de tiempo real y backend (NUNCA interceptar con CacheFirst)
const LIVE_HOSTS = [
  'supabase.co', 'supabase.in',          // API, Auth, Storage privado, Realtime
  'vercel.app',                          // backend serverless
  'nominatim.openstreetmap.org'          // geocoding dinámico
];

const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'tiles.openseamap.org',
  'basemaps.cartocdn.com',
  'cartocdn.com',
  'server.arcgisonline.com'
];

const LIB_HOSTS = [
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'cdn.tailwindcss.com'
];

const IMG_HOSTS = [
  'api.dicebear.com',
  'raw.githubusercontent.com'
];

/**
 * Peticiones NetworkOnly estrictas:
 * Supabase (Auth/RPC/REST), backend APIs (/api/*, api/backend.js),
 * version.json y cualquier petición con authorization o no-store.
 */
function isNetworkOnly(url, req) {
  const h = url.hostname;
  return (
    hostIs(h, 'supabase.co') && !isPublicStorage(url) ||
    LIVE_HOSTS.some(d => hostIs(h, d)) && !isPublicStorage(url) ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('backend.js') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/rpc/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/realtime/v1/') ||
    url.pathname.endsWith('/version.json') ||
    url.pathname.endsWith('/sw.js') ||
    url.searchParams.has('t') ||
    req.cache === 'no-store' ||
    req.headers.has('authorization') ||
    req.headers.has('range')
  );
}

/** Comprueba si la petición corresponde a la API meteorológica Open-Meteo */
function isOpenMeteo(url) {
  return hostIs(url.hostname, 'open-meteo.com');
}

/** Objetos públicos de Supabase Storage: cacheables si no tienen cache-buster ?t= */
const isPublicStorage = url =>
  hostIs(url.hostname, 'supabase.co') &&
  url.pathname.startsWith('/storage/v1/object/public/') &&
  !url.searchParams.has('t');

const isTile = url => TILE_HOSTS.some(d => hostIs(url.hostname, d));
const isLib  = url => LIB_HOSTS.some(d => hostIs(url.hostname, d));
const isImgHost = url => IMG_HOSTS.some(d => hostIs(url.hostname, d)) || isPublicStorage(url);

// ---------- Utilidades de Caché ----------
const timeoutReject = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

function cacheable(res) {
  if (!res || res.status !== 200) return false;
  if (res.type !== 'basic' && res.type !== 'cors') return false;
  if (res.redirected) return false;
  const cc = (res.headers.get('cache-control') || '').toLowerCase();
  if (cc.includes('no-store')) return false;
  return true;
}

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
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function dropOldVersions(cache, url) {
  const keys = await cache.keys();
  await Promise.all(keys
    .filter(k => {
      const u = new URL(k.url);
      return u.pathname === url.pathname && u.search !== url.search;
    })
    .map(k => cache.delete(k)));
}

async function fetchCors(req) {
  try {
    return await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit', cache: 'default' }));
  } catch (_) {
    return fetch(req);
  }
}

// ---------- Estrategias de Caché ----------

/**
 * NetworkFirst con timeout corto (2.5s) para APIs meteorológicas (Open-Meteo).
 * NUNCA CacheFirst: Consulta siempre a la red satelital primero. Solo ante caída total
 * de señal en altamar recurre al último pronóstico efímero disponible.
 */
async function networkFirstWeather(event, req, cacheName, timeoutMs = SHORT_API_TIMEOUT) {
  const cache = await caches.open(cacheName);

  const netPromise = fetch(req)
    .then(async res => {
      if (cacheable(res)) {
        await putSafe(cache, req, res.clone(), MAX.weather);
      }
      return res;
    });

  event.waitUntil(netPromise.catch(() => {}));

  try {
    return await Promise.race([netPromise, timeoutReject(timeoutMs)]);
  } catch (_) {
    const fallback = await cache.match(req);
    if (fallback) return fallback;
    return netPromise;
  }
}

/**
 * NetworkFirst estándar (4s) para navegación y scripts JS propios.
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

  net.catch(() => {});
  event.waitUntil(net.catch(() => {}));

  const fallback = async () =>
    (await cache.match(req)) ||
    (await cache.match(req, { ignoreSearch: true })) ||
    (key ? await cache.match(key) : undefined);

  try {
    const res = await Promise.race([net, timeoutReject(NET_TIMEOUT)]);
    if (res.status >= 500) {
      const hit = await fallback();
      if (hit) return hit;
    }
    return res;
  } catch (err) {
    const hit = await fallback();
    if (hit) return hit;
    return net;
  }
}

/** StaleWhileRevalidate: sirve copia inmediata y actualiza en segundo plano */
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

/** CacheFirst: exclusivo para assets completamente inmutables */
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

// ---------- Ciclo de Vida del Service Worker ----------

self.addEventListener('install', event => {
  // Pasa directamente a estado instalado sin bloquear
  event.waitUntil((async () => {
    await Promise.allSettled([
      caches.open(SHELL).then(async c => {
        const res = await fetch(new Request('/', { cache: 'reload' }));
        if (cacheable(res)) await c.put('/', res);
        await Promise.allSettled(['/js/map.js', ...MAP_MODULES_PRECACHE].map(async url => {
          try {
            const r = await fetch(new Request(url, { cache: 'reload' }));
            if (cacheable(r)) await c.put(url, r);
          } catch (_) {}
        }));
      }),
      caches.open(STATIC).then(c => c.add(new Request('/manifest.json', { cache: 'reload' })))
    ]);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // 1. Limpieza automática estricta de todos los buckets anteriores
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('paddlesafe-') && !KEEP.includes(k)).map(k => caches.delete(k))
    );

    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }

    await self.clients.claim();

    // 2. Notificación suave a los clientes abiertos (sin forzar recargas destructivas)
    const all = await self.clients.matchAll({ type: 'window' });
    all.forEach(c => c.postMessage({
      type: 'SW_ACTIVATED',
      version: VERSION,
      message: 'PaddleSafe se ha actualizado a ' + VERSION
    }));
  })());
});

// ---------- Enrutador Fetch ----------

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // 1) Endpoints NetworkOnly (Supabase, Auth, Realtime, /api/*, api/backend.js, version.json)
  //    NUNCA interceptados: el navegador gestiona la conexión directa a red
  if (isNetworkOnly(url, req)) {
    return;
  }

  // 2) Open-Meteo: NetworkFirst estricto con timeout corto de 2.5s (NUNCA CacheFirst)
  if (isOpenMeteo(url)) {
    event.respondWith(networkFirstWeather(event, req, WEATHER_CACHE, SHORT_API_TIMEOUT));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // 3) Navegación principal (SPA shell)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, req, SHELL, { key: '/', preload: event.preloadResponse, max: MAX.shell }));
    return;
  }

  // 4) Archivos del mismo origen
  if (sameOrigin) {
    // Scripts JS propios -> Red primero con eliminación de versiones obsoletas
    if (url.pathname.endsWith('.js')) {
      event.respondWith(networkFirst(event, req, SHELL, { max: MAX.shell, versioned: true }));
      return;
    }
    // Manifest, CSS, iconos, tipografías -> StaleWhileRevalidate
    if (url.pathname === '/manifest.json' || /\.(png|jpe?g|svg|gif|webp|ico|css|woff2?)$/i.test(url.pathname) ||
        ['image', 'style', 'font'].includes(req.destination)) {
      event.respondWith(staleWhileRevalidate(event, req, STATIC, MAX.static));
    }
    return;
  }

  // 5) Teselas cartográficas de mapa (OSM, OpenSeaMap, CartoDB, ArcGis)
  if (isTile(url)) {
    event.respondWith(staleWhileRevalidate(event, req, TILES, MAX.tiles, { cors: true }));
    return;
  }

  // 6) Avatares (DiceBear) y fotos públicas de Storage (inmutables)
  if (isImgHost(url)) {
    event.respondWith(cacheFirst(event, req, IMGS, MAX.imgs));
    return;
  }

  // 7) Librerías CDN externas (Leaflet, Tailwind, etc.)
  if (isLib(url)) {
    event.respondWith(staleWhileRevalidate(event, req, LIBS, MAX.libs, { cors: true }));
    return;
  }
});

// ---------- Mensajería Inter-Procesos ----------

self.addEventListener('message', event => {
  const t = event.data && event.data.type;
  if (t === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (t === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  } else if (t === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then(ks =>
      Promise.all(ks.filter(k => k.startsWith('paddlesafe-')).map(k => caches.delete(k)))));
  } else if (t === 'PREFETCH_TILES') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    event.waitUntil((async () => {
      const cache = await caches.open(TILES);
      let loaded = 0;
      const total = urls.length;
      const BATCH_SIZE = 6;

      const notify = (status, extra = {}) => {
        const payload = { type: 'PREFETCH_TILES_UPDATE', status, loaded, total, ...extra };
        if (event.ports && event.ports[0]) {
          try { event.ports[0].postMessage(payload); } catch (_) {}
        }
        if (event.source && event.source.postMessage) {
          try { event.source.postMessage(payload); } catch (_) {}
        }
      };

      notify('started');

      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async url => {
          try {
            const req = new Request(url, { mode: 'cors', credentials: 'omit', cache: 'default' });
            const hit = await cache.match(req);
            if (!hit) {
              const res = await fetch(req);
              if (cacheable(res)) {
                await putSafe(cache, req, res.clone(), MAX.tiles);
              }
            }
          } catch (_) {
          } finally {
            loaded++;
          }
        }));
        notify('progress');
      }
      notify('completed', { success: true });
    })());
  }
});
