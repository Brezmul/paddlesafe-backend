import { Geolocation } from '@capacitor/geolocation';

type Lectura = { coords: { latitude: number; longitude: number; accuracy?: number | null } };

/**
 * Capacitor Geolocation 8 aplica `timeout` también a `watchPosition`.
 * Si no se pasa `interval`, el intervalo deseado pasa a ser ese timeout.
 * Un timeout corto (15 s) corta el seguimiento en cuanto falta un punto.
 * La lectura puntual sigue teniendo un tope de 12 s. El seguimiento pide
 * puntos cada 4 s y solo considera perdida la señal tras 2 min.
 */
export const OPCIONES_LECTURA = { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 };
export const OPCIONES_SEGUIMIENTO = {
  enableHighAccuracy: true,
  timeout: 120_000,
  maximumAge: 5_000,
  interval: 4_000,
  minimumUpdateInterval: 2_000
};
const REINTENTOS_TIMEOUT = 2;
const PRECISION_FINA_M = 100;

export type CodigoUbicacion = 'denegado' | 'servicios' | 'timeout' | 'otro';

export class ErrorUbicacion extends Error {
  codigo: CodigoUbicacion;
  constructor(codigo: CodigoUbicacion, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorUbicacion';
    this.codigo = codigo;
  }
}

export type Posicion = { lat: number; lon: number; accuracy: number | null; aproximada: boolean };

export type AvisoSeguimiento = { fatal: boolean; mensaje: string };

type ClienteGeo = {
  requestPermissions: () => Promise<{ location?: string }>;
  getCurrentPosition: (opciones: typeof OPCIONES_LECTURA) => Promise<Lectura>;
  watchPosition: (opciones: typeof OPCIONES_SEGUIMIENTO, callback: (pos: Lectura | null, err?: unknown) => void) => Promise<string>;
  clearWatch: (opciones: { id: string }) => Promise<void>;
};

const clienteNativo = Geolocation as unknown as ClienteGeo;

export function codigoUbicacion(error: unknown): CodigoUbicacion {
  const texto = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  if (/denied|denegad/i.test(texto)) return 'denegado';
  if (/services are not enabled|location services|network and location turned off|enable location was denied|location settings/i.test(texto)) {
    return 'servicios';
  }
  if (/timeout|in time/i.test(texto)) return 'timeout';
  return 'otro';
}

export function mensajeUbicacion(codigo: CodigoUbicacion): string {
  if (codigo === 'denegado') return 'El permiso de ubicación está denegado. Puedes activarlo en los ajustes del sistema.';
  if (codigo === 'servicios') return 'Los servicios de ubicación del dispositivo están apagados.';
  if (codigo === 'timeout') return 'No ha llegado una posición a tiempo.';
  return 'No se ha podido leer la ubicación.';
}

function fallo(codigo: CodigoUbicacion): ErrorUbicacion {
  return new ErrorUbicacion(codigo, mensajeUbicacion(codigo));
}

export function leerPrecision(accuracy: number | null | undefined): { accuracy: number | null; aproximada: boolean } {
  const valor = typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null;
  return { accuracy: valor, aproximada: valor === null || valor > PRECISION_FINA_M };
}

function normalizar(pos: Lectura): Posicion {
  const precision = leerPrecision(pos.coords.accuracy);
  return { lat: pos.coords.latitude, lon: pos.coords.longitude, ...precision };
}

export async function leerPosicion(cliente: ClienteGeo = clienteNativo): Promise<Posicion> {
  try {
    const permiso = await cliente.requestPermissions();
    if (permiso.location === 'denied') throw fallo('denegado');
  } catch (error) {
    if (error instanceof ErrorUbicacion) throw error;
    const codigo = codigoUbicacion(error);
    if (codigo === 'denegado' || codigo === 'servicios') throw fallo(codigo);
  }
  try {
    return normalizar(await cliente.getCurrentPosition(OPCIONES_LECTURA));
  } catch (error) {
    if (error instanceof ErrorUbicacion) throw error;
    throw fallo(codigoUbicacion(error));
  }
}

export type Seguimiento = { parar: () => Promise<void> };

export async function seguirPosicion(
  onPosicion: (posicion: Posicion) => void,
  onAviso: (aviso: AvisoSeguimiento) => void,
  cliente: ClienteGeo = clienteNativo
): Promise<Seguimiento> {
  let activo = true;
  let generacion = 0;
  let idActual: string | null = null;
  let fallosTimeout = 0;

  const olvidar = async (id: string | null) => {
    if (!id) return;
    await cliente.clearWatch({ id }).catch(() => undefined);
  };

  const arrancar = async () => {
    const generacionActual = ++generacion;
    let id: string;
    try {
      id = await cliente.watchPosition(OPCIONES_SEGUIMIENTO, (pos, err) => {
        if (!activo || generacionActual !== generacion) return;
        if (pos) {
          fallosTimeout = 0;
          onPosicion(normalizar(pos));
          return;
        }
        const codigo = codigoUbicacion(err);
        if (codigo === 'timeout' && fallosTimeout < REINTENTOS_TIMEOUT) {
          fallosTimeout += 1;
          onAviso({ fatal: false, mensaje: 'La señal tarda. El seguimiento en primer plano sigue intentándolo.' });
          const viejo = idActual;
          idActual = null;
          void olvidar(viejo).then(() => { if (activo) void arrancar(); });
          return;
        }
        activo = false;
        onAviso({ fatal: true, mensaje: mensajeUbicacion(codigo === 'otro' ? 'timeout' : codigo) });
        void olvidar(idActual);
        idActual = null;
      });
    } catch (error) {
      if (!activo || generacionActual !== generacion) return;
      activo = false;
      onAviso({ fatal: true, mensaje: mensajeUbicacion(codigoUbicacion(error)) });
      return;
    }
    if (!activo || generacionActual !== generacion) {
      await olvidar(id);
      return;
    }
    idActual = id;
  };

  await arrancar();
  return {
    parar: async () => {
      activo = false;
      generacion += 1;
      const id = idActual;
      idActual = null;
      await olvidar(id);
    }
  };
}

/** El seguimiento no continúa con la app en segundo plano. En web no hay ciclo nativo. */
export async function observarPrimerPlano(alPausar: () => void, alReanudar: () => void): Promise<() => void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return () => undefined;
    const { App } = await import('@capacitor/app');
    const pausa = await App.addListener('pause', alPausar);
    const reanudacion = await App.addListener('resume', alReanudar);
    return () => {
      void pausa.remove();
      void reanudacion.remove();
    };
  } catch {
    return () => undefined;
  }
}
