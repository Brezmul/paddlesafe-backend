// ====================================================
// js/main.js - ORQUESTADOR PRINCIPAL (PUNTO DE ENTRADA)
// ====================================================

import { supabaseClient, appState } from './config.js';
import { IMG_FALLBACK, esc, safeUrl } from './utils.js'; // AÑADIDO: esc y safeUrl
import * as Auth from './auth.js';
import * as MapModule from './map.js';
import * as Social from './social.js';

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
window.reiniciarPuntosQuedada = () => MapModule.reiniciarPuntosQuedada();
window.guardarQuedadaDesdeMapa = () => MapModule.guardarQuedadaDesdeMapa();
window.cargarRutaEnMapaGrande = (...args) => MapModule.cargarRutaEnMapaGrande(...args);

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

    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const strHoy = `${hoy.getFullYear()}-${mes}-${dia}`;
    if (document.getElementById('date')) document.getElementById('date').value = strHoy;
    if (document.getElementById('proDate')) document.getElementById('proDate').value = strHoy;

    if (supabaseClient && supabaseClient.auth) {
        try {
            if (Auth.initAuthListeners) Auth.initAuthListeners();
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                appState.sesionActual = session;
                appState.esInvitado = false;
                await Auth.cargarPerfilUsuarioActivo();
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarAplicacion, { once: true });
} else {
    inicializarAplicacion();
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
        avatarEl.src = user.avatar_url || IMG_FALLBACK || '';
        // Fallback robusto nativo para evitar roturas visuales por CORS
        avatarEl.onerror = function() { this.onerror=null; this.src=IMG_FALLBACK; };
        
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
                    <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Este usuario ha ocultado su diario de navegación.</p>
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
        
        let html = bannerUpload + '<div class="space-y-4 mt-2 pb-4">';
        html += rutas.map(ruta => {
            const dist = Number(ruta.distancia_km || 0).toFixed(2);
            const mins = Number(ruta.tiempo_minutos || 0);
            const avgSpd = Number(ruta.avg_speed || 0).toFixed(1);
            const maxSpd = Number(ruta.max_speed || (avgSpd * 1.35)).toFixed(1);
            const pts = Number(ruta.puntos || 0);
            const fechaFormateada = ruta.fecha ? new Date(ruta.fecha).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}) : '--/--';
            const rutaIdEsc = String(ruta.id).replace(/'/g, "\\'");
            
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
                <div class="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-water dark:group-hover:text-sky-400 transition-colors">
                    <span class="flex items-center gap-1 font-bold">📍 Trazar en mapa interactivo</span>
                    <span class="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">🧠 Ver Análisis IA →</span>
                </div>
            </div>`;
        }).join('');
        content.innerHTML = html + '</div>';
    }
    else if (tab === 'insignias') {
        const insigniasCodigos = spaCurrentUser.insignias || [];
        if(!insigniasCodigos.length) return content.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Vitrina vacía.</p></div>';
        
        const { data: catalogo } = await supabaseClient.from('catalog_insignias').select('*').in('codigo', insigniasCodigos);
        
        let html = '<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 pb-4">';
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

export function abrirModalRanking() {
    const trackingPanel = document.getElementById('liveTrackingPanel');
    if (trackingPanel && !trackingPanel.classList.contains('hidden')) {
        return alert("⚠️ Finaliza o cancela la grabación de la travesía GPS antes de abrir los menús.");
    }

    const m = document.getElementById('rankingModal');
    if(m) {
        m.classList.remove('hidden');
        setTimeout(() => {
            m.classList.remove('opacity-0');
            m.querySelector('div').classList.remove('scale-95');
        }, 10);
        cargarTopPaddlers('historico');
    }
}

export function cerrarModalRanking() {
    const m = document.getElementById('rankingModal');
    if(m) {
        m.classList.add('opacity-0');
        m.querySelector('div').classList.add('scale-95');
        setTimeout(() => { m.classList.add('hidden'); }, 300);
    }
}

export async function cargarTopPaddlers(p) {
    ['Diario','Semanal','Mensual','Anual','Historico','Clubes'].forEach(t => {
        const b=document.getElementById(`tabRank${t}`);
        if(b) b.className="h-8 px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest rounded-lg flex-shrink-0 transition-colors cursor-pointer";
    });
    
    const bA = document.getElementById(`tabRank${p.charAt(0).toUpperCase()+p.slice(1)}`); 
    if(bA) bA.className="h-8 px-3 bg-marine dark:bg-water text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow flex-shrink-0 transition-colors cursor-pointer";
    
    const l = document.getElementById('rankingLista'); 
    if(!l) return;
    l.innerHTML = `<p class="text-[10px] text-center py-6 text-slate-400 animate-pulse uppercase tracking-widest w-full">Calculando...</p>`;
    
    if (p === 'clubes') {
        const { data: rankingClubs, error: errorClubs } = await supabaseClient.rpc('get_ranking_clubs_v2', { periodo: p });
        if(!rankingClubs || !rankingClubs.length) 
             return l.innerHTML=`<p class="text-[10px] text-center py-6 text-slate-400 uppercase tracking-widest w-full">Sin clubes.</p>`;
             
        l.innerHTML = rankingClubs.map((c, i) => {
            const logoEsc = esc(safeUrl(c.logo_url, IMG_FALLBACK));
            const nombreEsc = esc(c.nombre);
            return `
            <div class="flex items-center gap-3 p-3 border border-slate-100 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 hover:shadow-md w-full mb-2 transition-shadow">
                <span class="w-6 text-[10px] font-black text-slate-400 text-center flex-shrink-0">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
                <img src="${logoEsc}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-slate-100 dark:border-slate-700">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold truncate text-marine dark:text-white w-full">${nombreEsc}</p>
                </div>
                <div class="text-right flex-shrink-0 pl-2">
                    <p class="text-lg font-black text-water leading-none">${c.puntos_periodo}</p>
                    <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">PTS</p>
                </div>
            </div>`;
        }).join('');
    } else {
        const { data: rankingRiders, error: errorRiders } = await supabaseClient.rpc('get_ranking_riders', { periodo: p });
        if(!rankingRiders || !rankingRiders.length) 
             return l.innerHTML=`<p class="text-[10px] text-center py-6 text-slate-400 uppercase tracking-widest w-full">Sin actividad reciente.</p>`;
             
        l.innerHTML = rankingRiders.map((pd, i) => {
            const avatarEsc = esc(safeUrl(pd.avatar_url, IMG_FALLBACK));
            const nombreEsc = esc(pd.nombre);
            return `
            <div role="button" tabindex="0" onclick="navigateSPA('/user/${esc(pd.id)}')" class="flex items-center gap-3 p-3 border border-slate-100 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 hover:shadow-md cursor-pointer w-full mb-2 transition-shadow">
                <span class="w-6 text-[10px] font-black text-slate-400 text-center flex-shrink-0">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
                <img src="${avatarEsc}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full object-cover flex-shrink-0 border border-slate-100 dark:border-slate-700">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold truncate text-marine dark:text-white w-full">${nombreEsc}</p>
                </div>
                <div class="text-right flex-shrink-0 pl-2">
                    <p class="text-lg font-black text-water leading-none">${pd.puntos_periodo}</p>
                    <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">PTS</p>
                </div>
            </div>`;
        }).join('');
    }
}

window.navigateSPA = navigateSPA;
window.goBackSPA = goBackSPA;
window.handleSPA = handleSPA;
window.abrirPerfilPublicoSPA = abrirPerfilPublicoSPA;
window.cambiarTabPerfilSPA = cambiarTabPerfilSPA;
window.abrirModalRanking = abrirModalRanking;
window.cerrarModalRanking = cerrarModalRanking;
window.cargarTopPaddlers = cargarTopPaddlers;