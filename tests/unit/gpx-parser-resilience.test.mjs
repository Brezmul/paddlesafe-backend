/**
 * PaddleSafe - Test Suite Unitario de Resiliencia del GPX/TCX Parser y Gestión de Capas Leaflet
 * Cobertura:
 * 1. GPX estándar con <trkpt>, <ele>, <time>
 * 2. Garmin TCX con <Trackpoint>, <LatitudeDegrees>, <LongitudeDegrees>, <AltitudeMeters>, <Time>
 * 3. XML corrupto, vacío o con menos de 2 puntos
 * 4. Rutas sin marcas temporales (<time>) con reconstrucción sintética de splits y ritmo
 * 5. Rutas sin etiquetas de elevación (<ele>) sin propagación de NaN
 * 6. Filtrado de saltos de GPS inverosímiles (pérdida de señal > 32 km/h)
 * 7. Gestión y limpieza de capas en Leaflet (roseta, tracker, rutas)
 */

import assert from 'node:assert';
import { parseGPX, haversineDistance, generarGPX } from '../../public_html/js/gpxParser.js';
import { mapRuntime } from '../../public_html/js/map/map.state.js';
import { deshabilitarPropagacionMapa } from '../../public_html/js/map/map.core.js';
import { limpiarRosaVectoresMapa } from '../../public_html/js/map/map.bento.js';
import { restaurarTracker } from '../../public_html/js/map/map.tracker.js';

let totalTests = 0;
let passedTests = 0;

function it(description, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ [PASS] ${description}`);
    } catch (err) {
        console.error(`  ❌ [FAIL] ${description}`);
        console.error(err);
        process.exitCode = 1;
    }
}

console.log('\n======================================================');
console.log('SUITE UNITARIA: GPX/TCX PARSER Y GESTIÓN DE CAPAS MAPA');
console.log('======================================================\n');

// ----------------------------------------------------
// GRUPO 1: PARSING DE FORMATOS GPX Y TCX ESTÁNDAR
// ----------------------------------------------------
console.log('[GRUPO 1] Soporte de Estándares GPX 1.1 y Garmin TCX');

it('GPX estándar con <trkpt>, marcas temporales y elevación', () => {
    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1" creator="PaddleSafe">
      <trk>
        <name>Travesía Denia - Las Rotas</name>
        <trkseg>
          <trkpt lat="38.8350" lon="0.1150">
            <ele>0.5</ele>
            <time>2026-10-25T08:00:00Z</time>
          </trkpt>
          <trkpt lat="38.8320" lon="0.1200">
            <ele>1.2</ele>
            <time>2026-10-25T08:10:00Z</time>
          </trkpt>
          <trkpt lat="38.8280" lon="0.1250">
            <ele>0.8</ele>
            <time>2026-10-25T08:20:00Z</time>
          </trkpt>
        </trkseg>
      </trk>
    </gpx>`;

    const res = parseGPX(gpxXml);
    assert.strictEqual(res.coordinates.length, 3);
    assert.strictEqual(res.hasRealTimestamps, true);
    assert.ok(res.total_distance_km > 0.8 && res.total_distance_km < 1.6);
    assert.strictEqual(res.total_duration_seconds, 1200); // 20 minutos
    assert.ok(res.avg_speed_kmh > 0 && res.avg_speed_kmh < 15);
    assert.ok(Number.isFinite(res.total_elevation_gain_m));
});

it('Garmin TCX con <Trackpoint>, <LatitudeDegrees>, <LongitudeDegrees> y <AltitudeMeters>', () => {
    const tcxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <Activities>
        <Activity Sport="Other">
          <Lap StartTime="2026-10-25T09:00:00Z">
            <Track>
              <Trackpoint>
                <Time>2026-10-25T09:00:00Z</Time>
                <Position>
                  <LatitudeDegrees>38.8000</LatitudeDegrees>
                  <LongitudeDegrees>0.1500</LongitudeDegrees>
                </Position>
                <AltitudeMeters>0.0</AltitudeMeters>
              </Trackpoint>
              <Trackpoint>
                <Time>2026-10-25T09:15:00Z</Time>
                <Position>
                  <LatitudeDegrees>38.7950</LatitudeDegrees>
                  <LongitudeDegrees>0.1550</LongitudeDegrees>
                </Position>
                <AltitudeMeters>0.0</AltitudeMeters>
              </Trackpoint>
              <Trackpoint>
                <Time>2026-10-25T09:30:00Z</Time>
                <Position>
                  <LatitudeDegrees>38.7900</LatitudeDegrees>
                  <LongitudeDegrees>0.1600</LongitudeDegrees>
                </Position>
                <AltitudeMeters>0.0</AltitudeMeters>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const res = parseGPX(tcxXml);
    assert.strictEqual(res.coordinates.length, 3);
    assert.strictEqual(res.hasRealTimestamps, true);
    assert.strictEqual(res.total_duration_seconds, 1800); // 30 minutos
    assert.ok(res.total_distance_km > 1.0);
    assert.ok(res.avg_speed_kmh > 0);
});

// ----------------------------------------------------
// GRUPO 2: VALIDACIÓN ANTE ARCHIVOS CORRUPTOS O VACÍOS
// ----------------------------------------------------
console.log('\n[GRUPO 2] Validación Defensiva ante XML Corrupto o Inválido');

it('Archivo vacío, nulo o de tipo incorrecto lanza excepción controlada', () => {
    assert.throws(() => parseGPX(''), /vacío|no es un string/i);
    assert.throws(() => parseGPX(null), /vacío|no es un string/i);
    assert.throws(() => parseGPX(undefined), /vacío|no es un string/i);
    assert.throws(() => parseGPX('   '), /vacío/i);
});

it('Respuesta HTML 404/500 o texto plano corrupto lanza excepción', () => {
    const htmlError = `<!DOCTYPE html><html><head><title>404 Not Found</title></head><body>Error 404</body></html>`;
    assert.throws(() => parseGPX(htmlError), /no es un archivo GPX\/TCX/i);
});

it('Archivo XML con menos de 2 trackpoints lanza excepción descriptiva', () => {
    const singlePointGpx = `<?xml version="1.0"?>
    <gpx version="1.1"><trk><trkseg>
      <trkpt lat="38.8350" lon="0.1150"><time>2026-10-25T08:00:00Z</time></trkpt>
    </trkseg></trk></gpx>`;
    assert.throws(() => parseGPX(singlePointGpx), /mínimo 2/i);
});

// ----------------------------------------------------
// GRUPO 3: PUNTOS SIN MARCA DE TIEMPO O SIN ELEVACIÓN
// ----------------------------------------------------
console.log('\n[GRUPO 3] Reconstrucción de Tiempo y Manejo de Elevación Nula');

it('Ruta planificada sin marcas <time>: estima ritmo base SUP (~4.5 km/h) sin producir NaN ni duración cero', () => {
    const noTimeGpx = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <trk><trkseg>
        <trkpt lat="38.8000" lon="0.1000"></trkpt>
        <trkpt lat="38.8090" lon="0.1000"></trkpt>
        <trkpt lat="38.8180" lon="0.1000"></trkpt>
      </trkseg></trk>
    </gpx>`;

    const res = parseGPX(noTimeGpx);
    assert.strictEqual(res.hasRealTimestamps, false);
    assert.ok(res.total_distance_km > 1.8 && res.total_distance_km < 2.2); // ~2 km
    assert.ok(res.total_duration_seconds > 1000, 'La duración debe haber sido estimada en base a la distancia');
    assert.ok(!Number.isNaN(res.avg_speed_kmh), 'avg_speed_kmh no debe ser NaN');
    assert.ok(res.avg_speed_kmh >= 3.5 && res.avg_speed_kmh <= 5.5, `Velocidad estimada esperada ~4.5 km/h, obtenida: ${res.avg_speed_kmh}`);
    assert.ok(res.splits.length >= 1, 'Debe generar splits para cada kilómetro');
    assert.ok(!Number.isNaN(res.splits[0].duration_seconds));
    assert.ok(!Number.isNaN(res.splits[0].avg_speed_kmh));
});

it('Track sin etiquetas <ele>: asigna 0.0 sin propagar NaN en desnivel', () => {
    const noEleGpx = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <trk><trkseg>
        <trkpt lat="38.8000" lon="0.1000"><time>2026-10-25T10:00:00Z</time></trkpt>
        <trkpt lat="38.8020" lon="0.1020"><time>2026-10-25T10:05:00Z</time></trkpt>
      </trkseg></trk>
    </gpx>`;

    const res = parseGPX(noEleGpx);
    assert.strictEqual(res.total_elevation_gain_m, 0.0);
    assert.strictEqual(Number.isNaN(res.total_elevation_gain_m), false);
});

// ----------------------------------------------------
// GRUPO 4: FILTRADO DE PICOS DE GPS / PÉRDIDA DE SEÑAL
// ----------------------------------------------------
console.log('\n[GRUPO 4] Filtrado de Saltos de GPS Irreales (> 32 km/h)');

it('Salto satelital de 5 km en 2 segundos por pérdida de cobertura se descarta de la distancia y max_speed', () => {
    const glitchGpx = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <trk><trkseg>
        <trkpt lat="38.8000" lon="0.1000"><time>2026-10-25T08:00:00Z</time></trkpt>
        <trkpt lat="38.8005" lon="0.1005"><time>2026-10-25T08:01:00Z</time></trkpt>
        <!-- Teleportación de GPS por pérdida de señal: 0.15 grados de lat (~16.6 km) en 2 segundos (> 30000 km/h) -->
        <trkpt lat="38.9500" lon="0.1005"><time>2026-10-25T08:01:02Z</time></trkpt>
        <!-- Retorno a la posición real -->
        <trkpt lat="38.8010" lon="0.1010"><time>2026-10-25T08:02:00Z</time></trkpt>
      </trkseg></trk>
    </gpx>`;

    const res = parseGPX(glitchGpx);
    // La distancia total real de los 3 puntos válidos es ~150 metros (0.15 km).
    // Si no se filtrara el glitch, la distancia superaría los 30 km.
    assert.ok(res.total_distance_km < 1.0, `La distancia acumulada debe descartar el salto de 16km (actual: ${res.total_distance_km} km)`);
    assert.ok(res.max_speed_kmh <= 32.0, `La velocidad máxima debe estar acotada al límite físico de SUP (actual: ${res.max_speed_kmh} km/h)`);
});

// ----------------------------------------------------
// GRUPO 5: GESTIÓN DE CAPAS Y DOM PROPAGATION EN LEAFLET
// ----------------------------------------------------
console.log('\n[GRUPO 5] Gestión Limpia de Capas Leaflet y Eventos');

it('deshabilitarPropagacionMapa no lanza error en entornos sin DOM o con IDs inexistentes', () => {
    assert.doesNotThrow(() => deshabilitarPropagacionMapa('elementoInexistente'));
    assert.doesNotThrow(() => deshabilitarPropagacionMapa(null));
});

it('limpiarRosaVectoresMapa remueve la roseta previa y limpia activeSpotData', () => {
    let removedLayer = null;
    const fakeLayer = { id: 'roseta-svg-fake' };
    const fakeMap = {
        removeLayer: layer => { removedLayer = layer; }
    };
    mapRuntime.map = fakeMap;
    mapRuntime.marcadorRosaVectores = fakeLayer;
    mapRuntime.activeSpotData = { windKt: 12, waveM: 0.5 };

    limpiarRosaVectoresMapa();

    assert.strictEqual(removedLayer, fakeLayer, 'Debe haber llamado a removeLayer con el marcador de roseta');
    assert.strictEqual(mapRuntime.marcadorRosaVectores, null, 'marcadorRosaVectores debe quedar en null');
    assert.strictEqual(mapRuntime.activeSpotData, null, 'activeSpotData debe quedar en null');
});

it('restaurarTracker remueve la polilínea en vivo y resetea flags de navegación', () => {
    let removedLivePoly = null;
    const fakePolyline = { id: 'live-poly-fake' };
    const fakeMap = {
        removeLayer: layer => { removedLivePoly = layer; }
    };
    mapRuntime.map = fakeMap;
    mapRuntime.livePolyline = fakePolyline;
    mapRuntime.isTracking = true;
    mapRuntime.cronometroInterval = 99999;

    restaurarTracker();

    assert.strictEqual(removedLivePoly, fakePolyline, 'Debe haber llamado a removeLayer con livePolyline');
    assert.strictEqual(mapRuntime.livePolyline, null, 'livePolyline debe ser null');
    assert.strictEqual(mapRuntime.isTracking, false, 'isTracking debe ser false');
    assert.strictEqual(mapRuntime.cronometroInterval, null, 'cronometroInterval debe ser null');
});

console.log(`\n======================================================`);
console.log(`RESUMEN TESTS GPX Y CAPAS: ${passedTests} / ${totalTests} PASADOS`);
console.log(`======================================================\n`);

