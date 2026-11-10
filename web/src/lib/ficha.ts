/**
 * Datos de demostración solo para capturas de la ficha.
 * En el build de release `import.meta.env.DEV` es false: ?ficha=1 no abre Premium
 * ni sustituye datos. No escribe en Supabase.
 */
import type { EstadoPlay } from '@/lib/play';
import type { HoraMarina, Motor, Pronostico } from '@/lib/legacy';

export function esFicha(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const enUrl = params.get('ficha') === '1' || window.location.hash.includes('ficha=1');
  if (enUrl) window.sessionStorage.setItem('paddlesafe-ficha', '1');
  return window.sessionStorage.getItem('paddlesafe-ficha') === '1';
}

export function vistaFicha(): string | null {
  if (!esFicha()) return null;
  return new URLSearchParams(window.location.search).get('vista');
}

export const PLAY_FICHA: EstadoPlay = {
  disponible: true,
  conectado: true,
  activo: true,
  pendiente: false,
  token: null,
  producto: 'premium',
  planes: [
    { idBase: 'mensual', oferta: 'mensual', precio: '4,99 €', periodo: 'P1M', micros: 4_990_000, moneda: 'EUR' },
    { idBase: 'anual', oferta: 'anual', precio: '39,99 €', periodo: 'P1Y', micros: 39_990_000, moneda: 'EUR' }
  ],
  error: null
};

const HORAS: HoraMarina[] = [
  { hora: '08:00', vientoKt: 6, rachasKt: 9, dirDeg: 40, tempC: 17, oleajeM: 0.3, periodoOlaS: 6 },
  { hora: '09:00', vientoKt: 7, rachasKt: 10, dirDeg: 45, tempC: 18, oleajeM: 0.4, periodoOlaS: 6 },
  { hora: '10:00', vientoKt: 8, rachasKt: 12, dirDeg: 50, tempC: 19, oleajeM: 0.4, periodoOlaS: 6 },
  { hora: '11:00', vientoKt: 8, rachasKt: 12, dirDeg: 50, tempC: 20, oleajeM: 0.4, periodoOlaS: 7 },
  { hora: '12:00', vientoKt: 9, rachasKt: 13, dirDeg: 55, tempC: 21, oleajeM: 0.5, periodoOlaS: 7 },
  { hora: '13:00', vientoKt: 10, rachasKt: 14, dirDeg: 60, tempC: 21, oleajeM: 0.5, periodoOlaS: 6 },
  { hora: '14:00', vientoKt: 9, rachasKt: 13, dirDeg: 55, tempC: 21, oleajeM: 0.5, periodoOlaS: 6 },
  { hora: '15:00', vientoKt: 8, rachasKt: 12, dirDeg: 50, tempC: 20, oleajeM: 0.4, periodoOlaS: 6 },
  { hora: '16:00', vientoKt: 7, rachasKt: 11, dirDeg: 45, tempC: 19, oleajeM: 0.4, periodoOlaS: 6 },
  { hora: '17:00', vientoKt: 6, rachasKt: 9, dirDeg: 40, tempC: 18, oleajeM: 0.3, periodoOlaS: 6 }
];

export function demoCosta(): { nombre: string; lat: number; lon: number; pronostico: Pronostico; motor: Motor; puntos: Array<[number, number]> } {
  return {
    nombre: 'Cala del Portitxol, Jávea',
    lat: 38.789,
    lon: 0.186,
    puntos: [
      [38.7882, 0.1835],
      [38.7915, 0.1888],
      [38.7958, 0.1912],
      [38.7994, 0.1864],
      [38.7966, 0.1808],
      [38.7918, 0.1786]
    ],
    pronostico: {
      location: 'Cala del Portitxol, Jávea',
      date: '2026-11-10',
      windSpeed: 8,
      windGusts: 12,
      windDirection: 50,
      waveHeight: 0.4,
      wavePeriod: 6,
      tempAire: 19,
      tempAgua: 18,
      precipProbability: 0,
      precipitation: 0,
      horasDiurnas: HORAS,
      ventanasOptimas: {
        hayVentana: true,
        textoResumen: 'Mejor ventana de 09:00 a 13:00: 7–9 kt y 0,4 m de oleaje.',
        mejorVentana: { inicio: '09:00', fin: '13:00', vientoKt: 8, oleajeM: 0.4, duracionHoras: 4 }
      },
      coordinates: { latitude: 38.789, longitude: 0.186 },
      source: 'demostración'
    },
    motor: {
      estado: 'Favorable',
      icono: '🟢',
      score: 86,
      justificacion: 'Viento flojo del noreste y oleaje bajo. Buena hora para salir desde el Portitxol con tabla de paseo.',
      vientoConocido: true,
      oleajeConocido: true,
      oleajeAplica: true,
      analysisConfidence: 84,
      factoresCriticos: [],
      componenteCostera: { componente: 'Cruzado, con poco empuje hacia fuera' },
      riesgoDeriva: { nivel: 'Bajo', descripcion: 'La brisa no empuja mar adentro' },
      detallesTecnicos: {
        vientoKt: 8,
        rachasKt: 12,
        oleajeM: 0.4,
        periodoOlaS: 6,
        tempAireC: 19,
        tempAguaC: 18
      }
    }
  };
}

export function demoRadar() {
  const centro = { lat: 38.789, lon: 0.186 };
  const offsets = [-0.12, 0, 0.12];
  const flechas = offsets.flatMap((dy, fila) => offsets.map((dx, col) => ({
    lat: centro.lat + dy,
    lon: centro.lon + dx,
    kt: 7 + fila + col,
    dir: 48
  })));
  return { ...centro, flechas, motor: demoCosta().motor };
}

export function demoClub() {
  return {
    club: {
      id: 'club-portitxol',
      nombre: 'Club Portitxol',
      descripcion: 'Salidas tranquilas desde el muelle cuando el parte es favorable.',
      ubicacion: 'Jávea',
      nivel: 2
    },
    rol: 'miembro',
    mensajes: [
      { id: 'm1', user_id: 'lucia', autor: 'Lucía', mensaje: '¿Salimos a las 10? El parte marca 8 kt y oleaje de medio metro.' },
      { id: 'm2', user_id: 'andreu', autor: 'Andreu', mensaje: 'Yo llego al muelle a las 9:40. Llevo chaleco de más.' },
      { id: 'm3', user_id: 'nuria', autor: 'Núria', mensaje: 'Me apunto. Vuelta por la cala antes de que suba la brisa.' }
    ],
    eventos: [
      {
        id: 'q1',
        nombre: 'Travesía al Portitxol',
        descripcion: 'Quedada en el muelle. Ritmo de paseo, unos 6 km.',
        fecha_evento: '2026-11-15T09:30:00',
        distancia_km: 6
      }
    ],
    miembros: [
      { user_id: 'lucia', nombre: 'Lucía Serra', rol: 'admin' },
      { user_id: 'andreu', nombre: 'Andreu Costa', rol: 'miembro' },
      { user_id: 'nuria', nombre: 'Núria Vidal', rol: 'miembro' }
    ]
  };
}

export function demoMuro() {
  return {
    rutas: [
      { id: 'ruta-portitxol', user_id: 'lucia', autor: 'Lucía Serra', distancia_km: 6.4, tiempo_minutos: 78, ubicacion: 'Cala del Portitxol, Jávea', fecha: '2026-11-09' },
      { id: 'ruta-granadella', user_id: 'andreu', autor: 'Andreu Costa', distancia_km: 4.1, tiempo_minutos: 55, ubicacion: 'Cala Granadella', fecha: '2026-11-08' },
      { id: 'ruta-moraira', user_id: 'nuria', autor: 'Núria Vidal', distancia_km: 8.2, tiempo_minutos: 104, ubicacion: 'Moraira a Cala Blanca', fecha: '2026-11-07' }
    ],
    likes: { 'ruta-portitxol': 12, 'ruta-granadella': 7, 'ruta-moraira': 15 },
    comentarios: [
      { id: 'c1', user_id: 'andreu', autor_nombre: 'Andreu Costa', comentario: 'El agua estaba en calma y el viento no molestaba.' }
    ]
  };
}
