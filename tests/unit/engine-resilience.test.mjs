/**
 * PaddleSafe - Test Suite Unitario de Resiliencia del Motor y Cálculos Náuticos
 * Cobertura: Manejo de nulos/undefined/NaN, Timezones de pronóstico horario y Trigonometría costera/swell/corrientes.
 */

import assert from 'node:assert';
import { calcularConsensoModelos, promedioVectorialDireccion, diferenciaAngular } from '../../public_html/js/engine/consensus.js';
import {
    resolverOrientacionCostera,
    calcularComponenteVientoAuto,
    calcularComponenteOleaje,
    calcularComponenteCorriente,
    calcularIndiceDerivaPaddleSafe
} from '../../public_html/js/engine/coastal.js';
import { generarVeredictoNextGen } from '../../public_html/js/engine/verdict.js';
import { detectarVentanasOptimas } from '../../public_html/js/engine/windows.js';
import { calcularBeginnerIndex, evaluarCondicionesDeporte } from '../../public_html/js/engine/sports.js';
import { calcularDerivaCosteraPaddle } from '../../public_html/js/map/map.radar.js';

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

console.log('\n==================================================');
console.log('SUITE UNITARIA: RESILIENCIA DEL MOTOR Y NAVEGACIÓN');
console.log('==================================================\n');

// --------------------------------------------------
// 1. MANEJO DE NULOS / UNDEFINED / NAN EN CONSENSO
// --------------------------------------------------
console.log('[GRUPO 1] Resiliencia de Consenso y Fallback Meteorológico');

it('Consenso con fallback NaN: sanea a null sin propagar NaN', () => {
    const res = calcularConsensoModelos({
        ecmwfVientoKt: null,
        gfsVientoKt: null,
        iconVientoKt: null,
        fallbackVientoKt: NaN,
        fallbackDirDeg: 'NaN'
    });
    assert.strictEqual(Number.isNaN(res.consensoVientoKt), false, 'consensoVientoKt no debe ser NaN');
    assert.strictEqual(res.consensoVientoKt, null, 'consensoVientoKt debe ser null cuando fallback es NaN');
    assert.strictEqual(res.consensoDirDeg, null, 'consensoDirDeg debe ser null cuando fallbackDirDeg es NaN');
    assert.strictEqual(res.spreadVelocidadKt, 0);
});

it('Consenso con modelos parciales válidos y nulos en direcciones', () => {
    const res = calcularConsensoModelos({
        ecmwfVientoKt: 8.4,
        gfsVientoKt: 10.2,
        iconVientoKt: null,
        ecmwfDirDeg: null,
        gfsDirDeg: null,
        iconDirDeg: null,
        fallbackDirDeg: 90
    });
    assert.strictEqual(res.consensoVientoKt, 9.3);
    assert.strictEqual(res.spreadVelocidadKt, 1.8);
    assert.strictEqual(res.consensoDirDeg, 90, 'Debe usar fallbackDirDeg si no hay direcciones en modelos');
    assert.strictEqual(res.nivelConsenso, 'ALTO');
});

it('Promedio vectorial de direcciones maneja arrays vacíos, nulos o no finitos', () => {
    assert.strictEqual(promedioVectorialDireccion([]), null);
    assert.strictEqual(promedioVectorialDireccion([null, undefined, NaN]), null);
    assert.strictEqual(promedioVectorialDireccion([350, 10]), 0, 'Promedio circular de 350° y 10° debe ser 0°/N');
});

// --------------------------------------------------
// 2. MANEJO DE NULOS EN VEREDICTO Y DEPORTES
// --------------------------------------------------
console.log('\n[GRUPO 2] Veredicto y Deportes con Oleaje Nulo / Aguas Interiores');

it('Veredicto en embalse o aguas interiores con oleaje null otorga score de calma (98)', () => {
    const res = generarVeredictoNextGen({
        spotNombre: 'Embalse de Entrepeñas',
        lat: 40.55,
        lon: -2.70,
        vientoKt: 4,
        rachasKt: 5,
        oleajeM: null // En aguas interiores no hay oleaje oceánico
    });
    assert.strictEqual(res.score, 98, 'Brisa suave con oleaje nulo en interior debe alcanzar score 98');
    assert.strictEqual(res.estado, 'Favorable');
    assert.strictEqual(res.entorno, 'embalse_interior');
    assert.strictEqual(res.justificacion.includes('aguas interiores'), true);
    assert.strictEqual(res.justificacion.includes('0.0 m'), false, 'No debe mencionar 0.0 m');
});

it('Beginner Index con oleajeM null no lanza excepción ni produce NaN', () => {
    const res = calcularBeginnerIndex({
        vientoKt: 3,
        rachasKt: 4,
        oleajeM: null,
        componente: 'side-shore',
        esCosta: false
    });
    assert.strictEqual(res.nivel, 'Muy Fácil');
    assert.strictEqual(res.score, 100);
});

it('evaluarCondicionesDeporte no falla con toFixed cuando oleaje o swell son null', () => {
    const res = evaluarCondicionesDeporte({
        deporteKey: 'paddle_surf',
        nivelUsuario: 'Principiante',
        vientoKt: 5,
        rachasKt: 6,
        oleajeM: null,
        swellM: null
    });
    assert.strictEqual(res.recomendable, true);
    assert.strictEqual(res.estado, 'Favorable');
    assert.strictEqual(typeof res.motivo, 'string');
});

// --------------------------------------------------
// 3. SINCRONIZACIÓN HORARIA Y PARSEO RESILIENTE
// --------------------------------------------------
console.log('\n[GRUPO 3] Sincronización Horaria y Timezone Parsing en windows.js');

it('detectarVentanasOptimas soporta formatos ISO completos (YYYY-MM-DDTHH:MM)', () => {
    const horasIso = [
        { time: '2026-10-27T07:00', vientoKt: 4, rachasKt: 6, oleajeM: 0.2 },
        { time: '2026-10-27T08:00', vientoKt: 5, rachasKt: 7, oleajeM: 0.2 },
        { time: '2026-10-27T09:00', vientoKt: 6, rachasKt: 8, oleajeM: 0.2 },
        { time: '2026-10-27T10:00', vientoKt: 15, rachasKt: 20, oleajeM: 0.8 } // corta ventana
    ];
    const res = detectarVentanasOptimas(horasIso, 'Principiante');
    assert.strictEqual(res.hayVentana, true);
    assert.strictEqual(res.mejorVentana.inicio, '07:00', 'Debe extraer correctamente la hora local 07:00 de string ISO');
    assert.strictEqual(res.mejorVentana.fin, '10:00', 'Fin de ventana debe ser 10:00');
    assert.strictEqual(res.mejorVentana.duracionHoras, 3);
});

it('detectarVentanasOptimas con horas donde oleajeM es null promedia sin NaN', () => {
    const horasSinOla = [
        { hora: '08:00', vientoKt: 4, rachasKt: 5, oleajeM: null },
        { hora: '09:00', vientoKt: 5, rachasKt: 6, oleajeM: null }
    ];
    const res = detectarVentanasOptimas(horasSinOla, 'Intermedio');
    assert.strictEqual(res.hayVentana, true);
    assert.strictEqual(Number.isNaN(res.mejorVentana.oleajeM), false, 'oleajeM no debe ser NaN');
    assert.strictEqual(res.mejorVentana.oleajeM, 0);
});

// --------------------------------------------------
// 4. TRIGONOMETRÍA COSTERA: VIENTO, SWELL Y CORRIENTES
// --------------------------------------------------
console.log('\n[GRUPO 4] Trigonometría de Costa: Viento, Swell y Corrientes');

it('Viento: Playa mirando al Este (seaward 90°). Viento Poniente 270° es OFFSHORE, Levante 90° es ONSHORE', () => {
    const seaward = 90; // Mira al Este
    const poniente = calcularComponenteVientoAuto(270, seaward);
    const levante = calcularComponenteVientoAuto(90, seaward);
    const tramuntana = calcularComponenteVientoAuto(0, seaward);

    assert.strictEqual(poniente.componente, 'offshore', 'Viento del 270 sopla hacia 90 (mar adentro)');
    assert.strictEqual(levante.componente, 'onshore', 'Viento del 90 sopla hacia 270 (hacia tierra)');
    assert.strictEqual(tramuntana.componente, 'side-shore', 'Viento del Norte sopla paralelo a costa Este');
});

it('Swell: Las olas vienen DE 90° hacia playa que mira al Este (seaward 90°) -> Frontal / Rompiente', () => {
    const seaward = 90;
    const oleajeFrontal = calcularComponenteOleaje(90, seaward);
    const oleajeAbrigado = calcularComponenteOleaje(270, seaward);
    const oleajeLateral = calcularComponenteOleaje(0, seaward);

    assert.strictEqual(oleajeFrontal.componente, 'frontal', 'Olas procedentes de mar abierto inciden frontalmente');
    assert.strictEqual(oleajeAbrigado.componente, 'abrigado', 'Olas con rumbo de tierra quedan bloqueadas por relieve');
    assert.strictEqual(oleajeLateral.componente, 'lateral', 'Olas del Norte inciden lateralmente');
});

it('Corriente Marina: ocean_current_direction va HACIA 90° (mar abierto) -> Mar Adentro (Offshore)', () => {
    const seaward = 90;
    const corrienteResaca = calcularComponenteCorriente(90, seaward);
    const corrienteRetorno = calcularComponenteCorriente(270, seaward);
    const corrienteLitoral = calcularComponenteCorriente(0, seaward);

    assert.strictEqual(corrienteResaca.componente, 'mar_adentro', 'Corriente fluyendo a 90° arrastra hacia mar abierto');
    assert.strictEqual(corrienteRetorno.componente, 'hacia_tierra', 'Corriente fluyendo a 270° empuja hacia la playa');
    assert.strictEqual(corrienteLitoral.componente, 'paralela', 'Corriente hacia el Norte fluye paralela a la orilla');
});

it('Física de Deriva en map.radar.js: El swell desplaza en la dirección hacia la que viajan las olas', () => {
    // Si el viento viene del Norte (0°), empuja hacia el Sur (180°).
    // Si el swell viene del Norte (0°), también empuja hacia el Sur (180°).
    const deriva = calcularDerivaCosteraPaddle(10, 0, 1.0, 0, 'inflat_allround');
    assert.strictEqual(Math.round(deriva.direccionDeg), 180, 'Tanto viento como oleaje del Norte deben empujar hacia 180° (Sur)');
});

console.log(`\n==================================================`);
console.log(`RESUMEN TESTS DE RESILIENCIA: ${passedTests} / ${totalTests} PASADOS`);
console.log(`==================================================\n`);

