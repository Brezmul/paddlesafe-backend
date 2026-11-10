import { obtenerColorParticulaViento } from '../../../public_html/js/map/map.radar.js';

/** Tope para un móvil. El sitio antiguo usa 750; aquí no se pasa de 120. */
export const LIMITE_PARTICULAS = 120;

export type Particula = {
  x: number;
  y: number;
  edad: number;
  vida: number;
  velocidad: number;
};

export function cantidadParticulas(ancho: number, alto: number): number {
  const propuesta = Math.round((Math.max(1, ancho) * Math.max(1, alto)) / 9000);
  return Math.max(24, Math.min(LIMITE_PARTICULAS, propuesta));
}

/** El flujo empuja hacia donde sopla el viento, igual que el lienzo antiguo. */
export function vectorFlujo(dirDeg: number): { vx: number; vy: number } {
  const rad = (((dirDeg + 180) % 360) * Math.PI) / 180;
  return { vx: Math.sin(rad), vy: -Math.cos(rad) };
}

export function colorSiHayViento(kt: number | null): string | null {
  if (kt === null || !Number.isFinite(kt)) return null;
  return obtenerColorParticulaViento(kt);
}

export function crearParticulas(cantidad: number, ancho: number, alto: number, azar: () => number = Math.random): Particula[] {
  const n = Math.max(0, Math.min(LIMITE_PARTICULAS, Math.floor(cantidad)));
  const lista: Particula[] = [];
  for (let i = 0; i < n; i++) {
    lista.push({
      x: azar() * ancho,
      y: azar() * alto,
      edad: Math.floor(azar() * 40),
      vida: 40 + Math.floor(azar() * 40),
      velocidad: 1.2 + azar() * 2.2
    });
  }
  return lista;
}

export function avanzarParticula(
  particula: Particula,
  flujo: { vx: number; vy: number },
  factor: number,
  ancho: number,
  alto: number,
  azar: () => number = Math.random
): Particula {
  const siguiente = {
    ...particula,
    x: particula.x + flujo.vx * particula.velocidad * factor,
    y: particula.y + flujo.vy * particula.velocidad * factor,
    edad: particula.edad + 1
  };
  if (siguiente.x < 0 || siguiente.x > ancho || siguiente.y < 0 || siguiente.y > alto || siguiente.edad > siguiente.vida) {
    return { ...siguiente, x: azar() * ancho, y: azar() * alto, edad: 0 };
  }
  return siguiente;
}
