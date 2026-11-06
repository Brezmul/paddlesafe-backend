/** Distingue un cero medido de null, vacío o NaN. */
export function medicionNumerica(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = typeof valor === 'string' ? Number(valor.trim()) : Number(valor);
  return Number.isFinite(n) ? n : null;
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
  const vientoKt = medicionNumerica(motor.detallesTecnicos?.vientoKt ?? motor.vientoNudos);
  const oleajeM = medicionNumerica(motor.detallesTecnicos?.oleajeM);
  const oleajeAplica = motor.oleajeAplica === true || (motor.oleajeAplica === undefined && motor.entorno !== 'embalse_interior');
  if (vientoKt === null || (oleajeAplica && oleajeM === null)) {
    return {
      consultar: false,
      motivo: 'No se consulta el coach: falta viento u oleaje costero y no se sustituye por cero. El veredicto de arriba ya dice qué dato falta.'
    };
  }
  const rachas = medicionNumerica(motor.detallesTecnicos?.rachasKt);
  const periodo = medicionNumerica(motor.detallesTecnicos?.periodoOlaS);
  return {
    consultar: true,
    vientoKt,
    rachasKt: rachas ?? vientoKt,
    oleajeM: oleajeAplica ? oleajeM as number : 0,
    periodoS: periodo ?? 0
  };
}
