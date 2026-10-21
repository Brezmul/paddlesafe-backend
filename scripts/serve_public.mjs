import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public_html');

const PORT = process.env.PORT || 8080;

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

const server = http.createServer((req, res) => {
    // Parse URL and sanitize path
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(reqUrl.pathname);
    if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // SPA fallback or 404
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

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[PaddleSafe Static Server] Serving ${PUBLIC_DIR} on http://127.0.0.1:${PORT}`);
});

