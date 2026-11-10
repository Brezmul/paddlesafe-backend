import { haversineKm } from './geo';

export type MarcoRecorrido = {
  lat: number;
  lon: number;
  rumbo: number;
  km: number;
  indice: number;
  estela: Array<[number, number]>;
};

export const DURACION_BASE_S = 30;
export const VELOCIDADES = [1, 2, 5] as const;

/** La animación solo corre en primer plano y si el sistema no pide reducir el movimiento. */
export function debeAnimar(opts: { reproduciendo: boolean; reducido: boolean; oculto: boolean }): boolean {
  return opts.reproduciendo && !opts.reducido && !opts.oculto;
}

function rumbo(a: [number, number], b: [number, number]): number {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Misma idea que `obtenerInterpolacionProgreso` del sitio antiguo:
 * distancia acumulada y un punto entre los dos vértices del tramo.
 * Aquí no toca el mapa ni el DOM.
 */
export function interpolarRecorrido(puntos: Array<[number, number]>, progreso: number): MarcoRecorrido | null {
  if (!Array.isArray(puntos) || puntos.length === 0) return null;
  const p = Math.max(0, Math.min(1, Number.isFinite(progreso) ? progreso : 0));
  if (puntos.length === 1) {
    return { lat: puntos[0][0], lon: puntos[0][1], rumbo: 0, km: 0, indice: 0, estela: [puntos[0]] };
  }
  const acum = [0];
  for (let i = 1; i < puntos.length; i++) {
    acum.push(acum[i - 1] + haversineKm(puntos[i - 1][0], puntos[i - 1][1], puntos[i][0], puntos[i][1]));
  }
  const total = acum[acum.length - 1];
  if (total === 0) {
    return { lat: puntos[0][0], lon: puntos[0][1], rumbo: 0, km: 0, indice: 0, estela: [puntos[0]] };
  }
  const objetivo = p * total;
  let idx = 0;
  let bajo = 0;
  let alto = acum.length - 1;
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1;
    if (acum[medio] <= objetivo) {
      idx = medio;
      bajo = medio + 1;
    } else {
      alto = medio - 1;
    }
  }
  if (idx >= puntos.length - 1) idx = puntos.length - 2;
  const a = puntos[idx];
  const b = puntos[idx + 1];
  const tramo = acum[idx + 1] - acum[idx];
  const t = tramo > 0 ? (objetivo - acum[idx]) / tramo : 0;
  const lat = a[0] + t * (b[0] - a[0]);
  const lon = a[1] + t * (b[1] - a[1]);
  const estela = puntos.slice(0, idx + 1);
  estela.push([lat, lon]);
  return { lat, lon, rumbo: (rumbo(a, b) + 360) % 360, km: objetivo, indice: idx, estela };
}

export function siguienteVelocidad(actual: number): number {
  const i = VELOCIDADES.indexOf(actual as (typeof VELOCIDADES)[number]);
  return VELOCIDADES[(i + 1) % VELOCIDADES.length];
}
