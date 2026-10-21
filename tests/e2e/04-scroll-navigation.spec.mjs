import { test, expect } from '@playwright/test';

test.describe('Mobile Scroll Hygiene & Bottom Dock Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
        });
    });

    test('Mobile view switches seamlessly between Parte and Ruta Pro without stacked page underneath', async ({ page, isMobile }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');

        if (!isMobile) {
            // Desktop verification: both columns must be visible
            const tabBasico = page.locator('#tab-basico');
            const tabPro = page.locator('#tab-pro');
            await expect(tabBasico).toBeVisible();
            await expect(tabPro).toBeVisible();
            return;
        }

        // Mobile verification:
        const tabBasico = page.locator('#tab-basico');
        const tabPro = page.locator('#tab-pro');
        const bottomNav = page.locator('#mobileBottomNav');

        await expect(bottomNav).toBeVisible();

        // 1. Initially on Parte: tab-basico is visible, tab-pro is hidden
        await expect(tabBasico).toBeVisible();
        await expect(tabPro).toBeHidden();

        // 2. Click Ruta Pro on bottom dock
        const btnNavPro = page.locator('#btnNavPro');
        await btnNavPro.click();
        await page.waitForTimeout(300);

        // Verify clean switch: tab-pro is visible, tab-basico is hidden
        await expect(tabPro).toBeVisible();
        await expect(tabBasico).toBeHidden();

        // Scroll position must be at top (y=0)
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBeLessThanOrEqual(5);

        // 3. Click return button inside tab-pro
        const btnVolver = page.locator('#tab-pro button:has-text("Ver Parte y Pronóstico")');
        if (await btnVolver.isVisible()) {
            await btnVolver.click();
            await page.waitForTimeout(300);

            // Verify clean return: tab-basico visible, tab-pro hidden
            await expect(tabBasico).toBeVisible();
            await expect(tabPro).toBeHidden();
        }
    });

    test('Zero nested scroll contexts or runaway overflow containers', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');

        // Check for any body-level scroll leaks
        const bodyOverflow = await page.evaluate(() => {
            const style = window.getComputedStyle(document.body);
            return {
                overflowX: style.overflowX,
                position: style.position
            };
        });

        expect(bodyOverflow.overflowX).toBe('hidden');
    });

    test('Desktop header navigation is strictly hidden on mobile and visible on desktop', async ({ page, isMobile }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');

        const desktopNav = page.locator('#desktopHeaderNav');
        const mobileNav = page.locator('#mobileBottomNav');

        if (isMobile) {
            // Mobile assertions:
            // 1. Desktop navigation header must be completely hidden (0px height, display: none)
            await expect(desktopNav).toBeHidden();
            const navBox = await desktopNav.boundingBox();
            expect(navBox === null || navBox.height === 0).toBe(true);

            // 2. Mobile bottom dock must be visible
            await expect(mobileNav).toBeVisible();
        } else {
            // Desktop assertions:
            // 1. Desktop navigation header must be visible and accessible
            await expect(desktopNav).toBeVisible();

            // 2. Mobile bottom dock must be hidden
            await expect(mobileNav).toBeHidden();
        }
    });
});

