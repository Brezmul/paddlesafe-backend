import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public_html');
const SCREENSHOT_DIR = path.resolve(__dirname, '../reports/screenshots');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webapp': 'application/x-web-app-manifest+json',
    '.manifest': 'text/cache-manifest',
    '.webmanifest': 'application/manifest+json'
};

function startServer(port = 8089) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const reqUrl = new URL(req.url, `http://${req.headers.host}`);
            let pathname = decodeURIComponent(reqUrl.pathname);
            if (pathname === '/' || pathname === '') {
                pathname = '/index.html';
            }

            const filePath = path.join(PUBLIC_DIR, pathname);
            if (!filePath.startsWith(PUBLIC_DIR)) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden');
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    if (pathname.endsWith('.html') || !path.extname(pathname)) {
                        const indexFile = path.join(PUBLIC_DIR, 'index.html');
                        fs.readFile(indexFile, (readErr, data) => {
                            if (readErr) {
                                res.writeHead(404, { 'Content-Type': 'text/plain' });
                                res.end('Not Found');
                            } else {
                                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                                res.end(data);
                            }
                        });
                        return;
                    }
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                    return;
                }

                const ext = path.extname(filePath).toLowerCase();
                const contentType = MIME_TYPES[ext] || 'application/octet-stream';

                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });

                fs.createReadStream(filePath).pipe(res);
            });
        });

        server.listen(port, '127.0.0.1', () => {
            resolve(server);
        });
        server.on('error', reject);
    });
}

const DEVICES = [
    {
        id: 'Desktop',
        label: 'Desktop (1920x1080)',
        contextOptions: {
            viewport: { width: 1920, height: 1080 },
            isMobile: false,
            hasTouch: false
        }
    },
    {
        id: 'iPhone_12',
        label: 'iPhone 12 (390x844)',
        contextOptions: {
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
        }
    },
    {
        id: 'iPhone_15_Pro_Max',
        label: 'iPhone 15 Pro Max (430x932)',
        contextOptions: {
            viewport: { width: 430, height: 932 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        }
    }
];

async function captureEvidence() {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    const PORT = 8089;
    const server = await startServer(PORT);
    console.log(`[Evidence Capturer] Serving PaddleSafe on http://127.0.0.1:${PORT}`);

    const browser = await chromium.launch({ headless: true });
    const capturedFiles = [];

    try {
        for (const dev of DEVICES) {
            console.log(`\n========================================`);
            console.log(`Capturing evidence for: ${dev.label}`);
            console.log(`========================================`);

            const context = await browser.newContext(dev.contextOptions);
            await context.addInitScript(() => {
                try {
                    localStorage.setItem('ps_quick_setup_dismissed', '1');
                    localStorage.setItem('ps_onboarding_completed', '1');
                } catch (_) {}
            });

            // Helper to get a ready page
            async function getReadyPage() {
                const page = await context.newPage();
                await page.goto(`http://127.0.0.1:${PORT}/`);
                await page.waitForLoadState('domcontentloaded');
                await page.waitForFunction(() => window.mapRuntime !== undefined);
                await page.waitForTimeout(300);
                return page;
            }

            // 1. HOME
            console.log(` -> 1/6 Capturing [Home]...`);
            {
                const page = await getReadyPage();
                const fileHome = path.join(SCREENSHOT_DIR, `${dev.id}_Home.png`);
                await page.screenshot({ path: fileHome, fullPage: false });
                capturedFiles.push({ device: dev.id, view: 'Home', path: fileHome, size: fs.statSync(fileHome).size });
                await page.close();
            }

            // 2. MAPA
            console.log(` -> 2/6 Capturing [Mapa]...`);
            {
                const page = await getReadyPage();
                if (dev.contextOptions.isMobile) {
                    const btnNavPro = page.locator('#btnNavPro');
                    if (await btnNavPro.isVisible()) {
                        await btnNavPro.click();
                        await page.waitForTimeout(400);
                    }
                } else {
                    await page.evaluate(() => {
                        if (typeof window.inicializarMapa === 'function' && !window.map) {
                            window.inicializarMapa();
                        }
                        if (window.map) {
                            window.map.invalidateSize();
                        }
                    });
                    await page.waitForTimeout(400);
                }
                const fileMapa = path.join(SCREENSHOT_DIR, `${dev.id}_Mapa.png`);
                await page.screenshot({ path: fileMapa, fullPage: false });
                capturedFiles.push({ device: dev.id, view: 'Mapa', path: fileMapa, size: fs.statSync(fileMapa).size });
                await page.close();
            }

            // 3. RADAR
            console.log(` -> 3/6 Capturing [Radar]...`);
            {
                const page = await getReadyPage();
                if (dev.contextOptions.isMobile) {
                    const btnNavPro = page.locator('#btnNavPro');
                    if (await btnNavPro.isVisible()) {
                        await btnNavPro.click();
                        await page.waitForTimeout(300);
                    }
                }
                const radarBtn = page.locator('#mapLayerSwitcher button[data-map-layer="oscuro"]');
                if (await radarBtn.isVisible()) {
                    await radarBtn.click({ force: true });
                    await page.waitForTimeout(400);
                } else {
                    await page.evaluate(() => {
                        const p = document.getElementById('radarCockpitPanel');
                        if (p) {
                            p.classList.remove('hidden');
                            p.style.display = 'block';
                        }
                        if (typeof window.actualizarCockpitRadar === 'function') {
                            window.actualizarCockpitRadar();
                        }
                    });
                    await page.waitForTimeout(400);
                }
                const fileRadar = path.join(SCREENSHOT_DIR, `${dev.id}_Radar.png`);
                await page.screenshot({ path: fileRadar, fullPage: false });
                capturedFiles.push({ device: dev.id, view: 'Radar', path: fileRadar, size: fs.statSync(fileRadar).size });
                await page.close();
            }

            // 4. CLUBES
            console.log(` -> 4/6 Capturing [Clubes]...`);
            {
                const page = await getReadyPage();
                if (dev.contextOptions.isMobile) {
                    const btnNavClubes = page.locator('#btnNavClubes');
                    if (await btnNavClubes.isVisible()) {
                        await btnNavClubes.click();
                    } else {
                        await page.evaluate(() => window.abrirModalClubs && window.abrirModalClubs());
                    }
                } else {
                    const btnModalClubs = page.locator('#btnModalClubs');
                    if (await btnModalClubs.isVisible()) {
                        await btnModalClubs.click();
                    } else {
                        await page.evaluate(() => window.abrirModalClubs && window.abrirModalClubs());
                    }
                }
                await page.waitForTimeout(500);
                const fileClubes = path.join(SCREENSHOT_DIR, `${dev.id}_Clubes.png`);
                await page.screenshot({ path: fileClubes, fullPage: false });
                capturedFiles.push({ device: dev.id, view: 'Clubes', path: fileClubes, size: fs.statSync(fileClubes).size });
                await page.close();
            }

            // 5. SOCIAL
            console.log(` -> 5/6 Capturing [Social]...`);
            {
                const page = await getReadyPage();
                if (dev.contextOptions.isMobile) {
                    const btnNavRanking = page.locator('#btnNavRanking');
                    if (await btnNavRanking.isVisible()) {
                        await btnNavRanking.click();
                    } else {
                        await page.evaluate(() => window.abrirModalRanking && window.abrirModalRanking());
                    }
                } else {
                    const btnModalRanking = page.locator('#btnModalRanking');
                    if (await btnModalRanking.isVisible()) {
                        await btnModalRanking.click();
                    } else {
                        await page.evaluate(() => window.abrirModalRanking && window.abrirModalRanking());
                    }
                }
                await page.waitForTimeout(500);
                const fileSocial = path.join(SCREENSHOT_DIR, `${dev.id}_Social.png`);
                await page.screenshot({ path: fileSocial, fullPage: false });
                capturedFiles.push({ device: dev.id, view: 'Social', path: fileSocial, size: fs.statSync(fileSocial).size });
                await page.close();
            }

            // 6. PERFIL
            console.log(` -> 6/6 Capturing [Perfil]...`);
            {
                const page = await getReadyPage();
                const btnPerfil = page.locator('#btnCabeceraPerfil');
                if (await btnPerfil.isVisible()) {
                    await btnPerfil.click();
                } else {
                    await page.evaluate(() => window.abrirModalAuth && window.abrirModalAuth());
                }
                await page.waitForTimeout(500);
                const filePerfil = path.join(SCREENSHOT_DIR, `${dev.id}_Perfil.png`);
                await page.screenshot({ path: filePerfil, fullPage: false });
                capturedFiles.push({ device: dev.id, view: 'Perfil', path: filePerfil, size: fs.statSync(filePerfil).size });
                await page.close();
            }

            await context.close();
        }

        console.log(`\n========================================`);
        console.log(`EVIDENCIAS CAPTURADAS CON ÉXITO (${capturedFiles.length} archivos)`);
        console.log(`========================================`);
        for (const f of capturedFiles) {
            console.log(` - [${f.device}] ${f.view.padEnd(8)} -> ${path.relative(process.cwd(), f.path)} (${(f.size / 1024).toFixed(1)} KB)`);
        }

    } finally {
        await browser.close();
        server.close();
    }
}

captureEvidence().catch(err => {
    console.error('Evidence capture failed:', err);
    process.exit(1);
});
