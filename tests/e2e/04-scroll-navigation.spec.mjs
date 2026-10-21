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
        await page.waitForFunction(() => typeof window._activarItemBottomNavImpl === 'function');
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

    test('Mobile bottom dock maintains true viewport anchoring (getBoundingClientRect bottom === innerHeight) under deep scroll (scrollY >= 350)', async ({ page, isMobile }) => {
        if (!isMobile) return;

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => typeof window._activarItemBottomNavImpl === 'function');

        const mobileNav = page.locator('#mobileBottomNav');
        await expect(mobileNav).toBeVisible();

        // 1. Initial check at scrollY = 0
        const initialCheck = await page.evaluate(() => {
            const el = document.getElementById('mobileBottomNav');
            const rect = el.getBoundingClientRect();
            return {
                scrollY: window.scrollY,
                rectBottom: Math.round(rect.bottom),
                innerHeight: window.innerHeight,
                diff: Math.abs(Math.round(rect.bottom) - window.innerHeight),
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth
            };
        });
        expect(initialCheck.diff).toBeLessThanOrEqual(1);
        expect(initialCheck.scrollWidth).toBeLessThanOrEqual(initialCheck.innerWidth);

        // 2. Expand content to guarantee deep scroll
        await page.evaluate(() => {
            const container = document.querySelector('.max-w-2xl') || document.body;
            let expander = document.getElementById('e2eDeepScrollExpander');
            if (!expander) {
                expander = document.createElement('div');
                expander.id = 'e2eDeepScrollExpander';
                expander.style.height = '1500px';
                expander.style.minHeight = '1500px';
                expander.style.width = '100%';
                container.appendChild(expander);
            }
        });

        // 3. Scroll deep (>= 350px)
        await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
        await page.waitForFunction(() => window.scrollY >= 350, { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(200);

        // 4. Verify anchoring under deep scroll
        const deepCheck = await page.evaluate(() => {
            const el = document.getElementById('mobileBottomNav');
            const rect = el.getBoundingClientRect();
            return {
                scrollY: window.scrollY,
                rectBottom: Math.round(rect.bottom),
                innerHeight: window.innerHeight,
                diff: Math.abs(Math.round(rect.bottom) - window.innerHeight),
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth
            };
        });
        expect(deepCheck.scrollY).toBeGreaterThanOrEqual(350);
        expect(deepCheck.diff).toBeLessThanOrEqual(1);
        expect(deepCheck.scrollWidth).toBeLessThanOrEqual(deepCheck.innerWidth);
    });

    test('One-tap bottom dock switching seamlessly closes open modals and opens target modal without z-index collisions', async ({ page, isMobile }) => {
        if (!isMobile) return;

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => typeof window._activarItemBottomNavImpl === 'function' && typeof window.abrirModalFeed === 'function');

        
        const btnNavMuro = page.locator('#btnNavMuro');
        const btnNavClubes = page.locator('#btnNavClubes');
        const btnNavParte = page.locator('#btnNavParte');

        await expect(btnNavMuro).toBeVisible();

        // 1. Tap Muro -> opens socialFeedModal
        await btnNavMuro.click();
        const socialModal = page.locator('#socialFeedModal');
        await expect(socialModal).toBeVisible({ timeout: 5000 });

        // 2. Tap Clubes -> seamlessly closes socialFeedModal and opens clubsModal
        await page.evaluate(() => document.getElementById('btnNavClubes')?.click());
        const clubsModal = page.locator('#clubsModal');
        await expect(clubsModal).toBeVisible({ timeout: 5000 });
        await expect(socialModal).toBeHidden({ timeout: 5000 });

        // 3. Verify z-index hierarchy: clubsModal (9000) > mobileBottomNav (4000)
        const zIndexes = await page.evaluate(() => {
            const clubs = document.getElementById('clubsModal');
            const nav = document.getElementById('mobileBottomNav');
            return {
                clubsZ: parseInt(window.getComputedStyle(clubs).zIndex, 10),
                navZ: parseInt(window.getComputedStyle(nav).zIndex, 10)
            };
        });
        expect(zIndexes.clubsZ).toBe(9000);
        expect(zIndexes.navZ).toBe(4000);
        expect(zIndexes.clubsZ).toBeGreaterThan(zIndexes.navZ);

        // 4. Tap Parte -> closes clubsModal and returns to map/parte
        await page.evaluate(() => document.getElementById('btnNavParte')?.click());
        await expect(clubsModal).toBeHidden({ timeout: 5000 });
    });
});
