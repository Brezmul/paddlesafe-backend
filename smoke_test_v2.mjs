// ==============================================================================
// PADDLESAFE v2 - PREPUSH SMOKE TEST & AUTOFIX SUITE (smoke_test_v2.mjs)
// Self-contained Node.js ESM verification script for CI/CD and pre-push gates.
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';

// ------------------------------------------------------------------------------
// Browser Mocking Setup for Node.js Environment
// ------------------------------------------------------------------------------
globalThis.window = globalThis;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.window.dispatchEvent = () => true;

globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({
        setAttribute: () => {},
        classList: { add: () => {}, remove: () => {} },
        style: {}
    }),
    body: { appendChild: () => {}, removeChild: () => {} }
};

globalThis.localStorage = {
    _data: {},
    getItem: (key) => globalThis.localStorage._data[key] || null,
    setItem: (key, val) => { globalThis.localStorage._data[key] = String(val); },
    removeItem: (key) => { delete globalThis.localStorage._data[key]; },
    clear: () => { globalThis.localStorage._data = {}; }
};

try {
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'node-smoke-test', geolocation: { getCurrentPosition: () => {}, watchPosition: () => {} } },
        configurable: true,
        writable: true
    });
} catch {
    if (!globalThis.navigator.geolocation) {
        globalThis.navigator.geolocation = { getCurrentPosition: () => {}, watchPosition: () => {} };
    }
}

globalThis.L = {
    divIcon: () => ({}),
    marker: () => ({ addTo: () => ({}) }),
    polyline: () => ({ addTo: () => ({}) }),
    polygon: () => ({ addTo: () => ({}) }),
    circleMarker: () => ({ addTo: () => ({}) }),
    latLngBounds: () => ({ extend: () => {}, isValid: () => false }),
    layerGroup: () => ({ addTo: () => ({}), clearLayers: () => {} })
};

// ------------------------------------------------------------------------------
// Test Execution Tracker
// ------------------------------------------------------------------------------
let testsRun = 0;
let passCount = 0;
const autoFixesApplied = [];

function assert(condition, message) {
    testsRun++;
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
    passCount++;
}

// ------------------------------------------------------------------------------
// TASK 1: SYNTAX AND VERSION SYNC
// ------------------------------------------------------------------------------
console.log('--- [TASK 1] Syntax & Version Sync ---');

// 1.1 Node syntax check across all JS files
function getAllFiles(dir, ext = '.js') {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
                files = files.concat(getAllFiles(fullPath, ext));
            }
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            files.push(fullPath);
        }
    }
    return files;
}

const jsFilesToCheck = [
    ...getAllFiles('public_html'),
    ...getAllFiles('paddlesafe-backend-main')
];

let syntaxErrors = 0;
for (const file of jsFilesToCheck) {
    try {
        execSync(`"${process.execPath}" --check "${file}"`, { stdio: 'pipe' });
    } catch (e) {
        syntaxErrors++;
        console.error(`Syntax error in: ${file}`, e.stderr ? e.stderr.toString() : e.message);
    }
}
assert(syntaxErrors === 0, `All JS files must pass node --check without syntax errors. Found: ${syntaxErrors}`);
assert(jsFilesToCheck.length > 50, `Found and checked ${jsFilesToCheck.length} JS files`);

// 1.2 OTA Version Sync between sw.js and version.json
const swPath = 'public_html/sw.js';
const versionJsonPath = 'public_html/version.json';

assert(fs.existsSync(swPath), 'public_html/sw.js must exist');
const swContent = fs.readFileSync(swPath, 'utf8');
const versionMatch = swContent.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
const expectedSwVersion = versionMatch ? versionMatch[1] : null;

assert(expectedSwVersion === 'paddlesafe-v52', `sw.js version must be paddlesafe-v52, got: ${expectedSwVersion}`);

if (fs.existsSync(versionJsonPath)) {
    let vJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    if (vJson.hash !== expectedSwVersion) {
        const oldHash = vJson.hash;
        vJson.hash = expectedSwVersion;
        fs.writeFileSync(versionJsonPath, JSON.stringify(vJson, null, 2) + '\n', 'utf8');
        autoFixesApplied.push(`Synchronized version.json hash from '${oldHash}' to '${expectedSwVersion}'`);
    }
    vJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    assert(vJson.hash === expectedSwVersion, 'version.json hash must match sw.js VERSION');
}

// ------------------------------------------------------------------------------
// TASK 2: DOM & WINDOW BINDING AUDIT
// ------------------------------------------------------------------------------
console.log('--- [TASK 2] DOM & Window Binding Audit ---');

const indexPath = 'public_html/index.html';
assert(fs.existsSync(indexPath), 'public_html/index.html must exist');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// 2.1 Critical v2 DOM IDs
const criticalDomIds = [
    'savedSpotsBar',
    'savedSpotsList',
    'btnToggleSaveSpot',
    'btnCompararMisSpots',
    'spotsComparisonPanel',
    'userGearSelector',
    'fullDaySpotTimeline',
    'spotBestWindowBanner',
    'spotHourlyMatrix',
    'btnIdaYVueltaMultipunto',
    'btnDescargarMapaOffline',
    'quedadaMeteoPreview',
    'spotLiveReportsContainer',
    'mapWindWaveHud',
    'proBiometricsBar',
    'posterFinisherLightbox',
    'profileWeeklyChart',
    'rankingScopeTabs',
    'rankingCategoryTabs',
    'rankingPodioContainer',
    'rankingMiPosicionBar',
    'rankingClubChallengeBanner',
    'clubChallengesContainer'
];

for (const domId of criticalDomIds) {
    const idRegex = new RegExp(`id\\s*=\\s*["']${domId}["']`);
    if (!idRegex.test(indexHtml)) {
        // Autofix if missing
        if (domId === 'btnIdaYVueltaMultipunto') {
            indexHtml = indexHtml.replace('onclick="cerrarIdaYVueltaMultipunto()"', 'id="btnIdaYVueltaMultipunto" onclick="cerrarIdaYVueltaMultipunto()"');
            fs.writeFileSync(indexPath, indexHtml, 'utf8');
            autoFixesApplied.push(`Injected missing id='btnIdaYVueltaMultipunto' into index.html`);
        }
    }
    assert(new RegExp(`id\\s*=\\s*["']${domId}["']`).test(indexHtml), `Critical DOM element #${domId} must exist in index.html`);
}

// 2.2 Inline handlers check and window export verification
const handlerRegex = /(?:onclick|onchange)=["']([^"']+)["']/g;
const inlineFunctions = new Set();
let hMatch;
while ((hMatch = handlerRegex.exec(indexHtml)) !== null) {
    const fnCalls = hMatch[1].matchAll(/([a-zA-Z0-9_$]+)\s*\(/g);
    for (const fc of fnCalls) {
        const fnName = fc[1];
        if (!['confirm', 'alert', 'prompt', 'if', 'for', 'switch', 'parseInt', 'parseFloat', 'Boolean', 'Number', 'String', 'getElementById', 'remove', 'add', 'toggle', 'replace'].includes(fnName)) {
            inlineFunctions.add(fnName);
        }
    }
}

// Read all public_html/js files including subdirectories
const allFrontendJs = getAllFiles('public_html/js');
const jsCodeMap = {};
for (const f of allFrontendJs) {
    jsCodeMap[f] = fs.readFileSync(f, 'utf8');
}

for (const fn of inlineFunctions) {
    let bound = false;
    for (const f of allFrontendJs) {
        if (new RegExp(`(?:window|globalThis)\\.${fn}\\s*=`).test(jsCodeMap[f])) {
            bound = true;
            break;
        }
    }

    if (!bound) {
        // Attempt autofix by attaching to social.js or main.js if declared
        if (fn === 'cambiarFiltro') {
            const socialFile = 'public_html/js/social.js';
            let sCode = fs.readFileSync(socialFile, 'utf8');
            sCode += `\nwindow.cambiarFiltro = (filtro) => window.socialFeed ? window.socialFeed.cambiarFiltro(filtro) : null;\n`;
            fs.writeFileSync(socialFile, sCode, 'utf8');
            jsCodeMap[socialFile] = sCode;
            bound = true;
            autoFixesApplied.push(`Exported missing window.cambiarFiltro in social.js`);
        }
    }
    assert(bound, `Inline handler function '${fn}' must be explicitly bound to window`);
}

// ------------------------------------------------------------------------------
// TASK 3: ENGINE & MATH RUNTIME TESTS
// ------------------------------------------------------------------------------
console.log('--- [TASK 3] Engine & Math Runtime Tests ---');

// 3.1 Coastal orientation & drift modifier
const coastalMod = await import(pathToFileURL(path.resolve('public_html/js/engine/coastal.js')).href);
const { resolverOrientacionCostera, calcularIndiceDerivaPaddleSafe } = coastalMod;

const deniaSeaward = Number(resolverOrientacionCostera('Denia', 38.84, 0.11));
const granadellaSeaward = Number(resolverOrientacionCostera('Granadella', 38.72, 0.16));

assert(Math.abs(deniaSeaward - 45) <= 5, `Denia seaward heading should be ~45°, got: ${deniaSeaward}`);
assert(Math.abs(granadellaSeaward - 160) <= 5, `Granadella seaward heading should be ~160°, got: ${granadellaSeaward}`);

const driftHigh = calcularIndiceDerivaPaddleSafe({ vientoKt: 14, rachasKt: 18, oleajeM: 0.6, componente: 'offshore', esCosta: true, driftMod: 1.2 });
const driftLow = calcularIndiceDerivaPaddleSafe({ vientoKt: 14, rachasKt: 18, oleajeM: 0.6, componente: 'offshore', esCosta: true, driftMod: 0.95 });

assert(driftHigh > driftLow || driftHigh.score > driftLow.score, `Drift score with driftMod 1.2 (${driftHigh.score}) must exceed driftMod 0.95 (${driftLow.score})`);

// 3.2 Verdict & Thermal / Swell period tests
const verdictMod = await import(pathToFileURL(path.resolve('public_html/js/engine/verdict.js')).href);
const windowsMod = await import(pathToFileURL(path.resolve('public_html/js/engine/windows.js')).href);
const { generarVeredictoNextGen } = verdictMod;
const { detectarVentanasOptimas } = windowsMod;

const verdictShortWave = generarVeredictoNextGen({ vientoKt: 8, oleajeM: 0.6, periodoOla: 4 });
const verdictLongSwell = generarVeredictoNextGen({ vientoKt: 8, oleajeM: 0.6, periodoOla: 10 });

assert(verdictShortWave.score < verdictLongSwell.score, `Short wave period (4s, score ${verdictShortWave.score}) must yield lower score than long swell (10s, score ${verdictLongSwell.score})`);

const mockHourlySurge = [
    { hora: '10:00', vientoKt: 6, rachasKt: 8 },
    { hora: '11:00', vientoKt: 9, rachasKt: 11 },
    { hora: '12:00', vientoKt: 15, rachasKt: 19 }
];
const verdictSurge = generarVeredictoNextGen({ vientoKt: 6, horaSalida: '10:00', hourly: mockHourlySurge });
assert(verdictSurge.evolucionProxima && verdictSurge.evolucionProxima.detectada === true, `Evolución próxima alert must be triggered on +9 kt jump in 2h`);

const sampleHoras = [
    { hora: '08:00', vientoKt: 5, rachasKt: 7, oleajeM: 0.2 },
    { hora: '09:00', vientoKt: 6, rachasKt: 8, oleajeM: 0.2 },
    { hora: '10:00', vientoKt: 7, rachasKt: 9, oleajeM: 0.3 },
    { hora: '11:00', vientoKt: 14, rachasKt: 18, oleajeM: 0.6 }
];
const ventanasResult = detectarVentanasOptimas(sampleHoras, 'Intermedio');
assert(ventanasResult.hayVentana === true && ventanasResult.mejorVentana !== null, `detectarVentanasOptimas must return valid best window`);
assert(ventanasResult.mejorVentana.inicio === '08:00', `Best window should start at 08:00`);

// 3.3 GPX roundtrip test
const gpxMod = await import(pathToFileURL(path.resolve('public_html/js/gpxParser.js')).href);
const { generarGPX, parseGPX } = gpxMod;

const testGpxXml = generarGPX([{ lat: 38.80, lon: 0.18 }, { lat: 38.82, lon: 0.20 }], { name: 'Test Route' });
const parsedGpx = parseGPX(testGpxXml);

assert(parsedGpx.coordinates.length === 2, `GPX parsed coordinates length must be 2, got: ${parsedGpx.coordinates.length}`);
assert(parsedGpx.distance_km > 2.0, `GPX distance_km must exceed 2.0, got: ${parsedGpx.distance_km}`);

// 3.4 Solar & Biometrics tests
const utilsMod = await import(pathToFileURL(path.resolve('public_html/js/utils.js')).href);
const { calcularSolYCrepusculo } = utilsMod;

const solarRes = calcularSolYCrepusculo(38.80, 0.18, '2026-10-17');
assert(typeof solarRes.sunriseStr === 'string' && solarRes.sunriseStr.includes(':'), `Valid sunriseStr string`);
assert(typeof solarRes.sunsetStr === 'string' && solarRes.sunsetStr.includes(':'), `Valid sunsetStr string`);
assert(typeof solarRes.civilDuskStr === 'string' && solarRes.civilDuskStr.includes(':'), `Valid civilDuskStr string`);
assert(solarRes.sunriseMin < solarRes.sunsetMin && solarRes.sunsetMin < solarRes.duskMin, `Chronological order: sunriseMin (${solarRes.sunriseMin}) < sunsetMin (${solarRes.sunsetMin}) < duskMin (${solarRes.duskMin})`);

const mapMod = await import(pathToFileURL(path.resolve('public_html/js/map.js')).href);
const { calcularBiometriaSup } = mapMod;

const bioRes = calcularBiometriaSup({
    duracionMin: 90,
    distKm: 7,
    velKmh: 4.7,
    vientoKt: 13,
    olasM: 0.5,
    periodoS: 4,
    tempC: 25,
    tipoTabla: 'inflat_allround'
});

assert(bioRes.kcal > 400, `Biometrics kcal must be > 400, got: ${bioRes.kcal}`);
const hidrMl = bioRes.hidratacionMl !== undefined ? bioRes.hidratacionMl : bioRes.mlTotal;
assert(hidrMl >= 800, `Biometrics hidratacionMl must be >= 800, got: ${hidrMl}`);

// 3.5 Personal Records (PRs) & ISA Merit Badges Engine (Batch #10)
const gamifMod = await import(pathToFileURL(path.resolve('public_html/js/gamification.js')).href);
const { calcularRecordsYEstadisticasPerfil, evaluarLogrosUsuario, CATALOGO_LOGROS_MERITO } = gamifMod;

assert(Array.isArray(CATALOGO_LOGROS_MERITO) && CATALOGO_LOGROS_MERITO.length >= 8, 'CATALOGO_LOGROS_MERITO must have at least 8 merit badges');

// Test 1: Empty routes handling
const emptyStats = calcularRecordsYEstadisticasPerfil([]);
assert(emptyStats.recordDistancia.distKm === 0, 'Empty routes should have 0 distance PR');
assert(emptyStats.totales.totalSalidas === 0, 'Empty routes should have 0 total salidas');
assert(Array.isArray(emptyStats.totales.volumen8Semanas) && emptyStats.totales.volumen8Semanas.length === 8, 'Must return 8 weeks volume array');

// Test 2: 30.5 km epic route and 4.2 km speed route
const mockRoutes = [
    {
        id: 'route-epic-30k',
        title: 'Travesía Épica Costa Blanca',
        distance_km: 30.5,
        duration_seconds: 18000, // 5 hours
        avg_speed: 6.1,
        created_at: new Date().toISOString()
    },
    {
        id: 'route-speed-4k',
        title: 'Series Rápidas 4K',
        distance_km: 4.2,
        duration_seconds: 2700, // 45 min
        avg_speed: 5.6,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    }
];

const stats = calcularRecordsYEstadisticasPerfil(mockRoutes);
assert(stats.recordDistancia.distKm === 30.5, `Max distance PR must be 30.5 km, got: ${stats.recordDistancia.distKm}`);
assert(stats.recordVelocidad.velMedia === 6.1, `Max speed PR must be 6.1 km/h, got: ${stats.recordVelocidad.velMedia}`);
assert(stats.totales.totalSalidas === 2, `Total salidas must be 2, got: ${stats.totales.totalSalidas}`);
assert(stats.totales.kmTotales >= 34.7, `Total km must be >= 34.7 km, got: ${stats.totales.kmTotales}`);

const mockPerfil = { id: 'test-user-1', nombre: 'Test Paddler', insignias: [] };
const logros = evaluarLogrosUsuario(mockPerfil, stats, mockRoutes);

const badgeBautismo = logros.find(l => l.id === 'bautismo_mar');
const badge10k = logros.find(l => l.id === 'costero_10k');
const badge25k = logros.find(l => l.id === 'ultramaraton_25k');
const badgeQuilla = logros.find(l => l.id === 'quilla_veloz');

assert(badgeBautismo && badgeBautismo.unlocked === true, 'bautismo_mar badge must be unlocked with >= 1 outing');
assert(badge10k && badge10k.unlocked === true, 'costero_10k badge must be unlocked with 30.5 km route');
assert(badge25k && badge25k.unlocked === true, 'ultramaraton_25k badge must be unlocked with 30.5 km route');
assert(badgeQuilla && badgeQuilla.unlocked === true, 'quilla_veloz badge must be unlocked with 5.6 km/h on 4.2 km route');

// 3.6 Multi-Category Ranking Engine & Anti-Cheat Filter (Batch #11)
const { calcularDatosRankingMulticategoria } = gamifMod;
assert(typeof calcularDatosRankingMulticategoria === 'function', 'calcularDatosRankingMulticategoria must be exported by gamification.js');

// Test 1: km_total aggregation across routes
const testRutasKm = [
    { id: 'r1', user_id: 'u1', distance_km: 10.0, avg_speed: 5.0, created_at: new Date().toISOString() },
    { id: 'r2', user_id: 'u1', distance_km: 15.5, avg_speed: 5.2, created_at: new Date().toISOString() },
    { id: 'r3', user_id: 'u2', distance_km: 8.0, avg_speed: 4.8, created_at: new Date().toISOString() }
];
const testPerfiles = [
    { id: 'u1', nombre: 'Paddler Alfa', nivel: 4 },
    { id: 'u2', nombre: 'Paddler Beta', nivel: 2 }
];

const resKm = calcularDatosRankingMulticategoria({
    periodo: 'historico',
    scope: 'global',
    category: 'km_total',
    rutasData: testRutasKm,
    perfilesData: testPerfiles,
    currentUserId: 'u2'
});
assert(resKm.ranking[0].id === 'u1', 'User u1 should lead with 25.5 km');
assert(resKm.ranking[0].metric === 25.5, `User u1 metric must be 25.5, got: ${resKm.ranking[0].metric}`);
assert(resKm.currentUserRank && resKm.currentUserRank.rank === 2, 'CurrentUser u2 must be rank #2');
assert(resKm.currentUserRank.gapMessage.includes('17.5 km'), `Gap message should mention 17.5 km, got: ${resKm.currentUserRank.gapMessage}`);

// Test 2: max_route selection
const resMax = calcularDatosRankingMulticategoria({
    periodo: 'historico',
    scope: 'global',
    category: 'max_route',
    rutasData: testRutasKm,
    perfilesData: testPerfiles
});
assert(resMax.ranking[0].id === 'u1' && resMax.ranking[0].metric === 15.5, `Max route must be 15.5 km, got: ${resMax.ranking[0].metric}`);

// Test 3: best_speed Anti-Cheat Filter (must reject <2km and >16km/h)
const testRutasSpeed = [
    // Cheat 1: Distance < 2.0 km (e.g. 1.2 km at 8.5 km/h) -> REJECTED
    { id: 'r-cheat-short', user_id: 'u-cheat', distance_km: 1.2, avg_speed: 8.5, created_at: new Date().toISOString() },
    // Cheat 2: Speed > 16.0 km/h (e.g. 5.0 km at 24.0 km/h, car/glitch) -> REJECTED
    { id: 'r-cheat-fast', user_id: 'u-cheat', distance_km: 5.0, avg_speed: 24.0, created_at: new Date().toISOString() },
    // Valid route for legit user: 4.5 km at 6.2 km/h -> ACCEPTED
    { id: 'r-legit', user_id: 'u-legit', distance_km: 4.5, avg_speed: 6.2, created_at: new Date().toISOString() }
];
const testPerfilesSpeed = [
    { id: 'u-cheat', nombre: 'Cheater User', nivel: 1 },
    { id: 'u-legit', nombre: 'Legit Paddler', nivel: 3 }
];

const resSpeed = calcularDatosRankingMulticategoria({
    periodo: 'historico',
    scope: 'global',
    category: 'best_speed',
    rutasData: testRutasSpeed,
    perfilesData: testPerfilesSpeed
});
assert(resSpeed.ranking[0].id === 'u-legit', `Legit user should lead best_speed ranking, got: ${resSpeed.ranking[0]?.id}`);
assert(resSpeed.ranking[0].metric === 6.2, `Legit speed must be 6.2 km/h, got: ${resSpeed.ranking[0]?.metric}`);
const cheaterInRanking = resSpeed.ranking.find(r => r.id === 'u-cheat');
assert(!cheaterInRanking || cheaterInRanking.metric === 0, 'Cheater routes must be blocked by anti-cheat filter');

// Test 4: liga_clubes aggregation
const testClubs = [
    { id: 'club-1', nombre: 'Club del Mar', logo_url: 'logo1.jpg' },
    { id: 'club-2', nombre: 'Bahía SUP', logo_url: 'logo2.jpg' }
];
const testMemberships = [
    { club_id: 'club-1', user_id: 'u1' },
    { club_id: 'club-2', user_id: 'u2' }
];
const resClubs = calcularDatosRankingMulticategoria({
    periodo: 'historico',
    scope: 'liga_clubes',
    category: 'km_total',
    rutasData: testRutasKm,
    clubsData: testClubs,
    membershipsData: testMemberships
});
assert(resClubs.ranking.length === 2, 'Should have 2 clubs in ranking');
assert(resClubs.ranking[0].id === 'club-1', 'Club del Mar should lead with u1 routes');
assert(resClubs.ranking[0].km_total === 25.5, `Club 1 km_total must be 25.5, got: ${resClubs.ranking[0].km_total}`);
assert(resClubs.ranking[1].km_total === 8.0, `Club 2 km_total must be 8.0, got: ${resClubs.ranking[1].km_total}`);

// 3.7 Club Monthly Challenges Engine (Batch #12)
const { PLANTILLAS_RETOS_CLUB, calcularProgresoRetoClub } = gamifMod;
assert(typeof PLANTILLAS_RETOS_CLUB === 'object', 'PLANTILLAS_RETOS_CLUB must be an object');
assert(Object.keys(PLANTILLAS_RETOS_CLUB).length === 4, `PLANTILLAS_RETOS_CLUB must define 4 presets, got: ${Object.keys(PLANTILLAS_RETOS_CLUB).length}`);

// Test 1: colectivo_km
const retoColectivo = {
    id: 'reto-col-1',
    tipo: 'colectivo_km',
    meta_valor: 100,
    xp_recompensa: 250
};
const rutasColectivo = [
    { user_id: 'm1', distance_km: 40 },
    { user_id: 'm2', distance_km: 60 }
];
const resColectivo = calcularProgresoRetoClub(retoColectivo, rutasColectivo, ['m1']);
assert(resColectivo.progresoTotal === 100, `Colectivo total must be 100 km, got: ${resColectivo.progresoTotal}`);
assert(resColectivo.porcentaje === 100, `Colectivo percentage must be 100%, got: ${resColectivo.porcentaje}`);
assert(resColectivo.isCompletado === true, 'Colectivo challenge must be marked completed');
assert(resColectivo.miProgreso?.valor === 40, `Member m1 contribution must be 40 km, got: ${resColectivo.miProgreso?.valor}`);

// Test 2: individual_km
const retoIndKm = {
    id: 'reto-ind-1',
    tipo: 'individual_km',
    meta_valor: 50,
    xp_recompensa: 200
};
const rutasIndKm = [
    { user_id: 'm1', distance_km: 30 },
    { user_id: 'm2', distance_km: 55 }
];
const resIndM1 = calcularProgresoRetoClub(retoIndKm, rutasIndKm, ['m1', 'm2'], 'm1');
assert(resIndM1.miProgreso?.valor === 30, 'm1 progress must be 30 km');
assert(resIndM1.porcentaje === 60, `m1 percentage must be 60%, got: ${resIndM1.porcentaje}`);
assert(resIndM1.miProgreso?.isFinisher === false, 'm1 should not be finisher yet');

const resIndM2 = calcularProgresoRetoClub(retoIndKm, rutasIndKm, ['m1', 'm2'], 'm2');
assert(resIndM2.miProgreso?.valor === 55, 'm2 progress must be 55 km');
assert(resIndM2.porcentaje === 100, 'm2 percentage must cap at 100%');
assert(resIndM2.miProgreso?.isFinisher === true, 'm2 must be marked finisher');

// Test 3: individual_salidas
const retoIndSalidas = {
    id: 'reto-sal-1',
    tipo: 'individual_salidas',
    meta_valor: 10,
    xp_recompensa: 150
};
const rutasIndSalidas = [
    ...Array(12).fill({ user_id: 'm1', distance_km: 2 }),
    ...Array(5).fill({ user_id: 'm2', distance_km: 3 })
];
const resSalM1 = calcularProgresoRetoClub(retoIndSalidas, rutasIndSalidas, ['m1', 'm2'], 'm1');
assert(resSalM1.miProgreso?.valor === 12, 'm1 sorties must be 12');
assert(resSalM1.miProgreso?.isFinisher === true, 'm1 must be finisher on sorties');
const resSalM2 = calcularProgresoRetoClub(retoIndSalidas, rutasIndSalidas, ['m1', 'm2'], 'm2');
assert(resSalM2.miProgreso?.valor === 5, 'm2 sorties must be 5');
assert(resSalM2.miProgreso?.isFinisher === false, 'm2 should not be finisher on sorties');

// Test 4: mejor_ritmo with anti-cheat filters (dist >= 3km, speed <= 16km/h)
const retoRitmo = {
    id: 'reto-spd-1',
    tipo: 'mejor_ritmo',
    meta_valor: 6.0,
    xp_recompensa: 300
};
const rutasRitmo = [
    { user_id: 'm1', distance_km: 5.0, avg_speed: 6.2 }, // Legit
    { user_id: 'm2', distance_km: 1.0, avg_speed: 10.0 }, // Rejected (too short)
    { user_id: 'm3', distance_km: 5.0, avg_speed: 25.0 }  // Rejected (vehicle speed)
];
const resRitmo = calcularProgresoRetoClub(retoRitmo, rutasRitmo, ['m1', 'm2', 'm3'], 'm1');
assert(resRitmo.participantes[0]?.userId === 'm1', 'm1 must be leader in mejor_ritmo');
assert(resRitmo.participantes[0]?.valor === 6.2, `m1 speed must be 6.2, got: ${resRitmo.participantes[0]?.valor}`);
const m2Entry = resRitmo.participantes.find(p => p.userId === 'm2');
const m3Entry = resRitmo.participantes.find(p => p.userId === 'm3');
assert(m2Entry?.valor === 0, 'Short sprint route (<3km) must be filtered out for mejor_ritmo');
assert(m3Entry?.valor === 0, 'High-speed route (>16km/h) must be filtered out by anti-cheat');

// ------------------------------------------------------------------------------
// TASK 4: BACKEND & SQL AUDIT
// ------------------------------------------------------------------------------
console.log('--- [TASK 4] Backend & SQL Audit ---');

// 4.1 Backend rate limiter check
const backendApiPath = 'paddlesafe-backend-main/api/backend.js';
assert(fs.existsSync(backendApiPath), `${backendApiPath} must exist`);
const backendApiContent = fs.readFileSync(backendApiPath, 'utf8');
assert(backendApiContent.includes('rateLimitMap') && backendApiContent.includes('RATE_LIMIT_WINDOW_MS'), 'backend.js must implement rate limiting with window and map');

// 4.2 Forecast requests wind_gusts_10m and wave_period
const forecastPath = 'paddlesafe-backend-main/forecast.js';
assert(fs.existsSync(forecastPath), `${forecastPath} must exist`);
const forecastContent = fs.readFileSync(forecastPath, 'utf8');
assert(forecastContent.includes('wind_gusts_10m'), 'forecast.js must request wind_gusts_10m');
assert(forecastContent.includes('wave_period'), 'forecast.js must request wave_period');

// 4.3 Coach & route_coach target gemini-2.5-flash
const coachPath = 'paddlesafe-backend-main/lib/handlers/coach.js';
const routeCoachPath = 'paddlesafe-backend-main/lib/handlers/route_coach.js';
assert(fs.existsSync(coachPath), `${coachPath} must exist`);
assert(fs.existsSync(routeCoachPath), `${routeCoachPath} must exist`);

const coachContent = fs.readFileSync(coachPath, 'utf8');
const routeCoachContent = fs.readFileSync(routeCoachPath, 'utf8');

assert(coachContent.includes('gemini-2.5-flash'), 'coach.js must target gemini-2.5-flash');
assert(routeCoachContent.includes('gemini-2.5-flash'), 'route_coach.js must target gemini-2.5-flash');

// 4.4 SQL Master Rollout Check
const sqlRootPath = 'patch_MASTER_v2_rollout.sql';
const sqlBackendPath = 'paddlesafe-backend-main/sql/patch_MASTER_v2_rollout.sql';

assert(fs.existsSync(sqlRootPath), `${sqlRootPath} must exist in root`);
assert(fs.existsSync(sqlBackendPath), `${sqlBackendPath} must exist in paddlesafe-backend-main/sql/`);

const sqlContentRoot = fs.readFileSync(sqlRootPath, 'utf8');
const sqlContentBackend = fs.readFileSync(sqlBackendPath, 'utf8');

const topBeginRoot = (sqlContentRoot.match(/^\s*BEGIN\s*;/gm) || []).length;
const topCommitRoot = (sqlContentRoot.match(/^\s*COMMIT\s*;/gm) || []).length;
assert(topBeginRoot === 1 && topCommitRoot === 1, 'patch_MASTER_v2_rollout.sql in root must contain balanced BEGIN; and COMMIT;');

assert(sqlContentRoot.includes('trg_actualizar_gamificacion_desde_rutas'), 'SQL must define trg_actualizar_gamificacion_desde_rutas');
assert(sqlContentRoot.includes('user_spots'), 'SQL must define public.user_spots');
assert(sqlContentRoot.includes('spot_reports'), 'SQL must define public.spot_reports');
assert(sqlContentRoot.includes('club_retos'), 'SQL must define public.club_retos');
assert(sqlContentRoot.includes('club_retos_participantes'), 'SQL must define public.club_retos_participantes');

assert(sqlContentBackend.includes('trg_actualizar_gamificacion_desde_rutas'), 'Backend SQL must define trg_actualizar_gamificacion_desde_rutas');
assert(sqlContentBackend.includes('user_spots'), 'Backend SQL must define public.user_spots');
assert(sqlContentBackend.includes('spot_reports'), 'Backend SQL must define public.spot_reports');
assert(sqlContentBackend.includes('club_retos'), 'Backend SQL must define public.club_retos');
assert(sqlContentBackend.includes('club_retos_participantes'), 'Backend SQL must define public.club_retos_participantes');

// ------------------------------------------------------------------------------
// FINAL RESULT SUMMARY
// ------------------------------------------------------------------------------
const summary = {
    TESTS_RUN: testsRun,
    PASS_COUNT: passCount,
    AUTO_FIXES_APPLIED: autoFixesApplied,
    GIT_READY_STATUS: (testsRun === passCount && testsRun > 0)
};

console.log('\n=== SMOKE TEST SUITE COMPLETED ===');
console.log(JSON.stringify(summary, null, 2));
