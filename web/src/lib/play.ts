import { Capacitor, registerPlugin } from '@capacitor/core';

/** Identificador del producto en Play Console. No es un precio. */
export const PRODUCTO_PLAY = import.meta.env.VITE_PLAY_PRODUCT_ID?.trim() || 'premium';
const PAQUETE = 'es.evolucionesdigitales.paddlesafe';

export type PlanPlay = {
  idBase: string;
  oferta: string;
  precio: string;
  periodo: string;
};

export type EstadoPlay = {
  disponible: boolean;
  conectado: boolean;
  activo: boolean;
  pendiente: boolean;
  token: string | null;
  producto: string | null;
  planes: PlanPlay[];
  error: string | null;
};

interface PlayNativo {
  preparar(opciones: { producto: string }): Promise<EstadoPlay>;
  comprar(opciones: { producto: string; oferta: string }): Promise<EstadoPlay>;
  restaurar(opciones: { producto: string }): Promise<EstadoPlay>;
}

const nativo = registerPlugin<PlayNativo>('PlayBilling');

export function estadoSinPlay(error: string | null = null): EstadoPlay {
  return {
    disponible: false,
    conectado: false,
    activo: false,
    pendiente: false,
    token: null,
    producto: null,
    planes: [],
    error
  };
}

export function urlGestionSuscripcion(producto = PRODUCTO_PLAY): string {
  return `https://play.google.com/store/account/subscriptions?package=${PAQUETE}&sku=${encodeURIComponent(producto)}`;
}

export function esAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function prepararPlay(): Promise<EstadoPlay> {
  if (!esAndroid()) return estadoSinPlay(null);
  try {
    return await nativo.preparar({ producto: PRODUCTO_PLAY });
  } catch (error) {
    return estadoSinPlay(error instanceof Error ? error.message : 'Play no ha respondido.');
  }
}

export async function comprarPlan(oferta: string): Promise<EstadoPlay> {
  if (!esAndroid()) return estadoSinPlay('La suscripción se contrata en la app Android.');
  return nativo.comprar({ producto: PRODUCTO_PLAY, oferta });
}

export async function restaurarPlay(): Promise<EstadoPlay> {
  if (!esAndroid()) return estadoSinPlay(null);
  return nativo.restaurar({ producto: PRODUCTO_PLAY });
}
