/**
 * Selección de lugar: una respuesta tardía no devuelve el sitio anterior,
 * y cambiar de hora no borra la marca del parte guardado.
 */
import assert from 'node:assert/strict';
import {
  aplicarExito,
  aplicarFallo,
  aplicarHora,
  crearEstadoConsulta,
  iniciarEvaluacion,
  marcaSnapshotDe
} from '../../web/src/lib/consultaLugar.ts';

const marca = {
  _desdeSnapshot: true,
  _snapshotTs: 1000,
  _snapshotLocation: 'Jávea',
  _snapshotLat: 38.8,
  _snapshotLon: 0.18,
  _snapshotConsulta: '2026-11-06',
  _snapshotObservado: '2026-11-06T14:00:00Z'
};
const parteA = { location: 'Jávea', windSpeed: 9.9, horasDiurnas: [{ hora: '14:00', vientoKt: 9 }], ...marca };
const parteB = { location: 'Entrepeñas', windSpeed: 4, horasDiurnas: [{ hora: '15:00', vientoKt: 4 }] };
const motorA = { estado: 'Precaución', score: 55 };
const motorB = { estado: 'Favorable', score: 98 };

let estado = crearEstadoConsulta();
const idA = iniciarEvaluacion(estado);
estado = idA.estado;
assert.equal(estado.pronostico, null);
assert.equal(estado.motor, null);

const idB = iniciarEvaluacion(estado);
estado = idB.estado;
estado = aplicarExito(estado, idB.id, parteB, motorB);
estado = aplicarExito(estado, idA.id, parteA, motorA);
assert.equal(estado.pronostico.location, 'Entrepeñas');
assert.equal(estado.motor.estado, 'Favorable');

const conParte = aplicarExito({ ...crearEstadoConsulta(), generacion: 1 }, 1, parteA, motorA);
const cambio = iniciarEvaluacion({ ...conParte, generacion: 1 });
const fallo = aplicarFallo(cambio.estado, cambio.id, 'red simulada');
assert.equal(fallo.pronostico, null);
assert.equal(fallo.motor, null);
assert.equal(fallo.error, 'red simulada');

const tarde = aplicarFallo(cambio.estado, idA.id, 'error viejo');
assert.equal(tarde.generacion, cambio.estado.generacion);
assert.equal(tarde.error, null);

const conHora = aplicarHora(conParte, 0, { estado: 'Precaución', score: 40 });
assert.equal(conHora.pronostico, conParte.pronostico);
assert.equal(conHora.pronostico._snapshotTs, 1000);
assert.equal(conHora.pronostico._snapshotLocation, 'Jávea');
assert.equal(conHora.horaIdx, 0);
assert.equal(conHora.motor._snapshotTs, undefined);

assert.equal(marcaSnapshotDe(parteA)._snapshotTs, 1000);
assert.equal(marcaSnapshotDe(parteB), null);
assert.equal(marcaSnapshotDe(null), null);

console.log('consulta-lugar: ok');
