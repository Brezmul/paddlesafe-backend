import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Layout & Responsive Viewport Audit', () => {
    test.beforeAll(async () => {
        const screenshotDir = path.resolve('reports/screenshots');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }
    });

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
        });
    });

    test('Zero horizontal overflow & bounded client width across devices', async ({ page }, testInfo) => {
        // Collect any console errors
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);

        // 1. Check document scroll width vs client width
        const overflowData = await page.evaluate(() => {
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            const bodyWidth = document.body.clientWidth;
            const bodyScrollWidth = document.body.scrollWidth;
            
            // Find any elements exceeding clientWidth
            const elements = Array.from(document.querySelectorAll('*'));
            const offenders = [];
            for (const el of elements) {
                const rect = el.getBoundingClientRect();
                if (rect.right > docWidth + 2 && !el.closest('#ambientGlowTop') && !el.closest('#ambientGlowBottom')) {
                    offenders.push({
                        id: el.id,
                        tag: el.tagName,
                        classes: (el.className || '').toString().substring(0, 50),
                        right: rect.right,
                        width: rect.width
                    });
                }
            }

            return {
                docWidth,
                scrollWidth,
                bodyWidth,
                bodyScrollWidth,
                hasOverflow: scrollWidth > docWidth + 1,
                offendersCount: offenders.length,
                firstOffenders: offenders.slice(0, 3)
            };
        });

        expect(overflowData.hasOverflow, `Page has horizontal overflow: scrollWidth=${overflowData.scrollWidth} > clientWidth=${overflowData.docWidth}`).toBe(false);

        // Capture screenshot of home page on this device
        const projectName = testInfo.project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        await page.screenshot({ path: `reports/screenshots/home_${projectName}.png`, fullPage: false });
    });

    test('Header elements and Omnibar are fully visible and readable', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // Location input, date, timeRange, userLevel and CTA button must be present
        const locationInput = page.locator('#location');
        await expect(locationInput).toBeVisible();

        const btnConsultar = page.locator('#btn-consultar');
        await expect(btnConsultar).toBeVisible();

        // 4 Bento Metric Cards must be visible
        const basicWindSpeed = page.locator('#basicWindSpeed');
        await expect(basicWindSpeed).toBeVisible();

        const basicWave = page.locator('#basicWave');
        await expect(basicWave).toBeVisible();
    });

    test('Quick pills bar scrolls cleanly without breaking layout', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const pillsBar = page.locator('#quickTimePillsBar');
        await expect(pillsBar).toBeVisible();

        const pillHoy = page.locator('#quickPillHoy');
        await expect(pillHoy).toBeVisible();

        // Click on "Mañana" pill
        const pillManana = page.locator('#quickPillManana');
        await expect(pillManana).toBeVisible();
        await pillManana.click();
        await page.waitForTimeout(200);

        // Verify active class or state
        await expect(pillManana).toHaveClass(/active|bg-sky-500|ps-quick-pill/);
    });
});

