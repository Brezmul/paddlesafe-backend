import type { Nivel } from './legacy';

const NIVEL_KEY = 'ps_skill_level';
const EMERGENCIA_KEY = 'ps_emergency_phone';

const NIVELES: Nivel[] = ['Principiante', 'Intermedio', 'Avanzado', 'Competicion'];

export function leerNivel(): Nivel {
  const valor = localStorage.getItem(NIVEL_KEY);
  return NIVELES.includes(valor as Nivel) ? (valor as Nivel) : 'Intermedio';
}

export function guardarNivel(nivel: Nivel) {
  localStorage.setItem(NIVEL_KEY, nivel);
}

export function leerTelefonoEmergencia(): string {
  return localStorage.getItem(EMERGENCIA_KEY) || '';
}

export function guardarTelefonoEmergencia(telefono: string) {
  localStorage.setItem(EMERGENCIA_KEY, telefono.trim());
}
