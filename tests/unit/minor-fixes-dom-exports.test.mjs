import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { pathToFileURL } from 'node:url';

const htmlPath = path.resolve('public_html/index.html');
const mapJsPath = path.resolve('public_html/js/map.js');
const spotsJsPath = path.resolve('public_html/js/map/map.spots.js');
const bentoJsPath = path.resolve('public_html/js/map/map.bento.js');
const routesJsPath = path.resolve('public_html/js/map/map.routes.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const mapJsContent = fs.readFileSync(mapJsPath, 'utf8');
const spotsJsContent = fs.readFileSync(spotsJsPath, 'utf8');
const bentoJsContent = fs.readFileSync(bentoJsPath, 'utf8');
const routesJsContent = fs.readFileSync(routesJsPath, 'utf8');

test('LEVE 1 - #basicCards existe en el DOM y seleccionarHoraTimeline tiene fallback de scroll', () => {
    // 1. #basicCards en index.html
    assert.match(
        htmlContent,
        /id="basicCards"/,
        '#basicCards debe estar definido en index.html sobre la rejilla de tarjetas meteorológicas'
    );

    // 2. Fallback de scroll defensivo en map.spots.js
    assert.match(
        spotsJsContent,
        /const elScroll = document\.getElementById\('basicCards'\) \|\| document\.getElementById\('tab-basico'\)/,
        'seleccionarHoraTimeline debe contar con resolución defensiva de scroll para basicCards y tab-basico'
    );
});

test('LEVE 2 - #proTramoDetalle existe en el DOM, en las tarjetas de tramo y en centrarTramoMapa', () => {
    // 1. Contenedor de tramos en index.html
    assert.match(
        htmlContent,
        /id="proTramoDetalle"/,
        '#proTramoDetalle debe estar definido en index.html como contenedor del desglose por tramos'
    );

    // 2. Tarjetas individuales de tramo con ID estructurado
    assert.match(
        bentoJsContent,
        /id="proTramoDetalle-\$\{i\}"/,
        'Cada tarjeta de tramo generada en map.bento.js debe tener id="proTramoDetalle-${i}"'
    );

    // 3. Auto-scroll en centrarTramoMapa
    assert.match(
        routesJsContent,
        /document\.getElementById\(`proTramoDetalle-\$\{tramoIndex\}`\) \|\| document\.getElementById\('proTramoDetalle'\)/,
        'centrarTramoMapa debe realizar scrollIntoView suave hacia la tarjeta o contenedor de tramo'
    );
});

test('LEVE 3 - Controles multimedia del timeline 24h vinculados en el DOM', () => {
    assert.match(
        htmlContent,
        /id="btnPlayTimeline24h"/,
        '#btnPlayTimeline24h debe existir en index.html en la cabecera de #fullDaySpotTimeline'
    );
    assert.match(
        htmlContent,
        /id="timelineScrubberClock"/,
        '#timelineScrubberClock debe existir en index.html para mostrar la hora activa del timeline'
    );
});

test('LEVE 4 - Re-exportación limpia de estamparPosterFinisherCanvas en map.js sin duplicidades', async () => {
    // 1. Verificar que no haya doble import/export nominal manual
    assert.ok(
        !mapJsContent.includes("import { estamparPosterFinisherCanvas } from './map/map.poster.js'"),
        'map.js no debe importar nominalmente estamparPosterFinisherCanvas cuando usa export *'
    );

    // 2. Verificar que se re-exporta correctamente mediante export * from './map/map.poster.js'
    assert.match(
        mapJsContent,
        /export \* from '\.\/map\/map\.poster\.js';/,
        "map.js debe contener export * from './map/map.poster.js';"
    );

    // 3. Importación dinámica para verificar que la re-exportación es efectiva en el runtime ESM
    const mapModule = await import(pathToFileURL(path.resolve('public_html/js/map.js')).href);
    assert.equal(
        typeof mapModule.estamparPosterFinisherCanvas,
        'function',
        'map.js debe exportar estamparPosterFinisherCanvas como función'
    );
});
