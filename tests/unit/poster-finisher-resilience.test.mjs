/**
 * PaddleSafe - Test Suite Unitario: Generador de Póster Finisher y Trazado de Rutas vs Spot
 * Verifica:
 *   1. Extracción de coordenadas de ruta activa (GPS live, A-B, Multipunto, waypoints).
 *   2. Supresión de la roseta táctica cuando existe una ruta trazada (>= 2 puntos).
 *   3. Trazado visible y limpio de la polilínea deportiva en el mapa Leaflet.
 *   4. Ajuste automático de encuadre (fitBounds) con padding centrado.
 *   5. Preservación del comportamiento de spot único (< 2 puntos).
 *   6. Estampado de telemetría y refuerzo vectorial en Canvas.
 */

import assert from 'node:assert';
import {
    formatearDuracionPoster,
    escalarCanvasSiExcede,
    extraerCoordenadasRuta,
    prepararMapaPosterFinisher,
    dibujarTrazadoRutaEnCanvas,
    estamparPosterFinisherCanvas
} from '../../public_html/js/map/map.poster.js';

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
console.log('SUITE UNITARIA: PÓSTER FINISHER Y TRAZADO DE RUTA VS SPOT');
console.log('======================================================\n');

// ------------------------------------------------------------------------------
// GRUPO 1: EXTRACCIÓN Y NORMALIZACIÓN DE COORDENADAS DE RUTA ACTIVA
// ------------------------------------------------------------------------------
console.log('[GRUPO 1] Extracción y Normalización de Coordenadas de Ruta Activa');

it('Estado vacío o sin puntos: retorna array vacío', () => {
    const coords = extraerCoordenadasRuta({});
    assert.deepStrictEqual(coords, []);
});

it('Ruta con trackCoords de live GPS: normaliza correctamente', () => {
    const mapRuntime = {
        trackCoords: [
            [38.8242, 0.1472],
            [38.8250, 0.1480],
            [38.8260, 0.1490]
        ]
    };
    const coords = extraerCoordenadasRuta(mapRuntime);
    assert.strictEqual(coords.length, 3);
    assert.strictEqual(coords[0][0], 38.8242);
    assert.strictEqual(coords[0][1], 0.1472);
});

it('Ruta con marcadoresRuta (Punto A-B o Multipunto): extrae waypoints desde getLatLng()', () => {
    const mapRuntime = {
        trackCoords: [], // GPS no emitió puntos pero hay ruta planificada
        marcadoresRuta: [
            { getLatLng: () => ({ lat: 38.8242, lng: 0.1472 }) },
            { getLatLng: () => ({ lat: 38.8300, lng: 0.1550 }) },
            { getLatLng: () => ({ lat: 38.8350, lng: 0.1600 }) }
        ]
    };
    const coords = extraerCoordenadasRuta(mapRuntime);
    assert.strictEqual(coords.length, 3);
    assert.strictEqual(coords[1][0], 38.8300);
    assert.strictEqual(coords[1][1], 0.1550);
});

it('Filtrado defensivo de coordenadas inválidas o fuera de rango', () => {
    const coords = extraerCoordenadasRuta({}, [
        [38.82, 0.14],
        [NaN, 0.15],
        [150.0, 0.15], // Latitud fuera de [-90, 90]
        [38.85, 0.18]
    ]);
    assert.strictEqual(coords.length, 2);
    assert.strictEqual(coords[0][0], 38.82);
    assert.strictEqual(coords[1][0], 38.85);
});

// ------------------------------------------------------------------------------
// GRUPO 2: PREPARACIÓN DE MAPA CON RUTA TRAZADA (>= 2 PUNTOS)
// ------------------------------------------------------------------------------
console.log('\n[GRUPO 2] Preparación de Mapa con Ruta Trazada (>= 2 puntos)');

it('Ruta trazada (>= 2 puntos): oculta/remueve la roseta y dibuja la polilínea con fitBounds', () => {
    let rosetaRemovida = false;
    let polylineAgregada = null;
    let fitBoundsLlamado = false;
    let fitBoundsOptions = null;

    const mockRoseta = {
        id: 'roseta-tactica',
        getLatLng: () => ({ lat: 38.8242, lng: 0.1472 })
    };

    const mockMap = {
        removeLayer: (layer) => {
            if (layer === mockRoseta) rosetaRemovida = true;
        },
        fitBounds: (bounds, options) => {
            fitBoundsLlamado = true;
            fitBoundsOptions = options;
        }
    };

    // Mock global de Leaflet (L) si no existe en Node
    globalThis.L = globalThis.L || {
        polyline: (pts, opts) => {
            polylineAgregada = { pts, opts, getBounds: () => ({ north: 38.83, south: 38.82, east: 0.16, west: 0.14 }) };
            polylineAgregada.addTo = () => polylineAgregada;
            return polylineAgregada;
        }
    };

    const mapRuntime = {
        marcadorRosaVectores: mockRoseta,
        trackCoords: [
            [38.8242, 0.1472],
            [38.8300, 0.1550]
        ]
    };

    const res = prepararMapaPosterFinisher({ currentMap: mockMap, mapRuntime });

    assert.strictEqual(res.esRuta, true, 'Debe clasificarse como ruta');
    assert.strictEqual(rosetaRemovida, true, 'Debe remover la roseta del mapa');
    assert.strictEqual(mapRuntime.marcadorRosaVectores, null, 'El puntero a la roseta debe limpiarse');
    assert.strictEqual(fitBoundsLlamado, true, 'Debe ajustar el mapa con fitBounds');
    assert.deepStrictEqual(fitBoundsOptions.padding, [50, 50], 'Debe aplicar padding de 50px');
    assert.strictEqual(fitBoundsOptions.animate, false, 'No debe usar animación para permitir captura inmediata');
    assert.strictEqual(polylineAgregada.opts.color, '#0284c7', 'Debe usar color visible deportivo');
    assert.strictEqual(polylineAgregada.opts.weight, 6, 'Debe usar grosor visible');
});

// ------------------------------------------------------------------------------
// GRUPO 3: COMPORTAMIENTO ANTE SPOT ÚNICO (< 2 PUNTOS)
// ------------------------------------------------------------------------------
console.log('\n[GRUPO 3] Comportamiento ante Spot Único (< 2 puntos)');

it('Spot único (< 2 puntos): NO remueve la roseta y centra la vista en el spot', () => {
    let rosetaRemovida = false;
    let setViewLlamado = false;
    let setViewLatLng = null;

    const mockRoseta = {
        getLatLng: () => ({ lat: 38.8242, lng: 0.1472 })
    };

    const mockMap = {
        removeLayer: (layer) => {
            if (layer === mockRoseta) rosetaRemovida = true;
        },
        setView: (latLng) => {
            setViewLlamado = true;
            setViewLatLng = latLng;
        },
        getZoom: () => 14
    };

    const mapRuntime = {
        marcadorRosaVectores: mockRoseta,
        trackCoords: [] // Sin puntos de ruta
    };

    const res = prepararMapaPosterFinisher({ currentMap: mockMap, mapRuntime });

    assert.strictEqual(res.esRuta, false, 'No debe clasificarse como ruta');
    assert.strictEqual(rosetaRemovida, false, 'NO debe remover la roseta para spot único');
    assert.strictEqual(setViewLlamado, true, 'Debe centrar la vista en el spot');
    assert.deepStrictEqual(setViewLatLng, { lat: 38.8242, lng: 0.1472 });
});

// ------------------------------------------------------------------------------
// GRUPO 4: REFUERZO VECTORIAL Y ESTAMPADO DE TELEMETRÍA EN CANVAS
// ------------------------------------------------------------------------------
console.log('\n[GRUPO 4] Refuerzo Vectorial y Estampado de Telemetría en Canvas');

it('dibujarTrazadoRutaEnCanvas: proyecta y dibuja sin errores en contexto Canvas 2D', () => {
    const ops = [];
    const mockCtx = {
        save: () => ops.push('save'),
        restore: () => ops.push('restore'),
        beginPath: () => ops.push('beginPath'),
        moveTo: (x, y) => ops.push(`moveTo(${Math.round(x)},${Math.round(y)})`),
        lineTo: (x, y) => ops.push(`lineTo(${Math.round(x)},${Math.round(y)})`),
        stroke: () => ops.push('stroke'),
        fill: () => ops.push('fill'),
        arc: (x, y, r) => ops.push(`arc(${Math.round(x)},${Math.round(y)},${r})`),
        set strokeStyle(v) { ops.push(`strokeStyle=${v}`); },
        set fillStyle(v) { ops.push(`fillStyle=${v}`); },
        set lineWidth(v) { ops.push(`lineWidth=${v}`); },
        set lineCap(v) {},
        set lineJoin(v) {}
    };

    const coords = [
        [38.82, 0.14],
        [38.83, 0.15],
        [38.84, 0.16]
    ];

    dibujarTrazadoRutaEnCanvas(mockCtx, 800, 600, coords);

    assert.ok(ops.includes('save'), 'Debe guardar estado de canvas');
    assert.ok(ops.includes('restore'), 'Debe restaurar estado de canvas');
    assert.ok(ops.some(o => o.startsWith('moveTo')), 'Debe posicionar el inicio del trazo');
    assert.ok(ops.some(o => o.startsWith('lineTo')), 'Debe dibujar segmentos');
    assert.ok(ops.some(o => o.startsWith('arc')), 'Debe dibujar marcadores de salida y llegada');
});

it('estamparPosterFinisherCanvas: genera banda Finisher con métricas completas', () => {
    const textRendered = [];
    const mockCtx = {
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillText: (txt) => textRendered.push(txt),
        set font(v) {},
        set fillStyle(v) {},
        set textAlign(v) {}
    };

    estamparPosterFinisherCanvas(mockCtx, 800, 600, {
        duracionMinutos: 45,
        trackDistanceKm: 4.85,
        avgSpdFinalStr: '6.5',
        kcal: 320,
        vientoKtStr: '8.5 kt',
        olasMStr: '0.4m',
        scoreSeguridad: 95
    });

    assert.ok(textRendered.some(t => t.includes('PADDLESAFE FINISHER')), 'Debe estampar título FINISHER');
    assert.ok(textRendered.some(t => t.includes('4.85 km') && t.includes('45 min')), 'Debe incluir distancia y duración');
    assert.ok(textRendered.some(t => t.includes('6.5 km/h') && t.includes('320 kcal')), 'Debe incluir velocidad y calorías');
    assert.ok(textRendered.some(t => t.includes('8.5 kt') && t.includes('Score 95/100')), 'Debe incluir telemetría meteo');
});

console.log('\n======================================================');
console.log(`RESUMEN TESTS PÓSTER FINISHER: ${passedTests} / ${totalTests} PASADOS`);
console.log('======================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}

