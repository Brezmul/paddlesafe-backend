// ====================================================
// js/config.js - CONFIGURACIÓN Y ESTADO GLOBAL SEGURO
// ====================================================

export const supabaseUrl = 'https://amgmvnnwlraulbutgemx.supabase.co';
export const supabaseKey = 'sb_publishable_bMJMhbAMO932NzZR8QyxAw_T6JF76Kq';
export const BACKEND_API_URL = 'https://paddlesafe-backend.vercel.app/api/backend';

let _rawClient = (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(supabaseUrl, supabaseKey)
    : null;

export function getSupabase() {
    if (!_rawClient && typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
        _rawClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    return _rawClient;
}

export const supabaseClient = new Proxy({}, {
    get(target, prop) {
        const client = getSupabase();
        if (!client) return undefined;
        const val = client[prop];
        return typeof val === 'function' ? val.bind(client) : val;
    }
});

// Patrón de estado con Proxy para reactividad básica (evita mutaciones descontroladas)
const state = {
    isLoginMode: true,
    sesionActual: null,
    perfilUsuario: null,
    esInvitado: false,
    invitadoId: 'guest_' + Math.floor(Math.random() * 100000),
    spaCurrentUser: null,
    onlineUsers: {}
};

export const appState = new Proxy(state, {
    set(target, property, value) {
        target[property] = value;
        // Aquí se podrían disparar eventos de actualización global si fuera necesario
        return true;
    }
});

if (typeof window !== 'undefined') {
    window.appState = appState;
}

export const mapState = {
    map: null,
    marcador: null,
    latitudActual: 38.80,
    longitudActual: 0.18,
    modoTravesiaActivo: false,
    modoRutaLibreActivo: false,
    marcadoresRuta: [],
    lineaRuta: null,
    lineasMultiPunto: [],
    etiquetasDistancia: []
};