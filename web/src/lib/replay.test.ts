import { describe, expect, it } from 'vitest';
import { debeAnimar, interpolarRecorrido, siguienteVelocidad } from './replay';

const puntos: Array<[number, number]> = [
  [38.8, 0.18],
  [38.81, 0.18],
  [38.82, 0.19]
];

describe('reproducción de ruta', () => {
  it('empieza en el primer punto, acaba en el último y pasa por el medio', () => {
    const inicio = interpolarRecorrido(puntos, 0);
    const fin = interpolarRecorrido(puntos, 1);
    const medio = interpolarRecorrido(puntos, 0.5);
    expect(inicio?.lat).toBeCloseTo(38.8, 5);
    expect(fin?.lat).toBeCloseTo(38.82, 5);
    expect(fin?.lon).toBeCloseTo(0.19, 5);
    expect(medio && medio.km).toBeGreaterThan(0);
    expect(medio && medio.lat).toBeGreaterThan(38.8);
    expect(medio && medio.lat).toBeLessThan(38.82);
    expect(interpolarRecorrido([], 0.4)).toBeNull();
  });

  it('no anima en segundo plano ni si se pide menos movimiento', () => {
    expect(debeAnimar({ reproduciendo: true, reducido: false, oculto: false })).toBe(true);
    expect(debeAnimar({ reproduciendo: true, reducido: true, oculto: false })).toBe(false);
    expect(debeAnimar({ reproduciendo: true, reducido: false, oculto: true })).toBe(false);
    expect(debeAnimar({ reproduciendo: false, reducido: false, oculto: false })).toBe(false);
    expect(siguienteVelocidad(1)).toBe(2);
    expect(siguienteVelocidad(5)).toBe(1);
  });
});
