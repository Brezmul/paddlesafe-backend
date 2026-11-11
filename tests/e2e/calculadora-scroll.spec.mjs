import { test, expect } from '@playwright/test';

test('la calculadora térmica se desplaza en una pantalla baja', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  const fallos = [];
  page.on('pageerror', (error) => fallos.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir calculadora de neopreno y sensación térmica' }).click();
  const panel = page.locator('#thermalCalculatorModal > div');
  await expect(panel).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calculadora Térmica & Neopreno' })).toBeVisible();
  const medidas = await panel.evaluate((el) => {
    el.scrollTop = 0;
    const antes = el.scrollTop;
    el.scrollTop = 240;
    return {
      overflowY: getComputedStyle(el).overflowY,
      puede: el.scrollHeight > el.clientHeight,
      movido: el.scrollTop > antes
    };
  });
  expect(medidas.overflowY).toBe('auto');
  expect(medidas.puede).toBe(true);
  expect(medidas.movido).toBe(true);
  expect(fallos).toEqual([]);
});
