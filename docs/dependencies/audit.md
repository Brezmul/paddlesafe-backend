# AUDITORÍA DE DEPENDENCIAS Y GESTIÓN DE PAQUETES — PADDLESAFE

**Fecha:** 21 de Octubre de 2026  
**Proyecto:** PaddleSafe Core Platform  
**Gestor de Paquetes:** NPM (Node Package Manager) v10+  
**Herramientas de Auditoría:** `npm audit`, `npm outdated`, `PSScriptAnalyzer`, Inspector de CDN

---

## 1. Inventario de Paquetes NPM (devDependencies)

| Paquete | Versión Instalada | Licencia | Propósito | Estado |
| :--- | :---: | :---: | :--- | :---: |
| **`@playwright/test`** | `^1.50.0` | Apache-2.0 | Framework de pruebas End-to-End multi-dispositivo y visuales | 🟢 Actualizado |
| **`@axe-core/playwright`** | `^4.14.0` | MPL-2.0 | Integración de Axe-Core para auditoría automática de accesibilidad | 🟢 Actualizado |
| **`axe-core`** | `^4.14.0` | MPL-2.0 | Motor de análisis de accesibilidad conforme a WCAG 2.1 AA | 🟢 Actualizado |
| **`@lhci/cli`** | `^0.15.1` | Apache-2.0 | Ejecutor CLI de Google Lighthouse CI para rendimiento y calidad | 🟢 Actualizado |

**Diagnóstico NPM:**
- **Paquetes no utilizados:** 0. Todos los paquetes forman parte de las suites activas de CI/CD.
- **Librerías duplicadas en `node_modules`:** 0 duplicados detectados.
- **Versiones obsoletas (`npm outdated`):** 0 paquetes obsoletos.

---

## 2. Inventario de Dependencias de Frontend (CDN Externas)

| Recurso / CDN | Versión | Tamaño Aprox. | Función Crítica en PaddleSafe |
| :--- | :---: | :---: | :--- |
| **Leaflet Core (`leaflet.js`)** | `1.9.4` | ~145 KB (42 KB gzip) | Motor cartográfico interactivo, cálculo de distancias y visualización de rutas |
| **Leaflet Styles (`leaflet.css`)** | `1.9.4` | ~14 KB (4 KB gzip) | Estilos nativos de controles, zoom y capas de mapa |
| **Supabase Client (`supabase-js`)** | `v2.x` | ~120 KB (34 KB gzip) | Gestión de autenticación, perfiles, sesiones y base de datos cloud |
| **Html2Canvas (`html2canvas.min.js`)** | `1.4.1` | ~198 KB (48 KB gzip) | Exportación visual de tarjetas de ruta para redes sociales y descargas |

---

## 3. Análisis de Duplicidades y Redundancias

1. **Evaluación de Frameworks JS:**
   - PaddleSafe **NO** utiliza React, Vue ni Angular, evitando más de 500 KB de sobrecarga en el hilo principal.
   - Todo el motor interactivo está desarrollado en JavaScript Vanilla ES Modules (`<script type="module">`).
2. **Evaluación de Estilos CSS:**
   - La aplicación utiliza una única hoja de estilos compilada: `public_html/css/tailwind.min.css` (21.5 KB gzip).
   - No existen duplicados de Bootstrap ni librerías auxiliares de CSS.
3. **Manejo de Mapas:**
   - Se utiliza exclusivamente Leaflet 1.9.4. No hay colisión con Mapbox GL ni OpenLayers.

---

## 4. Política de Actualizaciones Automatizadas (Dependabot)

Se ha configurado [`.github/dependabot.yml`](../../.github/dependabot.yml) con los siguientes parámetros:
- **Ecosistema NPM:** Revisión semanal programada (Lunes 06:00 UTC+2).
- **Ecosistema GitHub Actions:** Revisión semanal programada de runners y actions oficiales.
- **Límite de PRs simultáneas:** 10 PRs con etiquetado automático `dependencies` y `quality`.

---

## 5. Recomendaciones de Calidad y Resiliencia

1. **Subresource Integrity (SRI):**
   - Incorporar hashes criptográficos `integrity="sha384-..."` y `crossorigin=""` en las etiquetas `<script>` y `<link>` de Leaflet y Supabase para proteger contra alteraciones maliciosas de CDN en tránsito.
2. **Copia Local de Respaldo (Fallback Offline):**
   - Para funcionamiento PWA 100% offline o en zonas marítimas sin cobertura 4G, almacenar una copia local de `leaflet.js` y `leaflet.css` en `public_html/vendor/leaflet/` servida mediante Service Worker.

