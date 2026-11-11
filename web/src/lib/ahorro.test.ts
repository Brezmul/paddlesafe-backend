import { describe, expect, it } from 'vitest';
import { ahorroAnual } from './ahorro';

const MES = 4_990_000;
const ANO = 39_990_000;

describe('ahorro del plan anual', () => {
  it('calcula el 33 % y 19,89 € a partir de los micros de 4,99 y 39,99', () => {
    const ahorro = ahorroAnual(
      [
        { periodo: 'P1M', micros: MES, moneda: 'EUR' },
        { periodo: 'P1Y', micros: ANO, moneda: 'EUR' }
      ],
      'es-ES'
    );
    expect(ahorro).toEqual({
      porcentaje: 33,
      menosAlAno: '19,89 €',
      alMes: '3,33 €'
    });
  });

  it('redondea el porcentaje hacia abajo', () => {
    const mes = 10_000_000;
    const doce = mes * 12;
    const menos = Math.floor(doce * 0.339);
    const ahorro = ahorroAnual(
      [
        { periodo: 'P1M', micros: mes, moneda: 'EUR' },
        { periodo: 'P1Y', micros: doce - menos, moneda: 'EUR' }
      ],
      'es-ES'
    );
    expect(ahorro?.porcentaje).toBe(33);
    expect(Math.round((menos / doce) * 100)).toBe(34);
  });

  it('no muestra insignia si falta el mensual, un importe o la moneda', () => {
    expect(ahorroAnual([{ periodo: 'P1Y', micros: ANO, moneda: 'EUR' }], 'es-ES')).toBeNull();
    expect(ahorroAnual(
      [
        { periodo: 'P1M', micros: null, moneda: 'EUR' },
        { periodo: 'P1Y', micros: ANO, moneda: 'EUR' }
      ],
      'es-ES'
    )).toBeNull();
    expect(ahorroAnual(
      [
        { periodo: 'P1M', micros: MES, moneda: 'EUR' },
        { periodo: 'P1Y', micros: null, moneda: 'EUR' }
      ],
      'es-ES'
    )).toBeNull();
    expect(ahorroAnual(
      [
        { periodo: 'P1M', micros: MES, moneda: null },
        { periodo: 'P1Y', micros: ANO, moneda: 'EUR' }
      ],
      'es-ES'
    )).toBeNull();
    expect(ahorroAnual(
      [
        { periodo: 'P1M', micros: MES, moneda: 'EUR' },
        { periodo: 'P1Y', micros: ANO, moneda: 'USD' }
      ],
      'es-ES'
    )).toBeNull();
    expect(ahorroAnual(
      [
        { periodo: 'P1M', micros: MES, moneda: 'EUR' },
        { periodo: 'P1Y', micros: MES * 12, moneda: 'EUR' }
      ],
      'es-ES'
    )).toBeNull();
  });
});
