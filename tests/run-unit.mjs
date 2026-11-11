/**
 * Ejecuta cada archivo tests/unit/*.test.mjs en su propio proceso.
 * Node 22: algunos importan TypeScript con --experimental-strip-types.
 * El fallo de uno no oculta el resto; el proceso acaba en error si alguno falla.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'unit');
const files = readdirSync(dir).filter((nombre) => nombre.endsWith('.test.mjs')).sort();
const fallos = [];

for (const nombre of files) {
    const archivo = path.join(dir, nombre);
    process.stdout.write(`\n===== ${nombre} =====\n`);
    const resultado = spawnSync(process.execPath, ['--experimental-strip-types', archivo], { stdio: 'inherit' });
    if (resultado.status !== 0) fallos.push(nombre);
}

if (fallos.length) {
    console.error(`\nSuites con fallo: ${fallos.join(', ')}`);
    process.exit(1);
}

console.log(`\nSuites unitarias: ${files.length} / ${files.length}`);
