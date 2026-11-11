import type { PlanPlay } from '@/lib/play';

export type AhorroAnual = {
  porcentaje: number;
  menosAlAno: string;
  alMes: string;
};

/**
 * Ahorro del plan anual frente a pagar doce meses.
 * El porcentaje se redondea hacia abajo. Sin mensual, sin micros o sin moneda, no hay insignia.
 */
export function ahorroAnual(planes: Array<Pick<PlanPlay, 'periodo' | 'micros' | 'moneda'>>, locale?: string): AhorroAnual | null {
  const mensual = planes.find((plan) => plan.periodo === 'P1M');
  const anual = planes.find((plan) => plan.periodo === 'P1Y');
  if (!mensual || !anual) return null;
  const mes = mensual.micros;
  const ano = anual.micros;
  const moneda = mensual.moneda;
  if (mes == null || ano == null || !moneda || moneda !== anual.moneda) return null;
  if (!Number.isFinite(mes) || !Number.isFinite(ano) || mes <= 0 || ano < 0) return null;
  const doce = mes * 12;
  const menos = doce - ano;
  if (menos <= 0) return null;
  const porcentaje = Math.floor((menos * 100) / doce);
  if (porcentaje <= 0) return null;
  let formato: Intl.NumberFormat;
  try {
    formato = new Intl.NumberFormat(locale, { style: 'currency', currency: moneda });
  } catch {
    return null;
  }
  return {
    porcentaje,
    menosAlAno: formato.format(menos / 1_000_000),
    alMes: formato.format(ano / 12 / 1_000_000)
  };
}
