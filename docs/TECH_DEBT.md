# REGISTRO DE DEUDA TÉCNICA — PADDLESAFE

**Fecha de Actualización:** 21 de Octubre de 2026  
**Proyecto:** PaddleSafe Platform  
**Objetivo:** Identificación, clasificación por riesgo/impacto y priorización estratégica de los ítems de deuda técnica acumulados para guiar la evolución arquitectónica hacia la versión 2.0 y soporte de app móvil nativa.

---

## 1. Deuda Técnica de PRIORIDAD ALTA

### DT-01: Contaminación Masiva del Namespace Global (`window.*`)
- **Descripción:** Existen **326 propiedades, funciones y objetos asignados directamente al objeto global `window`**. Esta práctica se originó para dar soporte a callbacks inline de HTML (`onclick="abrirModalAuth()"`) y shims defensivos de retrocompatibilidad.
- **Impacto:** Alto. Colisión potencial de nombres, dificultad para realizar pruebas unitarias aisladas, imposibilidad de ejecutar en entornos sin `window` (como SSR o pruebas en Worker threads) y riesgo de manipulación no intencionada en consola.
- **Riesgo:** Alto. Al escalar hacia una aplicación móvil nativa con Capacitor o React Native WebView, las fugas de ámbito global generan comportamientos impredecibles.
- **Prioridad:** **P1 (Crítica)**.
- **Mitigación Planificada:** Introducir un `PaddleStore` o despachador de eventos modular, sustituyendo los handlers inline por `addEventListener` declarativos o delegación de eventos.

---

### DT-02: Ficheros Monolíticos Superiores a 1,500 LOC
- **Descripción:** 7 ficheros concentran más de 12,000 líneas de código: `map.spots.js` (2,099 LOC), `map.routes.js` (1,915 LOC), `social.js` (1,856 LOC), `map.bento.js` (1,796 LOC), `auth.js` (1,719 LOC), `map.tracker.js` (1,612 LOC) y `main.js` (1,502 LOC).
- **Impacto:** Alto. Violación flagrante del Principio de Responsabilidad Única (SRP). En un mismo fichero conviven llamadas a API, cálculo matemático náutico, mutación de estado y renderizado de HTML.
- **Riesgo:** Alto. Elevada probabilidad de regresión en cada cambio, dificultad para trabajar en equipo de manera concurrente (conflictos de Git constantes) y tiempos de revisión de código excesivos.
- **Prioridad:** **P1 (Crítica)**.
- **Mitigación Planificada:** Descomposición modular guiada por dominio según la propuesta de arquitectura (`/map/core`, `/map/overlays`, `/map/routing`, `/auth/services`).

---

### DT-03: Mutación Descentralizada de Estado Compartido (`appState`)
- **Descripción:** El objeto `appState` es importado y mutado de forma directa e indiscriminada desde **19 ficheros distintos** sin funciones de acceso (getters/setters) ni control de inmutabilidad.
- **Impacto:** Alto. Condición de carrera (race conditions) en asincronía. Un módulo puede sobrescribir `appState.spotActual` o `appState.sesionActual` mientras otro módulo está en mitad de una petición de red.
- **Riesgo:** Alto. Inconsistencias sutiles de UI, estado zombi y dificultad de depuración ("¿quién cambió esta propiedad?").
- **Prioridad:** **P1 (Crítica)**.
- **Mitigación Planificada:** Separación estricta entre `UI State` y `Business State` con un Store reactivo observable y mutaciones controladas por acciones.

---

### DT-04: Acoplamiento de Peticiones de Red en Capas de Presentación
- **Descripción:** Peticiones directas a Open-Meteo y Supabase incrustadas dentro de controladores de vista y funciones de renderizado DOM.
- **Impacto:** Medio-Alto. Imposibilidad de sustituir o complementar proveedores meteorológicos (AEMET, Copernicus) sin reescribir la capa visual.
- **Riesgo:** Medio-Alto. Si la API de Open-Meteo cambia o experimenta latencia, impacta directamente al hilo de renderizado del mapa.
- **Prioridad:** **P1 (Crítica)**.
- **Mitigación Planificada:** Implementar el paquete `/weather` con adaptadores desacoplados (`WeatherService` y `WeatherProviderInterface`).

---

## 2. Deuda Técnica de PRIORIDAD MEDIA

### DT-05: Renderizado DOM Mediante Concatenación de Template Strings
- **Descripción:** La UI dinámica de tarjetas Bento, fichas de spots y muro social se construye concatenando strings de HTML con `.innerHTML = ...`.
- **Impacto:** Medio. Fuerza la recreación y parseo completo de árboles DOM en cada actualización de datos, aumentando el trabajo del recolector de basura (Garbage Collector).
- **Riesgo:** Medio. Riesgo residual de seguridad XSS si se olvida escapar una variable de usuario en una concatenación profunda.
- **Prioridad:** **P2 (Media)**.
- **Mitigación Planificada:** Adopción de componentes funcionales puros o mini-templates declarativos con actualización quirúrgica de nodos mediante `textContent` y atributos de datos.

---

### DT-06: Duplicación de Utilidades Matemáticas Náuticas
- **Descripción:** Cálculos de rumbos cardinales (`gradosACardinal`), distancias esféricas Haversine y escalas Beaufort/Douglas duplicados en `utils.js`, `coastal.js`, `map.routes.js` y `verdict.js`.
- **Impacto:** Medio. Si se optimiza la fórmula de distancia o se añade una corrección por curvatura marina en un fichero, los otros módulos quedan desincronizados.
- **Riesgo:** Bajo-Medio. Divergencia en los resultados de estimación de ritmos de palada entre la cabina y el exportador GPX.
- **Prioridad:** **P2 (Media)**.
- **Mitigación Planificada:** Centralizar toda la algoritmia náutica en un submódulo unificado `engine/math/nautical.js`.

---

### DT-07: Gestión Ineficiente de Capas y Marcadores Leaflet
- **Descripción:** Creación de marcadores, flechas y popups sueltos sin agrupar en `L.LayerGroup`.
- **Impacto:** Medio. Al cambiar repetidamente de spot en la barra de búsqueda, pueden quedar capas y tooltips huérfanos consumiendo memoria en el canvas Leaflet.
- **Riesgo:** Medio. Degradación del framerate en sesiones prolongadas de uso en dispositivos móviles de gama media/baja.
- **Prioridad:** **P2 (Media)**.
- **Mitigación Planificada:** Implementación de `ClusterManager` y `LayerGroupRegistry` con método `.clearLayers()` automático antes de cada repintado.

---

### DT-08: Formato Ineficiente de Imágenes Críticas
- **Descripción:** El logotipo principal `logo.png` (234.9 KB) y el icono PWA master (975.5 KB) se sirven en formato PNG sin compresión moderna.
- **Impacto:** Medio. Sobrecarga del Performance Budget de red, penalizando el Largest Contentful Paint (LCP) en redes 3G/4G móviles.
- **Riesgo:** Bajo. No afecta a la lógica de negocio, pero penaliza el ranking de Lighthouse Performance.
- **Prioridad:** **P2 (Media)**.
- **Mitigación Planificada:** Conversión a WebP / AVIF con compresión del 85% (-85% de peso).

---

## 3. Deuda Técnica de PRIORIDAD BAJA

### DT-09: Proliferación de Temporizadores `setTimeout` para Transiciones CSS
- **Descripción:** Existen **57 llamadas a `setTimeout`** dispersas, principalmente esperando 150ms-300ms a que finalicen animaciones CSS de Tailwind.
- **Impacto:** Bajo. Si el usuario interactúa rápidamente, pueden ejecutarse callbacks fuera de sincronía visual.
- **Riesgo:** Bajo. Fallos cosméticos transitorios sin pérdida de datos.
- **Prioridad:** **P3 (Baja)**.
- **Mitigación Planificada:** Sustituir timeouts por listeners nativos `el.addEventListener('transitionend', ..., { once: true })` o animaciones CSS puras.

---

### DT-10: Ausencia de Subresource Integrity (SRI) en Scripts CDN
- **Descripción:** Carga de `leaflet.js` y `supabase-js` desde CDN sin atributos `integrity="sha384-..."`.
- **Impacto:** Bajo. Riesgo teórico de ataque Supply Chain en caso de compromiso de la infraestructura CDN del proveedor.
- **Riesgo:** Bajo. Los CDNs empleados (Unpkg, JSDelivr, Cloudflare) poseen alta fiabilidad.
- **Prioridad:** **P3 (Baja)**.
- **Mitigación Planificada:** Añadir hashes SRI en las etiquetas del `<head>`.

---

## 4. Matriz de Priorización de Deuda Técnica

| ID | Ítem de Deuda Técnica | Impacto | Riesgo | Esfuerzo Estimado | Prioridad |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **DT-01** | Limpieza de 326 globales en `window.*` | Alto | Alto | 5 días | **P1 (Crítica)** |
| **DT-02** | Modularización de 7 archivos > 1,500 LOC | Alto | Alto | 8 días | **P1 (Crítica)** |
| **DT-03** | Centralización de `appState` en Store Observable | Alto | Alto | 4 días | **P1 (Crítica)** |
| **DT-04** | Desacoplamiento de Weather Engine (`/weather`) | Medio-Alto | Medio-Alto | 4 días | **P1 (Crítica)** |
| **DT-05** | Refactorización de renderizado HTML masivo | Medio | Medio | 5 días | **P2 (Media)** |
| **DT-06** | Unificación de matemáticas náuticas | Medio | Bajo-Medio | 2 días | **P2 (Media)** |
| **DT-07** | Agrupación de marcadores Leaflet en LayerGroup | Medio | Medio | 2 días | **P2 (Media)** |
| **DT-08** | Conversión de PNGs a WebP/AVIF | Medio | Bajo | 0.5 días | **P2 (Media)** |
| **DT-09** | Reemplazo de 57 `setTimeout` por `transitionend` | Bajo | Bajo | 1.5 días | **P3 (Baja)** |
| **DT-10** | Incorporación de hashes SRI en CDNs | Bajo | Bajo | 0.5 días | **P3 (Baja)** |
