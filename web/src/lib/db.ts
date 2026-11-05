import { supabase } from './supabase';

export function textoError(error: unknown): string {
  if (!error) return 'Ha ocurrido un error.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const maybe = error as { message?: string };
  return maybe.message || 'Ha ocurrido un error.';
}

export async function insertarFlexible(tabla: string, fila: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const payload = { ...fila };
  let ultimo = 'No se ha podido guardar.';
  for (let i = 0; i < 8; i++) {
    const { error } = await supabase.from(tabla).insert(payload);
    if (!error) return;
    ultimo = error.message;
    const columna =
      error.message.match(/Could not find the '([^']+)' column/i)?.[1] ||
      error.message.match(/column "([^"]+)" of relation/i)?.[1];
    if (!columna || !(columna in payload)) break;
    delete payload[columna];
  }
  throw new Error(ultimo);
}

export type SpotGuardado = {
  id: string;
  user_id?: string | null;
  nombre: string;
  lat: number;
  lon: number;
  seaward_deg?: number | null;
  orden?: number | null;
  notas_tacticas?: string | null;
  acceso_parking?: string | null;
  peligros_locales?: string | null;
};

const LOCAL_SPOTS = 'ps_spots_guardados';

export function leerSpotsLocales(): SpotGuardado[] {
  try {
    const raw = localStorage.getItem(LOCAL_SPOTS);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function guardarSpotsLocales(spots: SpotGuardado[]) {
  localStorage.setItem(LOCAL_SPOTS, JSON.stringify(spots));
}

export async function cargarSpots(userId: string | null): Promise<SpotGuardado[]> {
  const locales = leerSpotsLocales();
  if (!supabase || !userId) return locales;
  const { data, error } = await supabase
    .from('user_spots')
    .select('*')
    .eq('user_id', userId)
    .order('orden', { ascending: true });
  if (error || !data) return locales;
  const remotos = data as SpotGuardado[];
  const fusion = [...remotos];
  for (const local of locales) {
    const existe = fusion.some(
      (s) => s.nombre.toLowerCase() === local.nombre.toLowerCase() ||
        (Math.abs(Number(s.lat) - local.lat) < 0.002 && Math.abs(Number(s.lon) - local.lon) < 0.002)
    );
    if (!existe) fusion.push(local);
  }
  return fusion;
}

export async function guardarSpot(userId: string | null, spot: Omit<SpotGuardado, 'id'> & { id?: string }): Promise<SpotGuardado[]> {
  const actuales = await cargarSpots(userId);
  const nuevo: SpotGuardado = {
    id: spot.id || crypto.randomUUID(),
    user_id: userId,
    nombre: spot.nombre.trim(),
    lat: Number(spot.lat.toFixed(6)),
    lon: Number(spot.lon.toFixed(6)),
    seaward_deg: spot.seaward_deg ?? null,
    orden: actuales.length,
    notas_tacticas: spot.notas_tacticas || '',
    acceso_parking: spot.acceso_parking || '',
    peligros_locales: spot.peligros_locales || ''
  };
  const duplicado = actuales.some(
    (s) => Math.abs(Number(s.lat) - nuevo.lat) < 0.002 && Math.abs(Number(s.lon) - nuevo.lon) < 0.002
  );
  const lista = duplicado ? actuales : [...actuales, nuevo];
  guardarSpotsLocales(lista);
  if (supabase && userId && !duplicado) {
    try {
      await insertarFlexible('user_spots', {
        user_id: userId,
        nombre: nuevo.nombre,
        lat: nuevo.lat,
        lon: nuevo.lon,
        seaward_deg: nuevo.seaward_deg,
        orden: nuevo.orden,
        notas_tacticas: nuevo.notas_tacticas,
        acceso_parking: nuevo.acceso_parking,
        peligros_locales: nuevo.peligros_locales
      });
    } catch (error) {
      console.warn('Spot guardado en el dispositivo. Supabase:', textoError(error));
    }
  }
  return lista;
}

export async function borrarSpot(userId: string | null, spot: SpotGuardado): Promise<SpotGuardado[]> {
  const lista = (await cargarSpots(userId)).filter((s) => s.id !== spot.id);
  guardarSpotsLocales(lista);
  if (supabase && userId && spot.id && !String(spot.id).startsWith('spot_')) {
    await supabase.from('user_spots').delete().eq('user_id', userId).eq('id', spot.id);
  }
  return lista;
}

export async function actualizarNotasSpot(userId: string | null, spot: SpotGuardado, notas: Pick<SpotGuardado, 'notas_tacticas' | 'acceso_parking' | 'peligros_locales'>) {
  const lista = (await cargarSpots(userId)).map((s) => (s.id === spot.id ? { ...s, ...notas } : s));
  guardarSpotsLocales(lista);
  if (supabase && userId) {
    try {
      await supabase.from('user_spots').update(notas).eq('user_id', userId).eq('id', spot.id);
    } catch (error) {
      console.warn(textoError(error));
    }
  }
  return lista;
}

const PENDING_KEY = 'paddlesafe_ruta_pendiente';

export type RutaPendiente = {
  user_id: string;
  km: number;
  min: number;
  coords: Array<[number, number]>;
  ubicacion: string;
  points_earned: number;
};

export function guardarRutaPendiente(ruta: RutaPendiente) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(ruta));
}

export async function sincronizarRutaPendiente(userId: string) {
  if (!supabase) return;
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;
  let pendiente: RutaPendiente | null = null;
  try {
    pendiente = JSON.parse(raw) as RutaPendiente;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return;
  }
  if (!pendiente?.user_id) {
    localStorage.removeItem(PENDING_KEY);
    return;
  }
  const esInvitado = String(pendiente.user_id).startsWith('guest_');
  if (pendiente.user_id !== userId && !esInvitado) return;
  await guardarRutaEnNube({
    userId,
    distanciaKm: pendiente.km,
    tiempoMinutos: pendiente.min,
    coords: pendiente.coords,
    ubicacion: pendiente.ubicacion || 'Travesía GPS',
    pointsEarned: pendiente.points_earned
  });
  localStorage.removeItem(PENDING_KEY);
}

export async function guardarRutaEnNube(input: {
  userId: string;
  distanciaKm: number;
  tiempoMinutos: number;
  coords: Array<[number, number]>;
  ubicacion: string;
  pointsEarned?: number;
  avgSpeed?: number;
}) {
  if (!supabase) throw new Error('Inicia sesión para guardar la ruta en tu cuenta.');
  const km = Number(input.distanciaKm.toFixed(2));
  const minutos = Math.max(1, Math.round(input.tiempoMinutos));
  const puntos = input.pointsEarned ?? Math.round(km * 100);
  const velocidad = input.avgSpeed ?? Number((km / (minutos / 60)).toFixed(2));
  if (velocidad > 45) {
    throw new Error('La velocidad media supera lo creíble en paddle surf. Revisa el recorrido antes de guardarlo.');
  }
  const { data, error } = await supabase
    .from('rutas')
    .insert([{
      user_id: input.userId,
      distancia_km: km,
      tiempo_minutos: minutos,
      ruta_json: input.coords,
      ubicacion: input.ubicacion,
      points_earned: puntos,
      imagen_url: null
    }])
    .select('id')
    .maybeSingle();
  if (error) throw error;
  try {
    await insertarFlexible('user_routes', {
      user_id: input.userId,
      title: input.ubicacion,
      distance_km: km,
      duration_seconds: minutos * 60,
      avg_speed: velocidad,
      xp_earned: puntos,
      route_coordinates: input.coords
    });
  } catch (err) {
    console.warn('user_routes:', textoError(err));
  }
  return data;
}
