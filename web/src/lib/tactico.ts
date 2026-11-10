import { calcularBiometriaSup } from '../../../public_html/js/map/map.tracker.js';
import { calcularSolYCrepusculo } from '../../../public_html/js/utils.js';
import { cardinal } from './geo';
import type { Motor, Pronostico } from './legacy';

export type FichaTactica = {
  viento: string;
  rachas: string;
  direccion: string;
  oleaje: string;
  periodo: string;
  lluvia: string;
  aire: string;
  agua: string;
  veredicto: string;
  deriva: string;
  ventana: string;
  ocaso: { texto: string; peligro: boolean };
  esfuerzo: string;
};

function magnitud(valor: unknown, unidad: string, decimales = 1): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 'sin dato';
  return `${valor.toFixed(decimales)} ${unidad}`;
}

function minutosDe(hora: string): number | null {
  const [hh, mm] = hora.split(':').map((parte) => Number(parte));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Ficha del panel táctico. Un valor que no ha llegado se escribe «sin dato».
 * El esfuerzo no se calcula con un viento o un oleaje sustituidos por cero.
 */
export function fichaTactica(opts: {
  motor: Motor | null;
  pronostico: Pronostico | null;
  lat: number;
  lon: number;
  fecha?: string;
  horaSalida: string;
  minutosRuta: number | null;
  kmRuta: number | null;
  cruceroKmh: number | null;
}): FichaTactica {
  const det = opts.motor?.detallesTecnicos;
  const vientoKt = det?.vientoKt;
  const vientoConocido = typeof vientoKt === 'number' && Number.isFinite(vientoKt);
  const oleajeM = det?.oleajeM;
  const oleajeConocido = typeof oleajeM === 'number' && Number.isFinite(oleajeM);
  const interior = opts.motor?.oleajeAplica === false;
  const fecha = opts.fecha || opts.pronostico?.date || new Date().toISOString().slice(0, 10);
  const solar = calcularSolYCrepusculo(opts.lat, opts.lon, fecha);
  const salidaMin = minutosDe(opts.horaSalida);
  let ocaso: FichaTactica['ocaso'] = {
    texto: `Ocaso ${solar.sunsetStr}. Luz útil hasta ${solar.civilDuskStr}.`,
    peligro: false
  };
  if (opts.minutosRuta !== null && salidaMin !== null) {
    const llegada = salidaMin + Math.round(opts.minutosRuta);
    if (llegada >= solar.sunsetMin - 30) {
      const hh = String(Math.floor((llegada % 1440) / 60)).padStart(2, '0');
      const mm = String(llegada % 60).padStart(2, '0');
      ocaso = {
        texto: `La ruta llega sobre las ${hh}:${mm}, cerca o después del ocaso (${solar.sunsetStr}).`,
        peligro: true
      };
    }
  }

  const ventana = opts.pronostico?.ventanasOptimas?.textoResumen
    || (opts.pronostico?.ventanasOptimas?.mejorVentana
      ? `${opts.pronostico.ventanasOptimas.mejorVentana.inicio || '—'}–${opts.pronostico.ventanasOptimas.mejorVentana.fin || '—'}`
      : 'sin dato');

  const tempC = det?.tempAireC;
  const tempConocida = typeof tempC === 'number' && Number.isFinite(tempC);
  let esfuerzo = 'sin dato';
  const puedeEsfuerzo = opts.minutosRuta !== null
    && vientoConocido
    && tempConocida
    && (interior || oleajeConocido)
    && opts.cruceroKmh !== null
    && Number.isFinite(opts.cruceroKmh);
  if (
    puedeEsfuerzo
    && opts.minutosRuta !== null
    && opts.cruceroKmh !== null
    && typeof vientoKt === 'number'
    && typeof tempC === 'number'
    && (interior || typeof oleajeM === 'number')
  ) {
    const bio = calcularBiometriaSup({
      duracionMin: opts.minutosRuta,
      distKm: opts.kmRuta || 0,
      velKmh: opts.cruceroKmh,
      vientoKt,
      olasM: typeof oleajeM === 'number' ? oleajeM : 0,
      periodoS: typeof det?.periodoOlaS === 'number' ? det.periodoOlaS : 0,
      tempC
    });
    esfuerzo = `${bio.kcal} kcal · ${bio.litros} l`;
  }

  const direccionNum = typeof opts.pronostico?.windDirection === 'number' ? opts.pronostico.windDirection : null;

  return {
    viento: vientoConocido ? magnitud(vientoKt, 'kt') : 'sin dato',
    rachas: magnitud(det?.rachasKt, 'kt'),
    direccion: direccionNum === null ? 'sin dato' : `${Math.round(direccionNum)}° ${cardinal(direccionNum)}`,
    oleaje: interior ? 'No aplica' : (oleajeConocido ? magnitud(oleajeM, 'm') : 'sin dato'),
    periodo: magnitud(det?.periodoOlaS, 's'),
    lluvia: magnitud(opts.pronostico?.precipProbability, '%', 0),
    aire: magnitud(det?.tempAireC, '°C', 0),
    agua: magnitud(det?.tempAguaC, '°C', 0),
    veredicto: opts.motor?.estado || 'sin dato',
    deriva: opts.motor?.riesgoDeriva?.nivel
      ? `${opts.motor.riesgoDeriva.nivel}${opts.motor.riesgoDeriva.descripcion ? ` · ${opts.motor.riesgoDeriva.descripcion}` : ''}`
      : 'sin dato',
    ventana,
    ocaso,
    esfuerzo
  };
}
