/**
 * PaddleSafe - Test Suite de Auditoría y Resiliencia de Avatares en Ranking y Perfiles
 * FASE 7: Pruebas unitarias de avatar válido, sin avatar, inexistente y URL corrupta.
 */

import assert from 'node:assert';
import { IMG_FALLBACK, safeUrl, esc, handleAvatarError } from '../../public_html/js/utils.js';
import { renderizarPodioTop3Ranking } from '../../public_html/js/gamification.js';

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
console.log('SUITE DE RESILIENCIA: AVATARES DE RANKING Y PERFILES');
console.log('==================================================\n');

console.log('[CASO 1] Usuario con avatar válido');
it('safeUrl preserva URLs completas válidas (HTTPS y HTTP)', () => {
    const validUrl = 'https://amgmvnnwlraulbutgemx.supabase.co/storage/v1/object/public/paddlesafe/avatars/mateo.jpg?t=123';
    const result = safeUrl(validUrl);
    assert.strictEqual(result, validUrl);
});

it('renderizarPodioTop3Ranking renderiza la URL real del avatar cuando existe', () => {
    const usuarios = [
        { id: 'u1', nombre: 'Paddler Oro', avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2', metricLabel: '25 km', nivel: 4 },
        { id: 'u2', nombre: 'Paddler Plata', avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d', metricLabel: '18 km', nivel: 3 },
        { id: 'u3', nombre: 'Paddler Bronce', avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e', metricLabel: '12 km', nivel: 2 }
    ];
    const html = renderizarPodioTop3Ranking(usuarios);
    assert.ok(html.includes('https://images.unsplash.com/photo-1544005313-94ddf0286df2'), 'Debe incluir avatar de P1');
    assert.ok(html.includes('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d'), 'Debe incluir avatar de P2');
    assert.ok(html.includes('https://images.unsplash.com/photo-1500648767791-00dcc994a43e'), 'Debe incluir avatar de P3');
    assert.ok(!html.includes('src="img/default-avatar.svg"'), 'No debe referenciar el archivo local inexistente');
});

console.log('\n[CASO 2] Usuario sin avatar (null, cadena vacía o undefined)');
it('safeUrl asigna el avatar PaddleSafe SUP cuando el valor es null', () => {
    const result = safeUrl(null);
    assert.strictEqual(result, IMG_FALLBACK);
    assert.ok(result.startsWith('data:image/svg+xml;utf8,'), 'Debe ser un SVG data-URI autocontenido');
    assert.ok(result.includes('psSupBg'), 'El SVG debe contener el gradiente marino PaddleSafe');
});

it('safeUrl asigna el avatar PaddleSafe SUP cuando el valor es cadena vacía', () => {
    const result = safeUrl('');
    assert.strictEqual(result, IMG_FALLBACK);
});

it('safeUrl asigna el avatar PaddleSafe SUP cuando el valor es undefined', () => {
    const result = safeUrl(undefined);
    assert.strictEqual(result, IMG_FALLBACK);
});

it('renderizarPodioTop3Ranking utiliza el avatar PaddleSafe SUP sin avatares rotos', () => {
    const usuariosSinFoto = [
        { id: 'u1', nombre: 'Angy', avatar_url: null, metricLabel: '30 km', nivel: 5 },
        { id: 'u2', nombre: 'Piedad', avatar_url: '', metricLabel: '20 km', nivel: 4 },
        { id: 'u3', nombre: 'Lucas', avatar_url: undefined, metricLabel: '15 km', nivel: 3 }
    ];
    const html = renderizarPodioTop3Ranking(usuariosSinFoto);
    assert.ok(!html.includes('img/default-avatar.svg"'), 'No debe generar enlaces rotos');
    assert.ok(html.includes('data:image/svg+xml'), 'Debe incrustar el avatar data-URI de PaddleSafe');
    assert.ok(html.includes('psSupBg'), 'Debe contener la silueta SUP de PaddleSafe');
});

console.log('\n[CASO 3] Avatar inexistente o error 404');
it('handleAvatarError desconecta onerror y reasigna IMG_FALLBACK de forma determinista', () => {
    let onerrorCleared = false;
    const mockImg = {
        src: 'https://amgmvnnwlraulbutgemx.supabase.co/storage/v1/object/public/paddlesafe/avatars/deleted-file.jpg',
        onerror: () => {},
        classList: {
            classes: [],
            add(c) { this.classes.push(c); }
        }
    };

    handleAvatarError(mockImg);

    assert.strictEqual(mockImg.onerror, null, 'Debe desconectar onerror para evitar bucles');
    assert.strictEqual(mockImg.src, IMG_FALLBACK, 'Debe sustituir el src roto por IMG_FALLBACK');
    assert.ok(mockImg.classList.classes.includes('ps-fallback-avatar'), 'Debe marcar la clase de fallback');
});

it('safeUrl detecta la referencia histórica inexistente "img/default-avatar.svg" y la sustituye por IMG_FALLBACK', () => {
    const result = safeUrl('img/default-avatar.svg');
    assert.strictEqual(result, IMG_FALLBACK);
});

console.log('\n[CASO 4] URL corrupta, malformada o intento de inyección');
it('safeUrl rechaza cadenas literales "null" y "undefined" y devuelve IMG_FALLBACK', () => {
    assert.strictEqual(safeUrl('null'), IMG_FALLBACK);
    assert.strictEqual(safeUrl('undefined'), IMG_FALLBACK);
    assert.strictEqual(safeUrl('   '), IMG_FALLBACK);
});

it('safeUrl rechaza esquemas no seguros como javascript: y devuelve IMG_FALLBACK', () => {
    const xssAttempt = 'javascript:alert(1)';
    const result = safeUrl(xssAttempt);
    assert.strictEqual(result, IMG_FALLBACK);
});

it('safeUrl auto-completa rutas relativas a Supabase Storage (avatars/)', () => {
    const rawPath = 'avatars/usuario-777.jpg';
    const result = safeUrl(rawPath);
    assert.strictEqual(
        result,
        'https://amgmvnnwlraulbutgemx.supabase.co/storage/v1/object/public/paddlesafe/avatars/usuario-777.jpg'
    );
});

console.log('\n==================================================');
console.log(`RESUMEN TESTS DE AVATARES: ${passedTests} / ${totalTests} PASADOS`);
console.log('==================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}

