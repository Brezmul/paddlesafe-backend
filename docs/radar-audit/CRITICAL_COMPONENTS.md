# ELEMENTOS CRÍTICOS A PRESERVAR E INSPECCIÓN DE CAPAS VISUALES

> **Entregables:** PARTES 13 y 14 del Dossier Técnico de Auditoría de PaddleSafe  
> **Destinatario:** Argon (Arquitecto de Rediseño y Modelos Autónomos de IA)  
> **Fecha:** 21 de Octubre de 2026  
> **Objetivo:** Definir las barreras de protección de código para evitar regresiones operativas durante la evolución o refactorización del Radar Marítimo de SUP.  

---

## 1. Los 10 Elementos Críticos Intocables

Para cualquier evolución del sistema de radar, deben respetarse estrictamente los siguientes 10 componentes del ecosistema PaddleSafe:

---

### 1. Roseta de Viento Táctica
* **Archivo responsable:** [`public_html/js/map/map.bento.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.bento.js#L1150)
* **Punto de anclaje:** `mapRuntime.marcadorRosaVectores = L.marker([lat, lon], { icon: iconRosa, zIndexOffset: 250 })`.
* **Dependencias:** `mapRuntime.map`, `datosMeteo.wind_direction_10m`, `datosMeteo.wind_speed_10m`, `datosMeteo.wave_direction`, `datosMeteo.wave_height`.
* **Riesgo de modificación:** **MUY ALTO**. Si se altera la clase `.rosa-vectores-container` o se cambia el cálculo angular SVG, las flechas de rumbo de viento y olas no coincidirán con la realidad náutica.
* **Impacto potencial:** Desorientación del palista en el agua; pérdida de la capacidad visual de identificar al instante si el viento es de tierra (offshore) o de mar (onshore).

---

### 2. Panel Meteorológico al Pulsar el Mapa
* **Archivo responsable:** [`public_html/js/map/map.core.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.core.js#L313) y [`public_html/js/map/map.weather.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.weather.js#L80)
* **Función:** Evento `mapInstance.on('click')` -> `consultarPuntoProInstantaneo(lat, lon)` -> `renderizarBentoDashboard()`.
* **Dependencias:** Endpoint de elevación de Open-Meteo (`/v1/elevation`), inputs `#proLocation`, `#proDate`, `#proTime`, y contenedor `#panelPro`.
* **Riesgo de modificación:** **ALTO**. El manejador de clic incluye una validación que rechaza clics en tierra firme (`elevation > 8m`).
* **Impacto potencial:** Si se rompe este enlace, hacer clic en el mar no recargará el pronóstico del punto ni actualizará la telemetría del palista.

---

### 3. Selector de Modo: 🗺️ Mapa / 🛰️ Satélite / 📡 Radar
* **Archivo responsable:** [`public_html/js/map/map.core.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.core.js#L576)
* **Punto de anclaje:** Contenedor DOM `#mapLayerSwitcher` con botones que contienen el atributo `[data-map-layer]`.
* **Dependencias:** `cambiarCapaBaseMapa(estilo)` en `map.core.js` y llamadas acopladas a `activarModoRadar()` y `desactivarModoRadar()` en `map.radar.js`.
* **Riesgo de modificación:** **EXTREMO**. El selector no solo intercambia teselas gráficas (CARTO Voyager vs. Esri vs. CARTO Dark Matter), sino que actúa como disparador de ciclo de vida del radar.
* **Impacto potencial:** Dejar el radar encendido sobre capas diurnas con baja legibilidad o provocar fugas de memoria al acumular capas Doppler en segundo plano.

---

### 4. HUD Flotante Viento/Mar (`#mapWindWaveHud`)
* **Archivo responsable:** [`public_html/js/map/map.bento.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.bento.js#L1233)
* **Punto de anclaje:** Elemento DOM `#mapWindWaveHud` (anclado en la esquina inferior derecha con `z-index: 1000 !important`).
* **Dependencias:** Elementos hijos `#hudPointName`, `#hudCostalBadge`, `#hudWindSpeed`, `#hudWindGusts`, `#hudWaveHeight`, `#hudWavePeriod`.
* **Riesgo de modificación:** **MEDIO-ALTO**. Es la referencia visual directa para el usuario cuando el panel Bento está colapsado.
* **Impacto potencial:** Pantalla vacía sin lectura rápida de nudos y metros de ola mientras se navega por el mapa.

---

### 5. Capas Leaflet Base y Overlays
* **Archivo responsable:** [`public_html/js/map/map.core.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.core.js) y [`public_html/js/map/map.radar.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.radar.js)
* **Punto de anclaje:** `mapRuntime.capaBaseTile`, `mapRuntime.capaOverlayTile`, `radarWindGroup`, `radarWaveGroup`, `radarDriftGroup`, `radarRainGroup`.
* **Dependencias:** CARTO Voyager API, Esri World Imagery, OpenSeaMap seamark tiles, RainViewer Doppler radar tiles.
* **Riesgo de modificación:** **ALTO**. Las capas base deben mantener siempre `bringToBack()` para que no tapen los vectores ni la roseta.
* **Impacto potencial:** Mapa completamente negro o capas cartográficas tapando la señalización marítima y los marcadores de spots.

---

### 6. Marcadores de Spots (52+ Spots SUP)
* **Archivo responsable:** [`public_html/js/map/map.spots.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.spots.js#L180)
* **Punto de anclaje:** `cargarSpotsEnMapa()`, marcadores `L.marker` con iconos divIcon que contienen badges de dificultad (Iniciación, Intermedio, Experto).
* **Dependencias:** Array de spots preconfigurados, `mapRuntime.map`, evento clic de apertura del modal de spot.
* **Riesgo de modificación:** **MEDIO**.
* **Impacto potencial:** Pérdida del catálogo interactivo de puntos de salida costera.

---

### 7. Geolocalización en Vivo
* **Archivo responsable:** [`public_html/js/map/map.core.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.core.js#L420) y [`public_html/js/map/map.tracker.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.tracker.js)
* **Punto de anclaje:** Función `obtenerUbicacion()`, botón `#btn-gps`.
* **Dependencias:** `navigator.geolocation.getCurrentPosition`, Leaflet marker de usuario, `map.flyTo([lat, lon], 14)`.
* **Riesgo de modificación:** **MEDIO**.
* **Impacto potencial:** El palista en la playa no puede centrar automáticamente el mapa en su ubicación actual.

---

### 8. Ranking de Spots por Condiciones SUP
* **Archivo responsable:** [`public_html/js/map/map.spots.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.spots.js#L540)
* **Función:** `calcularRankingSpots()` basada en el scoring del motor [`engine/verdict.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/verdict.js).
* **Dependencias:** Viento medio, rachas y orientación de la costa de cada spot frente a la dirección del viento.
* **Riesgo de modificación:** **ALTO**.
* **Impacto potencial:** Mostrar recomendaciones erróneas a principiantes, sugiriendo spots con viento terral peligroso.

---

### 9. Sistema de Pronósticos Meteorológicos y Caché
* **Archivo responsable:** [`public_html/js/map/map.weather.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.weather.js)
* **Punto de anclaje:** `cargarPronosticoPunto(lat, lon, nombreSpot)` con TTL de 30 minutos.
* **Dependencias:** APIs públicas de Open-Meteo.
* **Riesgo de modificación:** **CRÍTICO**. Open-Meteo impone límites de tasa (429 Too Many Requests). Cualquier recarga innecesaria en bucle dentro del radar bloqueará la IP del cliente.
* **Impacto potencial:** Fallo generalizado ("No se pudo cargar el pronóstico") en toda la aplicación.

---

### 10. Navegación Móvil (Dock Inferior y Menú de Cabecera)
* **Archivo responsable:** [`public_html/index.html`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/index.html), [`public_html/css/tailwind-input.css`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/css/tailwind-input.css) y [`public_html/js/main.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/main.js)
* **Punto de anclaje:** Regla de corte responsive a **1024px** (`lg:`):
  * `< 1024px`: Cabecera de escritorio oculta (`#desktopHeaderNav { display: none !important; }`), dock inferior activo (`#mobileBottomNav`).
  * `>= 1024px`: Cabecera de escritorio visible, dock inferior oculto.
* **Riesgo de modificación:** **ALTO**.
* **Impacto potencial:** Duplicación de barras de navegación en móvil, solapamiento del dock sobre los controles del mapa o pérdida de acceso al perfil y botones de acción.

---

## 2. Inspección Exhaustiva de Capas Visuales Superpuestas (Z-Index y Posicionamiento)

Todos los controles y widgets flotantes sobre el mapa se rigen por la siguiente jerarquía geométrica y de apilamiento en `public_html/css/tailwind-input.css` y `public_html/index.html`:

```text
+--------------------------------------------------------------------------------------------------------+
|                                    VIEWPORT DEL MAPA (#mapContainer)                                   |
|                                                                                                        |
|  [Leaflet Zoom: z-1000]                                              [#mapLayerSwitcher: z-1100]       |
|  top-3 left-3                                                        top-3 right-3                     |
|                                                                      (🗺️ Mapa | 🛰️ Sat | 📡 Radar)    |
|                                                                                                        |
|  [#panelQuedadaMap: z-1000]                                                                            |
|  top-3 left-3 (modo quedada)                                                                           |
|                                                                                                        |
|  [#radarCockpitPanel: z-1000]                                                                          |
|  top-[105px] left-3 (w-full / sm:w-[350px])                                                            |
|  (Viento, Lluvia, Oleaje, Deriva, Opacidad)                                                            |
|                                                                                                        |
|                                         🎯 [L.marker / Roseta: z-250 / z-600]                          |
|                                         Centro de coordenadas del spot                                 |
|                                                                                                        |
|  [#routeReplayCockpit: z-420]                                        [#mapWindWaveHud: z-1000]         |
|  bottom-4 left-3 (sm:w-[420px])                                      bottom-6 right-3 (sm:right-4)     |
|  (Scrubber, velocidad, rumbo)                                        (Viento, Rachas, Olas, Costa)     |
|                                                                                                        |
|                              [#multipuntoToolbar: z-1000]                                              |
|                              bottom-6 left-1/2 (-translate-x-1/2)                                      |
+--------------------------------------------------------------------------------------------------------+
```

### Tabla de Auditoría de Elementos Visuales Superpuestos

| Elemento / Widget | Selector CSS | Posición CSS | Z-Index Efectivo | Comportamiento Responsive |
|---|---|---|---|---|
| **Selector de Capa Base** | `#mapLayerSwitcher` | `absolute top-3 right-3` | **`z-index: 1100 !important;`** | Máxima prioridad visual. Siempre visible y clickeable por encima de cualquier modal o cockpit. |
| **Cockpit del Radar** | `#radarCockpitPanel`, `.ps-floating-panel-top` | `absolute top-[105px] left-3 right-3 sm:right-auto` | **`z-index: 1000 !important;`** | Móvil: ancho completo (`left-3 right-3`), scroll interno (`max-h-[calc(100dvh-120px)]`). Escritorio: tarjeta compacta `sm:w-[350px]`. |
| **HUD Telemetría Viento/Mar** | `#mapWindWaveHud`, `.ps-map-telemetry-hud` | `absolute bottom-6 right-3 sm:right-4` | **`z-index: 1000 !important;`** | Móvil: ancho dinámico `calc(100% - 1.5rem)`, colapsable a 1 toque con botón ✕. Escritorio: `max-w-[220px]`. |
| **Barra de Quedada Club** | `#panelQuedadaMap` | `absolute top-3 left-3 right-3 sm:right-auto` | **`z-index: 1000 !important;`** | Se superpone temporalmente al zoom cuando el usuario pulsa "Quedada Club". |
| **Toolbar Multipunto** | `#multipuntoToolbar`, `.ps-map-dock` | `absolute bottom-6 left-1/2 -translate-x-1/2` | **`z-index: 1000 !important;`** | Barra dock flotante horizontal centrada. Permite scroll horizontal en móviles estrechos (`overflow-x-auto`). |
| **Leyenda de Resistencia** | `#leyendaMapa` | `absolute top-20 left-3` | **`z-index: 1000 !important;`** | Tarjeta semitransparente fija de 140px con códigos de color de resistencia SUP. `pointer-events-none`. |
| **Controles de Zoom Leaflet** | `.leaflet-top.leaflet-left .leaflet-control-zoom` | `absolute top-3 left-3` | **`z-index: 1000`** (Leaflet control) | Controles táctiles nativos + / -. No interfiere con el selector derecho. |
| **Controles de Replay Travesía** | `#routeReplayCockpit` | `absolute bottom-4 left-3 right-3 sm:left-4 sm:w-[420px]` | **`z-index: 420`** | Ocupa la franja inferior izquierda durante la reproducción animada Strava Flyover. |
| **Roseta SVG de Viento/Mar** | `#marcadorRosaVectores`, `.rosa-vectores-container` | Coordenadas Leaflet `[lat, lon]` | **`zIndexOffset: 250`** (Marker pane Leaflet `~600`) | Centrado dinámico sobre el punto examinado. Se mueve y escala con el zoom del mapa. |
| **Marcador de Clic / Spot** | `mapRuntime.marcador` (`.leaflet-marker-icon`) | Coordenadas Leaflet `[lat, lon]` | **`z-index: 600`** (Marker pane Leaflet) | Pin animado representativo de la ubicación seleccionada. |
| **Contenedor de Alertas AEMET** | `#proAlertTopContainer` | Relativo, superior en panel Bento | Flujo de bloque DOM | Se muestra en la cabecera del panel Pro con badges de aviso costero amarillo/naranja/rojo. |
| **Dock de Navegación Móvil** | `#mobileBottomNav`, `.mobile-bottom-nav` | `fixed bottom-0 left-0 right-0` | **`z-index: 50`** | Solo visible en pantallas `< 1024px`. Posee padding para safe-area-inset de iOS. |

---

## 3. Recomendaciones de Integración Segura para Argon

1. **Mantener la Regla de Oro del Z-Index:**
   * Ningún elemento nuevo debe superar `z-index: 1100`, reservado en exclusiva para `#mapLayerSwitcher` a fin de evitar que el usuario quede atrapado en una vista sin opción de retorno.
2. **Respetar el Presupuesto de Líneas de la Fachada:**
   * [`public_html/js/map.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map.js) debe mantenerse por debajo de las 200 líneas de código. Las nuevas funcionalidades de radar deben desarrollarse en [`public_html/js/map/map.radar.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/map/map.radar.js) o submódulos dedicados.
3. **No Fusionar la Roseta con el Radar:**
   * La Roseta responde a la inspección puntual (`spot / coordenada`), mientras que el Radar responde a la visión sinóptica del área (`viewport / bounding box`). Mantenerlos desacoplados garantiza alta velocidad y legibilidad.
4. **Respetar el Modelo Leeway de SUP:**
   * La fórmula `calcularDerivaCosteraPaddle` pondera el viento al 3% (área vélica del palista de pie) y el oleaje al 1.2% (Stokes drift). Modificar estos factores descalibraría la navegación de seguridad costera.

