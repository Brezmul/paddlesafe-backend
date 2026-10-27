// ====================================================
// js/main.js - ORQUESTADOR PRINCIPAL (PUNTO DE ENTRADA)
// ====================================================

import { supabaseClient, appState } from './config.js';
import { IMG_FALLBACK, esc, safeUrl, formatearTiempo } from './utils.js'; // AÑADIDO: esc y safeUrl
import * as Auth from './auth.js';
import * as MapModule from './map.js';
import * as Social from './social.js';
import { calcularDatosRankingMulticategoria, PLANTILLAS_RETOS_CLUB, calcularProgresoRetoClub, renderizarPodioTop3Ranking } from './gamification.js';

window.PLANTILLAS_RETOS_CLUB = PLANTILLAS_RETOS_CLUB;
window.calcularProgresoRetoClub = calcularProgresoRetoClub;

// ====================================================
// 1. EXPOSICIÓN GLOBAL (Para compatibilidad con HTML)
// ====================================================
[Auth, MapModule, Social].forEach(modulo => {
    Object.entries(modulo).forEach(([key, val]) => {
        if (typeof val === 'function' || typeof val === 'object') {
            window[key] = val;
        }
    });
});

// Adaptadores defensivos de retrocompatibilidad para el DOM
window.abrirModalClubs = () => {
    if (window.Club && typeof window.Club.abrirModal === 'function') {
        return window.Club.abrirModal();
    }
    const m = document.getElementById('clubsModal');
    if (m) {
        m.classList.remove('hidden');
        m.classList.remove('opacity-0');
        const box = m.querySelector('div');
        if (box) box.classList.remove('scale-95');
    }
};
window.cerrarModalClubs = () => window.Club && window.Club.cerrarModal ? window.Club.cerrarModal() : null;
window.cambiarTabClubs = (tab) => window.Club && window.Club.cambiarTabClubs ? window.Club.cambiarTabClubs(tab) : null;
window.abrirModalFeed = () => Social.abrirModalFeed ? Social.abrirModalFeed() : (window.socialFeed && window.socialFeed.abrirModal ? window.socialFeed.abrirModal() : null);
window.cerrarModalFeed = () => Social.cerrarModalFeed ? Social.cerrarModalFeed() : (window.socialFeed && window.socialFeed.cerrarModal ? window.socialFeed.cerrarModal() : null);

import('./club/index.js')
    .then(({ default: ClubFacade }) => {
        window.Club = ClubFacade;
    })
    .catch(error => {
        console.error('[club] No se pudo cargar el módulo de clubes:', error);
    });

const openClubProfileSafe = (id) => {
    if (window.Club && typeof window.Club.openClubProfile === 'function') window.Club.openClubProfile(id);
    else if (typeof window.openClubProfile === 'function') window.openClubProfile(id);
};

// Vinculación explícita de métodos de quedadas en mapa
window.iniciarCreacionQuedadaClub = (...args) => MapModule.iniciarCreacionQuedadaClub(...args);
window.cancelarCreacionQuedadaClub = () => MapModule.cancelarCreacionQuedadaClub();
window.deshacerUltimoPuntoQuedada = () => MapModule.deshacerUltimoPuntoQuedada();
let listenerNavegacionModalesInicializado = false;
window.reiniciarPuntosQuedada = () => MapModule.reiniciarPuntosQuedada();
window.guardarQuedadaDesdeMapa = () => MapModule.guardarQuedadaDesdeMapa();
window.cargarRutaEnMapaGrande = (...args) => MapModule.cargarRutaEnMapaGrande(...args);
window.exportarRutaPlanificadaGPX = (...args) => MapModule.exportarRutaPlanificadaGPX(...args);
window.descargarRutaActivaGPX = (...args) => MapModule.exportarRutaPlanificadaGPX(...args);
window.guardarForecastSnapshot = (...args) => MapModule.guardarForecastSnapshot(...args);
window.recuperarForecastSnapshot = (...args) => MapModule.recuperarForecastSnapshot(...args);

// Retos del Club
window.abrirCreadorRetoClub = (...args) => window.Club && window.Club.abrirCreadorRetoClub ? window.Club.abrirCreadorRetoClub(...args) : (typeof window._abrirCreadorRetoClub === 'function' ? window._abrirCreadorRetoClub(...args) : null);
window.cerrarCreadorRetoClub = (...args) => window.Club && window.Club.cerrarCreadorRetoClub ? window.Club.cerrarCreadorRetoClub(...args) : null;
window.aplicarPlantillaRetoClub = (...args) => window.Club && window.Club.aplicarPlantillaRetoClub ? window.Club.aplicarPlantillaRetoClub(...args) : null;
window.crearRetoMensualClub = (...args) => window.Club && window.Club.crearRetoMensualClub ? window.Club.crearRetoMensualClub(...args) : null;
window.toggleParticipacionRetoClub = (...args) => window.Club && window.Club.toggleParticipacionRetoClub ? window.Club.toggleParticipacionRetoClub(...args) : null;
window.toggleDesplegarParticipantesReto = (...args) => window.Club && window.Club.toggleDesplegarParticipantesReto ? window.Club.toggleDesplegarParticipantesReto(...args) : null;

const closeClubProfileSafe = () => {
    if (window.Club && typeof window.Club.cerrarClubProfileView === 'function') window.Club.cerrarClubProfileView();
    else if (typeof window.cerrarClubProfileView === 'function') window.cerrarClubProfileView();
};

// ====================================================
let ultimoTogglePro = 0;
// Control del Panel Copiloto Inteligente Pro
export function togglePanelPro(forceState) {
    const ahora = Date.now();
    if (typeof forceState !== 'boolean' && (ahora - ultimoTogglePro < 300)) {
        return;
    }
    ultimoTogglePro = ahora;

    const panelPro = document.getElementById("panelPro");
    const btnProIcon = document.getElementById("btnProIcon");
    if (!panelPro) return;

    const estaAbierto = panelPro.style.gridTemplateRows === "1fr";
    const nuevoEstado = typeof forceState === "boolean" ? forceState : !estaAbierto;

    panelPro.style.gridTemplateRows = nuevoEstado ? "1fr" : "0fr";

    if (btnProIcon) {
        if (nuevoEstado) {
            btnProIcon.classList.add("rotate-180");
        } else {
            btnProIcon.classList.remove("rotate-180");
        }
    }

    if (nuevoEstado) {
        // Redimensionados escalonados para que Leaflet pinte las teselas de inmediato y tras la transición
        setTimeout(() => {
            if (MapModule.inicializarMapa) MapModule.inicializarMapa();
            if (MapModule.map) MapModule.map.invalidateSize();
        }, 100);
        setTimeout(() => {
            if (MapModule.map) MapModule.map.invalidateSize();
        }, 250);
        setTimeout(() => {
            if (MapModule.map) MapModule.map.invalidateSize();
        }, 450);
    }
}
window.togglePanelPro = togglePanelPro;

export function cerrarModalesActivosNavegacion(tabId) {
    const modalMapping = {
        muro: 'socialFeedModal',
        clubes: 'clubsModal',
        ranking: 'rankingModal',
        perfil: 'authModal'
    };
    const targetModal = modalMapping[tabId] || null;

    const modales = [
        { id: 'socialFeedModal', close: () => typeof window.cerrarModalFeed === 'function' ? window.cerrarModalFeed() : null },
        { id: 'clubsModal', close: () => typeof window.cerrarModalClubs === 'function' ? window.cerrarModalClubs() : (window.Club?.cerrarModal ? window.Club.cerrarModal() : null) },
        { id: 'rankingModal', close: () => typeof window.cerrarModalRanking === 'function' ? window.cerrarModalRanking() : null },
        { id: 'authModal', close: () => typeof window.cerrarModalAuth === 'function' ? window.cerrarModalAuth() : null },
        { id: 'userProfileModal', close: () => null },
        { id: 'thermalCalculatorModal', close: () => typeof window.cerrarCalculadoraTermica === 'function' ? window.cerrarCalculadoraTermica() : null },
        { id: 'quickSetupModal', close: () => null },
        { id: 'modalNotasTacticasSpot', close: () => typeof window.cerrarModalNotasTacticasSpot === 'function' ? window.cerrarModalNotasTacticasSpot() : null },
        { id: 'modalReporteSpot', close: () => typeof window.cerrarModalReporteSpot === 'function' ? window.cerrarModalReporteSpot() : null },
        { id: 'rutaDetalleModal', close: () => typeof window.cerrarModalDetallesRuta === 'function' ? window.cerrarModalDetallesRuta() : null }
    ];

    modales.forEach(({ id, close }) => {
        if (id === targetModal) return;
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
            try {
                if (typeof close === 'function') close();
            } catch (_) {}
            el.classList.add('hidden');
            el.classList.add('opacity-0');
        }
    });
}
window.cerrarModalesActivosNavegacion = cerrarModalesActivosNavegacion;

// Navegación Ergonómica Móvil (Design System 4.0)
export function activarItemBottomNav(tabId) {
    cerrarModalesActivosNavegacion(tabId);
    const navItems = {
        parte: document.getElementById('btnNavParte'),
        pro: document.getElementById('btnNavPro'),
        muro: document.getElementById('btnNavMuro'),
        clubes: document.getElementById('btnNavClubes'),
        ranking: document.getElementById('btnNavRanking'),
        perfil: document.getElementById('btnNavPerfil')
    };

    Object.entries(navItems).forEach(([key, btn]) => {
        if (!btn) return;
        const indicator = btn.querySelector('.nav-indicator');
        if (key === tabId) {
            btn.classList.add('is-active', 'text-sky-400', 'scale-105');
            btn.classList.remove('text-slate-400');
            if (indicator) {
                indicator.classList.remove('opacity-0');
                indicator.classList.add('opacity-100');
            }
        } else {
            btn.classList.remove('is-active', 'text-sky-400', 'scale-105');
            btn.classList.add('text-slate-400');
            if (indicator) {
                indicator.classList.add('opacity-0');
                indicator.classList.remove('opacity-100');
            }
        }
    });

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    const tabBasico = document.getElementById('tab-basico');
    const tabPro = document.getElementById('tab-pro');
    const panelPro = document.getElementById('panelPro');

    if (tabId === 'parte') {
        if (isMobile) {
            if (tabBasico) { tabBasico.classList.remove('hidden'); tabBasico.classList.add('block'); }
            if (tabPro) { tabPro.classList.add('hidden'); tabPro.classList.remove('flex'); }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tabId === 'pro') {
        if (isMobile) {
            if (tabPro) { tabPro.classList.remove('hidden'); tabPro.classList.add('flex'); }
            if (tabBasico) { tabBasico.classList.add('hidden'); tabBasico.classList.remove('block'); }
            if (panelPro) panelPro.style.gridTemplateRows = "1fr";
        }
        if (typeof window.togglePanelPro === 'function') {
            window.togglePanelPro(true);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
            const m = window.MapModule?.map || window.map;
            if (m) m.invalidateSize();
        }, 150);
    } else if (tabId === 'muro') {
        if (typeof window.abrirModalFeed === 'function') {
            window.abrirModalFeed();
        }
    } else if (tabId === 'clubes') {
        if (typeof window.abrirModalClubs === 'function') {
            window.abrirModalClubs();
        }
    } else if (tabId === 'ranking') {
        if (typeof window.abrirModalRanking === 'function') {
            window.abrirModalRanking();
        }
    } else if (tabId === 'perfil') {
        if (typeof window.abrirModalAuth === 'function') {
            window.abrirModalAuth();
        }
    }
}
window.activarItemBottomNav = activarItemBottomNav;
window._activarItemBottomNavImpl = activarItemBottomNav;

// 2. INICIALIZACIÓN PRINCIPAL (Lifecycle Seguro)
// ====================================================
let appInicializada = false;
async function inicializarAplicacion() {
    if (appInicializada) return;
    appInicializada = true;

    if (!supabaseClient) console.warn("Aviso: Supabase aún no cargado.");

    // Escuchar cambios en el historial (botón atrás del navegador o móvil)
    window.addEventListener('popstate', handleSPA);

    ['btnModalRanking', 'btnModalClubs', 'btnModalFeed', 'btnCabeceraPerfil'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });
    });

    const btnPro = document.getElementById("btnPro");
    if (btnPro && !btnPro.dataset.toggleBound) {
        btnPro.dataset.toggleBound = "true";
        // Si el botón ya tiene onclick en el HTML, evitamos duplicar la ejecución en el mismo clic
        if (!btnPro.getAttribute("onclick")) {
            btnPro.addEventListener("click", (e) => {
                e.preventDefault();
                togglePanelPro();
            });
        }
    }

    // UI 5.0: En pantallas de escritorio (Cockpit split-screen), inicializar mapa interactivo automáticamente
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
        togglePanelPro(true);
    }

    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const strHoy = `${hoy.getFullYear()}-${mes}-${dia}`;
    if (document.getElementById('date')) document.getElementById('date').value = strHoy;
    if (document.getElementById('proDate')) document.getElementById('proDate').value = strHoy;

    // Reactividad para actualización de la jornada completa del spot al cambiar fecha o nivel
    const dateEl = document.getElementById('date');
    if (dateEl && !dateEl.dataset.spotsBound) {
        dateEl.dataset.spotsBound = "true";
        dateEl.addEventListener('change', () => {
            if (MapModule.spotActivoActual && MapModule.cargarJornadaCompletaSpot) {
                MapModule.cargarJornadaCompletaSpot(MapModule.spotActivoActual, dateEl.value, document.getElementById('userLevel')?.value);
            }
        });
    }

    const userLevelEl = document.getElementById('userLevel');
    if (userLevelEl && !userLevelEl.dataset.spotsBound) {
        userLevelEl.dataset.spotsBound = "true";
        userLevelEl.addEventListener('change', () => {
            if (MapModule.spotActivoActual && MapModule.pronosticoDiaCompletoActual && MapModule.renderizarTimelineJornadaCompleta) {
                MapModule.renderizarTimelineJornadaCompleta(MapModule.spotActivoActual, MapModule.pronosticoDiaCompletoActual, userLevelEl.value);
            }
        });
    }

    // Carga inicial de spots favoritos del usuario
    if (MapModule.cargarSpotsGuardadosUsuario) {
        MapModule.cargarSpotsGuardadosUsuario();
    }

    // Inicialización del selector de equipo y física de tabla
    if (MapModule.actualizarUIGearSelector) {
        MapModule.actualizarUIGearSelector();
    }

    if (supabaseClient && supabaseClient.auth) {
        try {
            if (Auth.initAuthListeners) Auth.initAuthListeners();
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                appState.sesionActual = session;
                appState.esInvitado = false;
                await Auth.cargarPerfilUsuarioActivo();
                if (typeof Auth.inicializarPresenciaRealtime === 'function') {
                    Auth.inicializarPresenciaRealtime(session.user);
                }
                Social.inicializarBotonesSociales();

                // Sincronización offline de rutas al detectar sesión iniciada
                if (MapModule.sincronizarRutasPendientes) {
                    MapModule.sincronizarRutasPendientes();
                }
            } else {
                Auth.actualizarBotonCabecera();
            }
        } catch (authErr) {
            console.warn("Aviso no crítico inicializando sesión:", authErr);
        }
    }
    handleSPA();
    inicializarManejadorNavegacionModales();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarAplicacion, { once: true });
} else {
    inicializarAplicacion();
}

// ====================================================
// GESTOR UNIFICADO DE NAVEGACIÓN Y CIERRE DE MODALES (ESC / PWA BACK)
// ====================================================

export function obtenerModalActivo() {
    const modalIds = [
        'posterFinisherLightbox',
        'modalReporteSpot',
        'modalAiRouteCoach',
        'modalSplitsKm',
        'rutaDetalleModal',
        'friendSystemModal',
        'clubAdminRequestsModal',
        'clubProfileViewModal',
        'userProfileModal',
        'authModal',
        'socialFeedModal',
        'rankingModal',
        'clubsModal',
        'notificationsModal',
        'spotsComparisonPanel'
    ];

    for (const id of modalIds) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
            return { id, element: el };
        }
    }
    return null;
}

export function cerrarModalActivo(modalInfo) {
    if (!modalInfo) return false;
    const { id, element } = modalInfo;

    if (id === 'posterFinisherLightbox') {
        if (typeof window.cerrarPosterFinisherFullscreen === 'function') {
            window.cerrarPosterFinisherFullscreen();
        } else {
            element.classList.add('opacity-0');
            setTimeout(() => element.classList.add('hidden'), 200);
        }
        return true;
    }

    if (['modalReporteSpot', 'modalAiRouteCoach', 'modalSplitsKm'].includes(id)) {
        element.remove();
        return true;
    }
    if (id === 'spotsComparisonPanel') {
        element.classList.add('hidden');
        return true;
    }
    if (id === 'userProfileModal') {
        if (typeof window.goBackSPA === 'function') window.goBackSPA();
        else {
            element.classList.add('opacity-0');
            setTimeout(() => element.classList.add('hidden'), 200);
        }
        return true;
    }
    if (id === 'clubsModal') {
        if (window.Club && typeof window.Club.cerrarModal === 'function') window.Club.cerrarModal();
        else if (typeof window.cerrarModalClubs === 'function') window.cerrarModalClubs();
        else {
            element.classList.add('opacity-0');
            setTimeout(() => element.classList.add('hidden'), 200);
        }
        return true;
    }
    if (id === 'clubProfileViewModal') {
        closeClubProfileSafe();
        return true;
    }
    if (id === 'socialFeedModal' && typeof window.cerrarModalFeed === 'function') {
        window.cerrarModalFeed();
        return true;
    }
    if (id === 'rankingModal' && typeof window.cerrarModalRanking === 'function') {
        window.cerrarModalRanking();
        return true;
    }
    if (id === 'authModal' && typeof window.cerrarModalAuth === 'function') {
        window.cerrarModalAuth();
        return true;
    }
    if (id === 'rutaDetalleModal' && typeof window.cerrarModalDetallesRuta === 'function') {
        window.cerrarModalDetallesRuta();
        return true;
    }
    if (id === 'clubAdminRequestsModal' && typeof window.cerrarModalSolicitudes === 'function') {
        window.cerrarModalSolicitudes();
        return true;
    }
    if (id === 'friendSystemModal' && typeof window.cerrarModalAmigos === 'function') {
        window.cerrarModalAmigos();
        return true;
    }

    element.classList.add('opacity-0');
    setTimeout(() => element.classList.add('hidden'), 200);
    return true;
}

export function inicializarManejadorNavegacionModales() {
    if (listenerNavegacionModalesInicializado) return;
    listenerNavegacionModalesInicializado = true;

    // 1. Escuchar tecla Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            const modal = obtenerModalActivo();
            if (modal) {
                e.preventDefault();
                cerrarModalActivo(modal);
                if (window.history.state?.modalOpen) {
                    window.history.back();
                }
            }
        }
    });

    // 2. Interceptar popstate (botón atrás en Android / navegador)
    window.addEventListener('popstate', () => {
        const modal = obtenerModalActivo();
        if (modal) {
            cerrarModalActivo(modal);
        }
    }, true);

    // 3. MutationObserver para sincronizar apertura con history.state
    try {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    const el = m.target;
                    if (el && !el.classList.contains('hidden') && el.classList.contains('fixed')) {
                        if (!window.history.state?.modalOpen) {
                            window.history.pushState({ modalOpen: true, modalId: el.id }, '');
                        }
                    }
                } else if (m.type === 'childList') {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1 && (node.id === 'modalSplitsKm' || node.id === 'modalAiRouteCoach' || node.id === 'modalReporteSpot')) {
                            if (!window.history.state?.modalOpen) {
                                window.history.pushState({ modalOpen: true, modalId: node.id }, '');
                            }
                        }
                    }
                }
            }
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
            childList: true,
            subtree: true
        });
    } catch (eObs) {
        console.warn('Aviso observador de modales:', eObs);
    }
}

// ====================================================
// 3. ENRUTADOR SPA Y PERFILES PÚBLICOS
// ====================================================
export function navigateSPA(path) {
    history.pushState(null, '', path);
    handleSPA();
}

export function goBackSPA() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        navigateSPA('/');
    }
}

export function handleSPA() {
    // Reseteo del scroll en la vista para evitar el "Scroll Fantasma"
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const path = window.location.pathname;
    const modalUser = document.getElementById('userProfileModal');
    
    const closeUser = () => {
        if(modalUser && !modalUser.classList.contains('hidden')) {
            modalUser.classList.add('opacity-0');
            setTimeout(() => modalUser.classList.add('hidden'), 300);
        }
    };

    if (path.startsWith('/user/')) {
        closeClubProfileSafe(); 
        const id = path.split('/')[2];
        abrirPerfilPublicoSPA(id);
    } else if (path.startsWith('/club/')) {
        closeUser(); 
        const id = path.split('/')[2];
        openClubProfileSafe(id);
    } else {
        closeUser();
        closeClubProfileSafe();
    }
}

export async function abrirPerfilPublicoSPA(userId) {
    if (typeof window.cerrarModalClubs === 'function') window.cerrarModalClubs();
    const modal = document.getElementById('userProfileModal');
    if(!modal) return;
    
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.remove('opacity-0'));
    document.getElementById('modalUserName').textContent = "Cargando...";
    
    // Asegurar sesión sincronizada con Supabase
    if (!appState.sesionActual && supabaseClient) {
        try {
            const { data: sData } = await supabaseClient.auth.getSession();
            if (sData?.session) appState.sesionActual = sData.session;
        } catch (_) {}
    }
    
    const { data: user } = await supabaseClient.from('perfiles').select('*').eq('id', userId).maybeSingle();
    
    if(user) {
        appState.spaCurrentUser = user;
        document.getElementById('modalUserName').textContent = user.nombre;
        
        const avatarEl = document.getElementById('spaAvatar');
        avatarEl.src = safeUrl(user.avatar_url, IMG_FALLBACK);
        // Fallback robusto nativo para evitar roturas visuales por CORS
        avatarEl.onerror = function() { if (window.handleAvatarError) window.handleAvatarError(this); else { this.onerror=null; this.src=IMG_FALLBACK; } };
        
        const levelEl = document.getElementById('spaUserLevel');
        if (levelEl) levelEl.textContent = `Nivel ${user.nivel || 1}`;
        
        const myId = appState.sesionActual?.user?.id;
        const isMe = myId === userId;
        
        // Contenedor dinámico y ordenado para las acciones de perfil
        let btnContainer = document.getElementById('spaBtnContainer');
        if (!btnContainer && levelEl) {
            btnContainer = document.createElement('div');
            btnContainer.id = 'spaBtnContainer';
            btnContainer.className = 'flex justify-center items-center gap-2 mt-1 mb-3 empty:hidden';
            levelEl.insertAdjacentElement('afterend', btnContainer);
        }
        
        if (btnContainer) {
            btnContainer.innerHTML = ''; // Limpiar botones anteriores

            // Botón 1: Añadir Amigo (Visible siempre que no sea mi propio perfil)
            if (!isMe) {
                const btnAmigo = document.createElement('button');
                btnAmigo.id = 'btnAnadirAmigoSPA';
                btnAmigo.setAttribute('data-id', 'btnAnadirAmigoSPA');
                btnAmigo.className = 'bg-water hover:bg-sky-600 text-white text-[10px] font-bold px-5 py-2 rounded-full uppercase transition-colors shadow-sm active:scale-95 cursor-pointer';
                btnAmigo.textContent = 'Añadir Amigo';
                if (!appState.sesionActual || appState.esInvitado) {
                    btnAmigo.onclick = () => {
                        if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
                        else alert("Inicia sesión para añadir amigos.");
                    };
                } else {
                    btnAmigo.onclick = () => { if(window.enviarSolicitudAmistad) window.enviarSolicitudAmistad(userId); };
                }
                btnContainer.appendChild(btnAmigo);
            }

            // Botón en perfil propio: Subir Sesión GPX
            if (isMe && appState.sesionActual && !appState.esInvitado) {
                const btnSubirGPX = document.createElement('button');
                btnSubirGPX.id = 'btnSubirGPXSPA';
                btnSubirGPX.type = 'button';
                btnSubirGPX.className = 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-[10px] sm:text-xs font-black px-4 py-2 rounded-full uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5';
                btnSubirGPX.innerHTML = '<span>🚀</span> Subir Sesión GPX';
                btnSubirGPX.onclick = () => {
                    let input = document.getElementById('gpxUploadInputSPA');
                    if (!input) {
                        input = document.createElement('input');
                        input.type = 'file';
                        input.id = 'gpxUploadInputSPA';
                        input.accept = '.gpx,application/gpx+xml';
                        input.className = 'hidden';
                        input.onchange = (e) => {
                            if (window.subirArchivoGPX) window.subirArchivoGPX(e);
                            setTimeout(() => cambiarTabPerfilSPA('rutas'), 1000);
                        };
                        document.body.appendChild(input);
                    }
                    input.click();
                };
                btnContainer.appendChild(btnSubirGPX);
            }

            // Botón 2: Invitar al Club (Visible si el usuario tiene sesión activa y club con permisos)
            if (appState.sesionActual && !appState.esInvitado && !isMe) {
                let activeClubId = null;
                if (window.Club && typeof window.Club.getActiveClubId === 'function') {
                    activeClubId = window.Club.getActiveClubId();
                } else if (window.clubActivoIdSeleccionado) {
                    activeClubId = window.clubActivoIdSeleccionado;
                } else {
                    const { data: firstClub } = await supabaseClient.from('clubs_usuarios').select('club_id').eq('user_id', myId).limit(1).maybeSingle();
                    if (firstClub) activeClubId = firstClub.club_id;
                }

                if (activeClubId) {
                    const { data: rel } = await supabaseClient.from('clubs_usuarios').select('rol').eq('club_id', activeClubId).eq('user_id', myId).maybeSingle();
                    if (rel && (rel.rol === 'creador' || rel.rol === 'admin')) {
                        const btnInvitar = document.createElement('button');
                        btnInvitar.id = 'btnInvitarClubSPA';
                        btnInvitar.className = 'bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold px-5 py-2 rounded-full uppercase transition-colors shadow-sm active:scale-95 cursor-pointer flex items-center gap-1';
                        btnInvitar.innerHTML = '➕ Invitar';
                        btnInvitar.onclick = () => { 
                            if(window.Club && typeof window.Club.invitarPaddler === 'function') window.Club.invitarPaddler(userId, activeClubId); 
                            else if(typeof window.invitarPaddler === 'function') window.invitarPaddler(userId, activeClubId); 
                        };
                        btnContainer.appendChild(btnInvitar);
                    }
                }
            }
        }

        // Verificar estado de amistad si hay sesión y no soy yo
        if (window.verificarEstadoAmistad && appState.sesionActual && !appState.esInvitado && !isMe) {
            window.verificarEstadoAmistad(userId);
        }

        // Pestaña Amigos (Solo visible si es mi propio perfil)
        let tabAmigos = document.getElementById('spaTabAmigos');
        if (isMe) {
            if (!tabAmigos) {
                const tabRutas = document.getElementById('spaTabRutas');
                if (tabRutas) {
                    tabAmigos = document.createElement('button');
                    tabAmigos.id = 'spaTabAmigos';
                    tabAmigos.type = 'button';
                    tabAmigos.className = 'h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-xl flex-1 cursor-pointer transition-colors';
                    tabAmigos.textContent = 'Amigos';
                    tabAmigos.onclick = () => cambiarTabPerfilSPA('amigos');
                    tabRutas.insertAdjacentElement('afterend', tabAmigos);
                }
            } else {
                tabAmigos.classList.remove('hidden');
            }
        } else {
            if (tabAmigos) tabAmigos.classList.add('hidden');
        }

        // BLOQUE DE CONTROL DE PRIVACIDAD (Afecta solo al diario de navegación, preserva botón de amigos)
        if (!isMe && user.is_private) {
            document.getElementById('userProfileContent').innerHTML = `
                <div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4">
                    <span class="text-4xl block mb-2 opacity-50">🔒</span>
                    <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Este usuario ha ocultado su diario de travesías.</p>
                </div>`;
            
            // Ocultar las pestañas de navegación preservando las clases Flexbox
            ['spaTabInsignias', 'spaTabRutas', 'spaTabAmigos'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            return; // Detenemos la carga de contenido privado
        } else {
            // Aseguramos que las pestañas sean visibles
            ['spaTabInsignias', 'spaTabRutas'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('hidden');
            });
            cambiarTabPerfilSPA('rutas');
        }
    } else {
        document.getElementById('modalUserName').textContent = "Usuario no encontrado";
        document.getElementById('userProfileContent').innerHTML = `<p class="text-center py-10 text-slate-500">El perfil ha sido eliminado o no existe.</p>`;
    }
}

export async function cambiarTabPerfilSPA(tab) {
    const spaCurrentUser = appState.spaCurrentUser;
    if(!spaCurrentUser) return;
    
    const content = document.getElementById('userProfileContent');
    content.innerHTML = 'Cargando datos...';
    
    ['spaTabInsignias','spaTabRutas', 'spaTabAmigos'].forEach(id => {
         const b = document.getElementById(id);
         if(b) b.className="h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold rounded-xl flex-1 cursor-pointer transition-colors";
    });
    
    const activeBtn = document.getElementById(tab === 'rutas' ? 'spaTabRutas' : (tab === 'insignias' ? 'spaTabInsignias' : 'spaTabAmigos'));
    if(activeBtn) activeBtn.className="h-10 px-2 bg-marine dark:bg-water text-white shadow-md text-[11px] font-bold rounded-xl flex-1 cursor-pointer transition-colors";
    
    if (tab === 'rutas') {
        let rutas = [];
        try {
            const { data: urData } = await supabaseClient
                .from('user_routes')
                .select('id, title, distance_km, duration_seconds, avg_speed, max_speed, xp_earned, created_at, route_coordinates, splits_data, ai_feedback')
                .eq('user_id', spaCurrentUser.id)
                .order('created_at', { ascending: false });

            if (Array.isArray(urData)) {
                urData.forEach(r => rutas.push({
                    id: r.id,
                    title: r.title || 'Ruta Deportiva',
                    distancia_km: Number(r.distance_km || 0),
                    tiempo_minutos: Math.max(1, Math.round(Number(r.duration_seconds || 0) / 60)),
                    avg_speed: Number(r.avg_speed || 0),
                    max_speed: Number(r.max_speed || 0),
                    fecha: r.created_at,
                    route_coordinates: r.route_coordinates,
                    splits_data: r.splits_data,
                    ai_feedback: r.ai_feedback,
                    puntos: Number(r.xp_earned || 0)
                }));
            }
        } catch (e) {
            console.warn('[SPA] Error consultando user_routes:', e);
        }

        try {
            const { data: legData } = await supabaseClient
                .from('rutas')
                .select('id, distancia_km, tiempo_minutos, fecha, ruta_json, avg_speed_kmh, points_earned')
                .eq('user_id', spaCurrentUser.id)
                .order('fecha', { ascending: false });

            if (Array.isArray(legData)) {
                legData.forEach(r => {
                    if (!rutas.some(x => String(x.id) === String(r.id))) {
                        const dist = Number(r.distancia_km || 0);
                        const mins = Number(r.tiempo_minutos || 0);
                        const avg = Number(r.avg_speed_kmh || (mins > 0 ? (dist / (mins / 60)) : 0));
                        rutas.push({
                            id: r.id,
                            title: 'Travesía GPS',
                            distancia_km: dist,
                            tiempo_minutos: mins,
                            avg_speed: avg,
                            max_speed: avg * 1.35,
                            fecha: r.fecha,
                            route_coordinates: r.ruta_json,
                            puntos: Number(r.points_earned || (Math.round(dist * 10) + mins))
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('[SPA] Error consultando rutas:', e);
        }

        rutas.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
        rutas.forEach(r => window.__rutasUsuarioCache.set(String(r.id), r));

        const isMe = appState.sesionActual?.user?.id === spaCurrentUser.id;
        let bannerUpload = '';
        if (isMe && !appState.esInvitado) {
            bannerUpload = `
                <div class="mb-4 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-4 text-white flex items-center justify-between shadow-lg">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🚀</span>
                        <div>
                            <p class="text-xs font-black uppercase tracking-wider">¿Tienes una sesión nueva?</p>
                            <p class="text-[10px] text-white/90 font-medium">Sube tu archivo .GPX y suma +100 XP por km</p>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('gpxUploadInputSPA')?.click() || document.getElementById('gpxUploadInput')?.click()" class="bg-white text-marine font-black text-xs px-3 py-2 rounded-xl shadow active:scale-95 transition-all cursor-pointer">
                        Subir GPX
                    </button>
                </div>
            `;
        }

        if(!rutas.length) {
            return content.innerHTML = `
                ${bannerUpload}
                <div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-2">
                    <span class="text-3xl block mb-2 opacity-60">🏄‍♂️</span>
                    <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Aún no tiene rutas registradas.</p>
                </div>`;
        }
        
        const stats = window.calcularRecordsYEstadisticasPerfil ? window.calcularRecordsYEstadisticasPerfil(rutas) : null;
        let prsBlock = (stats && window.renderizarPRsGrid) ? window.renderizarPRsGrid(stats) : '';
        let metaBlock = (isMe && stats && window.renderizarWidgetMetaMensual) ? window.renderizarWidgetMetaMensual(stats) : '';
        let chartBlock = (stats && window.renderizarGraficoVolumen8Semanas) ? window.renderizarGraficoVolumen8Semanas(stats.totales?.volumen8Semanas) : '';

        let html = bannerUpload + prsBlock + metaBlock + chartBlock + '<div class="space-y-4 mt-4 pb-4">';
        html += rutas.map(ruta => {
            const dist = Number(ruta.distancia_km || 0).toFixed(2);
            const mins = Number(ruta.tiempo_minutos || 0);
            const avgSpd = Number(ruta.avg_speed || 0).toFixed(1);
            const maxSpd = Number(ruta.max_speed || (avgSpd * 1.35)).toFixed(1);
            const pts = Number(ruta.puntos || 0);
            const fechaFormateada = ruta.fecha ? new Date(ruta.fecha).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}) : '--/--';
            const rutaIdEsc = String(ruta.id).replace(/'/g, "\\'");
            const kcal = Math.round((6.0 + (Number(avgSpd) > 5 ? 1.5 : 0)) * 75 * (mins / 60));
            
            return `
            <div role="button" tabindex="0" onclick="if(window.verRutaEnMapa) window.verRutaEnMapa('${rutaIdEsc}'); else if(window.cargarRutaDeportivaEnMapa) window.cargarRutaDeportivaEnMapa(window.__rutasUsuarioCache?.get('${rutaIdEsc}'));" class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[24px] p-5 shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-xl hover:border-water dark:hover:border-sky-500 transition-all duration-300 relative overflow-hidden group cursor-pointer active:scale-[0.99]" title="Trazar ruta en el mapa">
                <div class="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-water/10 dark:from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                <div class="flex justify-between items-center mb-3 border-b border-slate-50 dark:border-slate-700/50 pb-3 relative z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-800/20 text-sky-500 flex items-center justify-center text-lg border border-sky-200 dark:border-sky-700/50 shadow-inner group-hover:scale-110 transition-transform duration-300">🗺️</div>
                        <div>
                            <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none mb-1.5">${fechaFormateada}</p>
                            <span class="text-sm font-black text-marine dark:text-white truncate max-w-[150px] sm:max-w-[200px] block">${esc(ruta.title || 'Ruta Deportiva')}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="event.stopPropagation(); if(window.abrirModalDetallesRuta) window.abrirModalDetallesRuta('${rutaIdEsc}');" class="bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer">
                            <span>🧠</span> Coach
                        </button>
                        <div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-sm">
                            <span class="text-amber-500 text-xs drop-shadow-sm">🏆</span>
                            <span class="text-[11px] font-black text-amber-600 dark:text-amber-400">+${pts} XP</span>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 px-1 relative z-10 text-center">
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50 pr-1">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Distancia</span>
                        <p class="font-black text-marine dark:text-white text-base tracking-tight">${dist}<span class="text-[9px] font-bold text-slate-400 ml-0.5">km</span></p>
                    </div>
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50 pr-1">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Tiempo</span>
                        <p class="font-black text-marine dark:text-white text-base tracking-tight">${mins}<span class="text-[9px] font-bold text-slate-400 ml-0.5">m</span></p>
                    </div>
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50 pr-1">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Vel. Med</span>
                        <p class="font-black text-marine dark:text-white text-base tracking-tight">${avgSpd}<span class="text-[9px] font-bold text-slate-400 ml-0.5">k/h</span></p>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Vel. Máx</span>
                        <p class="font-black text-emerald-600 dark:text-emerald-400 text-base tracking-tight">${maxSpd}<span class="text-[9px] font-bold text-slate-400 ml-0.5">k/h</span></p>
                    </div>
                </div>
                <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between flex-wrap gap-2 text-[10px]">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onclick="event.stopPropagation(); if(window.abrirRutaSocialEnMapa) window.abrirRutaSocialEnMapa('${rutaIdEsc}'); else if(window.verRutaEnMapa) window.verRutaEnMapa('${rutaIdEsc}');" class="px-2.5 py-1 bg-marine hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>🗺️</span><span>Mapa</span>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); if(window.descargarGpxRutaSocial) window.descargarGpxRutaSocial('${rutaIdEsc}');" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>📲</span><span>GPX</span>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); if(window.mostrarModalSplitsKm) window.mostrarModalSplitsKm('${rutaIdEsc}');" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>📊</span><span>Splits</span>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); if(window.abrirModalDetallesRuta) window.abrirModalDetallesRuta('${rutaIdEsc}');" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>🧠</span><span>Coach</span>
                        </button>
                        ${isMe ? `
                        <button type="button" onclick="event.stopPropagation(); if(window.eliminarRutaUsuario) window.eliminarRutaUsuario('${rutaIdEsc}');" class="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Eliminar ruta">
                            <span>🗑️</span><span>Eliminar</span>
                        </button>
                        ` : ''}
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-black rounded-lg border border-amber-200 dark:border-amber-700/50">🔥 ~${kcal} kcal</span>
                    </div>
                </div>
            </div>`;
        }).join('');
        content.innerHTML = html + '</div>';
    }
    else if (tab === 'insignias') {
        let meritBlock = '';
        if (window.evaluarLogrosUsuario && window.renderizarVitrinaLogrosMerito) {
            const logros = window.evaluarLogrosUsuario(spaCurrentUser, null, []);
            meritBlock = window.renderizarVitrinaLogrosMerito(logros);
        }
        
        const insigniasCodigos = spaCurrentUser.insignias || [];
        if(!insigniasCodigos.length) {
            return content.innerHTML = meritBlock || '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Vitrina vacía.</p></div>';
        }
        
        const { data: catalogo } = await supabaseClient.from('catalog_insignias').select('*').in('codigo', insigniasCodigos);
        
        let html = meritBlock + '<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 pb-4">';
        if(catalogo) {
            html += catalogo.map(item => {
                const nombreEsc = esc(item.nombre);
                return `
                <div class="flex flex-col items-center justify-center bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 p-5 border border-slate-200 dark:border-slate-700 rounded-3xl text-center shadow-lg shadow-slate-200/50 dark:shadow-none hover:-translate-y-2 hover:shadow-2xl hover:border-amber-200 dark:hover:border-amber-700/50 transition-all duration-300 relative overflow-hidden group">
                    <div class="absolute inset-0 bg-gradient-to-tr from-amber-100/30 to-transparent dark:from-amber-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div class="w-16 h-16 mx-auto bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-md border border-slate-100 dark:border-slate-700 mb-3 group-hover:scale-110 transition-transform duration-300 relative z-10">
                        <span class="text-4xl drop-shadow-md">${esc(item.icono || '🏅')}</span>
                    </div>
                    <p class="text-[11px] font-black text-marine dark:text-white uppercase tracking-widest leading-tight relative z-10 px-1">${nombreEsc}</p>
                    ${item.descripcion ? `<p class="text-[9px] text-slate-400 dark:text-slate-500 mt-2 font-bold leading-relaxed relative z-10 px-2 hidden group-hover:block transition-all">${esc(item.descripcion)}</p>` : ''}
                </div>`;
            }).join('');
        }
        content.innerHTML = html + '</div>';
    } else if (tab === 'amigos') {
        if(typeof Social.cargarTabAmigosSPA === 'function') Social.cargarTabAmigosSPA();
    }
}

// ====================================================
// RANKING 2.0 - MULTICATEGORÍA, ÁMBITOS Y LIGA DE CLUBES
// ====================================================

export const rankingState = {
    periodo: 'historico',
    scope: 'global',
    category: 'km_total'
};

export function actualizarEstilosFiltrosRanking() {
    // 1. Period tabs
    ['diario', 'semanal', 'mensual', 'anual', 'historico', 'clubes'].forEach(t => {
        const id = `tabRank${t.charAt(0).toUpperCase() + t.slice(1)}`;
        const b = document.getElementById(id);
        if (!b) return;
        const isActive = (t === 'clubes' && rankingState.scope === 'liga_clubes') || (t === rankingState.periodo && rankingState.scope !== 'liga_clubes');
        if (isActive) {
            b.className = "h-8 px-3 bg-marine dark:bg-water text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow flex-shrink-0 transition-colors cursor-pointer";
        } else {
            b.className = "h-8 px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold uppercase tracking-widest rounded-lg flex-shrink-0 transition-colors cursor-pointer";
        }
    });

    // 2. Scope tabs (#rankingScopeTabs)
    const scopes = [
        { key: 'global', id: 'scopeRankGlobal' },
        { key: 'mi_club', id: 'scopeRankMiClub' },
        { key: 'amigos', id: 'scopeRankAmigos' },
        { key: 'liga_clubes', id: 'scopeRankLigaClubes' }
    ];
    scopes.forEach(s => {
        const b = document.getElementById(s.id);
        if (!b) return;
        const isActive = (rankingState.scope === s.key);
        if (isActive) {
            b.className = "h-7 px-2.5 bg-marine dark:bg-water text-white text-[10px] font-bold rounded-lg flex-shrink-0 cursor-pointer shadow-sm transition-colors";
        } else {
            b.className = "h-7 px-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold rounded-lg flex-shrink-0 cursor-pointer transition-colors";
        }
    });

    // 3. Category tabs (#rankingCategoryTabs)
    const categories = [
        { key: 'km_total', id: 'catRankKmTotal' },
        { key: 'max_route', id: 'catRankMaxRoute' },
        { key: 'best_speed', id: 'catRankBestSpeed' },
        { key: 'xp_total', id: 'catRankXpTotal' }
    ];
    categories.forEach(c => {
        const b = document.getElementById(c.id);
        if (!b) return;
        const isActive = (rankingState.category === c.key);
        if (isActive) {
            b.className = "h-7 px-2.5 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700 text-[9px] font-black rounded-lg flex-shrink-0 cursor-pointer transition-colors shadow-xs";
        } else {
            b.className = "h-7 px-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent text-[9px] font-black rounded-lg flex-shrink-0 cursor-pointer transition-colors";
        }
    });
}

export function cambiarAmbitoRanking(scope) {
    rankingState.scope = scope;
    actualizarRankingCompleto();
}

export function cambiarCategoriaRanking(category) {
    rankingState.category = category;
    actualizarRankingCompleto();
}

export function cargarTopPaddlers(p) {
    if (p === 'clubes') {
        rankingState.scope = 'liga_clubes';
    } else {
        rankingState.periodo = p;
        if (rankingState.scope === 'liga_clubes') {
            rankingState.scope = 'global';
        }
    }
    actualizarRankingCompleto();
}

export function abrirModalRanking() {
    const trackingPanel = document.getElementById('liveTrackingPanel');
    if (trackingPanel && !trackingPanel.classList.contains('hidden')) {
        return alert("⚠️ Finaliza o cancela la grabación de la travesía GPS antes de abrir los menús.");
    }

    const m = document.getElementById('rankingModal');
    if (m) {
        m.classList.remove('hidden');
        setTimeout(() => {
            m.classList.remove('opacity-0');
            const box = m.querySelector('div');
            if (box) box.classList.remove('scale-95');
        }, 10);
        actualizarRankingCompleto();
    }
}

export function cerrarModalRanking() {
    const m = document.getElementById('rankingModal');
    if (m) {
        m.classList.add('opacity-0');
        const box = m.querySelector('div');
        if (box) box.classList.add('scale-95');
        setTimeout(() => { m.classList.add('hidden'); }, 300);
    }
}

export function abrirDetalleClubDesdeRanking(clubId) {
    if (!clubId) return;
    cerrarModalRanking();
    if (window.ClubPublic && typeof window.ClubPublic.open === 'function') {
        window.ClubPublic.open(clubId);
    } else if (window.Club && typeof window.Club.abrirClub === 'function') {
        window.Club.abrirClub(clubId);
    } else {
        import('./club/club.public.js').then(mod => {
            if (mod.ClubPublic && mod.ClubPublic.open) mod.ClubPublic.open(clubId);
        }).catch(e => console.warn('Aviso abriendo detalle club:', e));
    }
}

function renderizarRankingUsuarios(ranking, currentUserRank, podioContainer, listaContainer, miPosicionBar, category) {
    if (!ranking || ranking.length === 0) {
        if (podioContainer) podioContainer.innerHTML = '';
        listaContainer.innerHTML = `
            <div class="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                <span class="text-3xl block mb-2 opacity-50">🏄‍♂️</span>
                <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Sin actividad en este periodo</p>
                <p class="text-[10px] text-slate-400 mt-1">¡Sal a remar o sube tu archivo GPX para puntuar!</p>
            </div>
        `;
        if (miPosicionBar) {
            miPosicionBar.innerHTML = `
                <div class="flex items-center justify-between w-full text-slate-500 dark:text-slate-400">
                    <span class="text-[10px] font-bold">🏁 Tu puesto: Sin clasificar</span>
                    <span class="text-[10px] font-semibold text-water dark:text-sky-400">Registra una travesía para puntuar</span>
                </div>
            `;
        }
        return;
    }

    const p1 = ranking[0] || null;
    const p2 = ranking[1] || null;
    const p3 = ranking[2] || null;

    // Cachear rutas de podio para visualización en mapa si aplica
    [p1, p2, p3].forEach(p => {
        if (p && p.routeId && p.route) {
            if (!window.socialRoutesCache) window.socialRoutesCache = {};
            window.socialRoutesCache[String(p.routeId)] = p.route;
        }
    });

    if (podioContainer) {
        const podioFn = window.renderizarPodioTop3Ranking || renderizarPodioTop3Ranking;
        if (typeof podioFn === 'function') {
            podioContainer.innerHTML = podioFn(ranking);
        }
    }

    // Leaderboard desde la posición 4
    const resto = ranking.slice(3);
    if (resto.length === 0) {
        listaContainer.innerHTML = '<div class="text-center py-4 text-[10px] text-slate-400 font-bold uppercase tracking-wider">Todos los participantes están en el podio.</div>';
    } else {
        listaContainer.innerHTML = resto.map(pd => {
            const avatarEsc = esc(safeUrl(pd.avatar_url, IMG_FALLBACK));
            const nombreEsc = esc(pd.nombre);

            let previewBtn = '';
            if ((category === 'max_route' || category === 'best_speed') && pd.routeId) {
                if (pd.route) {
                    if (!window.socialRoutesCache) window.socialRoutesCache = {};
                    window.socialRoutesCache[String(pd.routeId)] = pd.route;
                }
                previewBtn = `
                    <button type="button" onclick="event.stopPropagation(); if(window.abrirRutaSocialEnMapa) window.abrirRutaSocialEnMapa('${esc(pd.routeId)}');" class="px-2 py-1 bg-sky-50 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800 text-water dark:text-sky-300 hover:bg-water hover:text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer mr-2 flex items-center gap-1 active:scale-95 shrink-0" title="Ver travesía en mapa">
                        <span>🗺️</span><span>Ver</span>
                    </button>
                `;
            }

            return `
                <div role="button" tabindex="0" onclick="navigateSPA('/user/${esc(pd.id)}')" class="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-800/80 hover:shadow-md cursor-pointer w-full mb-1.5 transition-all group">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="w-6 text-[11px] font-black text-slate-400 group-hover:text-water text-center shrink-0">#${pd.rank}</span>
                        <img src="${avatarEsc}" onerror="if(window.handleAvatarError){window.handleAvatarError(this)}else{this.onerror=null;this.src='${IMG_FALLBACK}';}" class="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs" alt="${nombreEsc}">
                        <div class="min-w-0">
                            <p class="text-xs font-bold truncate text-marine dark:text-white group-hover:text-water transition-colors">${nombreEsc}</p>
                            <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Nivel ${pd.nivel}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0 pl-2">
                        ${previewBtn}
                        <div class="text-right">
                            <p class="text-sm font-black text-water dark:text-sky-400 leading-none">${esc(pd.metricLabel)}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Sticky position HUD
    if (miPosicionBar) {
        if (currentUserRank) {
            miPosicionBar.innerHTML = `
                <div class="flex items-center justify-between w-full gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="w-7 h-7 rounded-full bg-water/20 text-water dark:bg-sky-900/50 dark:text-sky-300 font-black text-xs flex items-center justify-center shrink-0">
                            #${currentUserRank.rank}
                        </div>
                        <div class="min-w-0">
                            <p class="text-[11px] font-black text-slate-800 dark:text-white truncate">Tu puesto: #${currentUserRank.rank} de ${currentUserRank.totalParticipantes} <span class="text-water dark:text-sky-400 ml-1">(${currentUserRank.metricLabel})</span></p>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">${esc(currentUserRank.gapMessage)}</p>
                        </div>
                    </div>
                    <button type="button" onclick="navigateSPA('/user/${esc(currentUserRank.id)}')" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg shrink-0 transition-colors cursor-pointer">
                        Mi Perfil
                    </button>
                </div>
            `;
        } else {
            miPosicionBar.innerHTML = `
                <div class="flex items-center justify-between w-full text-slate-500 dark:text-slate-400">
                    <span class="text-[10px] font-bold">🏁 Tu puesto: Sin clasificar</span>
                    <span class="text-[10px] font-semibold text-water dark:text-sky-400">Registra una travesía para puntuar</span>
                </div>
            `;
        }
    }
}

function renderizarLigaClubes(clubsRanking, podioContainer, listaContainer, miPosicionBar, myUserId, membershipsData) {
    if (podioContainer) podioContainer.innerHTML = '';

    if (!clubsRanking || clubsRanking.length === 0) {
        listaContainer.innerHTML = `
            <div class="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                <span class="text-3xl block mb-2 opacity-50">🛡️</span>
                <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Sin actividad de clubes</p>
                <p class="text-[10px] text-slate-400 mt-1">Crea o únete a un club y registra salidas para liderar la liga.</p>
            </div>
        `;
        if (miPosicionBar) {
            miPosicionBar.innerHTML = `<span class="text-[10px] text-slate-400 font-bold">Sin clubes clasificados en este periodo.</span>`;
        }
        return;
    }

    listaContainer.innerHTML = clubsRanking.map((c, i) => {
        const logoEsc = esc(safeUrl(c.logo_url, IMG_FALLBACK));
        const nombreEsc = esc(c.nombre);
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${c.rank}`;

        return `
            <div class="flex items-center justify-between p-3.5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-800/90 hover:shadow-md transition-all gap-3 w-full mb-2 group">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="w-7 text-xs font-black text-slate-400 group-hover:text-water text-center shrink-0">${medal}</span>
                    <img src="${logoEsc}" onerror="if(window.handleAvatarError){window.handleAvatarError(this)}else{this.onerror=null;this.src='${IMG_FALLBACK}';}" class="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs" alt="${esc(c.nombre || 'Club')}">
                    <div class="min-w-0">
                        <p class="text-sm font-black text-marine dark:text-white truncate group-hover:text-water transition-colors">${nombreEsc}</p>
                        <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-bold flex-wrap">
                            <span class="inline-flex items-center gap-0.5">👥 ${c.paddlersCount} riders</span>
                            <span>•</span>
                            <span class="inline-flex items-center gap-0.5">📏 ${c.km_total} km</span>
                            <span>•</span>
                            <span class="inline-flex items-center gap-0.5">🏄 ${c.total_rutas} salidas</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button type="button" onclick="abrirDetalleClubDesdeRanking('${esc(c.id)}')" class="px-3 py-1.5 bg-marine dark:bg-water hover:opacity-90 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer">
                        Ver Club
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Highlight user's club in sticky position HUD
    if (miPosicionBar) {
        let userClubId = null;
        if (myUserId && Array.isArray(membershipsData)) {
            const mem = membershipsData.find(m => String(m.user_id) === String(myUserId));
            if (mem) userClubId = String(mem.club_id);
        }

        if (userClubId) {
            const myClubRank = clubsRanking.find(c => String(c.id) === userClubId);
            if (myClubRank) {
                miPosicionBar.innerHTML = `
                    <div class="flex items-center justify-between w-full">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-base">🛡️</span>
                            <p class="text-[11px] font-black text-slate-800 dark:text-white truncate">Tu club: ${esc(myClubRank.nombre)} <span class="text-water dark:text-sky-400 font-bold ml-1">(Puesto #${myClubRank.rank} • ${myClubRank.metricLabel})</span></p>
                        </div>
                        <button type="button" onclick="abrirDetalleClubDesdeRanking('${esc(myClubRank.id)}')" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg shrink-0 transition-colors cursor-pointer">
                            Ver
                        </button>
                    </div>
                `;
            } else {
                miPosicionBar.innerHTML = `
                    <div class="flex items-center justify-between w-full text-slate-500 dark:text-slate-400">
                        <span class="text-[10px] font-bold">🛡️ Tu club aún no tiene actividad en este periodo</span>
                        <span class="text-[10px] font-semibold text-water dark:text-sky-400">¡Suma kilómetros para tu equipo!</span>
                    </div>
                `;
            }
        } else {
            miPosicionBar.innerHTML = `
                <div class="flex items-center justify-between w-full text-slate-500 dark:text-slate-400">
                    <span class="text-[10px] font-bold">🛡️ Liga de Clubes</span>
                    <button type="button" onclick="cerrarModalRanking(); if(window.abrirModalClubs) window.abrirModalClubs();" class="text-[10px] font-bold text-water dark:text-sky-400 hover:underline cursor-pointer">
                        Únete a un club para competir →
                    </button>
                </div>
            `;
        }
    }
}

export async function actualizarRankingCompleto() {
    actualizarEstilosFiltrosRanking();

    const podioContainer = document.getElementById('rankingPodioContainer');
    const listaContainer = document.getElementById('rankingLista');
    const miPosicionBar = document.getElementById('rankingMiPosicionBar');

    if (!listaContainer) return;
    listaContainer.innerHTML = `<p class="text-[10px] text-center py-6 text-slate-400 animate-pulse uppercase tracking-widest w-full">Calculando clasificación...</p>`;
    if (podioContainer) podioContainer.innerHTML = '';
    if (miPosicionBar) miPosicionBar.innerHTML = `<span class="text-[10px] text-slate-400 animate-pulse font-bold">Cargando tu posición...</span>`;

    const myUserId = appState.sesionActual?.user?.id || null;

    try {
        // Consultar fuentes de datos unificadas
        const [
            { data: urData },
            { data: legData },
            { data: perfilesData },
            { data: clubsData },
            { data: membershipsData },
            { data: friendshipsData }
        ] = await Promise.all([
            supabaseClient.from('user_routes').select('id, user_id, title, distance_km, duration_seconds, avg_speed, max_speed, xp_earned, created_at, route_coordinates'),
            supabaseClient.from('rutas').select('id, user_id, distancia_km, tiempo_minutos, fecha, avg_speed_kmh, points_earned, ruta_json'),
            supabaseClient.from('perfiles').select('id, nombre, avatar_url, nivel, titulo, km_totales, puntos, is_private'),
            supabaseClient.from('clubs').select('id, nombre, logo_url, descripcion, nivel'),
            supabaseClient.from('clubs_usuarios').select('club_id, user_id, rol'),
            supabaseClient.from('amistades').select('usuario_id, amigo_id, estado').eq('estado', 'aceptada')
        ]);

        // Unificar rutas normalizadas
        const rutasUnificadas = [];
        if (Array.isArray(urData)) {
            urData.forEach(r => {
                rutasUnificadas.push({
                    id: r.id,
                    user_id: r.user_id,
                    title: r.title || 'Travesía Deportiva',
                    distance_km: Number(r.distance_km || 0),
                    duration_seconds: Number(r.duration_seconds || 0),
                    avg_speed: Number(r.avg_speed || 0),
                    max_speed: Number(r.max_speed || 0),
                    xp_earned: Number(r.xp_earned || 0),
                    created_at: r.created_at,
                    route_coordinates: r.route_coordinates
                });
            });
        }
        if (Array.isArray(legData)) {
            legData.forEach(r => {
                if (!rutasUnificadas.some(x => String(x.id) === String(r.id))) {
                    const dist = Number(r.distancia_km || 0);
                    const durSec = Number(r.tiempo_minutos || 0) * 60;
                    const avg = Number(r.avg_speed_kmh || (durSec > 0 ? (dist / (durSec / 3600)) : 0));
                    rutasUnificadas.push({
                        id: r.id,
                        user_id: r.user_id,
                        title: 'Travesía GPS',
                        distance_km: dist,
                        duration_seconds: durSec,
                        avg_speed: avg,
                        max_speed: avg * 1.35,
                        xp_earned: Number(r.points_earned || (Math.round(dist * 10) + Math.round(durSec / 60))),
                        created_at: r.fecha,
                        route_coordinates: r.ruta_json
                    });
                }
            });
        }

        // Ejecutar motor multicategoría
        const engineFn = window.calcularDatosRankingMulticategoria || calcularDatosRankingMulticategoria;
        const res = engineFn({
            periodo: rankingState.periodo,
            scope: rankingState.scope,
            category: rankingState.category,
            rutasData: rutasUnificadas,
            perfilesData: perfilesData || [],
            clubsData: clubsData || [],
            membershipsData: membershipsData || [],
            friendshipsData: friendshipsData || [],
            currentUserId: myUserId
        });

        // Renderizar banner de Reto Mensual de Club si el ámbito es 'mi_club'
        const bannerChallengeEl = document.getElementById('rankingClubChallengeBanner');
        if (bannerChallengeEl) {
            if (rankingState.scope === 'mi_club' && myUserId) {
                const miClubId = membershipsData?.find(m => String(m.user_id) === String(myUserId))?.club_id;
                if (miClubId) {
                    try {
                        let retos = [];
                        if (typeof window.obtenerRetosClub === 'function') {
                            retos = await window.obtenerRetosClub(miClubId);
                        } else {
                            const raw = localStorage.getItem('ps_club_challenges_' + miClubId);
                            if (raw) retos = JSON.parse(raw);
                        }
                        const now = new Date();
                        const retoActivo = (retos || []).find(r => {
                            const fin = r.fecha_fin ? new Date(r.fecha_fin) : null;
                            return !fin || fin >= now;
                        }) || (retos && retos[0]);

                        if (retoActivo) {
                            const clubMemberIds = membershipsData.filter(m => String(m.club_id) === String(miClubId)).map(m => String(m.user_id));
                            const rutasClub = rutasUnificadas.filter(r => clubMemberIds.includes(String(r.user_id)));
                            const pData = calcularProgresoRetoClub(retoActivo, rutasClub, [myUserId]);
                            const porcentaje = pData.porcentaje || 0;
                            const aporteStr = pData.miProgreso?.valorLabel || `${pData.miProgreso?.valor || 0}`;

                            bannerChallengeEl.innerHTML = `
                                <div class="p-3 bg-gradient-to-r from-marine to-blue-900 text-white rounded-2xl shadow-md border border-cyan-400/30 flex flex-col gap-2">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <span class="text-xl flex-shrink-0">🏆</span>
                                            <div class="min-w-0">
                                                <p class="text-[9px] font-black uppercase tracking-wider text-cyan-300">Reto Mensual del Club</p>
                                                <h4 class="text-xs font-black truncate">${esc(retoActivo.titulo)}</h4>
                                            </div>
                                        </div>
                                        <button type="button" onclick="window.cerrarModalRanking(); window.abrirModalClubs(); setTimeout(() => { if (window.Club && window.Club.cambiarVistaInterna) window.Club.cambiarVistaInterna('retos'); }, 150);" class="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-[10px] font-black rounded-lg border border-white/20 transition-all cursor-pointer flex-shrink-0">Ver Retos</button>
                                    </div>
                                    <div class="w-full bg-black/30 rounded-full h-2 overflow-hidden">
                                        <div class="bg-gradient-to-r from-water to-cyan-400 h-full rounded-full transition-all duration-500" style="width: ${porcentaje}%"></div>
                                    </div>
                                    <div class="flex justify-between items-center text-[9px] font-bold text-slate-200">
                                        <span>Progreso: ${porcentaje}% (${pData.progresoTotalLabel || ''})</span>
                                        <span>Tu aporte: ${aporteStr}</span>
                                    </div>
                                </div>`;
                            bannerChallengeEl.classList.remove('hidden');
                        } else {
                            bannerChallengeEl.classList.add('hidden');
                            bannerChallengeEl.innerHTML = '';
                        }
                    } catch (eBanner) {
                        console.warn('[Ranking] Error renderizando banner de reto:', eBanner);
                        bannerChallengeEl.classList.add('hidden');
                        bannerChallengeEl.innerHTML = '';
                    }
                } else {
                    bannerChallengeEl.classList.add('hidden');
                    bannerChallengeEl.innerHTML = '';
                }
            } else {
                bannerChallengeEl.classList.add('hidden');
                bannerChallengeEl.innerHTML = '';
            }
        }

        // Renderizar según ámbito
        if (rankingState.scope === 'liga_clubes') {
            renderizarLigaClubes(res.ranking, podioContainer, listaContainer, miPosicionBar, myUserId, membershipsData);
        } else {
            renderizarRankingUsuarios(res.ranking, res.currentUserRank, podioContainer, listaContainer, miPosicionBar, rankingState.category);
        }

    } catch (err) {
        console.error('[Ranking] Error calculando ranking:', err);
        listaContainer.innerHTML = `<p class="text-[10px] text-center py-6 text-red-500 font-bold uppercase tracking-widest w-full">Error al cargar la clasificación.</p>`;
    }
}

/**
 * Elimina una ruta deportiva propia con confirmación y purga de caché
 */
export async function eliminarRutaUsuario(rutaId) {
    if (!rutaId) return;
    if (!appState.sesionActual || appState.esInvitado) {
        if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
        else alert("Debes iniciar sesión para realizar esta acción.");
        return;
    }

    if (!confirm("¿Estás seguro de que deseas eliminar esta ruta deportiva? Esta acción no se puede deshacer.")) {
        return;
    }

    const userId = appState.sesionActual.user.id;

    try {
        const { error: err1 } = await supabaseClient
            .from('rutas')
            .delete()
            .eq('id', rutaId)
            .eq('user_id', userId);
        if (err1) throw err1;

        try {
            await supabaseClient
                .from('user_routes')
                .delete()
                .eq('id', rutaId)
                .eq('user_id', userId);
        } catch (_) {}

        // Limpiar cachés de memoria
        if (window.__rutasUsuarioCache) {
            window.__rutasUsuarioCache.delete(String(rutaId));
        }
        if (window.socialRoutesCache) {
            delete window.socialRoutesCache[String(rutaId)];
        }

        // Refrescar lista de rutas o eliminar tarjeta
        if (typeof window.cambiarTabPerfilSPA === 'function') {
            window.cambiarTabPerfilSPA('rutas');
        } else {
            const card = document.querySelector(`[data-ruta-id="${rutaId}"]`);
            if (card) card.remove();
        }

        alert("✅ Ruta eliminada correctamente.");
    } catch (err) {
        console.error("Error al eliminar ruta de usuario:", err);
        alert("❌ Error al eliminar la ruta: " + (err.message || err));
    }
}

// Bindings globales a window
window.navigateSPA = navigateSPA;
window.goBackSPA = goBackSPA;
window.handleSPA = handleSPA;
window.abrirPerfilPublicoSPA = abrirPerfilPublicoSPA;
window.cambiarTabPerfilSPA = cambiarTabPerfilSPA;
window.eliminarRutaUsuario = eliminarRutaUsuario;
window.abrirModalRanking = abrirModalRanking;
window.cerrarModalRanking = cerrarModalRanking;
window.cargarTopPaddlers = cargarTopPaddlers;
window.cambiarAmbitoRanking = cambiarAmbitoRanking;
window.cambiarCategoriaRanking = cambiarCategoriaRanking;
window.actualizarRankingCompleto = actualizarRankingCompleto;
window.abrirDetalleClubDesdeRanking = abrirDetalleClubDesdeRanking;
window.obtenerModalActivo = obtenerModalActivo;
window.cerrarModalActivo = cerrarModalActivo;
window.inicializarManejadorNavegacionModales = inicializarManejadorNavegacionModales;
window.formatearTiempo = window.formatearTiempo || formatearTiempo;
window.aplicarActualizacionPwa = window.aplicarActualizacionPwa || function(nuevoHash) {
    if (typeof window.aplicarActualizacionPwa === 'function') {
        window.aplicarActualizacionPwa(nuevoHash);
    } else {
        window.location.reload();
    }
};
// Asegurar que en pantallas de escritorio ambas columnas se muestren simultáneamente
window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        const tabBasico = document.getElementById('tab-basico');
        const tabPro = document.getElementById('tab-pro');
        if (tabBasico) { tabBasico.classList.remove('hidden'); tabBasico.classList.add('block'); }
        if (tabPro) { tabPro.classList.remove('hidden'); tabPro.classList.add('flex'); }
    }
}); // resizeMobileCockpitListener

// Auto-inicializar Leaflet en escritorio si tab-pro es visible
if (typeof window !== 'undefined') {
    const autoInitDesktopMap = () => {
        if (window.innerWidth >= 1024 && typeof MapModule.inicializarMapa === 'function' && typeof window.L !== 'undefined' && !window.map) {
            MapModule.inicializarMapa();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInitDesktopMap);
    } else {
        autoInitDesktopMap();
    }
}
