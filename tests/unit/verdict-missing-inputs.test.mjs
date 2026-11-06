/**
 * Regresión: un dato ausente no es un cero ni un mar en calma.
 * Corre en cualquier máquina: solo importa el motor, sin rutas de Windows.
 */
import assert from 'node:assert/strict';
import { generarVeredictoNextGen } from '../../public_html/js/engine/verdict.js';
import { resolverOrientacionCostera } from '../../public_html/js/engine/coastal.js';
import { medicionNumerica, prepararEntradaCoach } from '../../web/src/lib/medicion.ts';

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
assert.equal(String(entrepenas.justificacion).includes('0.0 m'), false);

const calaCeroReal = evaluar({ ...COSTA, vientoKt: 0, rachasKt: 1, oleajeM: 0, periodoOla: 6 });
assert.equal(calaCeroReal.estado, 'Favorable');
assert.equal(calaCeroReal.vientoNudos, 0);
assert.equal(calaCeroReal.detallesTecnicos.oleajeM, 0);
assert.equal(String(calaCeroReal.justificacion).includes('0 kt'), true);
assert.equal(String(calaCeroReal.justificacion).includes('0.0 m'), true);

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

console.log('verdict-missing-inputs: ok');
