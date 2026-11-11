import { describe, expect, it } from 'vitest';
import { fichaTactica } from './tactico';
import type { Motor, Pronostico } from './legacy';

function motor(parcial: Partial<Motor> & { detallesTecnicos?: Motor['detallesTecnicos'] }): Motor {
  return {
    estado: 'Favorable',
    oleajeAplica: true,
    detallesTecnicos: {
      vientoKt: 8,
      rachasKt: 11,
      oleajeM: 0.4,
      periodoOlaS: 7,
      tempAireC: 18,
      tempAguaC: 16
    },
    ...parcial
  };
}

describe('panel táctico', () => {
  it('muestra las mediciones que han llegado', () => {
    const ficha = fichaTactica({
      motor: motor({}),
      pronostico: { windDirection: 90, precipProbability: 10, ventanasOptimas: { textoResumen: 'Mejor de 09 a 11' } } as Pronostico,
      lat: 38.8,
      lon: 0.18,
      fecha: '2026-06-21',
      horaSalida: '09:00',
      minutosRuta: 40,
      kmRuta: 3,
      cruceroKmh: 4.5
    });
    expect(ficha.viento).toBe('8.0 kt');
    expect(ficha.rachas).toBe('11.0 kt');
    expect(ficha.oleaje).toBe('0.4 m');
    expect(ficha.direccion).toContain('90°');
    expect(ficha.ventana).toBe('Mejor de 09 a 11');
    expect(ficha.esfuerzo).toMatch(/kcal/);
    expect(ficha.viento).not.toBe('sin dato');
  });

  it('no convierte el viento, el oleaje ni el esfuerzo ausentes en un cero', () => {
    const ficha = fichaTactica({
      motor: motor({
        detallesTecnicos: {
          vientoKt: null,
          rachasKt: null,
          oleajeM: null,
          periodoOlaS: null,
          tempAireC: null,
          tempAguaC: null
        }
      }),
      pronostico: { windDirection: null, precipProbability: null } as Pronostico,
      lat: 38.8,
      lon: 0.18,
      fecha: '2026-06-21',
      horaSalida: '10:00',
      minutosRuta: 50,
      kmRuta: 4,
      cruceroKmh: 4.5
    });
    expect(ficha.viento).toBe('sin dato');
    expect(ficha.oleaje).toBe('sin dato');
    expect(ficha.aire).toBe('sin dato');
    expect(ficha.esfuerzo).toBe('sin dato');
    expect(ficha.viento).not.toContain('0.0');
  });

  it('conserva un cero medido y no aplica oleaje en interior', () => {
    const cero = fichaTactica({
      motor: motor({ detallesTecnicos: { vientoKt: 0, rachasKt: 0, oleajeM: 0, periodoOlaS: 6, tempAireC: 22, tempAguaC: 20 } }),
      pronostico: null,
      lat: 38.8,
      lon: 0.18,
      horaSalida: '11:00',
      minutosRuta: null,
      kmRuta: null,
      cruceroKmh: null
    });
    expect(cero.viento).toBe('0.0 kt');
    expect(cero.esfuerzo).toBe('sin dato');

    const interior = fichaTactica({
      motor: motor({ oleajeAplica: false, detallesTecnicos: { vientoKt: 6, rachasKt: 8, oleajeM: null, tempAireC: 19, tempAguaC: null } }),
      pronostico: null,
      lat: 40.55,
      lon: -2.7,
      horaSalida: '08:00',
      minutosRuta: 30,
      kmRuta: 2,
      cruceroKmh: 4
    });
    expect(interior.oleaje).toBe('No aplica');
    expect(interior.esfuerzo).toMatch(/kcal/);
  });

  it('avisa si la llegada estimada cae junto al ocaso', () => {
    const ficha = fichaTactica({
      motor: motor({}),
      pronostico: null,
      lat: 38.8,
      lon: 0.18,
      fecha: '2026-12-21',
      horaSalida: '22:00',
      minutosRuta: 40,
      kmRuta: 6,
      cruceroKmh: 4
    });
    expect(ficha.ocaso.peligro).toBe(true);
    expect(ficha.ocaso.texto).toContain('ocaso');
  });
});
