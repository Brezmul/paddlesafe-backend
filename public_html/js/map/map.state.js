// ==============================================================================
// PADDLESAFE NEXT-GEN - MAP SHARED RUNTIME STATE (map.state.js)
// Central mutable state store for map modules adhering to the Strangler Fig pattern.
// Synchronizes with mapState and appState from config.js.
// ==============================================================================

import { mapState, appState } from '../config.js';

export const GPS_MIN_DISTANCIA_METROS = 8;

/**
 * mapRuntime: Almacén central de estado mutable compartido para los submódulos de mapa.
 * Proporciona acceso reactivo y sincronizado con mapState de config.js
 * sin problemas de reasignación de variables importadas entre módulos ES.
 */
export const mapRuntime = {
    // Referencias a los estados base
    mapState,
    appState,

    // Puentes (getters / setters) con mapState de config.js
    get map() { return mapState.map; },
    set map(v) { mapState.map = v; },
    get mapa() { return mapState.map; },
    set mapa(v) { mapState.map = v; },

    get equipoUsuario() { return appState?.equipoUsuario || null; },
    set equipoUsuario(v) { if (appState) appState.equipoUsuario = v; },

    get marcador() { return mapState.marcador; },
    set marcador(v) { mapState.marcador = v; },

    get latitudActual() { return mapState.latitudActual; },
    set latitudActual(v) { mapState.latitudActual = v; },

    get longitudActual() { return mapState.longitudActual; },
    set longitudActual(v) { mapState.longitudActual = v; },

    get modoTravesiaActivo() { return mapState.modoTravesiaActivo; },
    set modoTravesiaActivo(v) { mapState.modoTravesiaActivo = v; },

    get modoRutaLibreActivo() { return mapState.modoRutaLibreActivo; },
    set modoRutaLibreActivo(v) { mapState.modoRutaLibreActivo = v; },

    get modoRutaLibre() { return mapState.modoRutaLibreActivo; },
    set modoRutaLibre(v) { mapState.modoRutaLibreActivo = v; },

    get marcadoresRuta() { return mapState.marcadoresRuta; },
    set marcadoresRuta(v) { mapState.marcadoresRuta = v; },

    get marcadoresRutaLibre() { return mapState.marcadoresRuta; },
    set marcadoresRutaLibre(v) { mapState.marcadoresRuta = v; },

    get puntosRutaLibre() { return mapState.marcadoresRuta; },
    set puntosRutaLibre(v) { mapState.marcadoresRuta = v; },

    get lineaRuta() { return mapState.lineaRuta; },
    set lineaRuta(v) { mapState.lineaRuta = v; },

    get lineasMultiPunto() { return mapState.lineasMultiPunto; },
    set lineasMultiPunto(v) { mapState.lineasMultiPunto = v; },

    get polilineasRutaLibre() { return mapState.lineasMultiPunto; },
    set polilineasRutaLibre(v) { mapState.lineasMultiPunto = v; },

    get etiquetasDistancia() { return mapState.etiquetasDistancia; },
    set etiquetasDistancia(v) { mapState.etiquetasDistancia = v; },

    // Estado del Tracking GPS y cronómetro en vivo
    _isTracking: false,
    get isTracking() { return this._isTracking; },
    set isTracking(v) {
        this._isTracking = Boolean(v);
        if (typeof window !== 'undefined') {
            window.isTracking = this._isTracking;
        }
    },
    trackDistanceKm: 0,
    trackCoords: [],
    get coordenadasTravesia() { return this.trackCoords; },
    set coordenadasTravesia(v) { this.trackCoords = v; },
    splitsKm: [],
    get splitsKmActuales() { return this.splitsKm; },
    set splitsKmActuales(v) { this.splitsKm = v; },
    ultimoPuntoCrudoGPS: null,
    lastPositionGPS: null,
    lastTimestampGPS: null,
    trackStartTime: null,
    cronometroInterval: null,
    watchId: null,
    livePolyline: null,
    splitsKm: [],
    lastSplitKmDist: 0,
    lastSplitTimestamp: null,
    wakeLockSentinel: null,
    modoSolTrackerActivo: false,
    isSavingRoute: false,
    isSyncingPendingRoute: false,

    // Protocolo de seguridad y check-in
    checkinDuracionMinutos: 90,
    checkinTimestampLimite: null,
    checkinAlertaActiva: false,

    // Modo evento / quedada de club
    clubParaEvento: null,
    modoQuedadaClubActivo: false,
    cacheMeteoQuedada: null,

    // Inteligencia de Spots y Meteorología
    datosMeteoActuales: null,
    pronosticoDiaCompletoActual: null,
    horaSeleccionadaTimeline: null,
    spotsGuardadosMemoria: [],
    spotActivoActual: null,
    marcadorRosaVectores: null,
    marcadorReporteSpot: null,
    reportesSpotActivo: [],
    cacheGeohashMeteo: new Map(),
    pronosticoActualCache: null,
    biasSeleccionadoLogbook: 'exacto',
    ratingSeleccionadoLogbook: 5,
    tramosRutaActuales: [],

    // Route Replay 60FPS Engine State
    replayMarker: null,
    replayTrailPolyline: null,
    replayAnimFrameId: null,
    replayIsPlaying: false,
    replayProgress: 0,
    replaySpeed: 1,
    replayFollowCamera: true,
    replayData: null
};

/**
 * Reinicia las variables de telemetría de tracking a sus valores por defecto.
 */
export function resetTrackingRuntime() {
    mapRuntime.isTracking = false;
    mapRuntime.trackDistanceKm = 0;
    mapRuntime.trackCoords = [];
    mapRuntime.ultimoPuntoCrudoGPS = null;
    mapRuntime.lastPositionGPS = null;
    mapRuntime.lastTimestampGPS = null;
    mapRuntime.trackStartTime = null;
    mapRuntime.splitsKm = [];
    mapRuntime.lastSplitKmDist = 0;
    mapRuntime.lastSplitTimestamp = null;
    if (mapRuntime.cronometroInterval) {
        clearInterval(mapRuntime.cronometroInterval);
        mapRuntime.cronometroInterval = null;
    }
}

