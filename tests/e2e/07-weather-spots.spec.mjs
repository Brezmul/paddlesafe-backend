import { test, expect } from '@playwright/test';

test.describe('Weather & Spot Selection Engine (End-to-End)', () => {
    let pageErrors = [];

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', err => {
            pageErrors.push(err.message || String(err));
        });

        await page.addInitScript(() => {
            try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
        });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.consultarBasico === 'function');
    });

    test('Caso 1: Denia -> Spot seleccionado, pronóstico cargado, cero ReferenceError', async ({ page }) => {
        const locationInput = page.locator('#location');
        await expect(locationInput).toBeVisible();

        await locationInput.fill('Denia');
        const btnConsultar = page.locator('#btn-consultar');
        await btnConsultar.click();

        const resultado = page.locator('#resultado');
        await expect(resultado).toBeVisible();

        // Esperar a que finalice la consulta a la API meteorológica
        await expect(resultado).not.toContainText('Actualizando parte', { timeout: 15000 });
        await expect(resultado).not.toContainText('No se pudo cargar el pronóstico');
        await expect(resultado).toHaveText(/D[eé]nia/i);

        // Telemetría básica debe estar renderizada
        const basicWindSpeed = page.locator('#basicWindSpeed');
        await expect(basicWindSpeed).not.toHaveText('--', { timeout: 5000 });
        await expect(basicWindSpeed).toContainText('kt');

        const basicWave = page.locator('#basicWave');
        await expect(basicWave).not.toHaveText('--', { timeout: 5000 });

        // Validar que mapRuntime tiene coordenadas reales de Denia
        const coords = await page.evaluate(() => ({
            lat: window.mapRuntime?.latitudActual,
            lon: window.mapRuntime?.longitudActual
        }));

        expect(coords.lat).toBeGreaterThanOrEqual(38.7);
        expect(coords.lat).toBeLessThanOrEqual(38.95);

        // Ningún ReferenceError de latitudActual
        const refErrors = pageErrors.filter(e => e.includes('latitudActual') || e.includes('ReferenceError'));
        expect(refErrors).toHaveLength(0);
    });

    test('Caso 2: Jávea -> Muestra información meteorológica válida sin excepciones', async ({ page }) => {
        const locationInput = page.locator('#location');
        await locationInput.fill('Jávea');

        const btnConsultar = page.locator('#btn-consultar');
        await btnConsultar.click();

        const resultado = page.locator('#resultado');
        await expect(resultado).toBeVisible();
        await expect(resultado).not.toContainText('Actualizando parte', { timeout: 15000 });
        await expect(resultado).not.toContainText('No se pudo cargar el pronóstico');
        await expect(resultado).toHaveText(/J[aá]vea/i);

        // Validar telemetría
        const basicWind = page.locator('#basicWindSpeed');
        await expect(basicWind).not.toHaveText('--', { timeout: 5000 });

        // Validar ausencia de errores JS
        const refErrors = pageErrors.filter(e => e.includes('latitudActual') || e.includes('ReferenceError'));
        expect(refErrors).toHaveLength(0);
    });

    test('Caso 3: Moraira -> Selección y datos de viento y mar', async ({ page }) => {
        const locationInput = page.locator('#location');
        await locationInput.fill('Moraira');

        const btnConsultar = page.locator('#btn-consultar');
        await btnConsultar.click();

        const resultado = page.locator('#resultado');
        await expect(resultado).toBeVisible();
        await expect(resultado).not.toContainText('Actualizando parte', { timeout: 15000 });
        await expect(resultado).not.toContainText('No se pudo cargar el pronóstico');
        await expect(resultado).toHaveText(/Moraira/i);

        const basicWave = page.locator('#basicWave');
        await expect(basicWave).not.toHaveText('--', { timeout: 5000 });

        // Validar rosa de viento / dirección
        const windDir = page.locator('#basicWindDir');
        await expect(windDir).toBeVisible();

        const refErrors = pageErrors.filter(e => e.includes('latitudActual') || e.includes('ReferenceError'));
        expect(refErrors).toHaveLength(0);
    });

    test('Caso 4: Spot inexistente -> Muestra mensaje de validación amigable sin producir crash JS', async ({ page }) => {
        const locationInput = page.locator('#location');
        await locationInput.fill('SpotFantasmaTotalInexistente999XYZ');

        const btnConsultar = page.locator('#btn-consultar');
        await btnConsultar.click();

        const resultado = page.locator('#resultado');
        await expect(resultado).toBeVisible();
        await expect(resultado).not.toContainText('Actualizando parte', { timeout: 15000 });

        // Debe mostrar mensaje amigable de coordenadas / spot no encontrado
        await expect(resultado).toContainText('No se encontraron coordenadas');

        // Cero ReferenceError o excepciones no controladas
        const refErrors = pageErrors.filter(e => e.includes('latitudActual') || e.includes('ReferenceError'));
        expect(refErrors).toHaveLength(0);
    });
});
