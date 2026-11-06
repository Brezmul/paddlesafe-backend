import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorUbicacion, OPCIONES_LECTURA, OPCIONES_SEGUIMIENTO, leerPosicion, seguirPosicion } from './gps';

type Pos = { coords: { latitude: number; longitude: number; accuracy?: number | null } };

function cliente(parcial: Partial<{
  permiso: () => Promise<{ location?: string }>;
  actual: () => Promise<Pos>;
  vigilar: (opciones: typeof OPCIONES_SEGUIMIENTO, cb: (pos: Pos | null, err?: unknown) => void) => Promise<string>;
  limpiar: (id: string) => Promise<void>;
}>) {
  return {
    requestPermissions: vi.fn(parcial.permiso ?? (async () => ({ location: 'granted' }))),
    getCurrentPosition: vi.fn(parcial.actual ?? (async () => ({ coords: { latitude: 38.8, longitude: 0.18, accuracy: 8 } }))),
    watchPosition: vi.fn(parcial.vigilar ?? (async () => 'w1')),
    clearWatch: vi.fn(async ({ id }: { id: string }) => { await parcial.limpiar?.(id); })
  };
}

describe('ubicación', () => {
  beforeEach(() => {
    expect(OPCIONES_SEGUIMIENTO.interval).toBeLessThan(OPCIONES_SEGUIMIENTO.timeout);
    expect(OPCIONES_SEGUIMIENTO.timeout).toBeGreaterThan(OPCIONES_LECTURA.timeout);
  });

  it('no vuelve a pedir la posición si el permiso está denegado', async () => {
    const geo = cliente({ permiso: async () => ({ location: 'denied' }) });
    await expect(leerPosicion(geo)).rejects.toMatchObject({ codigo: 'denegado' });
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    expect(geo.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('no insiste si los servicios de ubicación están apagados', async () => {
    const geo = cliente({
      permiso: async () => { throw new Error('Location services are not enabled.'); }
    });
    await expect(leerPosicion(geo)).rejects.toBeInstanceOf(ErrorUbicacion);
    await expect(leerPosicion(geo)).rejects.toMatchObject({ codigo: 'servicios' });
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('distingue una posición fina de una aproximada', async () => {
    const fina = cliente({ actual: async () => ({ coords: { latitude: 1, longitude: 2, accuracy: 12 } }) });
    await expect(leerPosicion(fina)).resolves.toMatchObject({ lat: 1, lon: 2, aproximada: false });
    const basta = cliente({ actual: async () => ({ coords: { latitude: 1, longitude: 2, accuracy: 1500 } }) });
    await expect(leerPosicion(basta)).resolves.toMatchObject({ aproximada: true, accuracy: 1500 });
  });

  it('un timeout del watch no es el fin de la sesión y se limpia al salir', async () => {
    const avisos: Array<{ fatal: boolean; mensaje?: string }> = [];
    const puntos: number[] = [];
    const callbacks: Array<(pos: Pos | null, err?: unknown) => void> = [];
    const geo = cliente({
      vigilar: async (_opciones, cb) => {
        callbacks.push(cb);
        return `w${callbacks.length}`;
      }
    });
    const seguimiento = await seguirPosicion(
      (pos) => puntos.push(pos.lat),
      (aviso) => avisos.push(aviso),
      geo
    );
    expect(geo.watchPosition).toHaveBeenCalledWith(OPCIONES_SEGUIMIENTO, expect.any(Function));
    const timeout = new Error('Could not obtain location in time. Try with a higher timeout.');
    callbacks[0]?.(null, timeout);
    await vi.waitFor(() => expect(callbacks).toHaveLength(2));
    expect(geo.clearWatch).toHaveBeenCalledWith({ id: 'w1' });
    expect(avisos[0]).toMatchObject({ fatal: false });
    callbacks[1]?.({ coords: { latitude: 40.5, longitude: -2.7, accuracy: 6 } });
    expect(puntos).toEqual([40.5]);
    await seguimiento.parar();
    expect(geo.clearWatch).toHaveBeenCalledWith({ id: 'w2' });
    callbacks[1]?.({ coords: { latitude: 1, longitude: 1, accuracy: 1 } });
    expect(puntos).toEqual([40.5]);
  });

  it('tras varios timeouts detiene el seguimiento', async () => {
    const avisos: boolean[] = [];
    const callbacks: Array<(pos: Pos | null, err?: unknown) => void> = [];
    const geo = cliente({
      vigilar: async (_opciones, cb) => {
        callbacks.push(cb);
        return `w${callbacks.length}`;
      }
    });
    await seguirPosicion(() => undefined, (aviso) => avisos.push(aviso.fatal), geo);
    const error = new Error('Could not obtain location in time. Try with a higher timeout.');
    callbacks[0]?.(null, error);
    await vi.waitFor(() => expect(callbacks).toHaveLength(2));
    callbacks[1]?.(null, error);
    await vi.waitFor(() => expect(callbacks).toHaveLength(3));
    callbacks[2]?.(null, error);
    await vi.waitFor(() => expect(avisos.at(-1)).toBe(true));
    expect(callbacks).toHaveLength(3);
  });
});
