import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const capturas = path.join(raiz, 'web/store-assets/qa');
fs.mkdirSync(capturas, { recursive: true });

test.beforeEach(async ({ page }) => {
  const fallos = [];
  page.on('pageerror', (error) => fallos.push(error.message));
  page.fallos = fallos;
});

test.afterEach(async ({ page }) => {
  const graves = (page.fallos || []).filter((texto) => !/ResizeObserver/i.test(texto));
  expect(graves, graves.join('\n')).toEqual([]);
});

test('el mapa carga, evalúa y deja un solo aviso Premium', async ({ page }, info) => {
  await page.goto('/#/');
  await expect(page.getByRole('textbox', { name: 'Buscar playa, cala o pueblo' })).toBeVisible();
  await page.getByRole('button', { name: 'Evaluar spot' }).click();
  await expect(page.getByText(/Favorable|Precaución|exigentes|No recomendado|Tormenta|Sin datos|No se ha podido/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desbloquea con Premium' })).toHaveCount(1);
  await expect(page.getByText(/es Premium/)).toHaveCount(0);
  if (info.project.name === 'movil') {
    await page.screenshot({ path: path.join(capturas, '01-mapa-movil.png') });
  }
});

test('radar, clubes, muro, perfil y premium se recorren sin consola rota', async ({ page }, info) => {
  await page.goto('/#/radar');
  await expect(page.getByRole('heading', { name: 'Lectura en el punto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Viento' })).toBeVisible();

  await page.getByRole('link', { name: 'Clubes' }).click();
  await expect(page.getByRole('heading', { name: 'Clubes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();

  await page.getByRole('link', { name: 'Social' }).click();
  await expect(page.getByRole('heading', { name: 'El muro y el ranking' })).toBeVisible();

  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  const olvidar = page.getByRole('button', { name: 'Olvidé la contraseña' });
  const caja = await olvidar.boundingBox();
  expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
  await olvidar.click();
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
  if (info.project.name === 'movil') {
    await page.screenshot({ path: path.join(capturas, '03-perfil-movil.png') });
  }
  await page.getByRole('button', { name: 'Seguir como invitado' }).click();
  await expect(page.getByText('Estás en modo invitado')).toBeVisible();

  await page.goto('/#/premium');
  await expect(page.getByRole('heading', { name: 'Premium', exact: true })).toBeVisible();
  await expect(page.getByText(/se contrata en la app Android/)).toBeVisible();

  if (info.project.name === 'escritorio') {
    await page.screenshot({ path: path.join(capturas, '02-premium-escritorio.png') });
  }
});

test('en horizontal la barra y la cabecera siguen visibles', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil-horizontal', 'solo el viewport apaisado');
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: 'Mapa' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Perfil' })).toBeVisible();
  const barra = await page.getByRole('navigation').boundingBox();
  const alto = page.viewportSize()?.height ?? 0;
  expect(barra).toBeTruthy();
  expect((barra?.y ?? 0) + (barra?.height ?? 0)).toBeGreaterThan(alto - 4);
  await page.screenshot({ path: path.join(capturas, '04-horizontal.png') });
});

test('el buscador sigue a la vista cuando recibe el foco', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'el teclado se simula en el móvil');
  await page.goto('/#/');
  const campo = page.getByRole('textbox', { name: 'Buscar playa, cala o pueblo' });
  await campo.focus();
  await page.waitForTimeout(400);
  await expect(campo).toBeFocused();
  const caja = await campo.boundingBox();
  const alto = page.viewportSize()?.height ?? 0;
  expect(caja?.y ?? 0).toBeGreaterThan(0);
  expect((caja?.y ?? 0) + (caja?.height ?? 0)).toBeLessThan(alto);
});
