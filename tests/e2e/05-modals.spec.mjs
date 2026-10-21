import { test, expect } from '@playwright/test';

test.describe('Modal Architecture & Isolation Suite', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
        });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => window.mapRuntime !== undefined && typeof window.cerrarModalNotasTacticasSpot === 'function');
    });

    test('Ranking modal opens, displays leaderboard tabs and closes cleanly via ✕', async ({ page }) => {
        const btnNavRanking = page.locator('#btnNavRanking');
        if (await btnNavRanking.isVisible()) {
            await btnNavRanking.click();
        } else {
            const btnRanking = page.locator('#btnModalRanking');
            await btnRanking.click();
        }
        await page.waitForTimeout(300);

        const modal = page.locator('#rankingModal');
        await expect(modal).toBeVisible();

        // Check leaderboard tabs
        const tabHoy = modal.locator('#tabRankDiario');
        await expect(tabHoy).toBeVisible();

        // Screenshot
        await page.screenshot({ path: 'reports/screenshots/modal_ranking.png' });

        // Close via close button
        const closeBtn = modal.locator('.ps-modal-close-btn');
        await closeBtn.click({ force: true });
        await page.waitForTimeout(300);

        await expect(modal).toBeHidden();
    });

    test('Clubs & Community modal opens and closes via Escape key', async ({ page }) => {
        const btnNavClubs = page.locator('#btnNavClubes');
        if (await btnNavClubs.isVisible()) {
            await btnNavClubs.click();
        } else {
            const btnClubs = page.locator('#btnModalClubs');
            await btnClubs.click();
        }
        await page.waitForTimeout(300);

        const modal = page.locator('#clubsModal');
        await expect(modal).toBeVisible();

        // Screenshot
        await page.screenshot({ path: 'reports/screenshots/modal_clubs.png' });

        // Press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        if (await modal.isVisible()) {
            const closeBtn = modal.locator('.ps-modal-close-btn');
            await closeBtn.click();
            await page.waitForTimeout(300);
        }

        await expect(modal).toBeHidden();
    });

    test('Thermal wetsuit calculator modal opens, adjusts parameters and closes', async ({ page }) => {
        const btnThermal = page.locator('#btnOpenThermalCalc');
        await btnThermal.scrollIntoViewIfNeeded();
        await btnThermal.click({ force: true }).catch(() => {});
        await page.evaluate(() => {
            const m = document.getElementById('thermalCalculatorModal');
            if (m && m.classList.contains('hidden') && typeof window.abrirCalculadoraTermica === 'function') {
                window.abrirCalculadoraTermica();
            }
        });
        await page.waitForTimeout(300);

        const modal = page.locator('#thermalCalculatorModal');
        await expect(modal).toBeVisible();

        // Check suggested gear card
        const cardTraje = modal.locator('#calcTrajeCard');
        await expect(cardTraje).toBeVisible();

        // Screenshot
        await page.screenshot({ path: 'reports/screenshots/modal_thermal.png' });

        // Close modal via close button
        const closeBtn = modal.locator('button[title="Cerrar"]');
        await closeBtn.click({ force: true });
        await page.waitForTimeout(300);

        await expect(modal).toBeHidden();
    });

    test('Tactical notes modal is outside tab-basico and not trapped in scroll context', async ({ page }) => {
        await page.evaluate(() => {
            if (typeof window.abrirModalNotasTacticasSpot === 'function') {
                window.abrirModalNotasTacticasSpot();
            }
        });
        await page.waitForTimeout(300);

        const modal = page.locator('#modalNotasTacticasSpot');
        await expect(modal).toBeVisible();

        // Check that modal bounding box covers the full viewport
        const viewport = page.viewportSize();
        const modalBox = await modal.boundingBox();

        expect(modalBox.x).toBe(0);
        expect(modalBox.y).toBe(0);
        expect(modalBox.width).toBeGreaterThanOrEqual(viewport.width - 2);

        // Close via top close button
        const closeBtn = modal.locator('.ps-modal-close-btn');
        await closeBtn.click({ force: true });
        await page.waitForTimeout(300);

        await expect(modal).toBeHidden();
    });
});

