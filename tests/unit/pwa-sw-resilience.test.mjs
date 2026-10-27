// ==============================================================================
// tests/unit/pwa-sw-resilience.test.mjs
// SUITE UNITARIA: PWA SERVICE WORKER, ESTRATEGIA DE CACHÉ Y SEGURIDAD .HTACCESS
// PaddleSafe v5.18 - Resiliencia de Despliegue y Tiempo Real
// ==============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('\n======================================================');
console.log('SUITE UNITARIA: PWA, CACHÉ METEOROLÓGICO Y .HTACCESS');
console.log('======================================================\n');

let passCount = 0;
let totalCount = 0;

function it(name, fn) {
    totalCount++;
    try {
        fn();
        passCount++;
        console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

const baseDir = 'C:/Users/Usuario/Desktop/WEBS/PaddleSafe';

// ==============================================================================
// GRUPO 1: SINCRONIZACIÓN DE VERSIONES (SW.JS Y VERSION.JSON)
// ==============================================================================
console.log('[GRUPO 1] Sincronización Canónica de Versiones y Manifest PWA');

it('version.json contiene version y hash válidos', () => {
    const vJsonPath = path.join(baseDir, 'public_html/version.json');
    assert.ok(fs.existsSync(vJsonPath), 'version.json debe existir en public_html');
    const data = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
    assert.ok(data.version, 'version.json debe tener campo version');
    assert.ok(data.hash, 'version.json debe tener campo hash');
    assert.equal(data.hash, 'paddlesafe-v605', 'El hash debe coincidir con paddlesafe-v604');
});

it('sw.js define VERSION alineado exactamente con version.json', () => {
    const swPath = path.join(baseDir, 'public_html/sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js debe existir en public_html');
    const swContent = fs.readFileSync(swPath, 'utf8');

    const vMatch = swContent.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(vMatch, 'sw.js debe definir const VERSION');
    assert.equal(vMatch[1], 'paddlesafe-v605', 'VERSION en sw.js debe ser paddlesafe-v604');
});

it('manifest.json es válido y referencia iconos existentes con purpose maskable', () => {
    const manifestPath = path.join(baseDir, 'public_html/manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json debe existir en public_html');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.background_color, '#041e30');
    assert.equal(manifest.theme_color, '#041e30');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

    const icon192 = manifest.icons.find(i => i.sizes === '192x192');
    const icon512 = manifest.icons.find(i => i.sizes === '512x512');
    assert.ok(icon192, 'Debe incluir icono 192x192');
    assert.ok(icon512, 'Debe incluir icono 512x512');
    assert.equal(icon192.purpose, 'any maskable');
    assert.equal(icon512.purpose, 'any maskable');

    // Verificar que los archivos físicos existen
    assert.ok(fs.existsSync(path.join(baseDir, 'public_html', icon192.src)));
    assert.ok(fs.existsSync(path.join(baseDir, 'public_html', icon512.src)));
});

// ==============================================================================
// GRUPO 2: ESTRATEGIA DE CACHÉ EN SW.JS (NETWORKONLY Y TIMEOUT CORTO OPEN-METEO)
// ==============================================================================
console.log('\n[GRUPO 2] Reglas Estrictas de Caché en sw.js (Cero CacheFirst en Clima/Auth)');

it('sw.js clasifica Supabase, backend y api/backend.js como NetworkOnly', () => {
    const swContent = fs.readFileSync(path.join(baseDir, 'public_html/sw.js'), 'utf8');
    assert.ok(swContent.includes("url.pathname.startsWith('/api/')"), 'Debe excluir /api/ de la caché');
    assert.ok(swContent.includes("url.pathname.includes('backend.js')"), 'Debe excluir backend.js de la caché');
    assert.ok(swContent.includes("hostIs(h, 'supabase.co')"), 'Debe excluir supabase.co de la caché');
    assert.ok(swContent.includes("url.pathname.includes('/rest/v1/')"), 'Debe excluir rest/v1 de la caché');
    assert.ok(swContent.includes("url.pathname.includes('/auth/v1/')"), 'Debe excluir auth/v1 de la caché');
});

it('sw.js implementa NetworkFirst con timeout corto (2.5s) para Open-Meteo sin CacheFirst', () => {
    const swContent = fs.readFileSync(path.join(baseDir, 'public_html/sw.js'), 'utf8');
    assert.ok(swContent.includes('SHORT_API_TIMEOUT = 2500'), 'Debe definir timeout corto de 2500ms para Open-Meteo');
    assert.ok(swContent.includes('networkFirstWeather'), 'Debe usar networkFirstWeather');
    assert.ok(swContent.includes('isOpenMeteo(url)'), 'Debe detectar peticiones Open-Meteo');

    // Comprobar que Open-Meteo nunca pasa por CacheFirst
    assert.ok(!swContent.match(/if\s*\(\s*isOpenMeteo\(url\)\s*\)\s*\{[^}]*cacheFirst/), 'Open-Meteo jamás debe usar CacheFirst');
});

it('sw.js limpia automáticamente cachés antiguas en evento activate', () => {
    const swContent = fs.readFileSync(path.join(baseDir, 'public_html/sw.js'), 'utf8');
    assert.ok(swContent.includes("self.addEventListener('activate'"), 'Debe manejar evento activate');
    assert.ok(swContent.includes("k.startsWith('paddlesafe-') && !KEEP.includes(k)"), 'Debe purgar buckets obsoletos');
    assert.ok(swContent.includes('WEATHER_CACHE'), 'Debe incluir WEATHER_CACHE en KEEP');
});

// ==============================================================================
// GRUPO 3: ACTUALIZACIÓN NO DESTRUCTIVA DE PWA EN INDEX.HTML
// ==============================================================================
console.log('\n[GRUPO 3] Notificación Suave de Actualización PWA sin Romper la Sesión');

it('index.html define mostrarNotificacionActualizacionPwa y aplicarActualizacionPwa', () => {
    const htmlContent = fs.readFileSync(path.join(baseDir, 'public_html/index.html'), 'utf8');
    assert.ok(htmlContent.includes('window.mostrarNotificacionActualizacionPwa'), 'Debe definir función de notificación suave');
    assert.ok(htmlContent.includes('window.aplicarActualizacionPwa'), 'Debe definir función de aplicación de actualización');
    assert.ok(htmlContent.includes('window._pwaUserRequestedReload'), 'Debe condicionar recargas automáticas al consentimiento del usuario');

    // Verificar que no se ejecuta un window.location.replace o reload forzado e incondicional ante nueva versión
    assert.ok(!htmlContent.includes("window.location.replace(destUrl.toString())"), 'No debe forzar replace automático al detectar nueva versión');
});

// ==============================================================================
// GRUPO 4: UNIFICACIÓN DE CABECERAS DE SEGURIDAD Y CACHÉ EN .HTACCESS
// ==============================================================================
console.log('\n[GRUPO 4] Unificación de Cabeceras HTTP de Servidor (.htaccess)');

it('public_html/.htaccess y root .htaccess unifican CSP, nosniff, y políticas de caché', () => {
    const rootHtaccess = fs.readFileSync(path.join(baseDir, '.htaccess'), 'utf8');
    const pubHtaccess = fs.readFileSync(path.join(baseDir, 'public_html/.htaccess'), 'utf8');

    // 1. Content Security Policy
    assert.ok(rootHtaccess.includes('Content-Security-Policy'), 'Root .htaccess debe incluir CSP');
    assert.ok(pubHtaccess.includes('Content-Security-Policy'), 'public_html/.htaccess debe incluir CSP');
    assert.ok(rootHtaccess.includes("https://*.open-meteo.com"), 'CSP debe permitir Open-Meteo');
    assert.ok(pubHtaccess.includes("https://*.open-meteo.com"), 'CSP debe permitir Open-Meteo');
    assert.ok(rootHtaccess.includes("https://*.supabase.co"), 'CSP debe permitir Supabase');
    assert.ok(pubHtaccess.includes("https://*.supabase.co"), 'CSP debe permitir Supabase');

    // 2. Cabeceras de protección MIME y Clickjacking
    assert.ok(rootHtaccess.includes('X-Content-Type-Options "nosniff"'));
    assert.ok(pubHtaccess.includes('X-Content-Type-Options "nosniff"'));
    assert.ok(rootHtaccess.includes('X-Frame-Options "SAMEORIGIN"'));
    assert.ok(pubHtaccess.includes('X-Frame-Options "SAMEORIGIN"'));
    assert.ok(rootHtaccess.includes('Referrer-Policy "strict-origin-when-cross-origin"'));
    assert.ok(pubHtaccess.includes('Referrer-Policy "strict-origin-when-cross-origin"'));

    // 3. Reglas de Caché Cero para index, version.json y sw.js
    assert.ok(rootHtaccess.includes('(index\\.html|index\\.php|version\\.json|sw\\.js|manifest\\.json)'));
    assert.ok(pubHtaccess.includes('(index\\.html|index\\.php|version\\.json|sw\\.js|manifest\\.json)'));
    assert.ok(rootHtaccess.includes('Cache-Control "no-cache, no-store, must-revalidate"'));
    assert.ok(pubHtaccess.includes('Cache-Control "no-cache, no-store, must-revalidate"'));

    // 4. Reglas de Caché Inmutable para estáticos
    assert.ok(rootHtaccess.includes('Cache-Control "public, max-age=31536000, immutable"'));
    assert.ok(pubHtaccess.includes('Cache-Control "public, max-age=31536000, immutable"'));
});

console.log('\n======================================================');
console.log(`RESUMEN TESTS PWA & .HTACCESS: ${passCount} / ${totalCount} PASADOS`);
console.log('======================================================\n');

if (passCount !== totalCount) {
    process.exit(1);
}
