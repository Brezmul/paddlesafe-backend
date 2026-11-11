import { describe, expect, it } from 'vitest';
import { avanzarParticula, cantidadParticulas, colorSiHayViento, crearParticulas, LIMITE_PARTICULAS, vectorFlujo } from './particulas';

describe('partículas de viento', () => {
  it('no pinta un color de calma cuando el viento no ha llegado', () => {
    expect(colorSiHayViento(null)).toBeNull();
    expect(colorSiHayViento(Number.NaN)).toBeNull();
    expect(colorSiHayViento(0)).toBeTruthy();
    expect(colorSiHayViento(22)).toBe('#ef4444');
  });

  it('limita el campo y reutiliza el vector del lienzo antiguo', () => {
    expect(cantidadParticulas(4000, 3000)).toBe(LIMITE_PARTICULAS);
    expect(crearParticulas(900, 100, 80, () => 0.5)).toHaveLength(LIMITE_PARTICULAS);
    const norte = vectorFlujo(0);
    expect(norte.vy).toBeGreaterThan(0);
    const movida = avanzarParticula(
      { x: 10, y: 10, edad: 0, vida: 50, velocidad: 1 },
      { vx: 3, vy: 0 },
      2,
      30,
      30,
      () => 0
    );
    expect(movida.x).toBeGreaterThan(10);
    const fuera = avanzarParticula(
      { x: 29, y: 10, edad: 0, vida: 50, velocidad: 4 },
      { vx: 1, vy: 0 },
      2,
      30,
      30,
      () => 0.25
    );
    expect(fuera.edad).toBe(0);
    expect(fuera.x).toBeCloseTo(7.5);
  });
});
