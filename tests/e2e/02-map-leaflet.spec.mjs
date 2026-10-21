import { test, expect } from '@playwright/test';
import { setupWeatherMocks } from './helpers/weather-mock.mjs';

test.describe('Leaflet Map & Cockpit Controls Audit', () => {
    test.beforeEach(async ({ page }) => {
        await setupWeatherMocks(page);
        await page.addInitScript(() => {
            try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
        });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => window.mapRuntime !== undefined);

        const isMobile = await page.evaluate(() => window.innerWidth < 1024);
        if (isMobile) {
            const btnNavPro = page.locator('#btnNavPro');
            if (await btnNavPro.isVisible()) {
                await btnNavPro.click();
                await page.waitForTimeout(300);
            }
        } else {
            // Ensure map is initialized on desktop
            await page.evaluate(() => {
                if (typeof window.inicializarMapa === 'function' && !window.map) {
                    window.inicializarMapa();
                }
            });
            await page.waitForTimeout(300);
        }
    });

    test('Leaflet map container initializes and renders tiles', async ({ page }) => {
        const mapContainer = page.locator('#mapaInteractivo');
        await expect(mapContainer).toBeVisible();

        // Ensure Leaflet has attached its class and map instance exists
        await expect(mapContainer).toHaveClass(/leaflet-container/);

        const zoomLevel = await page.evaluate(() => {
            return window.map ? window.map.getZoom() : null;
        });
        expect(zoomLevel).not.toBeNull();
        expect(zoomLevel).toBeGreaterThan(0);
    });

    test('Zoom controls (+ / -) are functional and clickable', async ({ page }) => {
        const zoomInBtn = page.locator('.leaflet-control-zoom-in');
        const zoomOutBtn = page.locator('.leaflet-control-zoom-out');

        await expect(zoomInBtn).toBeVisible();
        await expect(zoomOutBtn).toBeVisible();

        const initialZoom = await page.evaluate(() => window.map.getZoom());

        // Click zoom in
        await zoomInBtn.click();
        await page.waitForTimeout(400);
        const zoomedIn = await page.evaluate(() => window.map.getZoom());
        expect(zoomedIn).toBe(initialZoom + 1);

        // Click zoom out
        await zoomOutBtn.click();
        await page.waitForTimeout(400);
        const zoomedOut = await page.evaluate(() => window.map.getZoom());
        expect(zoomedOut).toBe(initialZoom);
    });

    test('Base layer switcher toggles between Nautical, Satellite and Radar modes', async ({ page }) => {
        const switcher = page.locator('#mapLayerSwitcher');
        await expect(switcher).toBeVisible();

        const sateliteBtn = switcher.locator('button[data-map-layer="satelite"]');
        await sateliteBtn.click();
        await page.waitForTimeout(300);

        // Verify active state
        await expect(sateliteBtn).toHaveClass(/border-sky-400|bg-sky-500/);

        const nauticoBtn = switcher.locator('button[data-map-layer="nautico"]');
        await nauticoBtn.click();
        await page.waitForTimeout(300);
        await expect(nauticoBtn).toHaveClass(/border-sky-400|bg-sky-500/);
    });

    test('Leaflet zoom controls are never covered by floating panels (Radar, Quedada)', async ({ page }) => {
        // Open Radar Cockpit Panel
        await page.evaluate(() => {
            const p = document.getElementById('radarCockpitPanel');
            if (p) p.classList.remove('hidden');
        });
        await page.waitForTimeout(200);

        const zoomRect = await page.locator('.leaflet-control-zoom').boundingBox();
        const radarRect = await page.locator('#radarCockpitPanel').boundingBox();

        expect(zoomRect).not.toBeNull();
        expect(radarRect).not.toBeNull();

        // The radar cockpit panel top must be greater than or equal to zoom control bottom
        // or horizontally separated
        const isVerticallyClear = radarRect.y >= (zoomRect.y + zoomRect.height - 2);
        const isHorizontallyClear = radarRect.x >= (zoomRect.x + zoomRect.width) || (radarRect.x + radarRect.width) <= zoomRect.x;

        expect(isVerticallyClear || isHorizontallyClear, `Collision detected between Leaflet zoom and Radar Cockpit: zoom bottom=${zoomRect.y + zoomRect.height}, radar top=${radarRect.y}`).toBe(true);
    });

    test('Clicking on map displays Wind/Wave telemetry HUD with dismiss button', async ({ page }) => {
        // Trigger HUD directly with sample telemetry
        await page.evaluate(() => {
            if (typeof window.actualizarHudVectoresMapa === 'function') {
                window.actualizarHudVectoresMapa(38.80, 0.18, {
                    windSpeed: 4.2,
                    windGusts: 6.1,
                    windDirection: 90,
                    waveHeight: 0.4,
                    wavePeriod: 5.0
                });
            }
        });
        await page.waitForTimeout(200);

        const hud = page.locator('#mapWindWaveHud');
        await expect(hud).toBeVisible();

        // Check dismiss button works
        const closeBtn = hud.locator('button[title="Cerrar HUD"]');
        await expect(closeBtn).toBeVisible();
        await closeBtn.click();
        await page.waitForTimeout(200);

        await expect(hud).toBeHidden();
    });
    test('Telemetry HUD and Layer Switcher have zero overlap and maintain adequate separation distance', async ({ page }) => {
        // Trigger HUD
        await page.evaluate(() => {
            if (typeof window.actualizarHudVectoresMapa === 'function') {
                window.actualizarHudVectoresMapa(38.80, 0.18, {
                    windSpeed: 4.2,
                    windGusts: 6.1,
                    windDirection: 90,
                    waveHeight: 0.4,
                    wavePeriod: 5.0
                });
            }
        });
        await page.waitForTimeout(200);

        const switcher = page.locator('#mapLayerSwitcher');
        const hud = page.locator('#mapWindWaveHud');

        await expect(switcher).toBeVisible();
        await expect(hud).toBeVisible();

        const switcherRect = await switcher.boundingBox();
        const hudRect = await hud.boundingBox();

        expect(switcherRect).not.toBeNull();
        expect(hudRect).not.toBeNull();

        // 1. Zero vertical or horizontal overlap
        const hasOverlap = !(
            hudRect.x >= switcherRect.x + switcherRect.width ||
            hudRect.x + hudRect.width <= switcherRect.x ||
            hudRect.y >= switcherRect.y + switcherRect.height ||
            hudRect.y + hudRect.height <= switcherRect.y
        );
        expect(hasOverlap, 'mapWindWaveHud and mapLayerSwitcher must never overlap').toBe(false);

        // 2. Sufficient vertical separation (HUD at bottom-right, Switcher at top-right)
        const verticalDistance = hudRect.y - (switcherRect.y + switcherRect.height);
        expect(verticalDistance, `Vertical distance between Switcher and HUD must be > 50px, got ${verticalDistance}`).toBeGreaterThan(50);
    });
});
