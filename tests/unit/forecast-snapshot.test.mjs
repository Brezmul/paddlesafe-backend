/**
 * Integridad del parte guardado. No usa rutas de Windows ni red real:
 * fetch se sustituye y el almacenamiento es un mapa en memoria.
 */
import assert from 'node:assert/strict';
import {
  SNAPSHOT_KEY,
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_RADIO_KM,
  calcularDistanciaHaversineKm,
  guardarForecastSnapshot,
  juzgarForecastSnapshot,
  parteSirveAFecha,
  recuperarForecastSnapshot,
  solicitarPronostico,
  textoParteGuardado
} from '../../public_html/js/map/map.weather.js';

const AHORA = Date.parse('2026-11-06T15:00:00Z');
const JAVEA = { lat: 38.8, lon: 0.18 };
const ENTREPENAS = { lat: 40.55, lon: -2.7 };

function memoria() {
  const mem = new Map();
  const store = {
    getItem: (k) => mem.has(k) ? mem.get(k) : null,
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };
  globalThis.localStorage = store;
  return mem;
}

function parte(extra = {}) {
  return {
    ok: true,
    lat: JAVEA.lat,
    lon: JAVEA.lon,
    datos: {
      location: 'Jávea',
      windSpeed: 9.9,
      date: '2026-11-06',
      alertas: [{ nivel: 'AMARILLA', descripcion: 'Costeros' }],
      ...extra.datos
    }
  };
}

function guardar(mem, ts, coords = JAVEA, data = parte(), location = 'Jávea') {
  mem.set(SNAPSHOT_KEY, JSON.stringify({
    ts,
    location,
    lat: coords.lat,
    lon: coords.lon,
    consulta: data.datos?.date || null,
    observado: data.datos?.observadoEn || null,
    data
  }));
}

assert.equal(SNAPSHOT_RADIO_KM, 15);
assert.equal(SNAPSHOT_MAX_AGE_MS, 60 * 60 * 1000);

const reciente = {
  ts: AHORA - 10 * 60 * 1000,
  location: 'Jávea',
  lat: JAVEA.lat,
  lon: JAVEA.lon,
  consulta: '2026-11-06',
  observado: '2026-11-06T14:00:00Z',
  data: parte()
};
assert.equal(juzgarForecastSnapshot(reciente, 38.81, 0.19, AHORA).ok, true);
assert.equal(juzgarForecastSnapshot(reciente, ENTREPENAS.lat, ENTREPENAS.lon, AHORA).motivo, 'otra_ubicacion');
assert.equal(juzgarForecastSnapshot({ ...reciente, ts: AHORA - SNAPSHOT_MAX_AGE_MS - 1 }, JAVEA.lat, JAVEA.lon, AHORA).motivo, 'caducado');
assert.equal(juzgarForecastSnapshot({ ...reciente, ts: AHORA - 2 * 60 * 60 * 1000 }, JAVEA.lat, JAVEA.lon, AHORA).motivo, 'caducado');
assert.equal(juzgarForecastSnapshot({ ...reciente, ts: AHORA + 60 * 1000 }, JAVEA.lat, JAVEA.lon, AHORA).motivo, 'instante_futuro');
assert.equal(juzgarForecastSnapshot({ ...reciente, ts: 'mañana' }, JAVEA.lat, JAVEA.lon, AHORA).motivo, 'instante_ilegible');
assert.equal(juzgarForecastSnapshot({ ...reciente, ts: false }, JAVEA.lat, JAVEA.lon, AHORA).motivo, 'instante_ilegible');
assert.equal(juzgarForecastSnapshot({ ...reciente, lat: false, lon: [] }, JAVEA.lat, JAVEA.lon, AHORA).motivo, 'origen_sin_identidad');
assert.equal(juzgarForecastSnapshot({ ...reciente, lat: '38.8', lon: '0.18' }, JAVEA.lat, JAVEA.lon, AHORA).ok, true);
assert.equal(juzgarForecastSnapshot(reciente, null, null, AHORA).motivo, 'destino_sin_identidad');
assert.equal(juzgarForecastSnapshot({ ...reciente, data: null }, JAVEA.lat, JAVEA.lon, AHORA).motivo, 'incompleto');
assert.equal(juzgarForecastSnapshot(reciente, 'no', 'coords', AHORA).motivo, 'destino_sin_identidad');

const norte15 = JAVEA.lat + (14.9 / 111.32);
const norte16 = JAVEA.lat + (15.2 / 111.32);
assert.equal(calcularDistanciaHaversineKm(JAVEA.lat, JAVEA.lon, norte15, JAVEA.lon) <= 15, true);
assert.equal(calcularDistanciaHaversineKm(JAVEA.lat, JAVEA.lon, norte16, JAVEA.lon) > 15, true);
assert.equal(juzgarForecastSnapshot(reciente, norte15, JAVEA.lon, AHORA).ok, true);
assert.equal(juzgarForecastSnapshot(reciente, norte16, JAVEA.lon, AHORA).motivo, 'otra_ubicacion');

assert.equal(parteSirveAFecha(reciente, '2026-11-06', AHORA), true);
assert.equal(parteSirveAFecha(reciente, '2026-11-07', AHORA), false);
assert.equal(parteSirveAFecha({ ...reciente, consulta: null }, '2026-11-06', AHORA), false);

const mem = memoria();
guardar(mem, Date.now() - 5 * 60 * 1000);
const crudo = mem.get(SNAPSHOT_KEY);
globalThis.fetch = async () => { throw new TypeError('red simulada'); };

const mismo = await solicitarPronostico({ lat: 38.801, lon: 0.181, location: 'Cala cercana', date: '2026-11-06' });
assert.equal(mismo._desdeSnapshot, true);
assert.equal(mismo.datos._desdeSnapshot, true);
assert.equal(mismo.datos.location, 'Jávea');
assert.equal(mismo.datos.windSpeed, 9.9);
assert.equal(mismo.datos.alertas[0].nivel, 'AMARILLA');
assert.equal(mismo.lat, JAVEA.lat);
assert.notEqual(mismo.lat, 38.801);
assert.equal(mem.get(SNAPSHOT_KEY), crudo);

await assert.rejects(
  () => solicitarPronostico({ lat: ENTREPENAS.lat, lon: ENTREPENAS.lon, location: 'Entrepeñas', date: '2026-11-06' }),
  (err) => /red simulada|conexi/i.test(String(err?.message || err))
);
assert.equal(mem.get(SNAPSHOT_KEY), crudo);

await assert.rejects(
  () => solicitarPronostico({ lat: JAVEA.lat, lon: JAVEA.lon, location: 'Jávea', date: '2026-11-07' })
);

mem.set(SNAPSHOT_KEY, '{');
await assert.rejects(() => solicitarPronostico({ lat: JAVEA.lat, lon: JAVEA.lon, location: 'Jávea', date: '2026-11-06' }));

mem.delete(SNAPSHOT_KEY);
await assert.rejects(() => solicitarPronostico({ lat: JAVEA.lat, lon: JAVEA.lon, location: 'Jávea', date: '2026-11-06' }));

const roto = {
  getItem() { throw new Error('almacenamiento bloqueado'); },
  setItem() { throw new Error('almacenamiento bloqueado'); }
};
globalThis.localStorage = roto;
assert.equal(recuperarForecastSnapshot(JAVEA.lat, JAVEA.lon), null);
assert.equal(guardarForecastSnapshot('Jávea', JAVEA.lat, JAVEA.lon, parte()), false);

const mem2 = memoria();
const tsViejo = Date.now() - 20 * 60 * 1000;
guardarForecastSnapshot('Jávea', JAVEA.lat, JAVEA.lon, parte());
const servido = await solicitarPronostico({ lat: JAVEA.lat, lon: JAVEA.lon, location: 'Jávea', date: '2026-11-06' });
assert.equal(guardarForecastSnapshot('Entrepeñas', ENTREPENAS.lat, ENTREPENAS.lon, servido), true);
const regrabado = JSON.parse(mem2.get(SNAPSHOT_KEY));
assert.equal(regrabado.ts, servido._snapshotTs);
assert.equal(regrabado.lat, JAVEA.lat);
assert.equal(regrabado.location, 'Jávea');
assert.notEqual(regrabado.ts, tsViejo);

guardarForecastSnapshot('Entrepeñas', ENTREPENAS.lat, ENTREPENAS.lon, {
  ok: true,
  datos: { location: 'Entrepeñas', windSpeed: 4, date: '2026-11-06', observadoEn: '2026-11-06T14:30:00Z' }
});
const recuperado = await solicitarPronostico({ lat: ENTREPENAS.lat, lon: ENTREPENAS.lon, location: 'Entrepeñas', date: '2026-11-06' });
assert.equal(recuperado.datos.location, 'Entrepeñas');
assert.equal(recuperado.datos.windSpeed, 4);
await assert.rejects(() => solicitarPronostico({ lat: JAVEA.lat, lon: JAVEA.lon, location: 'Jávea', date: '2026-11-06' }));

const texto = textoParteGuardado({
  _desdeSnapshot: true,
  _snapshotTs: Date.UTC(2026, 10, 6, 12, 0, 0),
  _snapshotLocation: 'Jávea',
  _snapshotLat: 38.8,
  _snapshotLon: 0.18,
  _snapshotConsulta: '2026-11-06',
  _snapshotObservado: '2026-11-06T11:00:00Z'
}, { ahora: Date.UTC(2026, 10, 6, 12, 18, 0), horaParte: '14:00' });
assert.match(texto, /Parte guardado, no es una medición actual/);
assert.match(texto, /Jávea/);
assert.match(texto, /38\.8000, 0\.1800/);
assert.match(texto, /Consulta del 2026-11-06/);
assert.match(texto, /Observación: 2026-11-06T11:00:00Z/);
assert.match(texto, /Hora del parte seleccionada: 14:00/);
assert.match(texto, /avisos oficiales/);
assert.doesNotMatch(texto, /Europe\/Madrid/);
const madrid = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(new Date(Date.UTC(2026, 10, 6, 12, 0, 0)));
const local = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(new Date(Date.UTC(2026, 10, 6, 12, 0, 0)));
assert.match(texto, new RegExp(local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
if (madrid !== local) assert.doesNotMatch(texto, new RegExp(madrid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

delete globalThis.fetch;
console.log('forecast-snapshot: ok');
