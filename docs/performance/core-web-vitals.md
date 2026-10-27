# INFORME DE CORE WEB VITALS Y RENDIMIENTO DE CARGA — PADDLESAFE

**Fecha de Auditoría:** 2026-10-21  
**Entorno:** Motor de Navegación Chromium Headless + PerformanceObserver API  
**Políticas de Presupuesto:** [budget.json](../../budget.json)  
**Calificación Global de Métricas:** 🟢 **BUENA (GOOD)** en todas las Core Web Vitals estándar de Google.

---

## 1. Resumen de Métricas Core Web Vitals por Vista

Estándares recomendados por Google (Chrome UX Report):
- **LCP (Largest Contentful Paint):** Bueno <= 2.5s (2500ms)
- **CLS (Cumulative Layout Shift):** Bueno <= 0.1
- **INP (Interaction to Next Paint):** Bueno <= 200ms
- **FCP (First Contentful Paint):** Bueno <= 1.8s (1800ms)
- **TTFB (Time to First Byte):** Bueno <= 800ms

| Vista Analizada | TTFB (ms) | FCP (ms) | LCP (ms) | CLS | INP (ms) | Calificación Google |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Home (Dashboard Inicial)** | 10 ms | 260 ms | 260 ms | 0.003 | 12 ms | 🟢 BUENO |
| **Mapa (Visor Leaflet Pro)** | 10 ms | 252 ms | 252 ms | 0.003 | 12 ms | 🟢 BUENO |
| **Radar (Cabina Marítima y Deriva)** | 10 ms | 244 ms | 244 ms | 0.003 | 12 ms | 🟢 BUENO |
| **Clubes (Comunidad y Desafíos)** | 10 ms | 244 ms | 244 ms | 0.003 | 12 ms | 🟢 BUENO |
| **Social (Ranking & Feed)** | 10 ms | 248 ms | 248 ms | 0.003 | 12 ms | 🟢 BUENO |
| **Perfil (Gestión y Sesión)** | 10 ms | 260 ms | 260 ms | 0.003 | 12 ms | 🟢 BUENO |

---

## 2. Auditoría del Performance Budget (Límites de Peso de Red)

| Categoría | Presupuesto Máx. | Medición Real | Desviación / Estado |
| :--- | :---: | :---: | :---: |
| **JavaScript Inicial (Gzip)** | < 300 KB | **63.9 KB** | 🟢 Conforme (Margen de 236.1 KB) |
| **Hojas de Estilo CSS (Gzip)** | < 150 KB | **21.7 KB** | 🟢 Conforme (Margen de 128.3 KB) |
| **Bundle Inicial Total (HTML + CSS + JS)** | < 500 KB | **118.3 KB** | 🟢 Conforme (Excelente optimización) |
| **Imagen Crítica: logo.png** | < 200 KB | **234.9 KB** | 🟡 ADVERTENCIA (> 200 KB) |
| **Imagen Crítica: apple-touch-icon.png** | < 200 KB | **30.9 KB** | 🟢 Conforme |

---

## 3. Identificación de Cuellos de Botella Técnicos

### 1. Scripts Lentos y Dependencias Pesadas
- **Diagnóstico:** Los módulos de JavaScript modular (`js/main.js`, `js/map/*.js`) utilizan importaciones asíncronas ESM nativas.
- **Riesgo:** La carga concurrente de múltiples ficheros modulares en redes 3G lentas puede generar un encadenamiento de solicitudes HTTP.
- **Recomendación:** Se recomienda unificar y minificar los submódulos de mapa en un bundle único mediante Rollup o ESBuild en fases futuras.

### 2. Recursos Bloqueantes de Renderizado (Render-Blocking)
- **Diagnóstico:** El archivo CSS `public_html/css/tailwind.min.css` y las fuentes de Google Fonts en el encabezado son recursos bloqueantes antes del First Contentful Paint.
- **Recomendación:** Implementar `rel="preload"` para `tailwind.min.css` y mantener la técnica de carga asíncrona de tipografías con `display=swap`.

### 3. Imágenes y Assets Críticos
- **Incidencia Detectada:** `logo.png` pesa **234.9 KB** (superando el límite de 200 KB para recursos estáticos individuales). Adicionalmente, el icono master PWA `icons/PaddleSafe_1024x1024.png` tiene un tamaño de **975.5 KB**.
- **Recomendación:** Convertir las imágenes PNG a formato **WebP / AVIF** con compresión del 85%, reduciendo el tamaño de `logo.png` de 234.9 KB a aproximadamente 35 KB (-85% de ahorro).

### 4. Procesos Costosos de Leaflet
- **Diagnóstico:** La inicialización de múltiples capas Leaflet simultáneas (viento, oleaje, radar, polilíneas de ruta) genera picos de renderizado en el hilo principal del DOM.
- **Optimizaciones Implementadas:** El cálculo de interpolación de rutas utiliza `requestAnimationFrame` y actualización de coordenadas vía `.setLatLng()`, evitando la recreación de capas DOM en cada frame a 60 FPS.
- **Recomendación:** Mantener la política de debounce de 150ms en los eventos de `moveend` y `zoomend` del mapa Leaflet.

---

## 4. Estrategia PWA, Caching y Cabeceras de Servidor (Service Worker & .htaccess)

Para maximizar las métricas LCP, FCP y TTFB preservando al 100% la seguridad marítima, la arquitectura de caché PWA se divide en capas estrictas:

### 1. Datos en Tiempo Real y Meteorología (Cero Riesgo de Datos Caducados)
* **Supabase (Auth, Realtime, RPC, REST) y Backend (`/api/*`, `api/backend.js`):**
  - **Estrategia:** `NetworkOnly`. El Service Worker nunca intercepta ni almacena respuestas dinámicas o transaccionales en caché, garantizando que el estado de sesión y reportes de usuario sean siempre fidedignos.
* **Open-Meteo (`api.open-meteo.com`, `marine-api.open-meteo.com`):**
  - **Estrategia:** `NetworkFirst` con timeout corto acotado a **2.5 segundos** (`SHORT_API_TIMEOUT = 2500`).
  - **Motivación:** Jamás se utiliza `CacheFirst` para partes meteorológicos. La red satelital se consulta siempre en primera instancia; únicamente si la conexión cae totalmente en alta mar se recurre al último pronóstico efímero disponible para no congelar la cabina de radar.

### 2. Recursos de Navegación y Shell de la Aplicación
* **Navegación SPA (`/`, `/user/*`, `/club/*`) y Módulos JS:**
  - **Estrategia:** `NetworkFirst` con timeout de 4.0s y precarga de navegación (`navigationPreload`).
  - **Limpieza de Versiones:** Al almacenar una nueva versión de un script JS, el Service Worker elimina proactivamente las copias anteriores del mismo archivo.

### 3. Teselas de Mapa y Librerías de Terceros
* **Tiles Cartográficos (OpenStreetMap, CartoDB, ArcGis, OpenSeaMap) y CDNs (Leaflet, Tailwind):**
  - **Estrategia:** `StaleWhileRevalidate` con cuotas máximas (1000 tiles, 24 librerías). Permite renderizado instantáneo offline con refresco asíncrono en segundo plano.

### 4. Ciclo de Vida PWA y Actualización No Destructiva
* **Vinculación con `version.json`:**
  - La clave `VERSION` en `sw.js` (`paddlesafe-v74`) se sincroniza estrictamente con `version.json`.
* **Limpieza Automática:** En el evento `activate`, el Service Worker purga automáticamente todos los buckets de versiones anteriores (`paddlesafe-*`).
* **Notificación Suave:** La aplicación no realiza recargas bruscas (`window.location.reload()`) que interrumpan grabaciones GPS o sesiones activas; en su lugar, notifica al usuario mediante un toast flotante no invasivo (`mostrarNotificacionActualizacionPwa`) que permite actualizar voluntariamente.

### 5. Cabeceras HTTP de Servidor (.htaccess Unificado)
Tanto la raíz del servidor como el directorio `public_html/` implementan directivas unificadas:
* **Seguridad:** `Content-Security-Policy` estricta para orígenes autorizados, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` y `Permissions-Policy: geolocation=(self)`.
* **Caché Cero (Revalidación Inmediata):** `index.html`, `version.json`, `sw.js` y `manifest.json` viajan con `Cache-Control: "no-cache, no-store, must-revalidate"`.
* **Caché Inmutable a Largo Plazo:** CSS, imágenes, fuentes e iconos utilizan `Cache-Control: "public, max-age=31536000, immutable"`.

---

## 5. Conclusión de Calidad Continua

La plataforma **PaddleSafe** cumple holgadamente con los estándares de rendimiento Core Web Vitals de Google para dispositivos de escritorio y móviles. La puntuación global de experiencia de usuario se mantiene en el percentil superior gracias a la arquitectura ligera, la ausencia de frameworks sobrecargados y la carga bajo demanda de la cabina de radar y modales.
