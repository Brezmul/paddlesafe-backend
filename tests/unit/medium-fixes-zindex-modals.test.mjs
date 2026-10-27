import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve('public_html/index.html');
const tailwindInputPath = path.resolve('public_html/css/tailwind-input.css');
const tailwindMinPath = path.resolve('public_html/css/tailwind.min.css');
const trackerJsPath = path.resolve('public_html/js/map/map.tracker.js');
const coachJsPath = path.resolve('public_html/js/map/map.coach.js');
const socialJsPath = path.resolve('public_html/js/social.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const inputCssContent = fs.readFileSync(tailwindInputPath, 'utf8');
const minCssContent = fs.readFileSync(tailwindMinPath, 'utf8');
const trackerJsContent = fs.readFileSync(trackerJsPath, 'utf8');
const coachJsContent = fs.readFileSync(coachJsPath, 'utf8');
const socialJsContent = fs.readFileSync(socialJsPath, 'utf8');

test('MEDIO 1 - #posterFinisherLightbox cuenta con ps-modal-backdrop y elevación z-index: 9000', () => {
    // 1. En index.html estático
    assert.match(
        htmlContent,
        /id="posterFinisherLightbox"[^>]*ps-modal-backdrop/,
        '#posterFinisherLightbox en index.html debe incluir la clase ps-modal-backdrop'
    );

    // 2. En social.js al crearse dinámicamente
    assert.match(
        socialJsContent,
        /lb\.id\s*=\s*['"]posterFinisherLightbox['"][\s\S]*?lb\.className\s*=\s*['"][^'"]*ps-modal-backdrop/,
        '#posterFinisherLightbox dinámico en social.js debe incluir ps-modal-backdrop'
    );

    // 3. Elevación explícita a 9000 en tailwind-input.css
    assert.ok(
        inputCssContent.includes('#posterFinisherLightbox') && inputCssContent.includes('z-index: 9000 !important;'),
        '#posterFinisherLightbox debe estar en la lista de z-index: 9000 en tailwind-input.css'
    );

    // 4. Elevación en tailwind.min.css compilado
    assert.ok(
        minCssContent.includes('#posterFinisherLightbox'),
        '#posterFinisherLightbox debe existir en la lista de modales de tailwind.min.css'
    );
});

test('MEDIO 2 - #modalSplitsKm cuenta con ps-modal-backdrop, conserva z-[1200] y eleva a 9000', () => {
    // 1. En map.tracker.js
    assert.match(
        trackerJsContent,
        /modal\.id\s*=\s*['"]modalSplitsKm['"][\s\S]*?modal\.className\s*=\s*['"][^'"]*ps-modal-backdrop/,
        '#modalSplitsKm debe incluir ps-modal-backdrop en map.tracker.js'
    );
    assert.match(
        trackerJsContent,
        /modal\.id\s*=\s*['"]modalSplitsKm['"][\s\S]*?modal\.className\s*=\s*['"][^'"]*z-\[1200\]/,
        '#modalSplitsKm debe conservar z-[1200] para compatibilidad con la suite de smoke tests'
    );

    // 2. Elevación en CSS
    assert.ok(
        inputCssContent.includes('#modalSplitsKm') && minCssContent.includes('#modalSplitsKm'),
        '#modalSplitsKm debe estar en la lista de modales con z-index: 9000 en input y min CSS'
    );
});

test('MEDIO 3 - #modalAiRouteCoach cuenta con ps-modal-backdrop y elevación z-index: 9000', () => {
    // 1. En map.coach.js
    assert.match(
        coachJsContent,
        /modal\.id\s*=\s*['"]modalAiRouteCoach['"][\s\S]*?modal\.className\s*=\s*['"][^'"]*ps-modal-backdrop/,
        '#modalAiRouteCoach debe incluir ps-modal-backdrop en map.coach.js'
    );

    // 2. Elevación en CSS
    assert.ok(
        inputCssContent.includes('#modalAiRouteCoach') && minCssContent.includes('#modalAiRouteCoach'),
        '#modalAiRouteCoach debe estar en la lista de modales con z-index: 9000 en input y min CSS'
    );
});

test('MEDIO 4 - #radarBottomBar cuenta con elevación z-[1010] sobre Leaflet y padding ergonómico', () => {
    // 1. En index.html
    assert.match(
        htmlContent,
        /id="radarBottomBar"[^>]*z-\[1010\]/,
        '#radarBottomBar en index.html debe tener z-[1010] para superar los panes de Leaflet'
    );
    assert.match(
        htmlContent,
        /id="radarBottomBar"[^>]*p-2\s+sm:p-2\.5/,
        '#radarBottomBar en index.html debe tener padding compacto en móvil p-2 sm:p-2.5'
    );

    // 2. En tailwind-input.css
    assert.match(
        inputCssContent,
        /#radarBottomBar\s*\{[\s\S]*?z-index:\s*1010\s*!important;[\s\S]*?padding:\s*0\.5rem\s*!important;/,
        '#radarBottomBar en tailwind-input.css debe tener z-index: 1010 y padding: 0.5rem'
    );

    // 3. En tailwind.min.css
    assert.match(
        minCssContent,
        /#radarBottomBar\s*\{[\s\S]*?z-index:\s*1010\s*!important;[\s\S]*?padding:\s*0\.5rem\s*!important;/,
        '#radarBottomBar en tailwind.min.css debe tener z-index: 1010 y padding: 0.5rem'
    );
});

