import { describe, expect, it } from 'vitest';
import { lecturaEnHora, planificarTramos, textoViento, type LecturaHora } from './tramos';

const salida: [number, number] = [38.8, 0.18];
const lejos: [number, number] = [38.95, 0.18];

function hora(h: number, vientoKt: number | null, dirDeg: number | null = 180, rachasKt: number | null = null): LecturaHora {
  return { hora: h, vientoKt, dirDeg, rachasKt };
}

describe('planificador por tramos', () => {
  it('usa el viento medido de la hora de salida y de la hora de paso', () => {
    const plan = planificarTramos({
      puntos: [salida, lejos],
      cruceroKmh: 4.5,
      horaSalida: 10,
      minutoSalida: 0,
      horas: [hora(10, 8, 90), hora(11, 13.4, 90, 16)]
    });
    expect(plan.vientoSalidaKt).toBe(8);
    expect(plan.tramos).toHaveLength(1);
    expect(plan.tramos[0].vientoKt).not.toBe(5);
    expect(plan.tramos[0].vientoKt).not.toBeNull();
    expect(plan.tramos[0].relativo).not.toBe('DIRECCIÓN N/D');
    expect(textoViento(plan.tramos[0].vientoKt)).toMatch(/kt$/);
    expect(plan.avisos.length).toBeGreaterThan(0);
  });

  it('deja sin dato una hora ausente y no la convierte en 5 kt', () => {
    const plan = planificarTramos({
      puntos: [salida, lejos],
      cruceroKmh: 4.5,
      horaSalida: 10,
      horas: [hora(9, 12)]
    });
    expect(plan.vientoSalidaKt).toBeNull();
    expect(plan.tramos[0].vientoKt).toBeNull();
    expect(plan.tramos[0].incrementoKt).toBeNull();
    expect(plan.avisos).toEqual([]);
    expect(textoViento(plan.tramos[0].vientoKt)).toBe('sin dato');
    expect(JSON.stringify(plan)).not.toContain('"vientoKt":5');
  });

  it('conserva el cero medido y no avisa si falta el viento de salida', () => {
    const conCero = planificarTramos({
      puntos: [salida, [38.81, 0.18]],
      cruceroKmh: 6,
      horaSalida: 8,
      horas: [hora(8, 0, 200)]
    });
    expect(conCero.vientoSalidaKt).toBe(0);
    expect(conCero.tramos[0].vientoKt).toBe(0);
    expect(textoViento(0)).toBe('0.0 kt');

    const sinSalida = planificarTramos({
      puntos: [salida, [38.81, 0.18]],
      cruceroKmh: 6,
      horaSalida: 8,
      horas: [hora(8, null), hora(9, 20)]
    });
    expect(sinSalida.vientoSalidaKt).toBeNull();
    expect(sinSalida.avisos).toEqual([]);
    expect(lecturaEnHora([hora(8, null)], 8)?.vientoKt).toBeNull();
  });
});
