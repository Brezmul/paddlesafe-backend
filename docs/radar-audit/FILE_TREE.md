# ÁRBOL DE ARCHIVOS RELEVANTE: MAPA, RADAR Y METEOROLOGÍA

> **Entregable:** PARTE 11 del Dossier Técnico de Auditoría de PaddleSafe  
> **Destinatario:** Argon (Arquitecto de Rediseño y Modelos Autónomos de IA)  
> **Fecha:** 21 de Octubre de 2026  
> **Área:** Subsistema de Cartografía Náutica, Radar Táctico, Predicción Marina y Telemetría SUP  

---

## 1. Estructura Jerárquica del Código Fuente

A continuación se muestra la estructura real del proyecto PaddleSafe con los archivos directamente involucrados en el mapa Leaflet, radar Doppler, roseta de vientos, motores físicos de deriva costera, predicciones meteorológicas y controles UI:

```text
c:/Users/Usuario/Desktop/WEBS/PaddleSafe/
├── public_html/
│   ├── index.html                               # Contenedor raíz DOM, viewport Leaflet (#mapaInteractivo), HUDs flotantes y selectores
│   ├── sw.js                                    # Service Worker PWA, caché de teselas cartográficas CARTO/Esri y datos meteorológicos
│   │
│   ├── css/
│   │   ├── tailwind-input.css                   # Capas CSS de diseño, z-index prioritarios (#mapLayerSwitcher: 1100, #radarCockpitPanel: 1000)
│   │   └── tailwind.min.css                     # Tailwind CSS compilado de producción (147.2 KB)
│   │
│   └── js/
│       ├── config.js                            # API keys (CARTO, Supabase), coordenadas por defecto, endpoints de servicios
│       ├── utils.js                             # Conversión de unidades náuticas (nudos/kmh/Beaufort), cálculo Haversine, cálculo solar
│       ├── gpxParser.js                         # Intérprete XML de travesías náuticas GPX/KML para trazado y replay
│       ├── main.js                              # Orquestador global de arranque de la SPA, eventos de cabecera y navegación
│       ├── auth.js                              # Estado de sesión de usuario, preferencias de material (tabla SUP) y nivel técnico
│       ├── social.js                            # Quedadas en el mapa, travesías compartidas y feed de actividad
│       ├── gamification.js                      # Sistema de retos, insignias y kilómetros acumulados en SUP
│       │
│       ├── map.js                               # FACHADA PÚBLICA (Strangler Fig, 194 líneas, budget < 200 LOC)
│       │
│       ├── map/                                 # SUBSISTEMA MODULAR DE MAPAS
│       │   ├── map.state.js                     # Almacén central reactivo mutable (mapRuntime: mapa, capas, marcadores, tracking)
│       │   ├── map.core.js                      # Creación del L.map, selector de capas base, geolocalización, tiles offline y clic
│       │   ├── map.radar.js                     # Motor Radar Doppler (RainViewer), malla vectorial 3x3, cálculo de deriva y controles
│       │   ├── map.bento.js                     # Roseta de viento SVG, HUD #mapWindWaveHud, dashboard Bento y evolución horaria
│       │   ├── map.weather.js                   # Cliente Open-Meteo Weather/Marine APIs, validación de cota marina y caché
│       │   ├── map.spots.js                     # Base de 52+ spots de Paddle Surf, marcadores Leaflet interactivos y ranking
│       │   ├── map.routes.js                    # Trazado A->B, multipunto, import/export GPX y motor Replay 60FPS
│       │   ├── map.tracker.js                   # Grabador GPS en tiempo real, HUD de navegación marítima y botón SOS
│       │   ├── map.coach.js                     # Consejero experto SUP integrado con la meteorología del mapa
│       │   └── map.poster.js                    # Generación canvas del póster resumen de la travesía
│       │
│       └── engine/                              # MOTORES MATEMÁTICOS Y FÍSICOS
│           ├── coastal.js                       # Física costera: orientación del litoral, fetch, viento on/off-shore y deriva SUP
│           ├── verdict.js                       # Scoring de seguridad SUP (0-100), ventanas óptimas y validación de rachas
│           ├── sports.js                        # Modales y tolerancias técnicas según modalidad SUP (All-Round, Touring, Wave, Race)
│           ├── windows.js                       # Identificación de ventanas horarias seguras de navegación
│           ├── coach.js                         # Reglas expertas de seguridad marítima y recomendación de traje térmico
│           ├── consensus.js                     # Ponderación multimodelo meteorológico (ECMWF, GFS, ICON)
│           └── errors.js                        # Clases de error tipadas (MapError, WeatherError, RadarError) y telemetría
```

---

## 2. Inventario Técnico Detallado por Archivo

### 2.1. Fachada y Estado del Mapa

#### `public_html/js/map.js`
* **Ruta completa:** [`public_html/js/map.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map.js)
* **Tamaño:** 194 líneas | 12.8 KB
* **Responsabilidad principal:** Fachada unificada y orquestadora bajo el patrón *Strangler Fig*. Re-exporta los métodos públicos de los 9 submódulos y registra los bindings obligatorios en `window.*` para garantizar retrocompatibilidad con controladores HTML `onclick`.
* **Dependencias directas:** `./map/map.state.js`, `./map/map.core.js`, `./map/map.weather.js`, `./map/map.bento.js`, `./map/map.tracker.js`, `./map/map.poster.js`, `./map/map.routes.js`, `./map/map.coach.js`, `./map/map.spots.js`, `./gpxParser.js`, `./utils.js`, `./engine/coastal.js`.
* **Dependencias inversas (quién lo usa):** [`public_html/js/main.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/main.js).

#### `public_html/js/map/map.state.js`
* **Ruta completa:** [`public_html/js/map/map.state.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.state.js)
* **Tamaño:** 171 líneas | 5.8 KB
* **Responsabilidad principal:** Contenedor del singleton reactivo mutable `mapRuntime`. Aloja las instancias de `map`, `capaBaseTile`, `capaOverlayTile`, `marcador`, `marcadorRosaVectores`, `radarWindGroup`, `radarWaveGroup`, `radarDriftGroup`, `radarRainGroup`, flags de modos (`modoTravesiaActivo`, `radarActivo`, `isTracking`) y coordenadas actuales (`latitudActual`, `longitudActual`).
* **Dependencias directas:** `../config.js`.
* **Dependencias inversas (quién lo usa):** `map.core.js`, `map.radar.js`, `map.bento.js`, `map.weather.js`, `map.spots.js`, `map.routes.js`, `map.tracker.js`, `map.coach.js`, `map.js`.

---

### 2.2. Núcleo Cartográfico y Radar

#### `public_html/js/map/map.core.js`
* **Ruta completa:** [`public_html/js/map/map.core.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.core.js)
* **Tamaño:** 672 líneas | 28.8 KB
* **Responsabilidad principal:** Inicialización de Leaflet (`inicializarMapa`), configuración del canvas interactivo, cambio de capas base (`cambiarCapaBaseMapa`), geolocalización GPS (`obtenerUbicacion`), cálculo de bounding box para mapas offline (`calcularTilesBoundingBox`) y despachador central del evento `click` sobre el mapa con comprobación previa de cota marina (`api.open-meteo.com/v1/elevation`).
* **Dependencias directas:** `../config.js`, `../utils.js`, `./map.state.js`, `../engine/errors.js`, `./map.tracker.js`.
* **Dependencias inversas (quién lo usa):** `map.bento.js`, `map.routes.js`, `map.spots.js`, `map.js`, `public_html/index.html`.

#### `public_html/js/map/map.radar.js`
* **Ruta completa:** [`public_html/js/map/map.radar.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.radar.js)
* **Tamaño:** 574 líneas | 26.1 KB
* **Responsabilidad principal:** Subsistema Radar Táctico Marítimo. Controla la capa Doppler RainViewer animada con timestamp UTC, genera la malla táctica 3x3 de vectores marítimos (`radarWindGroup`, `radarWaveGroup`, `radarDriftGroup`, `radarRainGroup`), calcula la deriva neta SUP con el modelo Leeway (`calcularDerivaCosteraPaddle`) y emite el dictamen exprés de 10 segundos (`calcularValoracionRapidaPaddleSafe`).
* **Dependencias directas:** `./map.state.js`, `../utils.js`.
* **Dependencias inversas (quién lo usa):** `public_html/index.html` (vía `window.toggleCapaRadar`, `window.actualizarCapasRadar`, `window.ajustarOpacidadRadar`, etc.), `map.core.js` (activación al elegir capa oscura).

---

### 2.3. Roseta, Bento y Predicciones

#### `public_html/js/map/map.bento.js`
* **Ruta completa:** [`public_html/js/map/map.bento.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.bento.js)
* **Tamaño:** 1860 líneas | 96.5 KB
* **Responsabilidad principal:** Renderizado de la Roseta Táctica de Viento y Olas SVG en Leaflet (`actualizarRosetaVientoOleaje`), gestión del HUD flotante de telemetría `#mapWindWaveHud`, maquetación del Bento Dashboard con evolución meteorológica a 14 días, selector horario de timeline y calculadora térmica de neopreno.
* **Dependencias directas:** `../config.js`, `../utils.js`, `./map.state.js`, `../engine/errors.js`, `./map.core.js`, `./map.coach.js`, `./map.weather.js`, `./map.spots.js`, `./map.routes.js`, `../engine/coastal.js`.
* **Dependencias inversas (quién lo usa):** `map.spots.js`, `map.js`, `public_html/index.html`.

#### `public_html/js/map/map.weather.js`
* **Ruta completa:** [`public_html/js/map/map.weather.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.weather.js)
* **Tamaño:** 1593 líneas | 79.8 KB
* **Responsabilidad principal:** Cliente de red para las APIs de Open-Meteo (Weather Forecast, Marine API, Elevation API). Implementa cacheo local en memoria/IndexedDB, normalización de modelos de oleaje (swell primario/secundario), comprobación de rachas de viento y escaneo automático de ventanas seguras de 72 horas (`escanearMejoresVentanas72h`).
* **Dependencias directas:** `../config.js`, `../utils.js`, `./map.state.js`, `../engine/errors.js`.
* **Dependencias inversas (quién lo usa):** `map.bento.js`, `map.routes.js`, `map.spots.js`, `map.tracker.js`, `map.js`.

---

### 2.4. Spots, Rutas, Tracker y Coach

#### `public_html/js/map/map.spots.js`
* **Ruta completa:** [`public_html/js/map/map.spots.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.spots.js)
* **Tamaño:** 2099 líneas | 98.6 KB
* **Responsabilidad principal:** Base de datos estática y dinámica de spots de la costa española (52+ spots). Marcadores SVG interactivos con categorías SUP, filtrado por idoneidad, cálculo de ranking de spots según el estado del mar actual y modal de ficha del spot.
* **Dependencias directas:** `../config.js`, `../utils.js`, `../engine/coastal.js`, `./map.state.js`, `./map.weather.js`, `./map.coach.js`, `./map.core.js`, `./map.bento.js`.
* **Dependencias inversas (quién lo usa):** `map.bento.js`, `map.js`, `public_html/index.html`.

#### `public_html/js/map/map.routes.js`
* **Ruta completa:** [`public_html/js/map/map.routes.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.routes.js)
* **Tamaño:** 1918 líneas | 86.1 KB
* **Responsabilidad principal:** Planificador de travesías (modo A->B y multipunto), análisis de viento relativo por tramo de ruta, exportación/importación GPX, y motor Strava Flyover / Replay a 60FPS con interpolación lineal (`requestAnimationFrame`), velocímetro, rumbo y barra de scrubber interactiva.
* **Dependencias directas:** `../config.js`, `../club/state.js`, `../utils.js`, `../gpxParser.js`, `./map.state.js`, `./map.weather.js`, `./map.tracker.js`, `./map.coach.js`, `./map.core.js`.
* **Dependencias inversas (quién lo usa):** `map.bento.js`, `map.js`, `public_html/index.html`.

#### `public_html/js/map/map.tracker.js`
* **Ruta completa:** [`public_html/js/map/map.tracker.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.tracker.js)
* **Tamaño:** 1612 líneas | 79.0 KB
* **Responsabilidad principal:** Registro de navegación en vivo vía Geolocation WatchPosition. Cálculo de velocidad instantánea, distancia acumulada, splits por kilómetro, alerta de abatimiento por viento de tierra, telemetría biométrica SUP (calorías/remadas estimadas) y protocolo SOS.
* **Dependencias directas:** `../config.js`, `../club/state.js`, `../utils.js`, `../gamification.js`, `../gpxParser.js`, `./map.state.js`, `./map.poster.js`, `./map.weather.js`.
* **Dependencias inversas (quién lo usa):** `map.core.js`, `map.routes.js`, `map.js`, `public_html/index.html`.

#### `public_html/js/map/map.coach.js`
* **Ruta completa:** [`public_html/js/map/map.coach.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.coach.js)
* **Tamaño:** 875 líneas | 45.0 KB
* **Responsabilidad principal:** Generación contextual de consejos técnicos de seguridad para SUP según viento, periodo de olas, mareas y experiencia del deportista.
* **Dependencias directas:** `../config.js`, `../utils.js`, `./map.state.js`.
* **Dependencias inversas (quién lo usa):** `map.bento.js`, `map.routes.js`, `map.spots.js`, `map.js`.

#### `public_html/js/map/map.poster.js`
* **Ruta completa:** [`public_html/js/map/map.poster.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.poster.js)
* **Tamaño:** 131 líneas | 5.9 KB
* **Responsabilidad principal:** Generación gráfica mediante Canvas HTML5 de pósteres de sesión deportiva completada para compartir en redes sociales.
* **Dependencias directas:** Ninguna (módulo autocontenido).
* **Dependencias inversas (quién lo usa):** `map.tracker.js`, `map.js`.

---

### 2.5. Motores Matemáticos y Físicos (`engine/`)

#### `public_html/js/engine/coastal.js`
* **Ruta completa:** [`public_html/js/engine/coastal.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/coastal.js)
* **Tamaño:** 536 líneas | 25.3 KB
* **Responsabilidad principal:** Algoritmos náuticos: orientación de la línea de costa en grados, clasificación del viento (terral/offshore, térmico/onshore, paralelo/sideshore), cálculo de fetch y modelo matemático de deriva costera `calcularDerivaCosteraPaddle`.
* **Dependencias directas:** `./consensus.js`.
* **Dependencias inversas (quién lo usa):** `engine/verdict.js`, `map/map.bento.js`, `map/map.spots.js`, `map.js`.

#### `public_html/js/engine/verdict.js`
* **Ruta completa:** [`public_html/js/engine/verdict.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/verdict.js)
* **Tamaño:** 843 líneas | 43.5 KB
* **Responsabilidad principal:** Puntuación multidimensional de idoneidad (0 a 100) para Stand Up Paddle. Ponderación de viento sostenido, rachas críticas (>15 kt), altura de ola, periodo (>8s mar de fondo), dirección respecto a la costa y tipo de tabla.
* **Dependencias directas:** `./consensus.js`, `./coastal.js`, `./sports.js`, `./windows.js`.
* **Dependencias inversas (quién lo usa):** `public_html/js/utils.js`.

#### `public_html/js/engine/sports.js`
* **Ruta completa:** [`public_html/js/engine/sports.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/sports.js)
* **Tamaño:** 215 líneas | 8.9 KB
* **Responsabilidad principal:** Especificación de modalidades de SUP (All-Round, Touring, Wave SUP, Race, Downwind, Foil) con sus límites operacionales de viento y oleaje.
* **Dependencias directas:** Ninguna.
* **Dependencias inversas (quién lo usa):** `engine/verdict.js`.

#### `public_html/js/engine/windows.js`
* **Ruta completa:** [`public_html/js/engine/windows.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/windows.js)
* **Tamaño:** 157 líneas | 6.5 KB
* **Responsabilidad principal:** Detección de intervalos horarios estables durante el día donde coinciden viento calmo (<8 kt), mar favorable y marea adecuada.
* **Dependencias directas:** Ninguna.
* **Dependencias inversas (quién lo usa):** `engine/verdict.js`.

#### `public_html/js/engine/coach.js`
* **Ruta completa:** [`public_html/js/engine/coach.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/coach.js)
* **Tamaño:** 594 líneas | 36.3 KB
* **Responsabilidad principal:** Reglas de seguridad náutica según temperatura del agua/aire y viento térmico, cálculo de espesor de traje húmedo/seco.
* **Dependencias directas:** `../utils.js`.
* **Dependencias inversas (quién lo usa):** `map/map.bento.js`, `map/map.routes.js`, `map/map.spots.js`, `map.js`.

#### `public_html/js/engine/consensus.js`
* **Ruta completa:** [`public_html/js/engine/consensus.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/consensus.js)
* **Tamaño:** 128 líneas | 4.9 KB
* **Responsabilidad principal:** Fusión de pronósticos meteorológicos de múltiples fuentes de datos.
* **Dependencias directas:** Ninguna.
* **Dependencias inversas (quién lo usa):** `engine/coastal.js`, `engine/verdict.js`.

#### `public_html/js/engine/errors.js`
* **Ruta completa:** [`public_html/js/engine/errors.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/errors.js)
* **Tamaño:** 268 líneas | 12.7 KB
* **Responsabilidad principal:** Jerarquía de excepciones tipadas (`WeatherError`, `ForecastError`, `MapError`, `RadarError`) y normalización de fallos para evitar pantallas en blanco.
* **Dependencias directas:** Ninguna.
* **Dependencias inversas (quién lo usa):** `map/map.bento.js`, `map/map.core.js`, `map/map.weather.js`.

---

### 2.6. Servicios de Soporte, Vistas y Configuración

#### `public_html/index.html`
* **Ruta completa:** [`public_html/index.html`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/index.html)
* **Tamaño:** 2200 líneas | 192.1 KB
* **Responsabilidad principal:** Estructura DOM de la SPA. Contiene el contenedor del mapa `#mapaInteractivo`, barra de selector de capas `#mapLayerSwitcher`, panel radar `#radarCockpitPanel`, HUD de telemetría `#mapWindWaveHud`, cabecera de escritorio, dock móvil y modales.
* **Dependencias inversas:** Es el documento raíz cargado por el navegador.

#### `public_html/css/tailwind-input.css`
* **Ruta completa:** [`public_html/css/tailwind-input.css`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/css/tailwind-input.css)
* **Tamaño:** 637 líneas | 17.9 KB
* **Responsabilidad principal:** Definición de estilos de alta prioridad, jerarquía de `z-index` (`#mapLayerSwitcher: 1100`, cockpits: 1000), animaciones de flechas de viento, glassmorphism y reglas responsive específicas para escritorio/móvil.

#### `public_html/js/config.js`
* **Ruta completa:** [`public_html/js/config.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/config.js)
* **Tamaño:** 83 líneas | 3.1 KB
* **Responsabilidad principal:** Constantes globales: `CARTO_API_KEY`, URLs de teselas cartográficas, coordenadas geográficas de inicio y configuración de Supabase.

#### `public_html/js/utils.js`
* **Ruta completa:** [`public_html/js/utils.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/utils.js)
* **Tamaño:** 916 líneas | 41.1 KB
* **Responsabilidad principal:** Funciones matemáticas de uso común: fórmula de Haversine para distancias sobre la esfera terrestre, cálculo de azimut, conversiones entre nudos, km/h y m/s, formateo de fechas y horas náuticas.

