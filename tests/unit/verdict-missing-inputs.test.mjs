/**
 * Regresión: un dato ausente no es un cero ni un mar en calma.
 * Corre en cualquier máquina: solo importa el motor, sin rutas de Windows.
 */
import assert from 'node:assert/strict';
import { analizarEvolucionProxima, generarVeredictoNextGen, lecturaVientoHora, magnitudNoNegativa as magnitudMotor, medicionNumerica as medicionMotor } from '../../public_html/js/engine/verdict.js';
import { resolverOrientacionCostera } from '../../public_html/js/engine/coastal.js';
import { magnitudNoNegativa, medicionNumerica, prepararEntradaCoach } from '../../web/src/lib/medicion.ts';

const COSTA = { nombreSpot: 'Cala', coordenadas: { latitude: 38.8, longitude: 0.18 } };
const INTERIOR = { spotNombre: 'Embalse de Entrepeñas', lat: 40.55, lon: -2.70 };

function costaDe(params) {
    const lat = params.coordenadas?.latitude ?? params.lat;
    const lon = params.coordenadas?.longitude ?? params.lon;
    const nombre = params.spotNombre || params.nombreSpot || '';
    return resolverOrientacionCostera(nombre, lat, lon);
}

function evaluar(extra) {
    return generarVeredictoNextGen({ nivelUsuario: 'Intermedio', deporte: 'paddle_surf', ...extra });
}

const costaCala = costaDe(COSTA);
assert.equal(costaCala.esCosta, true);
assert.equal(costaCala.tipoEntorno, 'bahia_protegida');

const interior = costaDe(INTERIOR);
assert.equal(interior.esCosta, false);
assert.equal(interior.tipoEntorno, 'embalse_interior');

const calaSinOleaje = evaluar({ ...COSTA, vientoKmh: 4 * 1.852, olaM: null });
assert.notEqual(calaSinOleaje.estado, 'Favorable');
assert.equal(calaSinOleaje.estado, 'Sin datos meteorológicos');
assert.equal(calaSinOleaje.score, 0);
assert.equal(calaSinOleaje.oleajeConocido, false);
assert.equal(calaSinOleaje.oleajeAplica, true);
assert.equal(calaSinOleaje.vientoNudos, 4);
assert.equal(String(calaSinOleaje.justificacion).includes('aguas tranquilas'), false);
assert.equal(String(calaSinOleaje.justificacion).includes('óptimas'), false);
assert.equal(String(calaSinOleaje.justificacion).includes('no se da el mar por calmo'), true);

const calaSinViento = evaluar({ ...COSTA, vientoKmh: null, olaM: 0.4 });
assert.notEqual(calaSinViento.estado, 'Favorable');
assert.equal(calaSinViento.estado, 'Sin datos meteorológicos');
assert.equal(calaSinViento.vientoNudos, null);
assert.equal(calaSinViento.detallesTecnicos.vientoKt, null);
assert.equal(/viento suave \(0 kt\)|Viento de 0 kt/i.test(String(calaSinViento.justificacion)), false);
assert.equal(String(calaSinViento.justificacion).includes('no cuenta como 0 kt'), true);

const entrepenas = evaluar({ ...INTERIOR, vientoKt: 4, rachasKt: 5, oleajeM: null });
assert.equal(entrepenas.estado, 'Favorable');
assert.equal(entrepenas.score, 98);
assert.equal(entrepenas.entorno, 'embalse_interior');
assert.equal(entrepenas.oleajeAplica, false);
assert.equal(String(entrepenas.justificacion).includes('aguas interiores'), true);
assert.notEqual(entrepenas.beginnerIndex?.nivel, 'Sin Datos');
assert.equal(String(entrepenas.justificacion).includes('0.0 m'), false);

const calaCeroReal = evaluar({ ...COSTA, vientoKt: 0, rachasKt: 1, oleajeM: 0, periodoOla: 6 });
assert.equal(calaCeroReal.estado, 'Favorable');
assert.equal(calaCeroReal.vientoNudos, 0);
assert.equal(calaCeroReal.detallesTecnicos.oleajeM, 0);
assert.equal(String(calaCeroReal.justificacion).includes('0 kt'), true);
assert.equal(String(calaCeroReal.justificacion).includes('0.0 m'), true);
assert.notEqual(calaCeroReal.beginnerIndex?.nivel, 'Sin Datos');

const calaCompletaSuave = evaluar({ ...COSTA, vientoKt: 4, rachasKt: 5, oleajeM: 0.2, periodoOla: 7 });
assert.equal(calaCompletaSuave.estado, 'Favorable');
assert.equal(calaCompletaSuave.vientoNudos, 4);
assert.equal(String(calaCompletaSuave.justificacion).includes('0.2 m'), true);

const ambosAusentes = evaluar({ ...COSTA, vientoKt: null, oleajeM: null });
assert.equal(ambosAusentes.estado, 'Sin datos meteorológicos');
assert.equal(ambosAusentes.vientoNudos, null);
assert.equal(ambosAusentes.score, 0);

const vacioYNan = evaluar({ ...COSTA, vientoKt: '  ', oleajeM: Number.NaN });
assert.equal(vacioYNan.estado, 'Sin datos meteorológicos');
assert.equal(vacioYNan.vientoNudos, null);

const cadenaCero = evaluar({ ...COSTA, vientoKt: '0', oleajeM: '0.0' });
assert.equal(cadenaCero.vientoNudos, 0);
assert.equal(cadenaCero.detallesTecnicos.oleajeM, 0);
assert.equal(cadenaCero.estado, 'Favorable');

const vientoPeligrosoSinOleaje = evaluar({ ...COSTA, vientoKt: 22, rachasKt: 28, oleajeM: null });
assert.equal(vientoPeligrosoSinOleaje.estado, 'No recomendado');
assert.notEqual(vientoPeligrosoSinOleaje.estado, 'Favorable');
assert.equal(vientoPeligrosoSinOleaje.vientoNudos, 22);
assert.equal(String(vientoPeligrosoSinOleaje.justificacion).includes('aguas tranquilas'), false);
assert.equal(String(vientoPeligrosoSinOleaje.justificacion).includes('no se da el mar por calmo'), true);

const oleajePeligrosoSinViento = evaluar({ ...COSTA, vientoKt: null, oleajeM: 1.8 });
assert.equal(oleajePeligrosoSinViento.estado, 'No recomendado');
assert.equal(oleajePeligrosoSinViento.vientoNudos, null);
assert.equal(/viento suave \(0 kt\)|Viento de 0 kt/i.test(String(oleajePeligrosoSinViento.justificacion)), false);
assert.equal(String(oleajePeligrosoSinViento.justificacion).includes('no cuenta como 0 kt'), true);

const interiorSinViento = evaluar({ ...INTERIOR, vientoKt: null, oleajeM: null });
assert.equal(interiorSinViento.estado, 'Sin datos meteorológicos');
assert.equal(interiorSinViento.vientoNudos, null);
assert.equal(/viento suave \(0 kt\)|Viento de 0 kt/i.test(String(interiorSinViento.justificacion)), false);

assert.equal(medicionNumerica(0), 0);
assert.equal(medicionNumerica('0'), 0);
assert.equal(medicionNumerica(null), null);
assert.equal(medicionNumerica(undefined), null);
assert.equal(medicionNumerica(''), null);
assert.equal(medicionNumerica('  '), null);
assert.equal(medicionNumerica(Number.NaN), null);

const coachSinOleaje = prepararEntradaCoach(calaSinOleaje);
assert.equal(coachSinOleaje.consultar, false);
const coachSinViento = prepararEntradaCoach(calaSinViento);
assert.equal(coachSinViento.consultar, false);
const coachInterior = prepararEntradaCoach(entrepenas);
assert.equal(coachInterior.consultar, true);
assert.equal(coachInterior.vientoKt, 4);
const coachCero = prepararEntradaCoach(calaCeroReal);
assert.equal(coachCero.consultar, true);
assert.equal(coachCero.vientoKt, 0);
assert.equal(coachCero.oleajeM, 0);

for (const leer of [medicionNumerica, medicionMotor]) {
  assert.equal(leer(0), 0);
  assert.equal(leer('0'), 0);
  assert.equal(leer(' 0 '), 0);
  assert.equal(leer(false), null);
  assert.equal(leer(true), null);
  assert.equal(leer([]), null);
  assert.equal(leer({}), null);
  assert.equal(leer('   '), null);
  assert.equal(leer('12 kt'), null);
}
for (const magnitud of [magnitudNoNegativa, magnitudMotor]) {
  assert.equal(magnitud(0), 0);
  assert.equal(magnitud('0'), 0);
  assert.equal(magnitud(-3), null);
  assert.equal(magnitud('-0.2'), null);
  assert.equal(magnitud(false), null);
}
assert.equal(medicionNumerica(-4.5), -4.5);

const vientoFalso = evaluar({ ...COSTA, vientoKt: false, oleajeM: 0.2 });
assert.equal(vientoFalso.estado, 'Sin datos meteorológicos');
assert.equal(vientoFalso.vientoNudos, null);

const vientoNegativo = evaluar({ ...COSTA, vientoKt: -4, oleajeM: 0.2 });
assert.equal(vientoNegativo.estado, 'Sin datos meteorológicos');
assert.equal(vientoNegativo.vientoNudos, null);
assert.equal(/viento suave \(0 kt\)|Viento de 0 kt/i.test(String(vientoNegativo.justificacion)), false);

const oleajeNegativo = evaluar({ ...COSTA, vientoKt: 4, oleajeM: -0.4 });
assert.equal(oleajeNegativo.estado, 'Sin datos meteorológicos');
assert.equal(/aguas tranquilas/i.test(String(oleajeNegativo.justificacion)), false);

const aviso = {
  activa: true,
  nivel: 'AMARILLA',
  esVigente: true,
  estadoTemporal: 'ACTIVA_AHORA',
  fenomeno: 'costeros'
};
const avisoSinSeries = evaluar({ ...COSTA, vientoKt: null, oleajeM: null, alertaOficial: aviso, alertas: [aviso] });
assert.equal(avisoSinSeries.estado, 'Precaución');
assert.equal(avisoSinSeries.alertaOficialActiva, true);
assert.equal(/viento suave \(0 kt\)|Viento de 0 kt/i.test(String(avisoSinSeries.justificacion)), false);
assert.equal(String(avisoSinSeries.justificacion).includes('no cuenta como 0 kt'), true);
assert.equal(/sesión viable/i.test(String(avisoSinSeries.justificacion)), false);
assert.equal(avisoSinSeries.beginnerIndex?.nivel, 'Sin Datos');
assert.equal(avisoSinSeries.deporte?.recomendable, false);

const rachaPeligrosa = evaluar({ ...COSTA, vientoKt: null, rachasKt: 22, oleajeM: null });
assert.equal(rachaPeligrosa.estado, 'No recomendado');
assert.equal(rachaPeligrosa.vientoNudos, null);
assert.equal(String(rachaPeligrosa.justificacion).includes('Rachas medidas de 22 kt'), true);
assert.equal(String(rachaPeligrosa.justificacion).includes('no cuenta como 0 kt'), true);
assert.equal(/sesión viable/i.test(String(rachaPeligrosa.justificacion)), false);
assert.equal(rachaPeligrosa.beginnerIndex?.nivel, 'Sin Datos');
assert.notEqual(rachaPeligrosa.beginnerIndex?.nivel, 'Muy Fácil');

const precaucionSinOleaje = evaluar({ ...COSTA, vientoKt: 12, oleajeM: null });
assert.equal(precaucionSinOleaje.estado, 'Precaución');
assert.equal(/sesión viable/i.test(String(precaucionSinOleaje.justificacion)), false);
assert.equal(String(precaucionSinOleaje.justificacion).includes('no se da el mar por calmo'), true);

const rachaPrecaucion = evaluar({ ...COSTA, vientoKt: null, rachasKt: 12, oleajeM: 0.2 });
assert.equal(rachaPrecaucion.estado, 'Precaución');
assert.equal(String(rachaPrecaucion.justificacion).includes('Rachas medidas de 12 kt'), true);
assert.equal(String(rachaPrecaucion.justificacion).includes('no cuenta como 0 kt'), true);
assert.equal(/sesión viable/i.test(String(rachaPrecaucion.justificacion)), false);

const rachaSuaveSinMedia = evaluar({ ...COSTA, vientoKt: null, rachasKt: 4, oleajeM: null });
assert.equal(rachaSuaveSinMedia.estado, 'Sin datos meteorológicos');

function hora(offset) {
  const n = (new Date().getHours() + offset + 24) % 24;
  return `${String(n).padStart(2, '0')}:00`;
}
const sinSubida = analizarEvolucionProxima([
  { hora: hora(0), vientoKt: 8, rachasKt: 8 },
  { hora: hora(1), viento_kmh: 0, rachas_kmh: 0 },
  { hora: hora(2), wind_speed_10m: 2, wind_gusts_10m: 2 }
], null, null);
assert.equal(sinSubida, null);

const subidaReal = analizarEvolucionProxima([
  { hora: hora(0), wind_speed_10m: 0, wind_gusts_10m: 0 },
  { hora: hora(1), vientoKt: 12, rachasKt: 14 }
], null, null);
assert.equal(subidaReal?.detectada, true);
assert.equal(subidaReal.vientoFuturoKt, 12);
assert.equal(subidaReal.deltaVientoKt, 12);

const hueco = analizarEvolucionProxima([
  { hora: hora(0), vientoKt: 4 },
  { hora: hora(1), vientoKt: null, wind_speed_10m: null, viento_kmh: false },
  { hora: hora(2), vientoKt: [] }
], null, null);
assert.equal(hueco, null);
assert.deepEqual(lecturaVientoHora({ viento_kmh: 0, rachas_kmh: '0' }), { v: 0, r: 0 });
assert.deepEqual(lecturaVientoHora({ wind_speed_10m: ' 5 ', wind_gusts_10m: 0 }), { v: 5 * 3.6 / 1.852, r: 0 });
assert.deepEqual(lecturaVientoHora({ vientoKt: false, wind_speed_10m: [] }), { v: null, r: null });

function horaIso(offset) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}
const huecoHorario = analizarEvolucionProxima({
  hourly: { time: [horaIso(0), horaIso(1), horaIso(2)], wind_speed_10m: [0, null, false], wind_gusts_10m: [0, '  ', []] }
}, 0, 0);
assert.equal(huecoHorario, null);
const subidaHoraria = analizarEvolucionProxima({
  hourly: { time: [horaIso(0), horaIso(1)], wind_speed_10m: [0, 10], wind_gusts_10m: ['0', 12] }
}, 0, 0);
assert.equal(subidaHoraria?.detectada, true);

console.log('verdict-missing-inputs: ok');
