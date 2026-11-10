/**
 * El SQL y el borrado de cuenta usan las columnas que existen en Supabase.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const derechos = fs.readFileSync(path.join(raiz, 'sql/premium_derechos.sql'), 'utf8');
const borrado = fs.readFileSync(path.join(raiz, 'supabase/functions/eliminar-cuenta/index.ts'), 'utf8');

assert.match(derechos, /creado_en\s*</, 'el corte de acceso previo filtra perfiles.creado_en');
assert.doesNotMatch(derechos, /\bwhere[\s\S]*created_at/i, 'el update de perfiles no filtra por created_at');
assert.doesNotMatch(borrado, /\['club_showcase'/, 'la vitrina del club no se borra: no tiene columna de usuario');
assert.match(borrado, /\['perfiles', 'id'\]/, 'el perfil sigue borrándose por id');

console.log('esquema-cuenta: ok');
