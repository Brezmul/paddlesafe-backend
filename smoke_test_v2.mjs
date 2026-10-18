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

assert(expectedSwVersion === 'paddlesafe-v64', `sw.js version must be paddlesafe-v64, got: ${expectedSwVersion}`);

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

// 1.3 Design System 3.0 & 4.0 CSS tokens in compiled tailwind.min.css
const tailwindCssPath = 'public_html/css/tailwind.min.css';
assert(fs.existsSync(tailwindCssPath), 'public_html/css/tailwind.min.css must exist');
const tailwindCss = fs.readFileSync(tailwindCssPath, 'utf8');
assert(tailwindCss.includes('.ps-bento-card'), '.ps-bento-card must exist in compiled tailwind.min.css');
assert(tailwindCss.includes('.ps-tabular'), '.ps-tabular must exist in compiled tailwind.min.css');
assert(tailwindCss.includes('.ps-glass-glow-emerald'), '.ps-glass-glow-emerald must exist in compiled tailwind.min.css');
assert(tailwindCss.includes('.ps-glass-glow-amber'), '.ps-glass-glow-amber must exist in compiled tailwind.min.css');
assert(tailwindCss.includes('.ps-glass-glow-rose'), '.ps-glass-glow-rose must exist in compiled tailwind.min.css');
assert(tailwindCss.includes('.ps-shimmer'), '.ps-shimmer must exist in compiled tailwind.min.css');
assert(tailwindCss.includes('.ps-modal-backdrop'), '.ps-modal-backdrop must exist in compiled tailwind.min.css');
assert(tailwindCss.includes('.ps-pill-tab'), '.ps-pill-tab must exist in compiled tailwind.min.css');

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
    'proRouteWindChart',
    'mobileBottomNav',
    'spotIntelligenceBento',
    'spotSmartMatchBanner',
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

// 2.3 Mobile Bottom Dock and Navigation Active Item Verification
const mainJsCode = fs.readFileSync('public_html/js/main.js', 'utf8');
assert(mainJsCode.includes('activarItemBottomNav') && (mainJsCode.includes('window.activarItemBottomNav') || indexHtml.includes('window.activarItemBottomNav')), 'window.activarItemBottomNav must exist');
assert(indexHtml.includes('id="mobileBottomNav"'), '#mobileBottomNav element must exist in index.html');
assert(indexHtml.includes('nav-indicator'), '#mobileBottomNav buttons must include nav-indicator');
assert(indexHtml.includes('ps-modal-backdrop'), 'Modals must use ps-modal-backdrop');
assert(indexHtml.includes('ps-modal-close-btn'), 'Modals must use ps-modal-close-btn');

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

// 3.4b Design System 3.0 Interactive Route Profile SVG Chart
const { generarGraficoSvgPerfilRuta } = mapMod;
assert(typeof generarGraficoSvgPerfilRuta === 'function', 'generarGraficoSvgPerfilRuta must be exported from map.js');
const mockChartTramos = [
    { nombre: 'TRAMO A ➔ B', distancia_km: 2.5, rumbo: 45, viento_relativo: 'VIENTO A FAVOR', modVelocidad: 0.8, minutos: 28, eta_hora: '10:28', viento_kt: 8.5, viento_dir: 45 },
    { nombre: 'TRAMO B ➔ C', distancia_km: 3.2, rumbo: 135, viento_relativo: 'VIENTO EN CONTRA', modVelocidad: -1.2, minutos: 46, eta_hora: '11:14', viento_kt: 12.0, viento_dir: 130 }
];
const svgChart = generarGraficoSvgPerfilRuta(mockChartTramos, 5700);
assert(typeof svgChart === 'string' && svgChart.includes('<svg') && svgChart.includes('</svg>'), '#proRouteWindChart must receive valid <svg> markup when route segments exist');
assert(svgChart.includes('ps-tabular'), 'Route SVG chart must include ps-tabular classes');
assert(svgChart.includes('centrarTramoMapa'), 'Route SVG chart must include centrarTramoMapa waypoint handlers');

// 3.4c Spot Intelligence, Smart Match Engine & Conditions Logbook (Batch #17)
const { generarPerfilTacticoSpot, anguloACardinal } = coastalMod;
assert(typeof generarPerfilTacticoSpot === 'function', 'generarPerfilTacticoSpot must be exported from coastal.js');
assert(typeof anguloACardinal === 'function', 'anguloACardinal must be exported from coastal.js');

// Test 1: Tactical profile for Dénia coast
const deniaTactical = generarPerfilTacticoSpot('Dénia', 38.83, 0.145, 80);
assert(deniaTactical.esCosta === true, 'Dénia profile should be coastal');
assert(Array.isArray(deniaTactical.rumboAbrigo.rango) && deniaTactical.rumboAbrigo.rango.length === 2, 'rumboAbrigo must have 2-element range');
assert(Array.isArray(deniaTactical.rumboCross.cardinales) && deniaTactical.rumboCross.cardinales.length === 2, 'rumboCross must have 2 cardinals');
assert(deniaTactical.rumboCritico && deniaTactical.rumboCritico.onshore && deniaTactical.rumboCritico.offshoreDrift, 'rumboCritico must define onshore and offshoreDrift');

// Test 2: Smart Match & Historical Activity Analysis
const {
    analizarHistorialYSmartMatchSpot,
    calcularSesgoTermicoSpot,
    guardarEntradaBitacoraSpot,
    guardarNotasTacticasSpot
} = mapMod;

assert(typeof analizarHistorialYSmartMatchSpot === 'function', 'analizarHistorialYSmartMatchSpot must be exported from map.js');
assert(typeof calcularSesgoTermicoSpot === 'function', 'calcularSesgoTermicoSpot must be exported from map.js');
assert(typeof guardarEntradaBitacoraSpot === 'function', 'guardarEntradaBitacoraSpot must be exported from map.js');
assert(typeof guardarNotasTacticasSpot === 'function', 'guardarNotasTacticasSpot must be exported from map.js');

const mockHistoricalSpotRoutes = [
    { id: 'r-spot-1', nombre: 'Paseo Las Rotas Dénia', lat: 38.83, lon: 0.145, distancia_km: 6.2, velocidad_media_kmh: 5.1, meteo_viento_kt: 9, meteo_olas_m: 0.4 },
    { id: 'r-spot-2', nombre: 'Dénia Port Entreno', lat: 38.84, lon: 0.140, distancia_km: 8.5, velocidad_media_kmh: 5.8, meteo_viento_kt: 15, meteo_olas_m: 0.8 }
];

const intelAnalysis = analizarHistorialYSmartMatchSpot(38.83, 0.145, 'Dénia', { vientoKt: 10, olasM: 0.5 }, mockHistoricalSpotRoutes);
assert(intelAnalysis.totalSesionesSpot === 2, `Should match 2 sessions for Dénia, got: ${intelAnalysis.totalSesionesSpot}`);
assert(intelAnalysis.totalKmSpot >= 14.7, `Total km in spot must be >= 14.7 km, got: ${intelAnalysis.totalKmSpot}`);
assert(intelAnalysis.mejorRitmoKmh === 5.8, `Best rhythm must be 5.8 km/h, got: ${intelAnalysis.mejorRitmoKmh}`);
assert(intelAnalysis.smartMatch && intelAnalysis.smartMatch.rutaId === 'r-spot-1', `SmartMatch should identify r-spot-1 as closest weather match, got: ${intelAnalysis.smartMatch?.rutaId}`);

// Test 3: Thermal Bias Detection
const mockLogEntries = [
    { spot_nombre: 'Dénia', viento_real_bias: 'mas_viento', rating: 5 },
    { spot_nombre: 'Dénia', viento_real_bias: 'mas_viento', rating: 4 },
    { spot_nombre: 'Dénia', viento_real_bias: 'exacto', rating: 4 }
];
const sesgo = calcularSesgoTermicoSpot('Dénia', 38.83, 0.145, mockLogEntries);
assert(sesgo.hasThermalBias === true, 'Should detect thermal bias when >= 2 entries report mas_viento');
assert(sesgo.masVientoCount === 2, `masVientoCount must be 2, got: ${sesgo.masVientoCount}`);
assert(typeof sesgo.msg === 'string' && sesgo.msg.includes('Inteligencia Local'), 'Thermal bias should provide informative message');

// Test 4: Dynamic Bento Glow Application (Batch #18 Design System 4.0)
const { aplicarGlowVerdictBento } = mapMod;
assert(typeof aplicarGlowVerdictBento === 'function', 'aplicarGlowVerdictBento must be exported from map.js');

const mockBento = {
    classList: {
        classes: new Set(),
        add(...c) { c.forEach(x => this.classes.add(x)); },
        remove(...c) { c.forEach(x => this.classes.delete(x)); },
        contains(c) { return this.classes.has(c); }
    }
};

aplicarGlowVerdictBento(mockBento, 85);
assert(mockBento.classList.contains('ps-glass-glow-emerald'), 'Score 85 must apply ps-glass-glow-emerald');
aplicarGlowVerdictBento(mockBento, 65);
assert(mockBento.classList.contains('ps-glass-glow-amber'), 'Score 65 must apply ps-glass-glow-amber');
assert(!mockBento.classList.contains('ps-glass-glow-emerald'), 'Must clear previous glow class');
aplicarGlowVerdictBento(mockBento, 40);
assert(mockBento.classList.contains('ps-glass-glow-rose'), 'Score 40 must apply ps-glass-glow-rose');

// 3.4d Strangler Fig Map Modularization (Phase 1: map.state.js, map.poster.js, map.coach.js)
const mapStateMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.state.js')).href);
const mapPosterMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.poster.js')).href);
const mapCoachMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.coach.js')).href);

assert(typeof mapStateMod.mapRuntime === 'object' && mapStateMod.mapRuntime !== null, 'map.state.js must export mapRuntime');
assert(typeof mapStateMod.resetTrackingRuntime === 'function', 'map.state.js must export resetTrackingRuntime');
assert(typeof mapPosterMod.estamparPosterFinisherCanvas === 'function', 'map.poster.js must export estamparPosterFinisherCanvas');
assert(typeof mapPosterMod.formatearDuracionPoster === 'function', 'map.poster.js must export formatearDuracionPoster');
assert(typeof mapCoachMod.solicitarCoachIAPro === 'function', 'map.coach.js must export solicitarCoachIAPro');
assert(typeof mapCoachMod.solicitarCoachIABasico === 'function', 'map.coach.js must export solicitarCoachIABasico');
assert(typeof mapCoachMod.renderizarCoachProCard === 'function', 'map.coach.js must export renderizarCoachProCard');
assert(typeof mapCoachMod.renderizarCoachProFallbackLocal === 'function', 'map.coach.js must export renderizarCoachProFallbackLocal');
assert(typeof mapCoachMod.solicitarAnalisisIARutaDeportiva === 'function', 'map.coach.js must export solicitarAnalisisIARutaDeportiva');
assert(typeof mapCoachMod.normalizarUnidadesCoach === 'function', 'map.coach.js must export normalizarUnidadesCoach');

// Test re-exports from Facade map.js
assert(typeof mapMod.mapRuntime === 'object', 'map.js must re-export mapRuntime');
assert(typeof mapMod.estamparPosterFinisherCanvas === 'function', 'map.js must re-export estamparPosterFinisherCanvas');
assert(typeof mapMod.solicitarCoachIAPro === 'function', 'map.js must re-export solicitarCoachIAPro');
assert(typeof mapMod.solicitarAnalisisIARutaDeportiva === 'function', 'map.js must re-export solicitarAnalisisIARutaDeportiva');

// Test normalizarUnidadesCoach
const normStr = mapCoachMod.normalizarUnidadesCoach('Viento de 18 km/h a 25 km/h');
assert(normStr.includes('kt'), 'normalizarUnidadesCoach must convert km/h to kt');

// 3.4.2 Strangler Fig Architecture - Phase 2 (map.weather.js & map.spots.js)
const mapWeatherMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.weather.js')).href);
const mapSpotsMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.spots.js')).href);

// Assert map.weather.js exports
assert(typeof mapWeatherMod.AUTORIDADES_112_ES === 'object', 'map.weather.js must export AUTORIDADES_112_ES');
assert(Array.isArray(mapWeatherMod.ZONAS_ESPANA_112), 'map.weather.js must export ZONAS_ESPANA_112');
assert(typeof mapWeatherMod.obtenerAutoridadEmergencias112 === 'function', 'map.weather.js must export obtenerAutoridadEmergencias112');
assert(typeof mapWeatherMod.solicitarPronostico === 'function', 'map.weather.js must export solicitarPronostico');
assert(typeof mapWeatherMod.solicitarPronosticoOpenMeteo === 'function', 'map.weather.js must export solicitarPronosticoOpenMeteo');
assert(typeof mapWeatherMod.obtenerMotorExperto === 'function', 'map.weather.js must export obtenerMotorExperto');
assert(typeof mapWeatherMod.renderizarAvisoSuperior === 'function', 'map.weather.js must export renderizarAvisoSuperior');
assert(typeof mapWeatherMod.extraerDatosHoraPronostico === 'function', 'map.weather.js must export extraerDatosHoraPronostico');
assert(typeof mapWeatherMod.evaluarAlertasGlobales === 'function', 'map.weather.js must export evaluarAlertasGlobales');
assert(typeof mapWeatherMod.validarVigenciaAlerta === 'function', 'map.weather.js must export validarVigenciaAlerta');
assert(typeof mapWeatherMod.generarExplicacionAvisoAemet === 'function', 'map.weather.js must export generarExplicacionAvisoAemet');
assert(typeof mapWeatherMod.registrarDiagnosticoAemet === 'function', 'map.weather.js must export registrarDiagnosticoAemet');
assert(typeof mapWeatherMod.limpiarAvisosMeteorologicos === 'function', 'map.weather.js must export limpiarAvisosMeteorologicos');

const authVal = mapWeatherMod.obtenerAutoridadEmergencias112(38.83, 0.14, 'Dénia');
assert(authVal && (authVal.id === 'VALENCIA' || authVal.telefono === '112'), 'obtenerAutoridadEmergencias112 should identify 112 Comunitat Valenciana for Dénia');

const testHoraData = mapWeatherMod.extraerDatosHoraPronostico({
    time: ['2026-10-18T10:00:00Z'],
    wind_speed_10m: [14.2],
    wind_gusts_10m: [19.5],
    wind_direction_10m: [90],
    wave_height: [0.6],
    wave_period: [6]
}, 0);
assert(testHoraData && testHoraData.windSpeedMs === 14.2, 'extraerDatosHoraPronostico must correctly extract windSpeedMs');

// ==============================================================================
// 3.4.2b PADDLESAFE_AEMET_ALERT_ENGINE_FIX_V1 - VALIDATION SUITE (Tests 1 - 4)
// ==============================================================================

// Test 1: No AEMET warning -> No official alert displayed
const test1Input = {
    selected_date: '2026-10-19',
    vientoKmh: 12,
    olaM: 0.3,
    aemet: { disponible: true, alertas: [] }
};
const test1Alert = mapWeatherMod.evaluarAlertasGlobales(test1Input);
assert(test1Alert.activa === false, 'Test 1: No AEMET warning -> activa must be false');
assert(test1Alert.esOficialAemet === false, 'Test 1: No AEMET warning -> esOficialAemet must be false');
assert(test1Alert.alertas.length === 0, 'Test 1: No AEMET warning -> alertas array must be empty');
assert(test1Alert.tormenta === false, 'Test 1: No AEMET warning -> tormenta must be false');

// Test 2: AEMET yellow thunderstorm warning -> Official alert displayed
const test2Input = {
    selected_date: '2026-10-19',
    vientoKmh: 14,
    olaM: 0.4,
    aemet: {
        disponible: true,
        zonaDetectada: 'Litoral norte de Valencia',
        alertas: [{
            origen: 'AEMET',
            tipo: 'Tormentas',
            nivel: 'AMARILLA',
            inicio: '2026-10-19T14:00:00',
            fin: '2026-10-19T22:00:00',
            zona: 'Litoral norte de Valencia',
            descripcion: 'Posibilidad de tormentas con aparato eléctrico y chubascos fuertes.'
        }]
    }
};
const test2Alert = mapWeatherMod.evaluarAlertasGlobales(test2Input);
assert(test2Alert.activa === true, 'Test 2: AEMET yellow thunderstorm warning -> activa must be true');
assert(test2Alert.esOficialAemet === true, 'Test 2: AEMET yellow thunderstorm warning -> esOficialAemet must be true');
assert(test2Alert.aemetAvisoTormentaActivo === true, 'Test 2: aemetAvisoTormentaActivo must be true');
assert(test2Alert.nivel === 'AMARILLA', 'Test 2: Alert level must be AMARILLA');
assert(test2Alert.explicacionHumana && test2Alert.explicacionHumana.includes('AEMET ha emitido un aviso amarillo por tormentas'), 'Test 2: Explanation must be human readable and mention AEMET');

// Test 3: Forecast date outside warning window -> No official alert displayed
const test3Input = {
    selected_date: '2026-10-25', // Outside warning window of 2026-10-19
    vientoKmh: 14,
    olaM: 0.4,
    aemet: {
        disponible: true,
        zonaDetectada: 'Litoral norte de Valencia',
        alertas: [{
            origen: 'AEMET',
            tipo: 'Tormentas',
            nivel: 'AMARILLA',
            inicio: '2026-10-19T14:00:00',
            fin: '2026-10-19T22:00:00',
            zona: 'Litoral norte de Valencia',
            descripcion: 'Tormentas con aparato eléctrico.'
        }]
    }
};
const test3Alert = mapWeatherMod.evaluarAlertasGlobales(test3Input);
assert(test3Alert.activa === false, 'Test 3: Forecast date outside warning window -> activa must be false');
assert(test3Alert.esOficialAemet === false, 'Test 3: Outside date window -> esOficialAemet must be false');
assert(test3Alert.alertas.length === 0, 'Test 3: Outside date window -> alertas array must be empty');
assert(test3Alert.aemetAvisoTormentaActivo === false, 'Test 3: Outside date window -> aemetAvisoTormentaActivo must be false');

// Test 4: High CAPE but no AEMET bulletin -> Display only ⚠️ Riesgo Meteorológico Estimado
const test4Input = {
    selected_date: '2026-10-19',
    cape: 1800,
    precipitation: 4,
    vientoKmh: 10,
    olaM: 0.3,
    aemet: { disponible: true, alertas: [] }
};
const test4Alert = mapWeatherMod.evaluarAlertasGlobales(test4Input);
assert(test4Alert.activa === false, 'Test 4: High CAPE without AEMET -> activa must be false (no official alert)');
assert(test4Alert.esOficialAemet === false, 'Test 4: esOficialAemet must be false');
assert(test4Alert.aemetAvisoTormentaActivo === false, 'Test 4: aemetAvisoTormentaActivo must be false');
assert(test4Alert.riesgoModeloConvectivo === true, 'Test 4: riesgoModeloConvectivo must be true for CAPE 1800');
assert(test4Alert.etiquetaRiesgoModelo === '⚠️ Riesgo Meteorológico Estimado', 'Test 4: Must label as ⚠️ Riesgo Meteorológico Estimado');
assert(!/PELIGRO|ALERTA OFICIAL|AVISO AEMET/i.test(test4Alert.etiquetaRiesgoModelo), 'Test 4: Must NEVER label as PELIGRO, ALERTA OFICIAL or AVISO AEMET');

const test4Verdict = generarVeredictoNextGen(test4Input);
assert(test4Verdict.alertaOficialActiva === false, 'Test 4 verdict: alertaOficialActiva must be false');
assert(test4Verdict.tormentaElectricaOficial === false, 'Test 4 verdict: tormentaElectricaOficial must be false');
assert(test4Verdict.riesgoMeteorologicoEstimado === true, 'Test 4 verdict: riesgoMeteorologicoEstimado must be true');
assert(test4Verdict.etiquetaRiesgoModelo === '⚠️ Riesgo Meteorológico Estimado', 'Test 4 verdict: etiquetaRiesgoModelo must be ⚠️ Riesgo Meteorológico Estimado');
assert(!/PELIGRO|ALERTA OFICIAL|AVISO AEMET/i.test(test4Verdict.justificacion), 'Test 4 verdict: Justification must not claim official AEMET alert');

// ==============================================================================
// 3.4.2c PADDLESAFE_THUNDERSTORM_DATE_DESYNC_FIX - REGRESSION SUITE (Tests 5 - 8)
// Proves alerts active on 2026-10-18 and strictly inactive on 2026-10-30
// Proves no 'PELIGRO POR TORMENTA ELÉCTRICA' and no 'NO RECOMENDADO SALIR A REMAR' on day 30
// ==============================================================================

const coachEngineMod = await import(pathToFileURL(path.resolve('public_html/js/engine/coach.js')).href);
const { generarConsejoCoach } = coachEngineMod;

// Test 5: Real-world AEMET alert active for today (2026-10-18)
const mockAemetAlertPayload = {
    disponible: true,
    zonaDetectada: 'Litoral norte de Valencia',
    alertas: [{
        origen: 'AEMET',
        tipo: 'Tormentas',
        nivel: 'AMARILLA',
        inicio: '2026-10-17T10:00:00+00:00',
        fin: '2026-10-18T21:59:59+00:00',
        zona: 'Litoral norte de Valencia',
        descripcion: 'Aviso de tormentas moderadas con aparato eléctrico.'
    }]
};

const test5Input_Today = {
    selected_date: '2026-10-18',
    fechaConsulta: '2026-10-18',
    date: '2026-10-18',
    fecha: '2026-10-18',
    vientoKmh: 12,
    olaM: 0.3,
    aemet: mockAemetAlertPayload
};
const test5Alert = mapWeatherMod.evaluarAlertasGlobales(test5Input_Today);
assert(test5Alert.activa === true, 'Test 5: Alert must be active on 2026-10-18');
assert(test5Alert.aemetAvisoTormentaActivo === true, 'Test 5: aemetAvisoTormentaActivo must be true on 2026-10-18');
assert(test5Alert.alertas.length > 0 && test5Alert.alertas[0]?.esVigente === true, 'Test 5: Alert esVigente must be true on 2026-10-18');
assert(test5Alert.alertas[0]?.estadoTemporal === 'ACTIVA_AHORA', 'Test 5: Alert estadoTemporal must be ACTIVA_AHORA on 2026-10-18');

const test5Verdict = generarVeredictoNextGen({
    ...test5Input_Today,
    alertaOficial: test5Alert.alertas[0],
    alertas: test5Alert.alertas,
    alertaTormentaOficialActiva: test5Alert.aemetAvisoTormentaActivo,
    tormentaElectricaOficial: test5Alert.aemetAvisoTormentaActivo
});
assert(test5Verdict.tormentaElectricaOficial === true, 'Test 5 verdict: tormentaElectricaOficial must be true on 2026-10-18');
assert(test5Verdict.score === 0, 'Test 5 verdict: score must be 0 when official storm warning is active');
assert(test5Verdict.respuestaDirecta.includes('NO SALIR AL AGUA'), 'Test 5 verdict: respuestaDirecta must advise not going into water');

// Test 6: Same alert evaluated on future date (2026-10-30) -> STRICTLY INACTIVE
const test6Input_Day30 = {
    selected_date: '2026-10-30',
    fechaConsulta: '2026-10-30',
    date: '2026-10-30',
    fecha: '2026-10-30',
    vientoKmh: 10,
    olaM: 0.2,
    aemet: mockAemetAlertPayload
};
const test6Alert = mapWeatherMod.evaluarAlertasGlobales(test6Input_Day30);
assert(test6Alert.activa === false, 'Test 6: Alert must be INACTIVE on 2026-10-30');
assert(test6Alert.aemetAvisoTormentaActivo === false, 'Test 6: aemetAvisoTormentaActivo must be false on 2026-10-30');
assert(test6Alert.tormenta === false, 'Test 6: tormenta must be false on 2026-10-30');
assert(test6Alert.alertas.length === 0, 'Test 6: Active alerts array must be empty on 2026-10-30');

const test6Verdict = generarVeredictoNextGen({
    ...test6Input_Day30,
    alertaOficial: test6Alert.alertas[0] || null,
    alertas: test6Alert.alertas,
    alertaTormentaOficialActiva: test6Alert.aemetAvisoTormentaActivo,
    tormentaElectricaOficial: test6Alert.aemetAvisoTormentaActivo
});
assert(test6Verdict.tormentaElectricaOficial === false, 'Test 6 verdict: tormentaElectricaOficial must be false on 2026-10-30');
assert(test6Verdict.alertaOficialActiva === false, 'Test 6 verdict: alertaOficialActiva must be false on 2026-10-30');
assert(!/PELIGRO POR TORMENTA EL[EÉ]CTRICA/i.test(test6Verdict.justificacion || ''), 'Test 6 verdict: Justification must NOT contain "PELIGRO POR TORMENTA ELÉCTRICA" on day 30');
assert(!/NO RECOMENDADO SALIR A REMAR/i.test(test6Verdict.justificacion || ''), 'Test 6 verdict: Justification must NOT contain "NO RECOMENDADO SALIR A REMAR" on day 30');
assert(!/PELIGRO POR TORMENTA EL[EÉ]CTRICA/i.test(test6Verdict.alerta || ''), 'Test 6 verdict: Alert title must NOT contain "PELIGRO POR TORMENTA ELÉCTRICA" on day 30');
assert(!/NO RECOMENDADO SALIR A REMAR/i.test(test6Verdict.alerta || ''), 'Test 6 verdict: Alert title must NOT contain "NO RECOMENDADO SALIR A REMAR" on day 30');

// Test 6 Coach: Coach message must not produce thunderstorm veto on day 30
const test6Coach = generarConsejoCoach({
    userLevel: 'Intermedio',
    condiciones: { vientoKmh: 10, olaM: 0.2 },
    motor: {
        tormentaElectricaOficial: false,
        aemetAvisoTormentaActivo: false,
        tormentaElectrica: false,
        aemet: test6Alert
    }
});
assert(test6Coach.veredicto !== '⛔ NO RECOMENDADO SALIR A REMAR', 'Test 6 coach: veredicto must NOT be "⛔ NO RECOMENDADO SALIR A REMAR" on day 30');
assert(!/PELIGRO POR TORMENTA EL[EÉ]CTRICA/i.test(test6Coach.resumen || ''), 'Test 6 coach: resumen must NOT mention thunderstorm danger on day 30');
assert(!/descargas el[eé]ctricas/i.test(test6Coach.resumen || ''), 'Test 6 coach: resumen must NOT mention descargas eléctricas on day 30');

// Test 7: Date resolution priority in evaluarAlertasGlobales
// Proves fechaConsulta / selected_date / date / fecha overrides any DOM fallback
const test7Input_FechaConsulta = {
    fechaConsulta: '2026-10-30',
    aemet: mockAemetAlertPayload
};
const test7Alert = mapWeatherMod.evaluarAlertasGlobales(test7Input_FechaConsulta);
assert(test7Alert.activa === false, 'Test 7: fechaConsulta alone must resolve date to 2026-10-30 and reject expired alert');
assert(test7Alert.aemetAvisoTormentaActivo === false, 'Test 7: aemetAvisoTormentaActivo must be false');

// Test 8: Strict validation in verdict.js - undefined or non-active alerts must never trigger storm veto
const rawUnvalidatedAlert = {
    tipo: 'Aviso por Tormentas',
    descripcion: 'Tormenta con aparato electrico',
    // esVigente is undefined (not explicitly true)
    // estadoTemporal is undefined
};
const test8Verdict = generarVeredictoNextGen({
    vientoKt: 8,
    oleajeM: 0.3,
    alertaOficial: rawUnvalidatedAlert,
    alertas: [rawUnvalidatedAlert]
});
assert(test8Verdict.tormentaElectricaOficial === false, 'Test 8: Unvalidated alert (esVigente undefined) must NOT trigger tormentaElectricaOficial');
assert(!/PELIGRO POR TORMENTA EL[EÉ]CTRICA/i.test(test8Verdict.justificacion || ''), 'Test 8: Must NOT render thunderstorm danger when alert is unvalidated');

// Assert map.spots.js exports
assert(typeof mapSpotsMod.cargarSpotsGuardadosUsuario === 'function', 'map.spots.js must export cargarSpotsGuardadosUsuario');
assert(typeof mapSpotsMod.guardarSpotActual === 'function', 'map.spots.js must export guardarSpotActual');
assert(typeof mapSpotsMod.eliminarSpotGuardado === 'function', 'map.spots.js must export eliminarSpotGuardado');
assert(typeof mapSpotsMod.seleccionarSpotGuardado === 'function', 'map.spots.js must export seleccionarSpotGuardado');
assert(typeof mapSpotsMod.compararSpotsGuardados === 'function', 'map.spots.js must export compararSpotsGuardados');
assert(typeof mapSpotsMod.abrirModalComparadorSpots === 'function', 'map.spots.js must export abrirModalComparadorSpots');
assert(typeof mapSpotsMod.cargarJornadaCompletaSpot === 'function', 'map.spots.js must export cargarJornadaCompletaSpot');
assert(typeof mapSpotsMod.renderizarTimelineJornadaCompleta === 'function', 'map.spots.js must export renderizarTimelineJornadaCompleta');
assert(typeof mapSpotsMod.seleccionarHoraTimeline === 'function', 'map.spots.js must export seleccionarHoraTimeline');
assert(typeof mapSpotsMod.reproducirTimeline24hSpot === 'function', 'map.spots.js must export reproducirTimeline24hSpot');
assert(typeof mapSpotsMod.pausarTimeline24hSpot === 'function', 'map.spots.js must export pausarTimeline24hSpot');
assert(typeof mapSpotsMod.alternarPlayTimeline24hSpot === 'function', 'map.spots.js must export alternarPlayTimeline24hSpot');
assert(typeof mapSpotsMod.analizarHistorialYSmartMatchSpot === 'function', 'map.spots.js must export analizarHistorialYSmartMatchSpot');
assert(typeof mapSpotsMod.calcularSesgoTermicoSpot === 'function', 'map.spots.js must export calcularSesgoTermicoSpot');
assert(typeof mapSpotsMod.guardarEntradaBitacoraSpot === 'function', 'map.spots.js must export guardarEntradaBitacoraSpot');
assert(typeof mapSpotsMod.guardarNotasTacticasSpot === 'function', 'map.spots.js must export guardarNotasTacticasSpot');
assert(typeof mapSpotsMod.calcularDistanciaGeodesicaKm === 'function', 'map.spots.js must export calcularDistanciaGeodesicaKm');

const geoDist = mapSpotsMod.calcularDistanciaGeodesicaKm(38.83, 0.14, 38.84, 0.15);
assert(geoDist > 0 && geoDist < 5, 'calcularDistanciaGeodesicaKm must return valid geodesic distance (~1.4km)');

// Assert Facade map.js re-exports Phase 2 modules
assert(typeof mapMod.solicitarPronostico === 'function', 'map.js must re-export solicitarPronostico');
assert(typeof mapMod.obtenerMotorExperto === 'function', 'map.js must re-export obtenerMotorExperto');
assert(typeof mapMod.renderizarAvisoSuperior === 'function', 'map.js must re-export renderizarAvisoSuperior');
assert(typeof mapMod.validarVigenciaAlerta === 'function', 'map.js must re-export validarVigenciaAlerta');
assert(typeof mapMod.generarExplicacionAvisoAemet === 'function', 'map.js must re-export generarExplicacionAvisoAemet');
assert(typeof mapMod.registrarDiagnosticoAemet === 'function', 'map.js must re-export registrarDiagnosticoAemet');
assert(typeof mapMod.limpiarAvisosMeteorologicos === 'function', 'map.js must re-export limpiarAvisosMeteorologicos');
assert(typeof mapMod.cargarSpotsGuardadosUsuario === 'function', 'map.js must re-export cargarSpotsGuardadosUsuario');
assert(typeof mapMod.compararSpotsGuardados === 'function', 'map.js must re-export compararSpotsGuardados');
assert(typeof mapMod.renderizarTimelineJornadaCompleta === 'function', 'map.js must re-export renderizarTimelineJornadaCompleta');
assert(typeof mapMod.reproducirTimeline24hSpot === 'function', 'map.js must re-export reproducirTimeline24hSpot');
assert(typeof mapMod.cargarReportesSpot === 'function', 'map.js must re-export cargarReportesSpot');
assert(typeof mapMod.enviarReporteSpot === 'function', 'map.js must re-export enviarReporteSpot');

// 3.4.3 Map Refactor Phase 3: GPS Tracker & Routes Engine (map.tracker.js & map.routes.js)
const mapTrackerMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.tracker.js')).href);
const mapRoutesMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.routes.js')).href);

// Assert map.tracker.js exports
assert(typeof mapTrackerMod.iniciarTravesia === 'function', 'map.tracker.js must export iniciarTravesia');
assert(typeof mapTrackerMod.finalizarTravesia === 'function', 'map.tracker.js must export finalizarTravesia');
assert(typeof mapTrackerMod.normalizarYLimitarRutaGPS === 'function', 'map.tracker.js must export normalizarYLimitarRutaGPS');
assert(typeof mapTrackerMod.calcularBiometriaSup === 'function', 'map.tracker.js must export calcularBiometriaSup');
assert(typeof mapTrackerMod.construirPayloadRutaSupabase === 'function', 'map.tracker.js must export construirPayloadRutaSupabase');
assert(typeof mapTrackerMod.toggleModoTravesia === 'function', 'map.tracker.js must export toggleModoTravesia');

// Test normalizarYLimitarRutaGPS algorithm
const samplePts = mapTrackerMod.normalizarYLimitarRutaGPS([[38.8012345, 0.1812345], [38.8023456, 0.1823456]]);
assert(samplePts.length === 2, 'normalizarYLimitarRutaGPS must preserve valid points');
assert(samplePts[0][0] === 38.801234, 'normalizarYLimitarRutaGPS must round coordinates to 6 decimals');


// Test construirPayloadRutaSupabase deduplication helper
const samplePayload = mapTrackerMod.construirPayloadRutaSupabase({
    userId: '00000000-0000-0000-0000-000000000001',
    distanciaKm: 2.5,
    tiempoMinutos: 30,
    coords: [[38.8, 0.18], [38.81, 0.19]],
    vientoKt: 8,
    olasM: 0.3
});
assert(samplePayload.user_id === '00000000-0000-0000-0000-000000000001', 'construirPayloadRutaSupabase must set user_id');
assert(samplePayload.distancia_km === 2.5, 'construirPayloadRutaSupabase must set distancia_km');
assert(samplePayload.tiempo_minutos === 30, 'construirPayloadRutaSupabase must set tiempo_minutos');
assert(samplePayload.wind_speed_kt === 8, 'construirPayloadRutaSupabase must set wind_speed_kt');
assert(samplePayload.wave_height_m === 0.3, 'construirPayloadRutaSupabase must set wave_height_m');
assert(Array.isArray(samplePayload.ruta_json) && samplePayload.ruta_json.length === 2, 'construirPayloadRutaSupabase must set normalized ruta_json');


// Assert map.routes.js exports
assert(typeof mapRoutesMod.toggleRutaLibre === 'function', 'map.routes.js must export toggleRutaLibre');
assert(typeof mapRoutesMod.limpiarRuta === 'function', 'map.routes.js must export limpiarRuta');
assert(typeof mapRoutesMod.cerrarIdaYVueltaMultipunto === 'function', 'map.routes.js must export cerrarIdaYVueltaMultipunto');
assert(typeof mapRoutesMod.cargarRutaDeportivaEnMapa === 'function', 'map.routes.js must export cargarRutaDeportivaEnMapa');
assert(typeof mapRoutesMod.exportarRutaPlanificadaGPX === 'function', 'map.routes.js must export exportarRutaPlanificadaGPX');
assert(typeof mapRoutesMod.iniciarCreacionQuedadaClub === 'function', 'map.routes.js must export iniciarCreacionQuedadaClub');
assert(typeof mapRoutesMod.analizarVientoRutaClub === 'function', 'map.routes.js must export analizarVientoRutaClub');
assert(typeof mapRoutesMod.generarGraficoSvgPerfilRuta === 'function', 'map.routes.js must export generarGraficoSvgPerfilRuta');
assert(typeof mapRoutesMod.evaluarVientoRelativoInfo === 'function', 'map.routes.js must export evaluarVientoRelativoInfo');

// Test evaluarVientoRelativoInfo
const vContra = mapRoutesMod.evaluarVientoRelativoInfo(0, 0);
assert(vContra.texto.includes('CONTRA'), 'evaluarVientoRelativoInfo: 0 deg vs 0 deg should be wind against');
const vFavor = mapRoutesMod.evaluarVientoRelativoInfo(0, 180);
assert(vFavor.texto.includes('FAVOR'), 'evaluarVientoRelativoInfo: 0 deg vs 180 deg should be wind in favor');

// Test generarGraficoSvgPerfilRuta
const svgOutput = mapRoutesMod.generarGraficoSvgPerfilRuta([{ distancia_km: 2, viento_kt: 8, nombre: 'Tramo 1' }], 2000);
assert(svgOutput.includes('<svg') && svgOutput.includes('routeWindGrad'), 'generarGraficoSvgPerfilRuta must produce valid SVG');

// Assert Facade map.js re-exports Phase 3 modules
assert(typeof mapMod.iniciarTravesia === 'function', 'map.js must re-export iniciarTravesia');
assert(typeof mapMod.finalizarTravesia === 'function', 'map.js must re-export finalizarTravesia');
assert(typeof mapMod.normalizarYLimitarRutaGPS === 'function', 'map.js must re-export normalizarYLimitarRutaGPS');
assert(typeof mapMod.calcularBiometriaSup === 'function', 'map.js must re-export calcularBiometriaSup');
assert(typeof mapMod.construirPayloadRutaSupabase === 'function', 'map.js must re-export construirPayloadRutaSupabase');
assert(typeof mapMod.toggleModoTravesia === 'function', 'map.js must re-export toggleModoTravesia');
assert(typeof mapMod.toggleRutaLibre === 'function', 'map.js must re-export toggleRutaLibre');
assert(typeof mapMod.limpiarRuta === 'function', 'map.js must re-export limpiarRuta');
assert(typeof mapMod.cerrarIdaYVueltaMultipunto === 'function', 'map.js must re-export cerrarIdaYVueltaMultipunto');
assert(typeof mapMod.cargarRutaDeportivaEnMapa === 'function', 'map.js must re-export cargarRutaDeportivaEnMapa');
assert(typeof mapMod.exportarRutaPlanificadaGPX === 'function', 'map.js must re-export exportarRutaPlanificadaGPX');
assert(typeof mapMod.iniciarCreacionQuedadaClub === 'function', 'map.js must re-export iniciarCreacionQuedadaClub');
assert(typeof mapMod.analizarVientoRutaClub === 'function', 'map.js must re-export analizarVientoRutaClub');

// 3.4.4 Map Refactor Phase 4 (Final): Core GIS, Bento Cockpit, Pure Facade & Offline Precache
const mapCoreMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.core.js')).href);
const mapBentoMod = await import(pathToFileURL(path.resolve('public_html/js/map/map.bento.js')).href);

// Assert map.core.js exports
assert(typeof mapCoreMod.TABLAS_SUP_CONFIG === 'object', 'map.core.js must export TABLAS_SUP_CONFIG');
assert(typeof mapCoreMod.inicializarMapa === 'function', 'map.core.js must export inicializarMapa');
assert(typeof mapCoreMod.actualizarMapa === 'function', 'map.core.js must export actualizarMapa');
assert(typeof mapCoreMod.buscarYCentrarMapa === 'function', 'map.core.js must export buscarYCentrarMapa');
assert(typeof mapCoreMod.obtenerUbicacion === 'function', 'map.core.js must export obtenerUbicacion');
assert(typeof mapCoreMod.recuperarEquipoUsuario === 'function', 'map.core.js must export recuperarEquipoUsuario');
assert(typeof mapCoreMod.guardarEquipoUsuario === 'function', 'map.core.js must export guardarEquipoUsuario');
assert(typeof mapCoreMod.obtenerVelocidadCruceroUsuario === 'function', 'map.core.js must export obtenerVelocidadCruceroUsuario');
assert(typeof mapCoreMod.obtenerModificadorDerivaUsuario === 'function', 'map.core.js must export obtenerModificadorDerivaUsuario');
assert(typeof mapCoreMod.autoCalibrarRitmoDesdeRutas === 'function', 'map.core.js must export autoCalibrarRitmoDesdeRutas');
assert(typeof mapCoreMod.descargarZonaMapaOffline === 'function', 'map.core.js must export descargarZonaMapaOffline');
assert(typeof mapCoreMod.calcularTilesBoundingBox === 'function', 'map.core.js must export calcularTilesBoundingBox');

// Assert map.bento.js exports
assert(typeof mapBentoMod.aplicarGlowVerdictBento === 'function', 'map.bento.js must export aplicarGlowVerdictBento');
assert(typeof mapBentoMod.renderizarResumenExperto === 'function', 'map.bento.js must export renderizarResumenExperto');
assert(typeof mapBentoMod.activarSkeletonCargaSpot === 'function', 'map.bento.js must export activarSkeletonCargaSpot');
assert(typeof mapBentoMod.desactivarSkeletonCargaSpot === 'function', 'map.bento.js must export desactivarSkeletonCargaSpot');
assert(typeof mapBentoMod.consultarBasico === 'function', 'map.bento.js must export consultarBasico');
assert(typeof mapBentoMod.consultarPuntoProInstantaneo === 'function', 'map.bento.js must export consultarPuntoProInstantaneo');
assert(typeof mapBentoMod.consultarRutaPro === 'function', 'map.bento.js must export consultarRutaPro');
assert(typeof mapBentoMod.renderizarDashboardPro === 'function', 'map.bento.js must export renderizarDashboardPro');
assert(typeof mapBentoMod.cargarPrevisionHorariaExacta === 'function', 'map.bento.js must export cargarPrevisionHorariaExacta');
assert(typeof mapBentoMod.volverPlanificadorPro === 'function', 'map.bento.js must export volverPlanificadorPro');
assert(typeof mapBentoMod.renderizarRosaVectoresMapa === 'function', 'map.bento.js must export renderizarRosaVectoresMapa');
assert(typeof mapBentoMod.actualizarHudVectoresMapa === 'function', 'map.bento.js must export actualizarHudVectoresMapa');

// Assert Facade map.js re-exports Phase 4 modules
assert(typeof mapMod.inicializarMapa === 'function', 'map.js must re-export inicializarMapa');
assert(typeof mapMod.buscarYCentrarMapa === 'function', 'map.js must re-export buscarYCentrarMapa');
assert(typeof mapMod.obtenerVelocidadCruceroUsuario === 'function', 'map.js must re-export obtenerVelocidadCruceroUsuario');
assert(typeof mapMod.descargarZonaMapaOffline === 'function', 'map.js must re-export descargarZonaMapaOffline');
assert(typeof mapMod.consultarBasico === 'function', 'map.js must re-export consultarBasico');
assert(typeof mapMod.consultarPuntoProInstantaneo === 'function', 'map.js must re-export consultarPuntoProInstantaneo');
assert(typeof mapMod.consultarRutaPro === 'function', 'map.js must re-export consultarRutaPro');
assert(typeof mapMod.renderizarDashboardPro === 'function', 'map.js must re-export renderizarDashboardPro');
assert(typeof mapMod.renderizarRosaVectoresMapa === 'function', 'map.js must re-export renderizarRosaVectoresMapa');
assert(typeof mapMod.actualizarHudVectoresMapa === 'function', 'map.js must re-export actualizarHudVectoresMapa');

// Assert All 9 submodules exist in public_html/js/map/ and are precached in sw.js
const mapRefactorModules = [
    'map.state.js',
    'map.core.js',
    'map.weather.js',
    'map.bento.js',
    'map.tracker.js',
    'map.poster.js',
    'map.routes.js',
    'map.coach.js',
    'map.spots.js'
];
for (const modFile of mapRefactorModules) {
    const fullModPath = path.resolve('public_html/js/map', modFile);
    assert(fs.existsSync(fullModPath), `Submodule public_html/js/map/${modFile} must exist`);
    assert(swContent.includes(`js/map/${modFile}`), `sw.js precache must include js/map/${modFile}`);
}

// Assert map.js pure facade LOC < 200
const mapFacadeContent = fs.readFileSync('public_html/js/map.js', 'utf8');
const mapFacadeLines = mapFacadeContent.split('\n').length;
assert(mapFacadeLines < 200, `map.js must be a clean facade under 200 LOC, got ${mapFacadeLines} LOC`);

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

// 3.10 Realtime Presence Engine & Badges Audit
console.log('--- [TASK 3.10] Realtime Presence Engine & Badges Audit ---');
const configMod = await import(pathToFileURL(path.resolve('public_html/js/config.js')).href);
assert(configMod.appState && typeof configMod.appState.onlineUsers === 'object', 'appState.onlineUsers must be defined as an object in config.js');

const authJsContent = fs.readFileSync('public_html/js/auth.js', 'utf8');
assert(authJsContent.includes('inicializarPresenciaRealtime'), 'auth.js must export inicializarPresenciaRealtime');
assert(authJsContent.includes('actualizarMiEstadoPresencia'), 'auth.js must export actualizarMiEstadoPresencia');
assert(authJsContent.includes('presence:paddlesafe_global'), 'auth.js must use global presence channel presence:paddlesafe_global');
assert(authJsContent.includes('window.inicializarPresenciaRealtime = inicializarPresenciaRealtime'), 'auth.js must bind window.inicializarPresenciaRealtime');
assert(authJsContent.includes('window.actualizarMiEstadoPresencia = actualizarMiEstadoPresencia'), 'auth.js must bind window.actualizarMiEstadoPresencia');

const mapJsContent = fs.readFileSync('public_html/js/map.js', 'utf8');
assert(mapJsContent.includes("actualizarMiEstadoPresencia?.('in_water')"), 'map.js must update presence to in_water on iniciarTravesia');
assert(mapJsContent.includes("actualizarMiEstadoPresencia?.('online')"), 'map.js must restore presence to online on finalizarTravesia');

// Presence badge markup in community views
const socialJsContent = fs.readFileSync('public_html/js/social.js', 'utf8');
const clubRenderContent = fs.readFileSync('public_html/js/club/club.render.js', 'utf8');
const clubPublicContent = fs.readFileSync('public_html/js/club/club.public.js', 'utf8');
const clubIndexContentForPresence = fs.readFileSync('public_html/js/club/index.js', 'utf8');

assert(socialJsContent.includes('data-user-presence-id'), 'social.js must include data-user-presence-id badges in friends list');
assert(clubRenderContent.includes('data-user-presence-id'), 'club.render.js must include data-user-presence-id badges in paddlers list');
assert(clubPublicContent.includes('data-user-presence-id'), 'club.public.js must include data-user-presence-id badges in member list');
assert(clubIndexContentForPresence.includes('data-user-presence-id'), 'club/index.js must include data-user-presence-id badges in crew list');

// Test UI presence update logic
const { actualizarUIPresencia } = utilsMod;
assert(typeof actualizarUIPresencia === 'function', 'utils.js must export actualizarUIPresencia');

const mockBadges = [
    {
        attrs: { 'data-user-presence-id': 'u_online' },
        getAttribute: function(k) { return this.attrs[k]; },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        className: '',
        innerHTML: ''
    },
    {
        attrs: { 'data-user-presence-id': 'u_water' },
        getAttribute: function(k) { return this.attrs[k]; },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        className: '',
        innerHTML: ''
    },
    {
        attrs: { 'data-user-presence-id': 'u_away' },
        getAttribute: function(k) { return this.attrs[k]; },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        className: '',
        innerHTML: ''
    },
    {
        attrs: { 'data-user-presence-id': 'u_offline' },
        getAttribute: function(k) { return this.attrs[k]; },
        setAttribute: function(k, v) { this.attrs[k] = v; },
        className: '',
        innerHTML: ''
    }
];

const origQSA = globalThis.document.querySelectorAll;
globalThis.document.querySelectorAll = (sel) => {
    if (sel === '[data-user-presence-id]') return mockBadges;
    return [];
};
globalThis.window.appState = {
    onlineUsers: {
        'u_online': { status: 'online' },
        'u_water': { status: 'in_water' },
        'u_away': { status: 'away' }
    }
};

actualizarUIPresencia();
globalThis.document.querySelectorAll = origQSA;

assert(mockBadges[0].className.includes('bg-emerald-500'), 'Online badge must have bg-emerald-500');
assert(mockBadges[1].className.includes('bg-sky-500') && mockBadges[1].innerHTML === '🌊', 'In water badge must have bg-sky-500 and wave emoji');
assert(mockBadges[2].className.includes('bg-amber-400'), 'Away badge must have bg-amber-400');
assert(mockBadges[3].className.includes('bg-slate-500/70'), 'Offline badge must have bg-slate-500/70');

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
assert(topBeginRoot >= 1 && topBeginRoot === topCommitRoot, 'patch_MASTER_v2_rollout.sql in root must contain balanced BEGIN; and COMMIT;');

assert(sqlContentRoot.includes('es_admin_o_creador_club'), 'SQL must define es_admin_o_creador_club');
assert(sqlContentRoot.includes('idx_clubs_usuarios_unique_pair'), 'SQL must define idx_clubs_usuarios_unique_pair');
assert(sqlContentRoot.includes('idx_clubs_solicitudes_pendiente'), 'SQL must define idx_clubs_solicitudes_pendiente');
assert(sqlContentRoot.includes('obtener_solicitudes_club'), 'SQL must define obtener_solicitudes_club');
assert(sqlContentRoot.includes('procesar_solicitud_club'), 'SQL must define procesar_solicitud_club');

assert(sqlContentBackend.includes('es_admin_o_creador_club'), 'Backend SQL must define es_admin_o_creador_club');
assert(sqlContentBackend.includes('idx_clubs_usuarios_unique_pair'), 'Backend SQL must define idx_clubs_usuarios_unique_pair');
assert(sqlContentBackend.includes('idx_clubs_solicitudes_pendiente'), 'Backend SQL must define idx_clubs_solicitudes_pendiente');
assert(sqlContentBackend.includes('obtener_solicitudes_club'), 'Backend SQL must define obtener_solicitudes_club');
assert(sqlContentBackend.includes('procesar_solicitud_club'), 'Backend SQL must define procesar_solicitud_club');

// 4.5 Standalone Patch #07 Check
const patch07Path = 'patch_07_definitive_clubs_and_db_fix.sql';
assert(fs.existsSync(patch07Path), `${patch07Path} must exist at root`);
const patch07Content = fs.readFileSync(patch07Path, 'utf8');
assert(patch07Content.includes('BEGIN;') && patch07Content.includes('COMMIT;'), 'patch_07 must have balanced transaction');
assert(patch07Content.includes('fn_auto_registrar_creador_club'), 'patch_07 must define fn_auto_registrar_creador_club');
assert(patch07Content.includes('es_admin_o_creador_club'), 'patch_07 must define es_admin_o_creador_club');

// 4.6 Club Frontend JS Resilience Audit
const clubIndexPath = 'public_html/js/club/index.js';
assert(fs.existsSync(clubIndexPath), `${clubIndexPath} must exist`);
const clubIndexContent = fs.readFileSync(clubIndexPath, 'utf8');

assert(clubIndexContent.includes('23505'), 'solicitarUnirseClub must handle code 23505 gracefully');
assert(clubIndexContent.includes('cpvJoinBtn'), 'solicitarUnirseClub must reactively update #cpvJoinBtn');
assert(clubIndexContent.includes('data-solicitud-id'), 'Club cards must include data-solicitud-id');
assert(clubIndexContent.includes('procesar_solicitud_club'), 'procesarSolicitud must invoke RPC procesar_solicitud_club');
assert(clubIndexContent.includes('cambiarTab'), 'procesarSolicitud must refresh dual UI in ClubPublic');
assert(clubIndexContent.includes('rolNorm === \'creador\''), 'expulsarMiembro must protect club creator');
assert(clubIndexContent.includes('.select()'), 'Miembro mutations must use .select() verification');

// 4.7 Club Cover Persistence & RPC Audit
assert(sqlContentRoot.includes('portada_url'), 'SQL must define or include portada_url');
assert(sqlContentRoot.includes('clubs_update_admin_or_creator'), 'SQL must define clubs_update_admin_or_creator policy');
assert(sqlContentRoot.includes('paddlesafe_storage_update'), 'SQL must define paddlesafe_storage_update policy');
assert(sqlContentBackend.includes('portada_url'), 'Backend SQL must define or include portada_url');
assert(sqlContentBackend.includes('clubs_update_admin_or_creator'), 'Backend SQL must define clubs_update_admin_or_creator policy');

const clubPhotosPath = 'public_html/js/club/club.photos.js';
assert(fs.existsSync(clubPhotosPath), `${clubPhotosPath} must exist`);
const clubPhotosContent = fs.readFileSync(clubPhotosPath, 'utf8');
assert(clubPhotosContent.includes('urlConCacheBuster'), 'club.photos.js must generate cache buster');
assert(clubPhotosContent.includes('portada_url') && clubPhotosContent.includes('banner_url'), 'club.photos.js must update both portada_url and banner_url');
assert(clubPhotosContent.includes('ClubState.myClubs'), 'club.photos.js must sync in-memory ClubState.myClubs');

const clubApiPath = 'public_html/js/club/api.js';
assert(fs.existsSync(clubApiPath), `${clubApiPath} must exist`);
const clubApiContent = fs.readFileSync(clubApiPath, 'utf8');
assert(clubApiContent.includes('.select()'), 'ClubAPI.updateField must use .select() verification');

// 4.8 Bug Purge & Dual-Column Triggers Audit
assert(sqlContentRoot.includes('fn_sync_clubs_dual_columns'), 'SQL must define fn_sync_clubs_dual_columns trigger function');
assert(sqlContentRoot.includes('fn_sync_perfiles_dual_columns'), 'SQL must define fn_sync_perfiles_dual_columns trigger function');
assert(sqlContentRoot.includes('rutas_likes'), 'SQL must define rutas_likes table and RLS');
assert(sqlContentRoot.includes('rutas_comentarios'), 'SQL must define rutas_comentarios table and RLS');
assert(sqlContentRoot.includes('clubs_invitaciones_select'), 'SQL must define clubs_invitaciones RLS policies');

assert(sqlContentBackend.includes('fn_sync_clubs_dual_columns'), 'Backend SQL must define fn_sync_clubs_dual_columns');
assert(sqlContentBackend.includes('fn_sync_perfiles_dual_columns'), 'Backend SQL must define fn_sync_perfiles_dual_columns');

const mainJsContent = fs.readFileSync('public_html/js/main.js', 'utf8');
assert(mainJsContent.includes('eliminarRutaUsuario'), 'main.js must define and export eliminarRutaUsuario');
assert(mainJsContent.includes('window.eliminarRutaUsuario = eliminarRutaUsuario'), 'main.js must bind eliminarRutaUsuario to window');

const socialJsCode = fs.readFileSync('public_html/js/social.js', 'utf8');
assert(socialJsCode.includes('eliminarRutaSocial'), 'social.js must define and export eliminarRutaSocial');
assert(socialJsCode.includes('window.eliminarRutaSocial = eliminarRutaSocial'), 'social.js must bind eliminarRutaSocial to window');

assert(clubIndexContent.includes('cambiarClubActivo'), 'club/index.js must define and export cambiarClubActivo');

assert(indexHtml.includes('tailwind.min.css'), 'index.html must link compiled tailwind.min.css');
assert(fs.existsSync('public_html/css/tailwind.min.css'), 'public_html/css/tailwind.min.css must exist');

// 4.9 Final Stabilization v60 Audit (Polymorphic FKs, Invitations, Image Compression)
assert(sqlContentRoot.includes('fn_validar_ruta_existe_en_rutas_o_user_routes'), 'SQL must define fn_validar_ruta_existe_en_rutas_o_user_routes polymorphic function');
assert(sqlContentRoot.includes('procesar_invitacion_club'), 'SQL must define procesar_invitacion_club RPC');
assert(sqlContentRoot.includes('fn_cascade_delete_ruta_polymorphic'), 'SQL must define fn_cascade_delete_ruta_polymorphic trigger function');
assert(sqlContentRoot.includes('uq_club_eventos_asistentes_evento_user'), 'SQL must define uq_club_eventos_asistentes_evento_user unique index');

assert(sqlContentBackend.includes('fn_validar_ruta_existe_en_rutas_o_user_routes'), 'Backend SQL must define fn_validar_ruta_existe_en_rutas_o_user_routes');
assert(sqlContentBackend.includes('procesar_invitacion_club'), 'Backend SQL must define procesar_invitacion_club');

const utilsJsContent = fs.readFileSync('public_html/js/utils.js', 'utf8');
assert(utilsJsContent.includes('comprimirImagenCliente'), 'utils.js must define and export comprimirImagenCliente');
assert(utilsJsContent.includes('window.comprimirImagenCliente = comprimirImagenCliente'), 'utils.js must bind comprimirImagenCliente to window');

const authJsCode = fs.readFileSync('public_html/js/auth.js', 'utf8');
assert(authJsCode.includes('comprimirImagenCliente'), 'auth.js must import and use comprimirImagenCliente for avatars');

const clubPhotosCode = fs.readFileSync('public_html/js/club/club.photos.js', 'utf8');
assert(clubPhotosCode.includes('comprimirImagenCliente'), 'club.photos.js must import and use comprimirImagenCliente for covers/logos');

assert(socialJsCode.includes('toggleComentariosRutaSocial'), 'social.js must define toggleComentariosRutaSocial');
assert(socialJsCode.includes('cargarComentariosRuta'), 'social.js must define cargarComentariosRuta');
assert(socialJsCode.includes('agregarComentarioRuta'), 'social.js must define agregarComentarioRuta');
assert(socialJsCode.includes('eliminarComentarioRuta'), 'social.js must define eliminarComentarioRuta');
assert(socialJsCode.includes('window.toggleComentariosRutaSocial = toggleComentariosRutaSocial'), 'social.js must bind comments functions to window');

const clubIndexLatest = fs.readFileSync('public_html/js/club/index.js', 'utf8');
assert(clubIndexLatest.includes('procesarInvitacion'), 'club/index.js must define procesarInvitacion');
assert(clubIndexLatest.includes('window.procesarInvitacionClub ='), 'club/index.js must expose window.procesarInvitacionClub');

const clubEventsLatest = fs.readFileSync('public_html/js/club/club.events.js', 'utf8');
assert(clubEventsLatest.includes('evento-count-'), 'club.events.js must bind dynamic counter ID');
assert(clubEventsLatest.includes('btn-asistir-'), 'club.events.js must bind dynamic button ID');

// 4.10 Batch #17 Spot Intelligence & Conditions Logbook Schema Audit
assert(sqlContentRoot.includes('spot_logbook'), 'Root SQL must define spot_logbook table');
assert(sqlContentRoot.includes('notas_tacticas'), 'Root SQL must extend user_spots with notas_tacticas');
assert(sqlContentRoot.includes('acceso_parking'), 'Root SQL must extend user_spots with acceso_parking');
assert(sqlContentRoot.includes('peligros_locales'), 'Root SQL must extend user_spots with peligros_locales');
assert(sqlContentRoot.includes('spot_logbook_select'), 'Root SQL must define spot_logbook_select policy');

assert(sqlContentBackend.includes('spot_logbook'), 'Backend SQL must define spot_logbook table');
assert(sqlContentBackend.includes('notas_tacticas'), 'Backend SQL must extend user_spots with notas_tacticas');
assert(sqlContentBackend.includes('acceso_parking'), 'Backend SQL must extend user_spots with acceso_parking');
assert(sqlContentBackend.includes('peligros_locales'), 'Backend SQL must extend user_spots with peligros_locales');

// 4.11 Social Feed Resilience & Decoupled Polymorphic Queries Audit
const socialJsUpdated = fs.readFileSync('public_html/js/social.js', 'utf8');
assert(socialJsUpdated.includes('cargarMas()'), 'social.js must implement socialFeed.cargarMas for pagination/infinite scroll');
assert(socialJsUpdated.includes('parseFechaSegura'), 'social.js must define parseFechaSegura for robust date sorting');
assert(socialJsUpdated.includes('debugTelemetry'), 'social.js must track debugTelemetry for production monitoring');
assert(!socialJsUpdated.includes("from('rutas')\n                        .select('id, user_id, ubicacion, distancia_km, tiempo_minutos, velocidad_media"), 'social.js must not select non-existent velocidad_media on rutas');

const clubPublicUpdated = fs.readFileSync('public_html/js/club/club.public.js', 'utf8');
assert(!clubPublicUpdated.includes("select('created_at, rutas("), 'club.public.js must not attempt PostgREST embedded FK join on club_rutas');
assert(clubPublicUpdated.includes("from('user_routes')"), 'club.public.js must support polymorphic routes from user_routes');

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
