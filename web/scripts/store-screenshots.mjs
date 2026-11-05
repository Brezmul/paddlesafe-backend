import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'store-assets', 'screenshots');
const base = process.env.PADDLESAFE_URL || 'http://127.0.0.1:5173/';

await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  locale: 'es-ES',
  geolocation: { latitude: 38.789, longitude: 0.166 },
  permissions: ['geolocation']
});
const page = await context.newPage();

async function shot(nombre) {
  const archivo = path.join(out, nombre);
  await page.screenshot({ path: archivo, type: 'png' });
  console.log('captura', nombre);
}

await page.goto(base, { waitUntil: 'networkidle' });
await page.addStyleTag({
  content: `
    [class*="min-h-[280px]"], [class*="min-h-[300px]"] {
      height: 210px !important;
      min-height: 210px !important;
    }
  `
});
await page.getByRole('button', { name: 'Evaluar spot' }).click();
await page.getByText(/Favorable|Precaución|exigentes|No recomendado|Tormenta|emergencia/i).first().waitFor({ timeout: 25000 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await shot('01-mapa-veredicto.png');

await page.getByRole('button', { name: 'Ruta', exact: true }).click();
await page.evaluate(() => window.scrollTo(0, 0));
const mapa = page.locator('.leaflet-container');
const caja = await mapa.boundingBox();
if (!caja) throw new Error('No se ve el mapa.');
const puntos = [
  [0.32, 0.55],
  [0.58, 0.42],
  [0.7, 0.68]
];
for (const [x, y] of puntos) {
  await page.mouse.click(caja.x + caja.width * x, caja.y + caja.height * y);
  await page.waitForTimeout(250);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot('02-ruta.png');

await page.getByRole('link', { name: 'Radar' }).click();
await page.getByRole('button', { name: 'Actualizar radar' }).click();
await page.getByText(/Lectura en el punto/).waitFor();
await page.waitForTimeout(1500);
await shot('03-radar.png');

await page.getByRole('link', { name: 'Social' }).click();
await page.getByRole('button', { name: 'Ranking' }).click();
await page.getByRole('button', { name: 'Total' }).click();
await page.waitForTimeout(1200);
if (await page.getByText('Sin datos de ranking').count()) {
  await page.getByRole('button', { name: 'Clubes' }).click();
  await page.waitForTimeout(1200);
}
await shot('04-ranking.png');

await page.getByRole('link', { name: 'Perfil' }).click();
await page.getByRole('heading', { name: 'Entrar' }).waitFor();
await shot('05-perfil.png');

await browser.close();
