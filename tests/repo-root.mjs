import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz del repositorio, independiente del directorio de trabajo y del sistema. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
