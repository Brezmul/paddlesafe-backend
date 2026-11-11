/**
 * El panel de un modal tiene que poder deslizarse. Un overflow:hidden posterior
 * dejaba la calculadora térmica recortada en el móvil.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(raiz, 'public_html/css/tailwind.min.css'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'public_html/index.html'), 'utf8');
const chat = fs.readFileSync(path.join(raiz, 'public_html/js/club/club.chat.js'), 'utf8');

const regla = css.slice(css.lastIndexOf('.ps-modal-backdrop>div{'));
assert.match(regla, /overflow-y:auto!important/, 'el panel del modal se desplaza en vertical');
assert.doesNotMatch(regla.slice(0, regla.indexOf('}') + 1), /overflow:hidden!important/, 'el panel no queda recortado');
assert.match(html, /tailwind\.min\.css\?v=paddlesafe-v606/, 'el HTML pide la hoja corregida');
assert.match(html, /id="thermalCalculatorModal"/, 'la calculadora térmica sigue en la página');
assert.doesNotMatch(html.slice(html.indexOf('id="thermalCalculatorModal"'), html.indexOf('id="thermalCalculatorModal"') + 500), /select-none/, 'la calculadora no bloquea el gesto');
assert.match(chat, /Eliminar mensaje/, 'un mensaje propio se puede borrar');

console.log('modal-scroll: ok');
