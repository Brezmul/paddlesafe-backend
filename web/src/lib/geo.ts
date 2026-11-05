export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanciaKm(puntos: Array<[number, number]>): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) {
    total += haversineKm(puntos[i - 1][0], puntos[i - 1][1], puntos[i][0], puntos[i][1]);
  }
  return total;
}

export function cardinal(grados: number | null | undefined): string {
  if (grados === null || grados === undefined || !Number.isFinite(Number(grados))) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const idx = Math.round(((Number(grados) % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

export function formatoTiempo(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h <= 0) return `${rest} min`;
  return `${h} h ${rest.toString().padStart(2, '0')} min`;
}

export type Lugar = { nombre: string; lat: number; lon: number; detalle: string };

export async function buscarLugares(texto: string): Promise<Lugar[]> {
  const q = texto.trim();
  if (q.length < 2) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'es');
  url.searchParams.set('format', 'json');
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se ha podido buscar el lugar.');
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r: { latitude?: number; longitude?: number }) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r: { name?: string; admin1?: string; country?: string; latitude: number; longitude: number }) => ({
      nombre: r.name || q,
      lat: r.latitude,
      lon: r.longitude,
      detalle: [r.admin1, r.country].filter(Boolean).join(', ')
    }));
}

export async function precargarMapa(lat: number, lon: number, zoom = 13): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const cache = await caches.open('paddlesafe-map-tiles');
  const zooms = [zoom, Math.min(zoom + 1, 16)];
  const urls: string[] = [];
  for (const z of zooms) {
    const n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        urls.push(`https://tile.openstreetmap.org/${z}/${x + dx}/${y + dy}.png`);
      }
    }
  }
  let ok = 0;
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url);
      if (res.ok) {
        await cache.put(url, res);
        ok += 1;
      }
    } catch {
      /* una tesela caída no impide el resto */
    }
  }));
  return ok;
}

export function idaYVuelta(puntos: Array<[number, number]>): Array<[number, number]> {
  if (puntos.length < 2) return puntos;
  const vuelta = puntos.slice(0, -1).reverse();
  return [...puntos, ...vuelta];
}
