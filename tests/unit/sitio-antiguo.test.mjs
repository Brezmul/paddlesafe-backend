/**
 * La web de public_html sigue cargando el panel, la ruta y el radar antiguos.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderizarDashboardPro } from '../../public_html/js/map/map.bento.js';
import { calcularMeteoProgresivaPorTramo, togglePlayPauseReplayRuta } from '../../public_html/js/map/map.routes.js';
import { obtenerColorParticulaViento } from '../../public_html/js/map/map.radar.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indice = fs.readFileSync(path.join(raiz, 'public_html/index.html'), 'utf8');
const precarga = fs.readFileSync(path.join(raiz, 'public_html/sw.js'), 'utf8');

assert(indice.includes('id="proDashWind"'), 'el panel táctico antiguo sigue en index.html');
assert(indice.includes('id="radarCockpitPanel"'), 'el radar antiguo sigue en index.html');
assert(indice.includes('leaflet@1.9.4'), 'el mapa antiguo sigue cargando Leaflet');
assert(precarga.includes('/js/map/map.bento.js'), 'la caché sigue sirviendo map.bento.js');
assert(precarga.includes('/js/map/map.routes.js'), 'la caché sigue sirviendo map.routes.js');
assert(precarga.includes('/js/map/map.radar.js'), 'la caché sigue sirviendo map.radar.js');

assert.equal(typeof renderizarDashboardPro, 'function');
assert.equal(typeof togglePlayPauseReplayRuta, 'function');
assert.equal(typeof obtenerColorParticulaViento, 'function');

const conHora = calcularMeteoProgresivaPorTramo(
  [{ nombre: 'Tramo 1', minutos: 20, viento_kt: 8 }],
  10,
  [{ hora: '10', vientoKt: 9 }]
);
assert.equal(conHora.tramosEvaluados.length, 1);
assert.equal(typeof conHora.tramosEvaluados[0].vientoTramoKt, 'number');

const sinHora = calcularMeteoProgresivaPorTramo([{ nombre: 'Tramo 1', minutos: 20 }], 10, null);
assert.equal(sinHora.tramosEvaluados.length, 1);
assert.equal(typeof sinHora.vientoSalidaKt, 'number');

console.log('sitio-antiguo: ok');
