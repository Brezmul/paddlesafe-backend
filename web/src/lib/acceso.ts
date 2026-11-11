/**
 * Reparto gratis / Premium.
 * Lo que informa de si se puede salir ahora, y los avisos de peligro, no se cobran.
 * Entrar con una cuenta que ya existe tampoco: si no, quien ya estaba no podría identificarse.
 * Crear una cuenta nueva sí es Premium.
 */

export type Funcion =
  | 'mapa'
  | 'busqueda'
  | 'gps'
  | 'veredicto'
  | 'avisos'
  | 'radar'
  | 'cuenta'
  | 'clubes'
  | 'social'
  | 'tactico'
  | 'tramos'
  | 'reproduccion'
  | 'particulas'
  | 'gpx'
  | 'bitacora'
  | 'vivo'
  | 'jornada'
  | 'coach'
  | 'favoritos'
  | 'notificaciones'
  | 'neopreno'
  | 'reporte'
  | 'poster';

const GRATIS = new Set<Funcion>(['mapa', 'busqueda', 'gps', 'veredicto', 'avisos', 'radar']);

export type Derecho = 'activo' | 'inactivo' | 'desconocido';

export type OrigenPremium = 'play' | 'servidor' | 'previo' | 'gracia' | 'ninguno';

export function puedeUsar(funcion: Funcion, premium: boolean): boolean {
  return GRATIS.has(funcion) || premium;
}

/**
 * El servidor es la fuente de verdad de los datos (RLS).
 * En el dispositivo Android, una suscripción activa de Play abre la interfaz
 * aunque la cuenta aún no esté vinculada: quien acaba de pagar no se queda fuera.
 * Si la tabla todavía no existe y hay sesión, se respeta a quien ya tenía cuenta.
 */
export function decidirPremium(opts: {
  playActivo: boolean;
  derecho: Derecho;
  accesoPrevio: boolean;
  sesion: boolean;
  tablaAusente: boolean;
}): { premium: boolean; origen: OrigenPremium } {
  if (opts.accesoPrevio) return { premium: true, origen: 'previo' };
  if (opts.derecho === 'activo') return { premium: true, origen: 'servidor' };
  if (opts.tablaAusente && opts.sesion) return { premium: true, origen: 'gracia' };
  if (opts.playActivo) return { premium: true, origen: 'play' };
  return { premium: false, origen: 'ninguno' };
}

export function textoPeriodo(iso: string): string {
  if (iso === 'P1M') return 'Cada mes';
  if (iso === 'P1Y') return 'Cada año';
  if (iso === 'P3M') return 'Cada 3 meses';
  return 'Suscripción';
}
