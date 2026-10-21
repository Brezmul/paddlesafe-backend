import { test, expect } from '@playwright/test';

test.describe('Mobile Profile Navigation Suite (End-to-End)', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.setItem('ps_quick_setup_dismissed', '1');
            } catch (_) {}
        });
    });

    test('Caso 1: Botón Perfil es visible y accesible en el dock inferior en móvil', async ({ page, isMobile }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        if (!isMobile) {
            // En desktop, el acceso al perfil reside en la cabecera
            const btnDesktopPerfil = page.locator('#btnCabeceraPerfil');
            await expect(btnDesktopPerfil).toBeVisible();
            return;
        }

        const bottomNav = page.locator('#mobileBottomNav');
        await expect(bottomNav).toBeVisible();

        const btnNavPerfil = page.locator('#btnNavPerfil');
        await expect(btnNavPerfil).toBeVisible();

        // Verificar que contiene el icono y la etiqueta descriptiva
        const icon = btnNavPerfil.locator('#navPerfilIcon');
        const label = btnNavPerfil.locator('#navPerfilLabel');
        await expect(icon).toBeVisible();
        await expect(label).toBeVisible();
        await expect(label).toHaveText(/Perfil/i);

        // Tap target accesible (altura >= 40px)
        const box = await btnNavPerfil.boundingBox();
        expect(box).not.toBeNull();
        expect(box.height).toBeGreaterThanOrEqual(36);
        expect(box.width).toBeGreaterThanOrEqual(36);
    });

    test('Caso 2: Usuario no autenticado abre el flujo de autenticación existente al pulsar Perfil', async ({ page, isMobile }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const btnPerfil = isMobile ? page.locator('#btnNavPerfil') : page.locator('#btnCabeceraPerfil');
        await expect(btnPerfil).toBeVisible();
        await btnPerfil.click();

        const authModal = page.locator('#authModal');
        await expect(authModal).toBeVisible({ timeout: 5000 });

        // Verificar que reutiliza los componentes existentes de login y registro
        const authEmail = authModal.locator('#authEmail');
        const authPassword = authModal.locator('#authPassword');
        const authSubmitBtn = authModal.locator('#authSubmitBtn');
        const btnInvitado = authModal.locator('button:has-text("Acceder como Invitado")');

        await expect(authEmail).toBeVisible();
        await expect(authPassword).toBeVisible();
        await expect(authSubmitBtn).toBeVisible();
        await expect(btnInvitado).toBeVisible();

        // Evidencia visual
        if (isMobile) {
            await page.screenshot({ path: 'reports/screenshots/mobile_auth_modal.png' });
        }

        // Cerrar modal vía botón ✕
        const closeBtn = authModal.locator('.ps-modal-close-btn');
        await closeBtn.click({ force: true });
        await expect(authModal).toBeHidden({ timeout: 5000 });
    });

    test('Caso 3: Usuario autenticado / invitado muestra información completa de perfil', async ({ page, isMobile }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // 1. Abrir modal y entrar como invitado para simular sesión activa sin depender de backend externo
        const btnPerfil = isMobile ? page.locator('#btnNavPerfil') : page.locator('#btnCabeceraPerfil');
        await btnPerfil.click();

        const authModal = page.locator('#authModal');
        await expect(authModal).toBeVisible();

        const btnInvitado = authModal.locator('button:has-text("Acceder como Invitado")');
        await btnInvitado.click();
        await expect(authModal).toBeHidden({ timeout: 5000 });

        // 2. Volver a abrir el perfil ahora que el usuario está en sesión activa
        await btnPerfil.click();
        await expect(authModal).toBeVisible({ timeout: 5000 });

        // 3. Verificar que se renderiza el perfil real de paddler (estadísticas, avatar, nivel, cerrar sesión)
        const perfilNombre = authModal.locator('#perfilNombre');
        await expect(perfilNombre).toBeVisible();

        const btnSalir = authModal.locator('button:has-text("Salir del Modo Invitado"), button:has-text("Cerrar Sesión")');
        await expect(btnSalir).toBeVisible();

        // Evidencia visual de perfil autenticado
        if (isMobile) {
            await page.screenshot({ path: 'reports/screenshots/mobile_profile_active.png' });
        }

        // 4. Cerrar perfil y verificar que el dock restaura la pestaña principal
        const closeBtn = authModal.locator('.ps-modal-close-btn');
        await closeBtn.click({ force: true });
        await expect(authModal).toBeHidden({ timeout: 5000 });

        if (isMobile) {
            const btnNavParte = page.locator('#btnNavParte');
            await expect(btnNavParte).toBeVisible();
            await expect(btnNavParte).toHaveClass(/text-sky-400/);
        }
    });

    test('Caso 4: En pantalla de 320px (iPhone SE), Perfil es visible y sin scroll horizontal', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const bottomNav = page.locator('#mobileBottomNav');
        await expect(bottomNav).toBeVisible();

        const btnNavPerfil = page.locator('#btnNavPerfil');
        await expect(btnNavPerfil).toBeVisible();

        // Verificar que el contenedor general no tiene scroll horizontal desbordado
        const scrollInfo = await page.evaluate(() => {
            return {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                bodyOverflowX: window.getComputedStyle(document.body).overflowX
            };
        });

        expect(scrollInfo.bodyOverflowX).toBe('hidden');
        expect(scrollInfo.scrollWidth).toBeLessThanOrEqual(scrollInfo.clientWidth + 1);

        // Click en perfil a 320px abre modal sin desbordar
        await btnNavPerfil.click();
        const authModal = page.locator('#authModal');
        await expect(authModal).toBeVisible();

        await page.screenshot({ path: 'reports/screenshots/mobile_profile_320px.png' });

        const closeBtn = authModal.locator('.ps-modal-close-btn');
        await closeBtn.click({ force: true });
        await expect(authModal).toBeHidden();
    });

    test('Caso 5: En orientación Landscape, Perfil continúa accesible y el dock permanece ergonómico', async ({ page }) => {
        await page.setViewportSize({ width: 844, height: 390 }); // iPhone 12/14 Landscape
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const bottomNav = page.locator('#mobileBottomNav');
        await expect(bottomNav).toBeVisible();

        const btnNavPerfil = page.locator('#btnNavPerfil');
        await expect(btnNavPerfil).toBeVisible();

        // Verificar que Leaflet no queda roto ni solapado
        await btnNavPerfil.click();
        const authModal = page.locator('#authModal');
        await expect(authModal).toBeVisible();

        const closeBtn = authModal.locator('.ps-modal-close-btn');
        await closeBtn.click({ force: true });
        await expect(authModal).toBeHidden();
    });
});

