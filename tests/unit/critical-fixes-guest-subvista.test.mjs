import test from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal browser environment
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
    const makeEl = (id = '') => ({
        id,
        classList: {
            add: () => {},
            remove: () => {},
            replace: () => {},
            contains: () => false
        },
        dataset: {},
        innerHTML: '',
        value: '',
        style: {},
        appendChild: () => {},
        insertBefore: () => {}
    });

    globalThis.document = {
        getElementById: (id) => makeEl(id),
        createElement: (tag) => makeEl(tag),
        querySelectorAll: () => []
    };
} else {
    if (!globalThis.document.querySelectorAll) {
        globalThis.document.querySelectorAll = () => [];
    }
}

if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
    };
}

import {
    construirPayloadRutaSupabase,
    guardarRutaOffline
} from '../../public_html/js/map/map.tracker.js';
import {
    cambiarSubVistaSpot,
    renderizarResumenExperto
} from '../../public_html/js/map/map.bento.js';
import { mapRuntime } from '../../public_html/js/map/map.state.js';

test('CRÍTICO 1 - Construcción de payload de ruta en modo invitado (appState.sesionActual === null)', () => {
    const guestId = 'guest_1730000000000';
    const payload = construirPayloadRutaSupabase({
        userId: guestId,
        distanciaKm: 4.85,
        tiempoMinutos: 45,
        coords: [[38.84, 0.11], [38.85, 0.12]],
        pointsEarned: 485,
        vientoKt: 8.5,
        olasM: 0.3
    });

    assert.equal(payload.user_id, guestId, 'El payload debe contener el ID de invitado como user_id');
    assert.equal(payload.distancia_km, 4.85, 'La distancia debe ser 4.85 km');
    assert.equal(payload.tiempo_minutos, 45, 'El tiempo debe ser 45 minutos');
    assert.equal(payload.points_earned, 485, 'Los puntos deben asignarse correctamente');
    assert.ok(Array.isArray(payload.ruta_json), 'ruta_json debe ser un array de coordenadas');
    assert.ok(payload.ubicacion.includes('8.5 kt'), 'La ubicación debe incluir datos meteorológicos');
});

test('CRÍTICO 1 - Guardado offline tolerante a invitados y persistencia en LocalStorage', () => {
    localStorage.clear();
    const guestId = 'guest_test_999';
    const rutaData = {
        user_id: guestId,
        km: 5.2,
        min: 60,
        coords: [[38.8, 0.1], [38.81, 0.11]],
        points_earned: 520,
        ts: Date.now()
    };

    guardarRutaOffline(rutaData);

    const guardadaRaw = localStorage.getItem('paddlesafe_ruta_pendiente');
    assert.ok(guardadaRaw, 'paddlesafe_ruta_pendiente debe haberse almacenado en localStorage');
    const guardada = JSON.parse(guardadaRaw);
    assert.equal(guardada.user_id, guestId, 'El id del propietario debe coincidir con el guestId');
    assert.equal(guardada.km, 5.2);
});

test('CRÍTICO 1 - Detección de identificador de usuario tolerante a invitados', () => {
    localStorage.clear();
    const appState = {
        sesionActual: null,
        esInvitado: true
    };

    const currentUserId = appState.sesionActual?.user?.id 
        || (appState.esInvitado ? (localStorage.getItem('ps_guest_uid') || `guest_${Date.now()}`) : null);

    assert.ok(currentUserId, 'currentUserId no debe ser null ni undefined');
    assert.ok(currentUserId.startsWith('guest_'), 'currentUserId debe comenzar con guest_');

    if (appState.esInvitado && currentUserId) {
        localStorage.setItem('ps_guest_uid', currentUserId);
    }

    const secondUserId = appState.sesionActual?.user?.id 
        || (appState.esInvitado ? (localStorage.getItem('ps_guest_uid') || `guest_${Date.now()}`) : null);
    assert.equal(secondUserId, currentUserId, 'Debe reutilizar el mismo guest UID persistido');
});

test('CRÍTICO 2 - cambiarSubVistaSpot cambia y sincroniza el estado en mapRuntime y window', () => {
    mapRuntime.subVistaSpotActual = null;
    window.subVistaSpotActual = null;

    cambiarSubVistaSpot('inteligencia');

    assert.equal(mapRuntime.subVistaSpotActual, 'inteligencia', 'mapRuntime.subVistaSpotActual debe actualizarse a inteligencia');
    assert.equal(window.subVistaSpotActual, 'inteligencia', 'window.subVistaSpotActual debe sincronizarse a inteligencia');

    cambiarSubVistaSpot('meteo');
    assert.equal(mapRuntime.subVistaSpotActual, 'meteo', 'mapRuntime.subVistaSpotActual debe actualizarse a meteo');
});

test('CRÍTICO 2 - renderizarResumenExperto invoca cambiarSubVistaSpot sin lanzar excepciones', () => {
    let vistaInvocada = null;
    window.cambiarSubVistaSpot = (v) => {
        vistaInvocada = v;
    };
    mapRuntime.subVistaSpotActual = 'coach';

    const motorMock = {
        scoreFinal: 85,
        categoria: 'OPTIMO',
        seguridad: { nivel: 'OPTIMO' },
        derivaCostera: { nivel: 'BAJO', score: 10, descripcion: 'Sin deriva significativa' },
        componenteOleaje: { tipo: 'frontal' },
        componenteCorriente: { tipo: 'lateral' },
        resumenTexto: 'Condiciones óptimas'
    };

    assert.doesNotThrow(() => {
        renderizarResumenExperto(motorMock, 'basic');
    });

    assert.equal(mapRuntime.subVistaSpotActual, 'coach', 'mapRuntime.subVistaSpotActual debe mantenerse en coach');
    assert.equal(window.subVistaSpotActual, 'coach', 'window.subVistaSpotActual debe haberse sincronizado');
});
