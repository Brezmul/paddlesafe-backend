import { test, expect } from '@playwright/test';

test.describe('Advanced Marine Radar Cockpit Suite', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
        });
        await page.goto('/');
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
            await page.evaluate(() => {
                if (typeof window.inicializarMapa === 'function' && !window.map) {
                    window.inicializarMapa();
                }
            });
            await page.waitForTimeout(300);
        }
    });

    test('Radar cockpit panel opens, closes and displays quick verdict', async ({ page }) => {
        // Switch to radar layer via layer switcher to open cockpit
        const radarLayerBtn = page.locator('#mapLayerSwitcher button[data-map-layer="oscuro"]');
        await radarLayerBtn.scrollIntoViewIfNeeded();
        await radarLayerBtn.click({ force: true });
        await page.waitForTimeout(300);

        const radarPanel = page.locator('#radarCockpitPanel');
        await expect(radarPanel).toBeVisible();

        // Check header title and verdict badge
        const title = radarPanel.locator('h4');
        await expect(title).toContainText('Radar Marítimo Avanzado');

        const verdictBadge = page.locator('#radarVerdictBadge');
        await expect(verdictBadge).toBeVisible();

        // Close radar cockpit panel via close button
        const closeBtn = radarPanel.locator('button[title="Minimizar panel radar"]');
        await expect(closeBtn).toBeVisible();
        await closeBtn.click();
        await page.waitForTimeout(200);

        await expect(radarPanel).toBeHidden();
    });

    test('Radar layer buttons toggle smoothly without runtime errors', async ({ page }) => {
        // Open radar panel
        await page.evaluate(() => {
            const p = document.getElementById('radarCockpitPanel');
            if (p) p.classList.remove('hidden');
        });
        await page.waitForTimeout(200);

        const btnWind = page.locator('#btnRadarLayerWind');
        const btnRain = page.locator('#btnRadarLayerRain');
        const btnWave = page.locator('#btnRadarLayerWave');
        const btnDrift = page.locator('#btnRadarLayerDrift');

        await expect(btnWind).toBeVisible();
        await expect(btnRain).toBeVisible();
        await expect(btnWave).toBeVisible();
        await expect(btnDrift).toBeVisible();

        // Toggle each layer
        await btnWind.scrollIntoViewIfNeeded();
        await btnWind.click({ force: true });
        await page.waitForTimeout(150);

        await btnRain.click({ force: true });
        await page.waitForTimeout(150);

        await btnWave.click({ force: true });
        await page.waitForTimeout(150);

        await btnDrift.click({ force: true });
        await page.waitForTimeout(150);

        // Capture screenshot of radar panel
        await page.screenshot({ path: 'reports/screenshots/radar_panel.png' });
    });
});
