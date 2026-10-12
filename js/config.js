// ====================================================
// js/config.js - CONFIGURACIÓN Y ESTADO GLOBAL SEGURO
// ====================================================

const supabaseUrl = 'https://amgmvnnwlraulbutgemx.supabase.co';
const supabaseKey = 'sb_publishable_bMJMhbAMO932NzZR8QyxAw_T6JF76Kq';

export const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// Patrón de estado con Proxy para reactividad básica (evita mutaciones descontroladas)
const state = {
    isLoginMode: true,
    sesionActual: null,
    perfilUsuario: null,
    esInvitado: false,
    invitadoId: 'guest_' + Math.floor(Math.random() * 100000),
    spaCurrentUser: null
};

export const appState = new Proxy(state, {
    set(target, property, value) {
        target[property] = value;
        // Aquí se podrían disparar eventos de actualización global si fuera necesario
        return true;
    }
});

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