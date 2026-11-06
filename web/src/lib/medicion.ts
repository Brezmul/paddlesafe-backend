const CADENA_NUMERICA = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Número finito o cadena numérica, con espacios recortados.
 * false, true, arrays y objetos no valen: Number(false) y Number([]) son 0,
 * y Number(true) es 1. El cero y la cadena "0" sí son una medición.
 */
export function medicionNumerica(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (!CADENA_NUMERICA.test(texto)) return null;
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Viento u oleaje: una magnitud negativa no es calma. */
export function magnitudNoNegativa(valor: unknown): number | null {
  const n = medicionNumerica(valor);
  return n === null || n < 0 ? null : n;
}

export type MotorMedible = {
  entorno?: string;
  oleajeAplica?: boolean;
  vientoNudos?: number | null;
  estado?: string;
  justificacion?: string;
  detallesTecnicos?: {
    vientoKt?: number | null;
    rachasKt?: number | null;
    oleajeM?: number | null;
    periodoOlaS?: number | null;
    tempAireC?: number | null;
    tempAguaC?: number | null;
  } | null;
};

export function prepararEntradaCoach(motor: MotorMedible):
  | { consultar: false; motivo: string }
  | { consultar: true; vientoKt: number; rachasKt: number; oleajeM: number; periodoS: number } {
  const vientoKt = magnitudNoNegativa(motor.detallesTecnicos?.vientoKt ?? motor.vientoNudos);
  const oleajeM = magnitudNoNegativa(motor.detallesTecnicos?.oleajeM);
  const oleajeAplica = motor.oleajeAplica === true || (motor.oleajeAplica === undefined && motor.entorno !== 'embalse_interior');
  if (vientoKt === null || (oleajeAplica && oleajeM === null)) {
    return {
      consultar: false,
      motivo: 'No se consulta el coach: falta viento u oleaje costero y no se sustituye por cero. El veredicto de arriba ya dice qué dato falta.'
    };
  }
  const rachas = magnitudNoNegativa(motor.detallesTecnicos?.rachasKt);
  const periodo = magnitudNoNegativa(motor.detallesTecnicos?.periodoOlaS);
  return {
    consultar: true,
    vientoKt,
    rachasKt: rachas ?? vientoKt,
    oleajeM: oleajeAplica ? oleajeM as number : 0,
    periodoS: periodo ?? 0
  };
}
