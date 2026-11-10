import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapRuntime } from '../../../public_html/js/map/map.state.js';
import { AuthProvider } from '@/context/AuthContext';
import { MapaPage } from './MapaPage';

vi.mock('@/lib/supabase', () => ({ supabase: null }));
vi.mock('@/components/SpotMap', () => ({
  SpotMap: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}));

const FECHA = new Date().toISOString().slice(0, 10);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function serie(url: string, valor: number | null) {
  const dia = new URL(url).searchParams.get('start_date') || FECHA;
  const time = [`${dia}T10:00`, `${dia}T14:00`];
  return { time, valor: time.map(() => valor) };
}

function pronostico(url: string, vientoMs: number | null, rachaMs: number | null = vientoMs, direccion: number | null = null) {
  const horas = serie(url, vientoMs);
  const rachas = serie(url, rachaMs);
  return {
    hourly: {
      time: horas.time,
      wind_speed_10m: horas.valor,
      wind_gusts_10m: rachas.valor,
      wind_direction_10m: horas.time.map(() => direccion),
      temperature_2m: horas.time.map(() => 18),
      weather_code: horas.time.map(() => 1),
      precipitation: horas.time.map(() => 0),
      precipitation_probability: horas.time.map(() => 0),
      cloud_cover: horas.time.map(() => 10),
      relative_humidity_2m: horas.time.map(() => 60),
      surface_pressure: horas.time.map(() => 1015),
      visibility: horas.time.map(() => 20000)
    }
  };
}

function oleaje(url: string, metros: number | null) {
  const horas = serie(url, metros);
  return {
    hourly: {
      time: horas.time,
      wave_height: horas.valor,
      wave_period: horas.time.map(() => (metros === null ? null : 6)),
      wave_direction: horas.time.map(() => 90)
    }
  };
}

type Red = {
  vientoMs?: number | null;
  rachaMs?: number | null;
  oleajeM?: number | null;
  aviso?: boolean;
  direccion?: number | null;
  colgar?: (url: string) => Promise<Response> | null;
};

function instalarRed(red: Red = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (red.colgar) {
      const colgado = red.colgar(url);
      if (colgado) return colgado;
    }
    if (url.includes('api.open-meteo.com/v1/forecast')) {
      return json(pronostico(url, red.vientoMs ?? null, red.rachaMs ?? red.vientoMs ?? null, red.direccion ?? null));
    }
    if (url.includes('marine-api.open-meteo.com')) {
      return json(oleaje(url, red.oleajeM ?? null));
    }
    if (url.includes('action=aemet') && red.aviso) {
      return json({
        ok: true,
        disponible: true,
        alertas: [{ nivel: 'AMARILLA', origen: 'AEMET', descripcion: 'Aviso costero de viento' }]
      });
    }
    throw new TypeError('Failed to fetch');
  }));
}

function pagina() {
  localStorage.setItem('ps_spots_guardados', JSON.stringify([
    { id: 'javea', nombre: 'Cala de Jávea', lat: 38.8, lon: 0.18 },
    { id: 'entrepenas', nombre: 'Embalse de Entrepeñas', lat: 40.55, lon: -2.7 }
  ]));
  render(<AuthProvider><MapaPage /></AuthProvider>);
}

beforeEach(() => {
  localStorage.clear();
  mapRuntime.cacheGeohashMeteo.clear();
  instalarRed();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Mapa de la app', () => {
  it('distingue un viento desconocido de un cero medido en la costa', async () => {
    instalarRed({ vientoMs: null, oleajeM: 0.4 });
    pagina();
    fireEvent.click(screen.getByRole('button', { name: 'Evaluar spot' }));
    expect(await screen.findByRole('heading', { name: /Sin datos meteorológicos/ })).toBeTruthy();
    expect(screen.getAllByText('Sin dato').length).toBeGreaterThan(0);
    expect(screen.queryByText(/viento suave \(0 kt\)|Viento de 0 kt/)).toBeNull();
    expect(screen.queryByText('0.0 m')).toBeNull();

    mapRuntime.cacheGeohashMeteo.clear();
    instalarRed({ vientoMs: 0, rachaMs: 0, oleajeM: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluar spot' }));
    expect(await screen.findByRole('heading', { name: /Favorable/ })).toBeTruthy();
    expect(screen.getAllByText(/0 kt/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.0 m').length).toBeGreaterThan(0);
  });

  it('trata el embalse como interior y no da el mar por calmo', async () => {
    instalarRed({ vientoMs: 4 * 0.514444, oleajeM: null });
    pagina();
    fireEvent.click(await screen.findByRole('button', { name: 'Embalse de Entrepeñas' }));
    expect(await screen.findByRole('heading', { name: /Favorable/ })).toBeTruthy();
    expect(screen.getByText(/aguas interiores/)).toBeTruthy();
    expect(screen.getAllByText('No aplica').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.0 m')).toBeNull();
    expect(screen.queryByText(/aguas tranquilas/)).toBeNull();
  });

  it('conserva un viento peligroso y un aviso oficial', async () => {
    instalarRed({ vientoMs: 12, oleajeM: null });
    pagina();
    fireEvent.click(screen.getByRole('button', { name: 'Evaluar spot' }));
    expect(await screen.findByRole('heading', { name: /No recomendado/ })).toBeTruthy();
    expect(screen.getAllByText(/no se da el mar por calmo/).length).toBeGreaterThan(0);

    mapRuntime.cacheGeohashMeteo.clear();
    instalarRed({ vientoMs: 2, oleajeM: 0.2, aviso: true });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluar spot' }));
    expect(await screen.findByRole('heading', { name: /Precaución/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Favorable/ })).toBeNull();
    expect(screen.queryByText(/óptimas/)).toBeNull();
  });

  it('muestra el parte guardado y conserva la marca al cambiar de hora', async () => {
    const ts = Date.now() - 8 * 60 * 1000;
    localStorage.setItem('paddlesafe_last_forecast_snapshot', JSON.stringify({
      ts,
      location: 'Jávea',
      lat: 38.8,
      lon: 0.18,
      consulta: FECHA,
      observado: `${FECHA}T10:00:00Z`,
      data: {
        ok: true,
        lat: 38.8,
        lon: 0.18,
        datos: {
          location: 'Jávea',
          date: FECHA,
          observadoEn: `${FECHA}T10:00:00Z`,
          windSpeed: 2.5,
          windGusts: 4,
          windDirection: 220,
          waveHeight: 0.4,
          coordinates: { latitude: 38.8, longitude: 0.18 },
          horasDiurnas: [
            { hora: '10:00', vientoKt: 4, rachasKt: 6, oleajeM: 0.4 },
            { hora: '14:00', vientoKt: 8, rachasKt: 11, oleajeM: 0.5 }
          ]
        }
      }
    }));
    instalarRed();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    pagina();
    fireEvent.click(screen.getByRole('button', { name: 'Evaluar spot' }));
    const aviso = await screen.findByText(/Parte guardado, no es una medición actual/);
    expect(aviso.textContent).toMatch(/Jávea/);
    expect(aviso.textContent).toMatch(new RegExp(`Consulta del ${FECHA}`));
    expect(aviso.textContent).toMatch(/Observación/);
    expect(aviso.textContent).toMatch(/38\.8000, 0\.1800/);
    fireEvent.click(screen.getByRole('button', { name: /14:00/ }));
    const despues = screen.getByText(/Parte guardado, no es una medición actual/);
    expect(despues.textContent).toMatch(/Hora del parte seleccionada: 14:00/);
    expect(despues.textContent).toMatch(/Jávea/);
    expect(despues.textContent).toMatch(/Observación/);
  });

  it('no usa un parte ausente, lejano, caducado, futuro o de otra fecha', async () => {
    instalarRed();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    pagina();
    fireEvent.click(screen.getByRole('button', { name: 'Evaluar spot' }));
    expect(await screen.findByText(/No se ha podido conectar con el servicio meteorológico/)).toBeTruthy();
    expect(screen.queryByText(/Parte guardado/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /Favorable|Precaución|No recomendado|Sin datos/ })).toBeNull();

    const base = {
      location: 'Jávea',
      lat: 38.8,
      lon: 0.18,
      consulta: FECHA,
      data: { ok: true, lat: 38.8, lon: 0.18, datos: { location: 'Jávea', date: FECHA, windSpeed: 9, waveHeight: 0.4 } }
    };
    for (const snapshot of [
      { ...base, ts: Date.now() - 2 * 60 * 60 * 1000 },
      { ...base, ts: Date.now() + 60 * 1000 },
      { ...base, ts: Date.now() - 5 * 60 * 1000, consulta: '2020-01-01', data: { ...base.data, datos: { ...base.data.datos, date: '2020-01-01' } } }
    ]) {
      localStorage.setItem('paddlesafe_last_forecast_snapshot', JSON.stringify(snapshot));
      fireEvent.click(screen.getByRole('button', { name: 'Evaluar spot' }));
      expect(await screen.findByText(/No se ha podido conectar con el servicio meteorológico/)).toBeTruthy();
      expect(screen.queryByText(/Parte guardado/)).toBeNull();
    }

    localStorage.setItem('paddlesafe_last_forecast_snapshot', JSON.stringify({ ...base, ts: Date.now() - 5 * 60 * 1000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Embalse de Entrepeñas' }));
    expect(await screen.findByText(/No se ha podido conectar con el servicio meteorológico/)).toBeTruthy();
    expect(screen.queryByText(/Parte guardado/)).toBeNull();
    expect(screen.queryByText(/9 kt/)).toBeNull();
  });

  it('no resucita el veredicto anterior cuando las respuestas llegan fuera de orden', async () => {
    let soltarJavea: (respuesta: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.open-meteo.com/v1/forecast') && url.includes('latitude=38.8')) {
        return new Promise<Response>((resolve) => {
          soltarJavea = () => resolve(json(pronostico(url, 1, 1)));
        });
      }
      if (url.includes('marine-api.open-meteo.com') && url.includes('latitude=38.8')) {
        return Promise.resolve(json(oleaje(url, 0.3)));
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    }));
    pagina();
    fireEvent.click(await screen.findByRole('button', { name: 'Cala de Jávea' }));
    fireEvent.click(screen.getByRole('button', { name: 'Embalse de Entrepeñas' }));
    expect(await screen.findByText(/No se ha podido conectar con el servicio meteorológico/)).toBeTruthy();
    soltarJavea(json({}));
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(screen.queryByRole('heading', { name: /Favorable|Precaución|No recomendado|Sin datos/ })).toBeNull();
    expect(screen.getAllByText(/Embalse de Entrepeñas/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Parte guardado/)).toBeNull();
  });
});
