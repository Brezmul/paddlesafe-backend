import { solicitarPronostico, obtenerMotorExperto, textoParteGuardado } from '../../../public_html/js/map/map.weather.js';
export { textoParteGuardado };
import { calcularEquipamientoTermicoDetallado } from '../../../public_html/js/utils.js';
import { parseGPX, generarGPX } from '../../../public_html/js/gpxParser.js';
import { env } from './env';
import { magnitudNoNegativa, medicionNumerica } from './medicion';
import { marcaSnapshotDe, type MarcaSnapshot, type ParteVisible } from './consultaLugar';

export type Nivel = 'Principiante' | 'Intermedio' | 'Avanzado' | 'Competicion';

export type HoraMarina = {
  hora?: string;
  vientoKt?: number | null;
  rachasKt?: number | null;
  dirDeg?: number | null;
  tempC?: number | null;
  oleajeM?: number | null;
  periodoOlaS?: number | null;
};

export type Pronostico = {
  location?: string;
  windSpeed?: number | null;
  windGusts?: number | null;
  windDirection?: number | null;
  waveHeight?: number | null;
  wavePeriod?: number | null;
  swellHeight?: number | null;
  tempAire?: number | null;
  tempAgua?: number | null;
  precipProbability?: number | null;
  precipitation?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  visibility?: number | null;
  horasDiurnas?: HoraMarina[];
  ventanasOptimas?: {
    hayVentana?: boolean;
    textoResumen?: string;
    mejorVentana?: { inicio?: string; fin?: string; vientoKt?: number; oleajeM?: number; duracionHoras?: number };
    ventanasSecundarias?: Array<{ inicio?: string; fin?: string; duracionHoras?: number }>;
    evolucionAviso?: string | null;
  } | null;
  coordinates?: { latitude: number; longitude: number };
  source?: string;
  date?: string;
  _desdeSnapshot?: boolean;
  _snapshotTs?: number | null;
  _snapshotLocation?: string | null;
  _snapshotLat?: number | null;
  _snapshotLon?: number | null;
  _snapshotConsulta?: string | null;
  _snapshotObservado?: string | null;
};

export type Motor = {
  estado?: string;
  icono?: string;
  score?: number;
  scoreSeguridad?: number;
  respuestaDirecta?: string;
  justificacion?: string;
  vientoNudos?: number | null;
  oleajeAplica?: boolean;
  vientoConocido?: boolean;
  oleajeConocido?: boolean;
  factoresCriticos?: string[];
  analysisConfidence?: number;
  tipoMar?: string | null;
  componenteCostera?: { componente?: string };
  riesgoDeriva?: { nivel?: string; score?: number; descripcion?: string };
  detallesTecnicos?: {
    vientoKt?: number | null;
    rachasKt?: number | null;
    oleajeM?: number | null;
    periodoOlaS?: number | null;
    tempAireC?: number | null;
    tempAguaC?: number | null;
  };
  avisoPreventivoActivo?: boolean;
  alertaEmergenciaActiva?: boolean;
  tormentaElectrica?: boolean;
};

export async function evaluarLugar(opts: {
  lat: number;
  lon: number;
  nombre: string;
  nivel: Nivel;
  boardType?: string | null;
  fecha?: string;
}): Promise<{ pronostico: Pronostico; motor: Motor }> {
  const hoy = opts.fecha || new Date().toISOString().slice(0, 10);
  const crudo = await solicitarPronostico({
    lat: opts.lat,
    lon: opts.lon,
    location: opts.nombre,
    date: hoy,
    fecha: hoy,
    timeRange: '(08:00 - 20:00)',
    userLevel: opts.nivel
  }) as { datos?: Pronostico } & Pronostico;
  const base = (crudo?.datos && typeof crudo.datos === 'object' ? crudo.datos : crudo) as Pronostico;
  const marca = marcaSnapshotDe(crudo) || marcaSnapshotDe(base);
  const pronostico = (marca ? { ...base, ...marca } : base) as ParteVisible;
  const motor = obtenerMotorExperto(pronostico, opts.nivel, {
    boardType: opts.boardType || null,
    deporte: 'paddle_surf'
  }) as Motor;
  return { pronostico, motor };
}

export function evaluarHora(base: Pronostico, hora: HoraMarina, nivel: Nivel, boardType?: string | null): Motor {
  const ausente = (valor: unknown) => valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
  const nudosAMs = (kt: unknown, respaldo: number | null | undefined) => {
    if (ausente(kt)) return respaldo;
    const n = magnitudNoNegativa(kt);
    return n === null ? null : n * 0.514444;
  };
  const numeroORespaldo = (valor: unknown, respaldo: number | null | undefined) => {
    if (ausente(valor)) return respaldo;
    return medicionNumerica(valor);
  };
  const oleaje = ausente(hora.oleajeM) ? base.waveHeight : magnitudNoNegativa(hora.oleajeM);
  const dx = {
    ...base,
    windSpeed: nudosAMs(hora.vientoKt, base.windSpeed),
    windGusts: nudosAMs(hora.rachasKt, base.windGusts),
    windDirection: numeroORespaldo(hora.dirDeg, base.windDirection),
    waveHeight: oleaje,
    wavePeriod: ausente(hora.periodoOlaS) ? base.wavePeriod : magnitudNoNegativa(hora.periodoOlaS),
    tempAire: numeroORespaldo(hora.tempC, base.tempAire)
  };
  const motor = obtenerMotorExperto(dx, nivel, { boardType: boardType || null, deporte: 'paddle_surf' }) as Motor;
  const marca: MarcaSnapshot | null = marcaSnapshotDe(base);
  return marca ? { ...motor, ...marca } : motor;
}

export function equipoTermico(params: {
  tempAguaC?: number | null;
  tempAireC?: number | null;
  vientoKt?: number | null;
  intensidad?: 'paseo' | 'travesia' | 'race';
  toleranciaFrio?: 'friolero' | 'normal' | 'caluroso';
}) {
  return calcularEquipamientoTermicoDetallado({
    tempAguaC: params.tempAguaC ?? 18,
    tempAireC: params.tempAireC ?? 20,
    vientoKt: params.vientoKt ?? 8,
    intensidad: params.intensidad || 'paseo',
    toleranciaFrio: params.toleranciaFrio || 'normal'
  }) as {
    trajePrincipal: { titulo: string; grosorMm: string; icono: string; explicacion: string };
    calzado: string;
    accesorios: string[];
    nivelConfort: string;
    indiceTermico: number;
    alertaRegla30: string | null;
    sensacionTermicaC: number;
  };
}

export function leerGpx(xml: string) {
  return parseGPX(xml) as {
    coordinates: Array<[number, number]>;
    total_distance_km: number;
    total_duration_seconds: number;
    avg_speed_kmh: number;
  };
}

export function xmlGpx(coords: Array<[number, number]>, nombre: string): string {
  return generarGPX(coords, { nombre, descripcion: 'Ruta exportada desde PaddleSafe' }) as string;
}

export async function pedirCoach(input: {
  nivel: Nivel;
  vientoKmh: number;
  rachasKmh: number;
  direccion: number;
  oleaje: number;
  periodo: number;
  tempAire: number | string;
  tempAgua: number | string;
  lat: number;
  lon: number;
  ubicacion: string;
  distanciaKm: number;
  duracionMin: number;
}) {
  const res = await fetch(`${env.backendUrl}?action=coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userLevel: input.nivel,
      condiciones: {
        viento: input.vientoKmh,
        rachas: input.rachasKmh,
        direccion: input.direccion,
        oleaje: input.oleaje,
        periodo: input.periodo,
        tempAire: input.tempAire,
        tempAgua: input.tempAgua,
        lluvia: 0,
        precipProb: 0,
        lat: input.lat,
        lon: input.lon,
        ubicacion: input.ubicacion,
        distanciaKm: input.distanciaKm,
        duracionMin: input.duracionMin
      }
    })
  });
  if (!res.ok) throw new Error('El coach no responde ahora mismo.');
  return res.json() as Promise<{
    ok?: boolean;
    fuente?: string;
    coach?: {
      veredicto?: string;
      resumen?: string;
      regla_oro?: string;
      consejos_nivel?: string[];
      seguridad_estrategia?: string[];
      tecnica_postura?: string[];
      material_recomendado?: string[];
      estrategia_viento?: { resumen?: string } | string;
    };
  }>;
}
