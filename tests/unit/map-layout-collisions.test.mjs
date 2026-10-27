import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BASE_DIR = 'C:/Users/Usuario/Desktop/WEBS/PaddleSafe';

describe('SUITE DE UI/UX: LAYOUT DEL MAPA Y PREVENCIÓN DE SOLAPAMIENTOS', () => {

    const indexHtml = fs.readFileSync(path.join(BASE_DIR, 'public_html/index.html'), 'utf8');
    const tailwindCss = fs.readFileSync(path.join(BASE_DIR, 'public_html/css/tailwind.min.css'), 'utf8');
    const tailwindInputCss = fs.readFileSync(path.join(BASE_DIR, 'public_html/css/tailwind-input.css'), 'utf8');

    it('TAREA 2: #panelModificarRuta se renderiza inmediatamente al inicio de #proDashboardResumen antes de los paneles secundarios', () => {
        const dashboardIdx = indexHtml.indexOf('id="proDashboardResumen"');
        const panelModificarIdx = indexHtml.indexOf('id="panelModificarRuta"');
        const alertTopIdx = indexHtml.indexOf('id="proAlertTopContainer"');
        const horasIdx = indexHtml.indexOf('id="proDashHorasContainer"');

        assert(dashboardIdx !== -1, '#proDashboardResumen debe existir');
        assert(panelModificarIdx !== -1, '#panelModificarRuta debe existir');
        assert(panelModificarIdx > dashboardIdx, '#panelModificarRuta debe estar dentro de #proDashboardResumen');
        assert(panelModificarIdx < alertTopIdx, '#panelModificarRuta debe estar antes de #proAlertTopContainer');
        assert(panelModificarIdx < horasIdx, '#panelModificarRuta debe estar antes de paneles secundarios (horas)');
    });

    it('TAREA 2: Botón #btnVolverPlanificador conserva onclick="volverPlanificadorPro()" y diseño accesible', () => {
        assert(indexHtml.includes('id="btnVolverPlanificador"'), 'Debe existir #btnVolverPlanificador');
        assert(indexHtml.includes('onclick="volverPlanificadorPro()"'), 'Debe invocar volverPlanificadorPro()');
        assert(indexHtml.includes('Modificar Ruta o Salida'), 'Debe contener el texto visible para el usuario');
    });

    it('TAREA 1: #mapWindWaveHud tiene margen vertical inferior para no solapar #multipuntoToolbar en móvil', () => {
        // En HTML debe tener bottom-[74px] sm:bottom-6
        assert(indexHtml.includes('id="mapWindWaveHud" class="hidden absolute ps-map-telemetry-hud bottom-[74px] sm:bottom-6 right-3 sm:right-4'),
            'mapWindWaveHud debe tener bottom-[74px] en móvil para sobrevolar la barra multipunto (60px)');

        // En CSS compilado y de entrada debe tener bottom: 4.75rem
        assert(tailwindCss.includes('bottom: 4.75rem !important'), 'tailwind.min.css debe fijar bottom: 4.75rem en móvil para HUD');
        assert(tailwindInputCss.includes('bottom: 4.75rem !important'), 'tailwind-input.css debe fijar bottom: 4.75rem en móvil para HUD');
    });

    it('TAREA 1: Estratificación de Z-Index para controles Leaflet, toolbars y cockpits flotantes', () => {
        assert(tailwindCss.includes('#liveTrackingPanel'), 'tailwind.min.css debe elevar #liveTrackingPanel');
        assert(tailwindCss.includes('z-index: 1200 !important'), 'liveTrackingPanel debe tener z-index 1200 para no ser solapado por switcher');
        assert(tailwindCss.includes('#mapLayerSwitcher'), 'mapLayerSwitcher debe estar definido');
        assert(tailwindCss.includes('z-index: 1100 !important'), 'mapLayerSwitcher debe tener z-index 1100');
    });

    it('TAREA 1: Exclusión mutua de barras de control inferiores para evitar colisiones', () => {
        const radarJs = fs.readFileSync(path.join(BASE_DIR, 'public_html/js/map/map.radar.js'), 'utf8');
        const routesJs = fs.readFileSync(path.join(BASE_DIR, 'public_html/js/map/map.routes.js'), 'utf8');
        const trackerJs = fs.readFileSync(path.join(BASE_DIR, 'public_html/js/map/map.tracker.js'), 'utf8');

        // Radar oculta toolbar multipunto
        assert(radarJs.includes("toolbar.classList.replace('flex', 'hidden')"), 'activarModoRadar debe ocultar multipuntoToolbar');
        // Replay oculta toolbar multipunto
        assert(routesJs.includes("document.getElementById('multipuntoToolbar')?.classList.replace('flex', 'hidden')"), 'iniciarReplayRuta debe ocultar multipuntoToolbar');
        // Tracker oculta toolbar multipunto y HUD
        assert(trackerJs.includes("document.getElementById('multipuntoToolbar')?.classList.replace('flex', 'hidden')"), 'iniciarTravesia debe ocultar multipuntoToolbar');
    });

    it('TAREA 2: volverPlanificadorPro restaura la vista y realiza scroll suave defensivo hacia el planificador', async () => {
        const bentoMod = await import('../../public_html/js/map/map.bento.js');
        assert(typeof bentoMod.volverPlanificadorPro === 'function', 'volverPlanificadorPro debe ser una función exportada');

        // Mock básico de DOM para verificar ejecución sin excepciones
        let scrollCalled = false;
        const mockEvo = { classList: { add: () => {} }, innerHTML: 'badge' };
        const mockDash = { classList: { replace: (a, b) => {} } };
        const mockPlan = {
            classList: { remove: () => {}, add: () => {} },
            scrollIntoView: () => { scrollCalled = true; }
        };

        globalThis.document = {
            getElementById: (id) => {
                if (id === 'proRouteWeatherEvolutionBadge') return mockEvo;
                if (id === 'proDashboardResumen') return mockDash;
                if (id === 'proPlanificador') return mockPlan;
                return null;
            }
        };

        bentoMod.volverPlanificadorPro();
        assert.equal(scrollCalled, true, 'volverPlanificadorPro debe invocar scrollIntoView sobre #proPlanificador');
    });
});

