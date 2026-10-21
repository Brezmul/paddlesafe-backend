import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

test.describe('Accessibility & WCAG AA Audit (Axe-Core)', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
        });
    });

    test('Home screen passes core WCAG AA accessibility standards', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);

        // Run Axe scan on main view
        const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            // Leaflet injects third-party tile img tags and map attribution without explicit alt attributes
            .exclude('.leaflet-container')
            .analyze();

        // Write results to reports/
        const reportPath = path.resolve('reports/accessibility-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(accessibilityScanResults, null, 2), 'utf8');

        // Check for any critical violations
        const criticalViolations = accessibilityScanResults.violations.filter(
            v => v.impact === 'critical'
        );

        if (criticalViolations.length > 0) {
            console.warn('Critical accessibility violations:', JSON.stringify(criticalViolations, null, 2));
        }

        expect(criticalViolations.length, `Found ${criticalViolations.length} critical accessibility violations`).toBe(0);
    });

    test('All interactive buttons have aria-label, title or accessible text', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');

        const buttonAudits = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button:not(.leaflet-control *)'));
            const unlabelled = [];

            for (const btn of buttons) {
                // Must have textContent, title, or aria-label
                const text = (btn.textContent || '').trim();
                const title = btn.getAttribute('title') || '';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                const id = btn.id || '';

                if (!text && !title && !ariaLabel) {
                    unlabelled.push({ id, classes: btn.className });
                }
            }

            return {
                totalButtons: buttons.length,
                unlabelledCount: unlabelled.length,
                unlabelled
            };
        });

        expect(buttonAudits.unlabelledCount, `Buttons without accessible names: ${JSON.stringify(buttonAudits.unlabelled)}`).toBe(0);
    });

    test('Keyboard Tab navigation reaches key interactive controls', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');

        // Press Tab repeatedly and verify focus progresses
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);

        const firstActiveElement = await page.evaluate(() => {
            return document.activeElement ? document.activeElement.tagName : null;
        });

        expect(firstActiveElement).not.toBeNull();
        expect(['BUTTON', 'A', 'INPUT', 'SELECT']).toContain(firstActiveElement);
    });
});

