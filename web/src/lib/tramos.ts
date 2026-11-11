import { haversineKm } from './geo';
import { evaluarVientoRelativoInfo } from '../../../public_html/js/map/map.routes.js';

/** Lectura de una hora. `null` es ausencia, no calma. */
export type LecturaHora = {
  hora: number;
  vientoKt: number | null;
  dirDeg: number | null;
  rachasKt: number | null;
};

export type Tramo = {
  nombre: string;
  km: number;
  minutos: number | null;
  rumbo: number;
  eta: string;
  vientoKt: number | null;
  dirDeg: number | null;
  rachasKt: number | null;
  relativo: string;
  color: string;
  incrementoKt: number | null;
  aviso: string | null;
};

export type PlanTramos = {
  tramos: Tramo[];
  km: number;
  minutos: number | null;
  vientoSalidaKt: number | null;
  avisos: string[];
};

const SUBIDA_KT = 4;

function horaEnDia(hora: number): number {
  return ((Math.round(hora) % 24) + 24) % 24;
}

/** La hora que no está, o cuyo viento no es un número, no se inventa. */
export function lecturaEnHora(horas: LecturaHora[], hora: number): LecturaHora | null {
  if (!Number.isFinite(hora)) return null;
  const encontrada = horas.find((item) => item.hora === horaEnDia(hora));
  if (!encontrada) return null;
  return {
    hora: encontrada.hora,
    vientoKt: Number.isFinite(encontrada.vientoKt as number) ? encontrada.vientoKt : null,
    dirDeg: Number.isFinite(encontrada.dirDeg as number) ? encontrada.dirDeg : null,
    rachasKt: Number.isFinite(encontrada.rachasKt as number) ? encontrada.rachasKt : null
  };
}

export function textoViento(kt: number | null): string {
  return kt === null ? 'sin dato' : `${Number(kt).toFixed(1)} kt`;
}

function rumboDe(a: [number, number], b: [number, number]): number {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function horaTexto(hora: number, minuto: number, extraMin: number): string {
  const total = hora * 60 + minuto + Math.max(0, Math.round(extraMin));
  const h = ((Math.floor(total / 60) % 24) + 24) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Viento de cada tramo a la hora estimada de paso.
 * No usa `calcularMeteoProgresivaPorTramo`: esa función del sitio antiguo
 * pone 5 kt cuando falta la hora. Aquí la ausencia se queda en null.
 */
export function planificarTramos(opts: {
  puntos: Array<[number, number]>;
  cruceroKmh: number;
  horaSalida: number;
  minutoSalida?: number;
  horas: LecturaHora[];
}): PlanTramos {
  const vacio: PlanTramos = { tramos: [], km: 0, minutos: null, vientoSalidaKt: null, avisos: [] };
  if (!Array.isArray(opts.puntos) || opts.puntos.length < 2) return vacio;

  const minutoSalida = Number.isFinite(opts.minutoSalida) ? Number(opts.minutoSalida) : 0;
  const horaSalida = Number.isFinite(opts.horaSalida) ? opts.horaSalida : 10;
  const salida = lecturaEnHora(opts.horas, horaSalida);
  const vientoSalidaKt = salida?.vientoKt ?? null;
  const crucero = Number(opts.cruceroKmh);
  const cruceroOk = Number.isFinite(crucero) && crucero > 0;

  let acumulado = 0;
  let km = 0;
  const tramos: Tramo[] = [];
  const avisos: string[] = [];

  for (let i = 0; i < opts.puntos.length - 1; i++) {
    const a = opts.puntos[i];
    const b = opts.puntos[i + 1];
    const dist = haversineKm(a[0], a[1], b[0], b[1]);
    const minutos = cruceroOk ? (dist / crucero) * 60 : null;
    const paso = minutos === null ? acumulado : acumulado + minutos / 2;
    const horaPaso = horaSalida + Math.floor((minutoSalida + paso) / 60);
    const lectura = lecturaEnHora(opts.horas, horaPaso);
    const dir = lectura?.dirDeg ?? null;
    const relativo = evaluarVientoRelativoInfo(rumboDe(a, b), dir);
    const vientoKt = lectura?.vientoKt ?? null;
    const incrementoKt = vientoSalidaKt !== null && vientoKt !== null
      ? Number((vientoKt - vientoSalidaKt).toFixed(1))
      : null;
    const nombre = `Tramo ${i + 1}`;
    let aviso: string | null = null;
    if (incrementoKt !== null && incrementoKt >= SUBIDA_KT) {
      aviso = `A la hora de paso por el ${nombre} (${horaTexto(horaSalida, minutoSalida, paso)}), el viento sube de ${vientoSalidaKt} kt a ${vientoKt} kt.`;
      avisos.push(aviso);
    }
    tramos.push({
      nombre,
      km: dist,
      minutos,
      rumbo: rumboDe(a, b),
      eta: horaTexto(horaSalida, minutoSalida, acumulado),
      vientoKt,
      dirDeg: dir,
      rachasKt: lectura?.rachasKt ?? null,
      relativo: relativo.texto,
      color: relativo.hexLineColor,
      incrementoKt,
      aviso
    });
    km += dist;
    if (minutos !== null) acumulado += minutos;
  }

  return {
    tramos,
    km,
    minutos: cruceroOk ? acumulado : null,
    vientoSalidaKt,
    avisos
  };
}
