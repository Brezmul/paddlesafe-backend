/**
 * PaddleSafe - Test Suite Unitario de Validación y Servicios Meteorológicos
 * FASE 6: Pruebas unitarias completas para cobertura de validaciones, errores y APIs meteo.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const baseDir = 'C:/Users/Usuario/Desktop/WEBS/PaddleSafe';
import { formatearTiempo } from '../../public_html/js/utils.js';
import {
    BaseAppError,
    WeatherError,
    ForecastError,
    MapError,
    RadarError,
    validarCoordenadas,
    resolverSpotConocido,
    clasificarErrorMeteo,
    logForecastService
} from '../../public_html/js/engine/errors.js';

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

async function itAsync(description, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✅ [PASS] ${description}`);
    } catch (err) {
        console.error(`  ❌ [FAIL] ${description}`);
        console.error(err);
        process.exitCode = 1;
    }
}

console.log('\n==================================================');
console.log('SUITE UNITARIA: SERVICIOS Y ERRORES METEOROLÓGICOS');
console.log('==================================================\n');

// --------------------------------------------------
// 1. VALIDACIÓN DEFENSIVA DE COORDENADAS
// --------------------------------------------------
console.log('[GRUPO 1] Validación Defensiva de Coordenadas');

it('Spot válido: coordenadas correctas dentro de rango', () => {
    const res = validarCoordenadas(38.8242, 0.1472);
    assert.strictEqual(res.valido, true);
    assert.strictEqual(res.lat, 38.8242);
    assert.strictEqual(res.lon, 0.1472);
});

it('Spot válido: coordenadas en formato string convertible', () => {
    const res = validarCoordenadas('38.7681', '0.2078');
    assert.strictEqual(res.valido, true);
    assert.strictEqual(res.lat, 38.7681);
    assert.strictEqual(res.lon, 0.2078);
});

it('Spot sin coordenadas: latitud o longitud undefined o null', () => {
    const res1 = validarCoordenadas(undefined, 0.1472);
    assert.strictEqual(res1.valido, false);
    assert.strictEqual(res1.code, 'MISSING_COORDINATES');

    const res2 = validarCoordenadas(38.8242, null);
    assert.strictEqual(res2.valido, false);
    assert.strictEqual(res2.code, 'MISSING_COORDINATES');

    const res3 = validarCoordenadas('', '');
    assert.strictEqual(res3.valido, false);
    assert.strictEqual(res3.code, 'MISSING_COORDINATES');
});

it('Coordenadas inválidas: valores NaN o strings corruptos', () => {
    const res1 = validarCoordenadas('invalido', 0.1472);
    assert.strictEqual(res1.valido, false);
    assert.strictEqual(res1.code, 'INVALID_COORDINATES');

    const res2 = validarCoordenadas(NaN, 0.1472);
    assert.strictEqual(res2.valido, false);
    assert.strictEqual(res2.code, 'INVALID_COORDINATES');

    const res3 = validarCoordenadas(Infinity, 0.1472);
    assert.strictEqual(res3.valido, false);
    assert.strictEqual(res3.code, 'INVALID_COORDINATES');
});

it('Coordenadas fuera de rango geográfico', () => {
    const resLat = validarCoordenadas(95.5, 0.1472);
    assert.strictEqual(resLat.valido, false);
    assert.strictEqual(resLat.code, 'LATITUDE_OUT_OF_RANGE');

    const resLon = validarCoordenadas(38.8242, 195.0);
    assert.strictEqual(resLon.valido, false);
    assert.strictEqual(resLon.code, 'LONGITUDE_OUT_OF_RANGE');
});

// --------------------------------------------------
// 2. RESOLUCIÓN DE SPOTS NAÚTICOS PRECONFIGURADOS
// --------------------------------------------------
console.log('\n[GRUPO 2] Resolución Inmediata de Spots Costeros');

it('Spot válido: Denia (Dénia, Les Rotes)', () => {
    const spot = resolverSpotConocido('Denia');
    assert.ok(spot !== null, 'Debe resolver Denia');
    assert.strictEqual(spot.nombre, 'Les Rotes (Dénia)');
    assert.strictEqual(spot.lat, 38.8242);
    assert.strictEqual(spot.lon, 0.1472);
});

it('Spot válido: Jávea (Xàbia, Cala Blanca)', () => {
    const spot = resolverSpotConocido('Jávea');
    assert.ok(spot !== null, 'Debe resolver Jávea');
    assert.strictEqual(spot.nombre, 'Cala Blanca (Jávea)');
    assert.strictEqual(spot.lat, 38.7681);
    assert.strictEqual(spot.lon, 0.2078);
});

it('Spot válido: Moraira (El Portet)', () => {
    const spot = resolverSpotConocido('Moraira');
    assert.ok(spot !== null, 'Debe resolver Moraira');
    assert.strictEqual(spot.nombre, 'El Portet (Moraira)');
    assert.strictEqual(spot.lat, 38.6881);
    assert.strictEqual(spot.lon, 0.1389);
});

it('Spot inexistente: retorna null y permite flujo controlado', () => {
    const spot = resolverSpotConocido('SpotInexistenteTotal999XYZ');
    assert.strictEqual(spot, null);
});

// --------------------------------------------------
// 3. JERARQUÍA UNIFORME DE ERRORES
// --------------------------------------------------
console.log('\n[GRUPO 3] Jerarquía Uniforme de Errores');

it('WeatherError y ForecastError heredan de BaseAppError y Error', () => {
    const wErr = new WeatherError('Fallo de sensor meteo', { code: 'SENSOR_OFFLINE', spot: 'Denia' });
    assert.ok(wErr instanceof BaseAppError);
    assert.ok(wErr instanceof Error);
    assert.strictEqual(wErr.name, 'WeatherError');
    assert.strictEqual(wErr.code, 'SENSOR_OFFLINE');
    assert.strictEqual(wErr.spot, 'Denia');

    const fErr = new ForecastError('Error en forecast', { code: 'HTTP_500', status: 500 });
    assert.ok(fErr instanceof BaseAppError);
    assert.ok(fErr instanceof Error);
    assert.strictEqual(fErr.name, 'ForecastError');
    assert.strictEqual(fErr.status, 500);

    const mErr = new MapError('Error en capa vectorial');
    assert.ok(mErr instanceof BaseAppError);

    const rErr = new RadarError('Error en frame radar');
    assert.ok(rErr instanceof BaseAppError);
});

// --------------------------------------------------
// 4. CLASIFICACIÓN DE ERRORES Y MENSAJES AMIGABLES
// --------------------------------------------------
console.log('\n[GRUPO 4] Clasificación y Mensajes de Usuario');

it('Timeout de API: genera ForecastError con código TIMEOUT y mensaje amigable', () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'AbortError';
    const classified = clasificarErrorMeteo(err, null, 'https://api.open-meteo.com', 'Denia');
    assert.strictEqual(classified.code, 'TIMEOUT');
    assert.ok(classified.userMessage.includes('tiempo'), 'Debe indicar que no respondió a tiempo');
});

it('Error de red: genera ForecastError con código NETWORK_ERROR', () => {
    const err = new TypeError('Failed to fetch');
    const classified = clasificarErrorMeteo(err, null, 'https://api.open-meteo.com', 'Denia');
    assert.strictEqual(classified.code, 'NETWORK_ERROR');
    assert.ok(classified.userMessage.includes('conexión'), 'Debe mencionar la conexión a internet');
});

it('Error HTTP 400: coordenadas incorrectas para el modelo', () => {
    const classified = clasificarErrorMeteo(null, 400, 'https://api.open-meteo.com', 'Denia');
    assert.strictEqual(classified.code, 'HTTP_400');
    assert.ok(classified.userMessage.includes('coordenadas'), 'Debe advertir sobre coordenadas');
});

it('Error HTTP 404: estación o spot no encontrado', () => {
    const classified = clasificarErrorMeteo(null, 404, 'https://api.open-meteo.com', 'Inexistente');
    assert.strictEqual(classified.code, 'HTTP_404');
    assert.ok(classified.userMessage.includes('No se encontraron'), 'Debe advertir sobre datos no encontrados');
});

it('Error HTTP 429: límite de consultas excedido', () => {
    const classified = clasificarErrorMeteo(null, 429, 'https://api.open-meteo.com', 'Denia');
    assert.strictEqual(classified.code, 'RATE_LIMITED');
    assert.ok(classified.userMessage.includes('Límite de consultas'), 'Debe advertir sobre rate limit');
});

it('Error HTTP 500: servidor meteorológico no disponible', () => {
    const classified = clasificarErrorMeteo(null, 500, 'https://api.open-meteo.com', 'Denia');
    assert.strictEqual(classified.code, 'HTTP_500');
    assert.ok(classified.userMessage.includes('temporalmente no disponible'), 'Debe informar indisponibilidad temporal');
});

it('JSON inválido: SyntaxError mapeado a INVALID_JSON', () => {
    const err = new SyntaxError('Unexpected token < in JSON at position 0');
    const classified = clasificarErrorMeteo(err, 200, 'https://api.open-meteo.com', 'Denia');
    assert.strictEqual(classified.code, 'INVALID_JSON');
    assert.ok(classified.userMessage.includes('no legible'), 'Debe informar respuesta no legible');
});

it('Datos vacíos: detecta cuando no hay datos horarios disponibles', () => {
    const err = new Error('Open-Meteo no devolvió datos horarios');
    const classified = clasificarErrorMeteo(err, 200, 'https://api.open-meteo.com', 'Denia');
    assert.strictEqual(classified.code, 'EMPTY_RESPONSE');
    assert.ok(classified.userMessage.includes('datos horarios'), 'Debe informar ausencia de datos horarios');
});

// --------------------------------------------------
// 5. OBSERVABILIDAD Y REGISTRO ESTRUCTURADO
// --------------------------------------------------
console.log('\n[GRUPO 5] Logging y Observabilidad');

it('logForecastService registra llamada exitosa sin lanzar excepciones', () => {
    let logged = false;
    const originalLog = console.log;
    console.log = (msg) => {
        if (typeof msg === 'string' && msg.includes('[ForecastService]')) logged = true;
    };

    try {
        logForecastService({
            spot: 'Denia',
            lat: 38.8242,
            lng: 0.1472,
            url: 'https://api.open-meteo.com/v1/forecast',
            status: 200,
            durationMs: 245
        });
        assert.strictEqual(logged, true, 'Debe haber emitido el formato [ForecastService]');
    } finally {
        console.log = originalLog;
    }
});

it('logForecastService registra llamadas con error en formato estructurado', () => {
    let loggedWarn = false;
    const originalWarn = console.warn;
    console.warn = (msg) => {
        if (typeof msg === 'string' && msg.includes('[ForecastService]')) loggedWarn = true;
    };

    try {
        logForecastService({
            spot: 'Denia',
            lat: undefined,
            lng: undefined,
            url: null,
            status: 'ERR',
            durationMs: 50,
            error: new Error('Missing Latitude')
        });
        assert.strictEqual(loggedWarn, true, 'Debe haber emitido el log de error');
    } finally {
        console.warn = originalWarn;
    }
});


// --------------------------------------------------
// 6. FORMATEO DE TIEMPO Y DURACIÓN DE RUTAS (formatearTiempo)
// --------------------------------------------------
console.log('\n[GRUPO 7] Integridad de Ámbito en Dashboard Pro (hhInicio)');

it('renderizarDashboardPro define hhInicio a nivel de función sin ReferenceError', () => {
    const bentoContent = fs.readFileSync(path.join(baseDir, 'public_html/js/map/map.bento.js'), 'utf8');
    assert.ok(bentoContent.includes('const hhInicio = parseInt(timeParts[0], 10) || 0;'), 'hhInicio debe declararse al inicio de renderizarDashboardPro');
    assert.ok(bentoContent.includes('const mmInicio = parseInt(timeParts[1], 10) || 0;'), 'mmInicio debe declararse al inicio de renderizarDashboardPro');
    assert.ok(!bentoContent.includes('const hhInicioSalida ='), 'hhInicioSalida redundante eliminado a favor de hhInicio en ámbito');
});

console.log('\n[GRUPO 6] Formateo de Tiempo y Duración de Rutas (formatearTiempo)');

it('formatearTiempo: minutos simples (< 60 min)', () => {
    assert.strictEqual(formatearTiempo(45), '45 min');
    assert.strictEqual(formatearTiempo(1), '1 min');
});

it('formatearTiempo: horas exactas sin minutos restantes', () => {
    assert.strictEqual(formatearTiempo(60), '1h');
    assert.strictEqual(formatearTiempo(120), '2h');
});

it('formatearTiempo: horas compuestas con minutos restantes', () => {
    assert.strictEqual(formatearTiempo(75), '1h 15 min');
    assert.strictEqual(formatearTiempo(130), '2h 10 min');
});

it('formatearTiempo defensivo: valores nulos, undefined, NaN o negativos', () => {
    assert.strictEqual(formatearTiempo(null), '-- min');
    assert.strictEqual(formatearTiempo(undefined), '-- min');
    assert.strictEqual(formatearTiempo(NaN), '-- min');
    assert.strictEqual(formatearTiempo('invalido'), '-- min');
    assert.strictEqual(formatearTiempo(-10), '0 min');
});

console.log('\n==================================================');
console.log(`RESUMEN TESTS UNITARIOS: ${passedTests} / ${totalTests} PASADOS`);
console.log('==================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}

