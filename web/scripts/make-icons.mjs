import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function chunk(type, data) {
  const tipo = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipo, data])) >>> 0);
  return Buffer.concat([len, tipo, data, crc]);
}

const tabla = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = tabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    const fila = y * (size * 4 + 1);
    raw[fila] = 0;
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dentro = dx * dx + dy * dy <= 1;
      const ola = Math.sin((x / size) * 10 + y * 0.01) * 0.08;
      let r = 4, g = 30, b = 48, a = dentro ? 255 : 0;
      if (dentro) {
        const mar = (y / size) > 0.55 + ola;
        if (mar) { r = 14; g = 116; b = 144; }
        else { r = 14; g = 165; b = 233; }
        const tablaX = Math.abs(dx) < 0.46 && Math.abs(dy - 0.35) < 0.08;
        if (tablaX) { r = 255; g = 255; b = 255; }
      }
      const i = fila + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const destinos = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['resources/icon.png', 512],
  ['resources/splash.png', 512]
];

for (const [rel, size] of destinos) {
  const archivo = join(root, rel);
  mkdirSync(dirname(archivo), { recursive: true });
  writeFileSync(archivo, png(size));
  console.log('icono', rel, size);
}
