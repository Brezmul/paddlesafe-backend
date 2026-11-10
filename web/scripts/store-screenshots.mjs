import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'store-assets', 'screenshots');
const base = process.env.PADDLESAFE_URL || 'http://127.0.0.1:5173';

await mkdir(out, { recursive: true });
for (const vieja of ['02-ruta.png', '02-premium.png', '04-ranking.png', '04-clubes-premium.png', '05-perfil.png', '05-social-premium.png', '06-ruta-premium.png']) {
  await rm(path.join(out, vieja), { force: true });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
  colorScheme: 'dark',
  geolocation: { latitude: 38.789, longitude: 0.186 },
  permissions: ['geolocation']
});
const page = await context.newPage();

async function ir(hash, vista = 'veredicto') {
  await page.goto(`${base}/?ficha=1&vista=${vista}#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

async function shot(nombre) {
  const archivo = path.join(out, nombre);
  await page.screenshot({ path: archivo, type: 'png' });
  const caja = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }));
  console.log('captura', nombre, `${caja.w * caja.dpr}x${caja.h * caja.dpr}`);
}

await ir('/');
await page.getByRole('heading', { name: 'Favorable' }).waitFor();
await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 20000 });
await page.addStyleTag({
  content: '[data-captura="buscar"], [data-captura="panel"], [data-captura="acciones"], [data-captura="jornada"] { display: none !important; }'
});
await page.waitForTimeout(600);
await shot('01-mapa-veredicto.png');

await ir('/', 'tactico');
await page.getByRole('heading', { name: 'Panel táctico' }).waitFor();
await page.addStyleTag({
  content: '.ps-marco, [data-captura="buscar"], [data-captura="acciones"], [data-captura="modos"], [data-captura="veredicto-texto"] { display: none !important; }'
});
await page.locator('[data-captura="jornada"]').evaluate((el) => {
  const main = el.closest('main');
  if (!main) return;
  const sobra = el.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom;
  if (sobra > 0) main.scrollTop += sobra + 12;
});
await page.waitForTimeout(300);
await shot('02-panel-tactico.png');

await ir('/radar');
await page.getByText('8 kt').first().waitFor();
await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
await shot('03-radar.png');

await ir('/clubes');
await page.getByRole('heading', { name: 'Club Portitxol' }).waitFor();
await page.getByText('Travesía al Portitxol').waitFor();
await page.waitForTimeout(300);
await shot('04-club.png');

await ir('/social');
await page.getByText('Cala del Portitxol, Jávea').waitFor();
await page.getByText('El agua estaba en calma').waitFor();
await page.waitForTimeout(300);
await shot('05-muro.png');

await ir('/', 'replay');
await page.getByRole('heading', { name: 'Recorrido' }).waitFor();
await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 20000 });
await page.evaluate(() => {
  for (const titulo of document.querySelectorAll('h2')) {
    if (titulo.textContent === 'Planificador' || titulo.textContent === 'Tramos') {
      titulo.closest('section')?.style.setProperty('display', 'none');
    }
  }
});
await page.getByLabel('Posición del recorrido').evaluate((el) => {
  const input = el;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '420');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.addStyleTag({
  content: '[data-captura="buscar"], [data-captura="panel"], [data-captura="acciones"] { display: none !important; } .ps-marco { height: 280px !important; min-height: 280px !important; }'
});
await page.waitForTimeout(500);
await shot('06-repeticion.png');

await ir('/premium');
await page.getByText('4,99 €').waitFor();
await page.getByText('39,99 €').waitFor();
await page.getByText('4,99 €').evaluate((el) => {
  const main = el.closest('main');
  if (!main) return;
  const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
  main.scrollTop = Math.max(0, top - 220);
});
await page.waitForTimeout(250);
await shot('07-premium.png');

await browser.close();
