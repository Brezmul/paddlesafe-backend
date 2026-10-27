// ====================================================
// js/auth.js - AUTENTICACIÓN, PERFIL Y STORAGE
// ====================================================

import { supabaseClient, appState, BACKEND_API_URL } from './config.js';
import { esc, safeUrl, validarImagen, comprimirImagenCliente, calcularRangoMaritimo, IMG_FALLBACK, fetchConTimeout } from './utils.js';
import { parseGPX } from './gpxParser.js';
import {
    calcularNivelYProgreso,
    obtenerPosicionRanking,
    guardarRutaDeportivaConGamificacion,
    CATALOGO_LOGROS_MERITO,
    calcularRecordsYEstadisticasPerfil,
    evaluarLogrosUsuario
} from './gamification.js';

export function initAuthListeners() {
    if (supabaseClient && supabaseClient.auth) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') { setTimeout(abrirModalRecuperacionFinal, 500); return; }
            if (event === 'INITIAL_SESSION') return;
            
            const mismoUsuario = session?.user?.id && session.user.id === appState.perfilUsuario?.id;
            appState.sesionActual = session;
            appState.esInvitado = false;
            
            if (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && mismoUsuario)) return;
            
            setTimeout(async () => {
                if (session) {
                    await cargarPerfilUsuarioActivo();
                    inicializarPresenciaRealtime(session.user);
                    if (event === 'SIGNED_IN') {
                        window.sincronizarRutasPendientes?.();
                        window.cargarSpotsGuardadosUsuario?.();
                    }
                }
                else { 
                    if (presenceChannel) {
                        try {
                            presenceChannel.untrack();
                            presenceChannel.unsubscribe();
                        } catch (_) {}
                        presenceChannel = null;
                        currentPresenceUser = null;
                    }
                    appState.perfilUsuario = null; 
                    actualizarBotonCabecera(); 
                    window.cargarSpotsGuardadosUsuario?.();
                }
                
                const modal = document.getElementById('authModal');
                if (modal && !modal.classList.contains('hidden') && appState.sesionActual && !document.getElementById('nuevaPassword') && appState.perfilUsuario) cerrarModalAuth();
            }, 0);
        });
    }
}

// ====================================================
// REALTIME PRESENCE ENGINE (Global Channel)
// ====================================================
let presenceChannel = null;
let currentPresenceUser = null;
let currentPresenceStatus = 'online';

export function inicializarPresenciaRealtime(user) {
    if (!user || !user.id || !supabaseClient || typeof supabaseClient.channel !== 'function') return;
    
    // Si ya está suscrito con el mismo usuario, solo actualizar estado
    if (presenceChannel && currentPresenceUser?.id === user.id) {
        actualizarMiEstadoPresencia('online');
        return;
    }

    // Limpieza de canal previo si existiera
    if (presenceChannel) {
        try {
            presenceChannel.untrack();
            presenceChannel.unsubscribe();
        } catch (_) {}
        presenceChannel = null;
    }

    currentPresenceUser = user;
    currentPresenceStatus = 'online';

    try {
        presenceChannel = supabaseClient.channel('presence:paddlesafe_global', {
            config: {
                presence: {
                    key: user.id
                }
            }
        });

        presenceChannel.on('presence', { event: 'sync' }, () => {
            try {
                const state = presenceChannel.presenceState();
                const flattened = {};
                Object.values(state).forEach(presences => {
                    if (Array.isArray(presences)) {
                        presences.forEach(p => {
                            if (p && p.user_id) {
                                flattened[p.user_id] = {
                                    status: p.status || 'online',
                                    updatedAt: p.updated_at || new Date().toISOString()
                                };
                            }
                        });
                    }
                });
                appState.onlineUsers = flattened;
                if (typeof window !== 'undefined' && typeof window.actualizarUIPresencia === 'function') {
                    window.actualizarUIPresencia();
                }
            } catch (syncErr) {
                console.warn('[presence] sync error:', syncErr);
            }
        });

        presenceChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                try {
                    await presenceChannel.track({
                        user_id: user.id,
                        status: currentPresenceStatus || 'online',
                        updated_at: new Date().toISOString()
                    });
                } catch (trErr) {
                    // Degradar silenciosamente si se excede la cuota de sockets
                    console.warn('[presence] track error:', trErr);
                }
            }
        });
    } catch (chanErr) {
        console.warn('[presence] channel initialization error:', chanErr);
    }
}

export async function actualizarMiEstadoPresencia(status = 'online') {
    if (!presenceChannel || !currentPresenceUser) return;
    currentPresenceStatus = status;
    try {
        await presenceChannel.track({
            user_id: currentPresenceUser.id,
            status: status,
            updated_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[presence] actualizarMiEstadoPresencia error:', e);
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (!presenceChannel || !currentPresenceUser) return;
        if (document.visibilityState === 'hidden') {
            if (window.isTracking !== true) {
                actualizarMiEstadoPresencia('away');
            }
        } else if (document.visibilityState === 'visible') {
            if (window.isTracking === true) {
                actualizarMiEstadoPresencia('in_water');
            } else {
                actualizarMiEstadoPresencia('online');
            }
        }
    });
}

export async function cargarPerfilUsuarioActivo() {
    if (!appState.sesionActual?.user) return;
    const userId = appState.sesionActual.user.id;
    let { data, error } = await supabaseClient.from('perfiles').select('*').eq('id', userId).maybeSingle();
    if (error) console.warn('[perfil] lectura:', error.message);
    if (!data && !error) {
        const nuevo = { id: userId, nombre: (appState.sesionActual.user.email || 'Paddler').split('@')[0] };
        const { data: creado } = await supabaseClient.from('perfiles').upsert([nuevo], { onConflict: 'id', ignoreDuplicates: true }).select().maybeSingle();
        data = creado || nuevo;
    }
    if (data) { 
        appState.perfilUsuario = data; 
        actualizarBotonCabecera(); 
        if (window.socialNotifications && typeof window.socialNotifications.cargarNotificaciones === 'function') {
            window.socialNotifications.cargarNotificaciones();
        }
        if (typeof window.cargarSpotsGuardadosUsuario === 'function') {
            window.cargarSpotsGuardadosUsuario();
        }
    }
}

export function actualizarBotonPerfilNav() {
    const navBtn = document.getElementById('btnNavPerfil');
    if (!navBtn) return;
    const iconContainer = navBtn.querySelector('#navPerfilIcon');
    const labelContainer = navBtn.querySelector('#navPerfilLabel');
    if ((appState.sesionActual || appState.esInvitado) && appState.perfilUsuario) {
        if (iconContainer) {
            const avatarUrl = esc(safeUrl(appState.perfilUsuario.avatar_url, IMG_FALLBACK));
            iconContainer.innerHTML = `<img src="${avatarUrl}" alt="Avatar" onerror="if(window.handleAvatarError){window.handleAvatarError(this)}else{this.onerror=null;this.parentElement.textContent='👤';}" class="w-5 h-5 rounded-full object-cover border border-sky-400 inline-block shadow-sm">`;
        }
        if (labelContainer) {
            labelContainer.textContent = esc(appState.perfilUsuario.nombre || 'Perfil');
        }
    } else {
        if (iconContainer) {
            iconContainer.textContent = '👤';
        }
        if (labelContainer) {
            labelContainer.textContent = 'Perfil';
        }
    }
}

export function actualizarBotonCabecera() {
    const btn = document.getElementById('btnCabeceraPerfil');
    if (!btn) return;
    if ((appState.sesionActual || appState.esInvitado) && appState.perfilUsuario) {
        btn.innerHTML = `
            <div class="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-700 rounded-full pr-3 pl-1 py-1 border border-slate-700 transition-colors">
                <img src="${esc(safeUrl(appState.perfilUsuario.avatar_url, IMG_FALLBACK))}" onerror="if(window.handleAvatarError){window.handleAvatarError(this)}else{this.onerror=null;this.src='${IMG_FALLBACK}';}" class="w-7 h-7 rounded-full object-cover border border-slate-600" alt="Avatar">
                <span class="text-[10px] sm:text-xs font-bold text-white truncate max-w-[80px]">${esc(appState.perfilUsuario.nombre)}</span>
            </div>`;
    } else {
        btn.innerHTML = `
            <svg class="h-7 w-7 sm:h-8 sm:w-8 drop-shadow-md text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-[11px] sm:text-xs font-black mt-1 uppercase tracking-widest text-white/80">Perfil</span>`;
    }
    actualizarBotonPerfilNav();
}

export function abrirModalAuth() {
    // Defensive UX: Bloqueamos apertura si el usuario está en plena travesía GPS
    const trackingPanel = document.getElementById('liveTrackingPanel');
    if (trackingPanel && !trackingPanel.classList.contains('hidden')) {
        return alert("⚠️ Finaliza o cancela la grabación de la travesía GPS antes de abrir los menús.");
    }

    restaurarFormularioAuth();
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.remove('hidden');
        setTimeout(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); }, 10);
    }
}

export function cerrarModalAuth() {
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.add('opacity-0'); m.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            m.classList.add('hidden');
            if (typeof window.activarItemBottomNav === 'function' && window.innerWidth < 1024) {
                const tabPro = document.getElementById('tab-pro');
                const isPro = tabPro && !tabPro.classList.contains('hidden');
                window.activarItemBottomNav(isPro ? 'pro' : 'parte');
            }
        }, 300);
    }
}

export function restaurarFormularioAuth() {
    const c = document.getElementById('authModalContent');
    if(!c) return;
    appState.isLoginMode = true;
    if ((appState.sesionActual && appState.perfilUsuario) || appState.esInvitado) {
        const avatarSrc = esc(safeUrl(appState.perfilUsuario?.avatar_url, IMG_FALLBACK));
        const horasNav = Math.floor((appState.perfilUsuario?.tiempo_total || 0) / 60);
        const minNav = (appState.perfilUsuario?.tiempo_total || 0) % 60;
        const pts = appState.perfilUsuario?.total_xp ?? appState.perfilUsuario?.puntos ?? 0;
        const distTot = Number(appState.perfilUsuario?.total_distance_km ?? appState.perfilUsuario?.km_totales ?? 0).toFixed(1);
        const progresoGamif = calcularNivelYProgreso(pts);
        const nivelActual = progresoGamif.nivel;
        const rango = calcularRangoMaritimo(pts);
        
        let insigniasHTML = `<p class="text-[10px] text-slate-400 dark:text-slate-500 font-medium my-2">Aún no has ganado insignias en quedadas.</p>`;
        if (appState.perfilUsuario?.insignias && appState.perfilUsuario.insignias.length > 0) {
            insigniasHTML = `<div class="grid grid-cols-3 sm:grid-cols-4 gap-3 justify-items-center mt-3">`;
            insigniasHTML += appState.perfilUsuario.insignias.map(rawIns => {
                const ins = typeof rawIns === 'string' ? { nombre: rawIns.replace(/_/g, ' '), icono: '🏅' } : rawIns; 
                return `
                    <div class="flex flex-col items-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-md hover:shadow-xl hover:-translate-y-2 transition-all duration-300 text-center w-full relative group">
                        <div class="absolute inset-0 bg-gradient-to-tr from-amber-200/20 to-transparent dark:from-amber-900/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span class="text-4xl drop-shadow-lg mb-3 transform group-hover:scale-110 transition-transform">${esc(ins.icono || '🏅')}</span>
                        <span class="text-[9px] sm:text-[10px] font-black text-marine dark:text-white uppercase tracking-widest leading-tight z-10 break-words w-full">${esc(ins.nombre)}</span>
                    </div>`;
            }).join('');
            insigniasHTML += `</div>`;
        }
        
        const disableInput = appState.esInvitado ? 'disabled' : '';
        const cursorInput = appState.esInvitado ? 'cursor-not-allowed' : 'cursor-pointer';
        const colorInput = appState.esInvitado ? 'bg-slate-400 dark:bg-slate-600' : 'bg-water hover:bg-sky-600';
        const bannerInvitado = appState.esInvitado ? `<div class="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold py-3 px-4 rounded-2xl mb-4 shadow-sm border border-blue-100 dark:border-blue-800/50">Modo Invitado: Tus rutas y avatar no se guardarán permanentemente.</div>` : '';
        
        c.innerHTML = `
            <div class="text-center pt-2 relative dark:bg-slate-900 rounded-b-3xl pb-6">
                ${bannerInvitado}
                <div class="relative inline-block mb-2 mt-4 group">
                    <img id="avatarPreview" src="${avatarSrc}" onerror="if(window.handleAvatarError){window.handleAvatarError(this)}else{this.onerror=null;this.src='${IMG_FALLBACK}';}" class="w-28 h-28 sm:w-32 sm:h-32 mx-auto rounded-full border-[6px] border-white dark:border-slate-800 shadow-xl bg-slate-50 dark:bg-slate-800 object-cover transition-all group-hover:scale-105" alt="Avatar">
                    <label for="avatarUpload" class="absolute bottom-2 right-2 ${colorInput} text-white rounded-full p-3 ${cursorInput} shadow-lg transition-transform hover:scale-110 border-4 border-white dark:border-slate-800">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                    </label>
                    <input type="file" id="avatarUpload" accept="image/jpeg, image/png, image/webp" class="hidden" onchange="subirAvatar(event)" ${disableInput}>
                </div>
                <div class="mb-6 mt-4">
                    <h2 class="text-2xl sm:text-3xl font-black text-marine dark:text-white leading-tight truncate px-6">
                        <input type="text" id="perfilNombre" value="${esc(appState.perfilUsuario?.nombre || 'Invitado')}" class="text-center bg-transparent border-b-2 border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-water dark:focus:border-sky-500 focus:outline-none transition-colors w-full dark:text-white pb-1" placeholder="Tu Nombre" ${disableInput}>
                    </h2>
                    <div class="inline-flex items-center justify-center gap-2 mt-2 bg-slate-50 dark:bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm">
                        <span class="text-xs sm:text-sm font-black text-water dark:text-sky-400 uppercase tracking-widest">${rango.titulo}</span>
                    </div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-[24px] p-6 mb-6 grid grid-cols-3 gap-4 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div class="absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br from-water/20 dark:from-sky-500/10 to-blue-500/5 rounded-full blur-3xl"></div>
                    <div class="flex flex-col items-center justify-center min-w-0 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-700/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-600 shadow-sm relative z-10 hover:-translate-y-1 transition-transform group">
                        <div class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-2 text-blue-500 group-hover:scale-110 transition-transform"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg></div>
                        <p class="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-widest mb-0.5">Puntos / XP</p>
                        <p class="text-marine dark:text-white text-xl font-black">${pts}</p>
                    </div>
                    <div class="flex flex-col items-center justify-center min-w-0 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-700/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-600 shadow-sm relative z-10 hover:-translate-y-1 transition-transform group">
                        <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-2 text-emerald-500 group-hover:scale-110 transition-transform"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg></div>
                        <p class="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-widest mb-0.5">Distancia</p>
                        <p class="text-marine dark:text-white text-xl font-black">${distTot}<span class="text-[10px] ml-0.5 text-slate-400">km</span></p>
                    </div>
                    <div class="flex flex-col items-center justify-center min-w-0 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-700/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-600 shadow-sm relative z-10 hover:-translate-y-1 transition-transform group">
                        <div class="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-2 text-amber-500 group-hover:scale-110 transition-transform"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                        <p class="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-widest mb-0.5">Tiempo</p>
                        <p class="text-marine dark:text-white text-xl font-black">${horasNav}h<span class="text-[10px] ml-0.5 text-slate-400">${minNav}m</span></p>
                    </div>
                </div>
                
                <!-- GAMIFICACIÓN: NIVEL Y PROGRESO XP -->
                <div class="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-6 mb-4 shadow-inner text-left relative overflow-hidden">
                    <div class="flex justify-between items-end mb-2.5">
                        <div class="flex items-center gap-1.5">
                            <span class="text-base">⚡</span>
                            <span class="text-xs font-black text-marine dark:text-white uppercase tracking-wider">Nivel ${progresoGamif.nivel}</span>
                        </div>
                        <span class="text-[10px] font-bold text-water dark:text-sky-400 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded-lg border border-blue-100 dark:border-blue-800/40">
                            ${progresoGamif.xpActualEnNivel} / ${progresoGamif.xpRangoNivel} XP <span class="text-slate-400 font-normal">(${progresoGamif.xpFaltante} XP para Nivel ${progresoGamif.nivel + 1})</span>
                        </span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden shadow-inner relative">
                        <div class="absolute top-0 left-0 h-full w-full bg-white/20"></div>
                        <div class="bg-gradient-to-r from-water to-blue-500 h-4 rounded-full shadow-md transition-all duration-1000 relative" style="width: ${progresoGamif.progresoPorcentaje}%">
                            <div class="absolute top-0 right-0 w-4 h-full bg-white/30 skew-x-12"></div>
                        </div>
                    </div>
                </div>

                <!-- POSICIÓN EN EL RANKING GLOBAL -->
                <div class="flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 p-4 rounded-3xl mb-4 shadow-xl relative overflow-hidden group">
                    <div class="flex items-center gap-3 relative z-10">
                        <div class="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform">
                            🏆
                        </div>
                        <div>
                            <p class="text-[9px] font-black uppercase tracking-widest text-indigo-300 mb-0.5">Clasificación Global</p>
                            <h4 id="perfilRankingTexto" class="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                                <span class="animate-pulse text-indigo-200 text-[11px]">Consultando ranking...</span>
                            </h4>
                        </div>
                    </div>
                    <button type="button" onclick="cerrarModalAuth(); if(window.abrirModalRanking) window.abrirModalRanking();" class="relative z-10 text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-400/40 text-indigo-200 px-3 py-2 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1">
                        <span>Ranking</span>
                        <span>→</span>
                    </button>
                </div>

                <!-- BOTÓN DESTACADO: SUBIR RUTA PARA SUMAR XP Y ESCALAR EN EL RANKING -->
                <div class="mb-8">
                    <button type="button" onclick="document.getElementById('gpxUploadInput')?.click()" class="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white p-4 sm:p-5 rounded-3xl shadow-xl shadow-teal-900/30 active:scale-[0.98] transition-all flex items-center justify-between cursor-pointer group border border-emerald-400/30 relative overflow-hidden ${appState.esInvitado ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}">
                        <div class="absolute -right-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform"></div>
                        <div class="flex items-center gap-3.5 relative z-10 text-left min-w-0">
                            <div class="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl shadow-inner group-hover:rotate-6 transition-transform shrink-0">
                                🚀
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <h4 class="text-xs sm:text-sm font-black text-white tracking-wide uppercase">Subir Ruta Deportiva</h4>
                                    <span class="text-[9px] font-black bg-white/25 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">GPX</span>
                                </div>
                                <p class="text-[11px] text-white/90 font-medium mt-0.5 truncate sm:whitespace-normal">Suma XP (+100/km), sube de nivel y escala en el ranking global</p>
                            </div>
                        </div>
                        <div class="relative z-10 bg-white text-marine font-black text-xs px-3.5 py-2.5 rounded-2xl shadow-md group-hover:bg-amber-300 group-hover:text-slate-900 transition-colors flex items-center gap-1.5 shrink-0 ml-2">
                            <span>Subir</span>
                            <span class="text-xs">📥</span>
                        </div>
                    </button>
                    <input type="file" id="gpxUploadInput" accept=".gpx,application/gpx+xml" class="hidden" onchange="subirArchivoGPX(event)" ${appState.esInvitado ? 'disabled' : ''}>
                </div>

                <!-- 🏅 RÉCORDS PERSONALES (PRs) -->
                <div id="perfilPRsContainer" class="w-full"></div>

                <!-- 🎯 META MENSUAL SUP -->
                <div id="perfilMetaMensualContainer" class="w-full"></div>

                <!-- 📊 VOLUMEN 8 SEMANAS CHART -->
                <div id="profileWeeklyChartContainer" class="w-full"></div>

                <!-- 🏆 VITRINA DE LOGROS MERITOCRÁTICOS ISA -->
                <div id="perfilVitrinaLogrosContainer" class="w-full mb-6"></div>
                <div class="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 rounded-3xl mb-8 shadow-md hover:shadow-lg transition-shadow">
                    <div class="flex items-center gap-3">
                        <div class="relative flex items-start">
                            <div class="flex items-center h-6">
                                <input type="checkbox" id="perfilPrivado" ${appState.perfilUsuario?.is_private ? 'checked' : ''} class="w-6 h-6 text-water bg-slate-100 border-slate-300 rounded focus:ring-water dark:focus:ring-sky-500 dark:ring-offset-slate-800 dark:bg-slate-700 dark:border-slate-600 transition-all cursor-pointer" ${disableInput}>
                            </div>
                            <div class="ml-3 text-sm flex flex-col">
                                <label for="perfilPrivado" class="font-black text-slate-700 dark:text-slate-200 cursor-pointer">Perfil Privado</label>
                                <span class="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Ocultar de la comunidad</span>
                            </div>
                        </div>
                    </div>
                    <button onclick="guardarPerfil()" id="btnGuardarPerfil" class="h-11 px-6 ${appState.esInvitado ? 'bg-slate-400 dark:bg-slate-600 cursor-not-allowed' : 'bg-marine dark:bg-white dark:text-marine hover:bg-slate-800 dark:hover:bg-slate-200'} text-white font-black rounded-xl shadow-lg text-[11px] uppercase tracking-widest transition-all active:scale-95">Guardar</button>
                </div>
                <div class="text-left mb-6">
                    <div class="flex items-center justify-between border-b-2 border-slate-100 dark:border-slate-800 pb-3 mb-5">
                        <h3 class="text-[11px] sm:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <svg class="w-4 h-4 text-water dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg> 
                            Diario de Aventuras
                        </h3>
                        <button type="button" onclick="document.getElementById('gpxUploadInput')?.click()" class="cursor-pointer bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 ${appState.esInvitado ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}">
                            <span>📥</span> Subir GPX
                        </button>
                    </div>
                    <div id="contenedorHistorial" class="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar pb-4"></div>
                </div>
                <button onclick="cerrarSesion()" class="w-full h-14 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-black uppercase tracking-widest text-[11px] rounded-2xl border-2 border-red-100 dark:border-red-900/30 transition-all shadow-sm active:scale-95">
                    ${appState.esInvitado ? 'Salir del Modo Invitado' : 'Cerrar Sesión'}
                </button>
                <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PaddleSafe v${window.__APP_VERSION__ || "6.0.0"}</p>
                    <button type="button" onclick="if(window.forzarActualizacion) window.forzarActualizacion(); else window.location.reload();" class="mt-1 text-[9px] text-water dark:text-sky-400 hover:underline font-bold uppercase tracking-wider cursor-pointer">🔄 Buscar actualizaciones / Limpiar caché</button>
                </div>
            </div>
        `;
        cargarHistorialRutas();
        actualizarBadgeRanking(pts);
        return;
    }
    
    c.innerHTML = `
        <div class="text-center mb-8 dark:bg-slate-900 pt-6 rounded-t-3xl relative">
            <div class="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
            <h2 id="authTitle" class="text-3xl sm:text-4xl font-black text-marine dark:text-white mb-2 tracking-tight">Iniciar Sesión</h2>
            <p class="text-slate-500 dark:text-slate-400 text-sm font-medium">Accede a tu diario y progreso en el mar.</p>
        </div>
        <div class="space-y-4 w-full dark:bg-slate-900 pb-4 px-2">
            <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path></svg></span>
                <input type="email" id="authEmail" class="block w-full h-14 pl-12 pr-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-water dark:focus:ring-sky-500 outline-none transition-all shadow-sm" placeholder="Correo electrónico">
            </div>
            <div class="relative hidden" id="authNombreContainer">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></span>
                <input type="text" id="authNombre" class="block w-full h-14 pl-12 pr-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-water dark:focus:ring-sky-500 outline-none transition-all shadow-sm" placeholder="Tu Nombre">
            </div>
            <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></span>
                <input type="password" id="authPassword" class="block w-full h-14 pl-12 pr-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-water dark:focus:ring-sky-500 outline-none transition-all shadow-sm" placeholder="Contraseña">
            </div>
            <button type="button" id="authSubmitBtn" onclick="procesarAuth()" class="w-full h-14 mt-4 bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-water/30 dark:shadow-none transition-transform active:scale-95 cursor-pointer">Entrar</button>
            <button type="button" id="authRegisterBtn" onclick="procesarAuth()" class="hidden w-full h-14 mt-4 bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-water/30 dark:shadow-none transition-transform active:scale-95 cursor-pointer">Registrarme</button>
            
            <div class="relative py-4 flex items-center">
                <div class="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                <span class="flex-shrink-0 mx-4 text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest">O</span>
                <div class="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <button type="button" onclick="entrarComoInvitado()" class="w-full h-14 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-2xl border-2 border-slate-100 dark:border-slate-700 active:scale-95 transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2">🏄‍♂️ Acceder como Invitado</button>
        </div>
        <div class="mt-4 text-center text-sm dark:bg-slate-900 pb-2">
            <span id="authToggleText" class="text-slate-500 dark:text-slate-400 font-medium">¿No tienes cuenta?</span> 
            <button type="button" onclick="toggleAuthMode()" class="text-water dark:text-sky-400 font-black cursor-pointer ml-1 hover:underline" id="authToggleBtn">Regístrate</button>
        </div>
        <div class="mt-4 text-center dark:bg-slate-900 pb-6">
            <button type="button" id="btnRecuperarPass" onclick="enviarEmailRecuperacion()" class="text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest transition-colors">¿Olvidaste tu contraseña?</button>
        </div>
    `;
}

export async function enviarEmailRecuperacion() {
    const email = document.getElementById('authEmail').value;
    if (!email) return alert("Por favor, escribe tu email en el campo de arriba y pulsa este botón.");
    const btn = document.getElementById('btnRecuperarPass');
    if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
    
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' });
    
    if (error) { alert("Error: " + error.message); } 
    else { alert("✅ Te hemos enviado un enlace para restablecer tu contraseña. Revisa tu email."); }
    
    if (btn) { btn.disabled = false; btn.textContent = "¿Olvidaste tu contraseña?"; }
}

export function abrirModalRecuperacionFinal() {
    const c = document.getElementById('authModalContent');
    if (!c) return;
    c.innerHTML = `
        <div class="text-center mb-8 dark:bg-slate-900 pt-8 rounded-t-3xl">
            <div class="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
            <h2 class="text-3xl font-black text-marine dark:text-white mb-2 tracking-tight">Nueva Contraseña</h2>
            <p class="text-slate-500 dark:text-slate-400 text-sm font-medium">Crea una contraseña nueva para volver a acceder a tu cuenta.</p>
        </div>
        <form class="space-y-4 w-full dark:bg-slate-900 pb-6 px-2" onsubmit="event.preventDefault(); guardarNuevaPassword()">
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-300" for="nuevaPassword">Nueva contraseña</label>
            <div class="relative -mt-2">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></span>
                <input type="password" id="nuevaPassword" minlength="6" autocomplete="new-password" required class="block w-full h-14 pl-12 pr-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm" placeholder="Mínimo 6 caracteres">
            </div>
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-300" for="confirmarNuevaPassword">Repite la contraseña</label>
            <div class="relative -mt-2">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></span>
                <input type="password" id="confirmarNuevaPassword" minlength="6" autocomplete="new-password" required class="block w-full h-14 pl-12 pr-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm" placeholder="Repite la nueva contraseña">
            </div>
            <button type="submit" id="guardarNuevaPasswordBtn" class="w-full h-14 mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/30 dark:shadow-none transition-transform active:scale-95 cursor-pointer">Guardar Contraseña</button>
        </form>
    `;
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.remove('hidden');
        setTimeout(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); }, 10);
    }
}

export async function guardarNuevaPassword() {
    const passwordInput = document.getElementById('nuevaPassword');
    const confirmInput = document.getElementById('confirmarNuevaPassword');
    const btn = document.getElementById('guardarNuevaPasswordBtn');
    if (!passwordInput || !confirmInput || !btn) return;

    const pass = passwordInput.value;
    if (pass.length < 6) return alert("La contraseña debe tener al menos 6 caracteres.");
    if (pass !== confirmInput.value) return alert("Las contraseñas no coinciden.");

    btn.disabled = true;
    btn.textContent = "Guardando...";
    const { error } = await supabaseClient.auth.updateUser({ password: pass });
    if (error) {
        alert("Error: " + error.message);
        btn.disabled = false;
        btn.textContent = "Guardar Contraseña";
    } else {
        alert("✅ Contraseña actualizada correctamente.");
        cerrarModalAuth();
        window.history.replaceState(null, null, window.location.pathname);
    }
}

export async function subirAvatar(event) {
    if (appState.esInvitado) return alert("Los invitados no pueden subir foto.");
    if (!appState.sesionActual) return alert("Sesión inválida.");
    const fileInput = event.target || document.getElementById('avatarUpload');
    const file = fileInput?.files?.[0];
    if (!file) return;
    
    const errImg = validarImagen(file); 
    if (errImg) { alert(errImg); if (fileInput) fileInput.value = ''; return; }
    
    const preview = document.getElementById('avatarPreview');
    if (preview) preview.style.opacity = '0.5';
    
    const mime = file.type || 'image/jpeg';
    
    // Nombramos el archivo SIEMPRE igual (solo con el ID de usuario) para evitar saturar el storage
    const filePath = `avatars/${appState.sesionActual.user.id}.jpg`;
    
    try {
        let fileToUpload = file;
        try {
            fileToUpload = await comprimirImagenCliente(file, 600, 0.84);
        } catch (eCompress) {
            console.warn('[subirAvatar] Error en compresión, usando original:', eCompress);
        }
        const mime = fileToUpload.type || 'image/jpeg';

        const { error: uploadError } = await supabaseClient.storage.from('paddlesafe').upload(filePath, fileToUpload, { upsert: true, contentType: mime });
        if (uploadError) throw uploadError;
        
        const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(filePath);
        
        // Cache-Buster para forzar al navegador a renderizar la nueva imagen
        const urlConCacheBuster = `${data.publicUrl}?t=${Date.now()}`;
        
        const { error: dbError } = await supabaseClient
            .from('perfiles')
            .upsert({ id: appState.sesionActual.user.id, avatar_url: urlConCacheBuster })
            .select();
        if (dbError) throw dbError;
        
        if (!appState.perfilUsuario) appState.perfilUsuario = {};
        appState.perfilUsuario.avatar_url = urlConCacheBuster;
        if (preview) preview.src = urlConCacheBuster;
        const modalAvatar = document.querySelector('#avatarPreview');
        if (modalAvatar) modalAvatar.src = urlConCacheBuster;
        actualizarBotonCabecera();
    } catch (error) {
        console.warn('Aviso al subir imagen:', error);
        alert("❌ Error al subir la imagen. Verifica tu conexión o formato.");
    } finally {
        if (preview) preview.style.opacity = '1';
        if (fileInput) fileInput.value = '';
    }
}

export async function guardarPerfil() {
    if (appState.esInvitado) return alert("Los invitados no pueden modificar su perfil. ¡Regístrate!");
    if (!appState.sesionActual) return alert("No hay sesión activa.");
    const nuevoNombre = document.getElementById('perfilNombre').value.trim().slice(0, 30);
    if (nuevoNombre.length < 2) return alert("El nombre debe tener entre 2 y 30 caracteres.");
    const esPrivado = document.getElementById('perfilPrivado').checked;
    const btn = document.getElementById('btnGuardarPerfil');
    
    btn.disabled = true; btn.textContent = "Guardando...";
    
    const { data: updatedProfile, error } = await supabaseClient
        .from('perfiles')
        .update({ 
            nombre: nuevoNombre, 
            is_private: esPrivado,
            es_privado: esPrivado 
        })
        .eq('id', appState.sesionActual.user.id)
        .select();
        
    if (error) {
        alert("❌ Error al guardar: " + error.message);
        btn.textContent = "Guardar";
        btn.disabled = false;
    } else if (!updatedProfile || updatedProfile.length === 0) {
        alert("❌ No se pudo guardar el perfil. Intenta de nuevo.");
        btn.textContent = "Guardar";
        btn.disabled = false;
    } else {
        if (!appState.perfilUsuario) appState.perfilUsuario = {};
        appState.perfilUsuario.nombre = nuevoNombre;
        appState.perfilUsuario.is_private = esPrivado;
        appState.perfilUsuario.es_privado = esPrivado;
        actualizarBotonCabecera();
        btn.textContent = "✅ Guardado!";
        setTimeout(() => { btn.textContent = "Guardar"; btn.disabled = false; }, 2000);
    }
}

export function toggleAuthMode() {
    appState.isLoginMode = !appState.isLoginMode;
    document.getElementById('authTitle').textContent = appState.isLoginMode ? "Iniciar Sesión" : "Crear Cuenta";
    document.getElementById('authToggleText').textContent = appState.isLoginMode ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?";
    document.getElementById('authToggleBtn').textContent = appState.isLoginMode ? "Regístrate" : "Inicia Sesión";
    const authNombreContainer = document.getElementById('authNombreContainer');
    if (authNombreContainer) authNombreContainer.classList.toggle('hidden', appState.isLoginMode);
    document.getElementById('authSubmitBtn').classList.toggle('hidden', !appState.isLoginMode);
    document.getElementById('authRegisterBtn').classList.toggle('hidden', appState.isLoginMode);
}

export async function procesarAuth() {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPassword').value;
    const nombre = document.getElementById('authNombre').value;
    const btn = appState.isLoginMode ? document.getElementById('authSubmitBtn') : document.getElementById('authRegisterBtn');
    
    if (!email || !pass) return alert("Rellena email y contraseña.");
    const tx = btn.textContent; btn.disabled = true; btn.textContent = "Procesando...";
    
    if (appState.isLoginMode) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
        if (error) { 
            alert("❌ Error: " + error.message); 
            btn.disabled = false; btn.textContent = tx; 
        } else if (!data.session) {
            alert("⚠️ Debes verificar tu correo electrónico antes de iniciar sesión.");
            btn.disabled = false; btn.textContent = tx;
        } else { 
            appState.sesionActual = data.session; 
            await cargarPerfilUsuarioActivo(); 
            cerrarModalAuth(); 
        }
    } else {
        const nombreLimpio = (nombre || '').trim().slice(0, 30) || email.split('@')[0];
        const { data, error } = await supabaseClient.auth.signUp({
            email, password: pass,
            options: { data: { full_name: nombreLimpio }, emailRedirectTo: window.location.origin + '/' }
        });
        
        btn.disabled = false; btn.textContent = tx;
        if (error) { alert("❌ Error: " + error.message); } 
        else if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) { 
            alert("⚠️ Ese email ya está registrado. Inicia sesión o recupera tu contraseña."); 
        } else if (data?.user && !data.session) { 
            alert("✅ Cuenta creada. Revisa tu email para confirmarla y después inicia sesión."); 
            cerrarModalAuth(); 
        } else { 
            appState.sesionActual = data.session; 
            await cargarPerfilUsuarioActivo(); 
            alert("🎉 ¡Registro completado!"); 
            cerrarModalAuth(); 
        }
    }
}

export async function cerrarSesion() {
    if (presenceChannel) {
        try {
            await presenceChannel.untrack();
            await presenceChannel.unsubscribe();
        } catch (_) {}
        presenceChannel = null;
        currentPresenceUser = null;
    }

    if (appState.esInvitado) { 
        appState.esInvitado = false; 
        appState.perfilUsuario = null; 
        actualizarBotonCabecera(); 
        cerrarModalAuth(); 
        window.location.reload(); 
        return; 
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] flex h-screen w-full items-center justify-center bg-marine font-bold text-white animate-pulse';
    overlay.style.zIndex = '9999';
    overlay.textContent = 'Cerrando sesión de forma segura...';
    document.body.appendChild(overlay);
    
    await supabaseClient.auth.signOut(); 
    window.location.reload(); 
}

export function entrarComoInvitado() {
    appState.esInvitado = true;
    appState.perfilUsuario = {
        id: appState.invitadoId, nombre: 'Invitado', nivel: 1, puntos: 0, km_totales: 0,
        is_private: true, insignias: [],
        avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${appState.invitadoId}&backgroundColor=e0f2fe`,
        titulo: 'Paddler', club_rol: 'ninguno'
    };
    actualizarBotonCabecera(); cerrarModalAuth();
}

export async function subirArchivoGPX(event) {
    if (appState.esInvitado) return alert("Los usuarios invitados no pueden guardar rutas. ¡Regístrate gratis!");
    if (!appState.sesionActual?.user) return alert("Debes iniciar sesión para subir tus rutas.");

    const fileInput = event?.target || document.getElementById('gpxUploadInput');
    const file = fileInput?.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gpx')) {
        alert("Por favor selecciona un archivo con formato .gpx válido.");
        if (fileInput) fileInput.value = '';
        return;
    }

    const contenedor = document.getElementById('contenedorHistorial');
    const prevHTML = contenedor ? contenedor.innerHTML : '';
    if (contenedor) {
        contenedor.innerHTML = `
            <div class="text-center py-8 bg-slate-50 dark:bg-slate-800/60 rounded-3xl border border-water/30 dark:border-sky-500/30 shadow-inner px-4 animate-pulse">
                <span class="text-3xl mb-2 inline-block">⏳</span>
                <p class="text-xs font-black text-marine dark:text-white uppercase tracking-wider mb-1">Procesando archivo GPX...</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500">Calculando distancia, velocidades con Haversine y tramos...</p>
            </div>
        `;
    }

    const reader = new FileReader();
    reader.onerror = () => {
        alert("❌ Error al leer el archivo desde tu dispositivo.");
        if (contenedor) contenedor.innerHTML = prevHTML;
        if (fileInput) fileInput.value = '';
    };

    reader.onload = async (e) => {
        try {
            const xmlContent = e.target.result;
            const parsed = parseGPX(xmlContent);

            if (!parsed.coordinates || parsed.coordinates.length < 2) {
                throw new Error("El archivo no contiene suficientes puntos GPS para registrar la ruta.");
            }

            // Extraer nombre de la ruta o fallback al nombre de archivo
            let routeName = 'Ruta en Paddle Surf';
            const nameMatch = xmlContent.match(/<name>([^<]+)<\/name>/i);
            if (nameMatch && nameMatch[1].trim()) {
                routeName = nameMatch[1].trim();
            } else if (file.name) {
                routeName = file.name.replace(/\.gpx$/i, '').replace(/[-_]/g, ' ').trim();
            }

            // Telemetría calculada punto a punto con Haversine y tiempo
            const distKm = Number(parsed.total_distance_km || parsed.distance_km || 0);
            const durSecs = Math.max(0, Math.round(Number(parsed.total_duration_seconds || parsed.duration_seconds || 0)));
            const durMins = Math.max(1, Math.round(durSecs / 60));
            const velMedia = Number(parsed.avg_speed_kmh || parsed.avg_speed || 0);
            const velMax = Number(parsed.max_speed_kmh || parsed.max_speed || (velMedia * 1.35));

            const resGuardado = await guardarRutaDeportivaConGamificacion({
                userId: appState.sesionActual.user.id,
                title: routeName,
                distanceKm: distKm,
                durationSeconds: durSecs,
                avgSpeed: velMedia,
                maxSpeed: velMax,
                routeCoordinates: parsed.coordinates,
                splitsData: parsed.splits || [],
                createdAt: parsed.startTime ? new Date(parsed.startTime).toISOString() : new Date().toISOString()
            });

            // Recargar perfil para refrescar XP, nivel y ranking en UI
            await cargarPerfilUsuarioActivo();
            restaurarFormularioAuth();

            const calculo = resGuardado.calculoXp;
            if (calculo.esTrampa) {
                alert(`⚠️ Ruta guardada, pero la velocidad media (${velMedia} km/h) superó los 45 km/h.\nSe ha clasificado como vehículo motorizado y no otorga XP.`);
            } else {
                const totalXpActual = Number(resGuardado.perfil?.total_xp || resGuardado.perfil?.puntos || 0);
                const { posicion } = await obtenerPosicionRanking(totalXpActual);
                
                let msgExito = `🎉 ¡Ruta subida con éxito!\n\n📍 ${routeName}\n📏 Distancia: ${distKm} km\n⏱️ Tiempo: ${durMins} min\n⚡ Vel. Media: ${velMedia} km/h\n🚀 Vel. Máx: ${velMax} km/h\n\n🏆 +${calculo.xpGanado} XP ganados (${calculo.xpBase} XP base${calculo.bonusVelocidad > 0 ? ' + 50 XP bonus velocidad' : ''})\n⭐ Nivel actual: ${resGuardado.perfil?.current_level || 1}\n🏅 Posición en el Ranking: #${posicion}`;
                if (resGuardado.subioDeNivel) {
                    msgExito += `\n\n🎊 ¡ENHORABUENA! ¡HAS SUBIDO AL NIVEL ${resGuardado.perfil.current_level}! 🚀`;
                }
                alert(msgExito);
            }

        } catch (err) {
            console.error("Error al procesar archivo GPX:", err);
            alert("❌ No se pudo procesar el archivo GPX: " + (err.message || err));
            if (contenedor) contenedor.innerHTML = prevHTML;
        } finally {
            if (fileInput) fileInput.value = '';
        }
    };

    reader.readAsText(file);
}

/**
 * Consulta unificada de rutas del usuario desde 'user_routes' y 'rutas' legacy.
 * Normaliza campos y sincroniza cachés globales en memoria.
 */
export async function obtenerRutasUnificadasUsuario(userId) {
    if (!userId || !supabaseClient) return [];
    const rutas = [];

    // 1. Consultar user_routes
    try {
        const { data: urData, error: urErr } = await supabaseClient
            .from('user_routes')
            .select('id, title, distance_km, duration_seconds, avg_speed, max_speed, xp_earned, created_at, route_coordinates, splits_data, ai_feedback')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (!urErr && Array.isArray(urData)) {
            urData.forEach(r => rutas.push({
                id: r.id,
                title: r.title || 'Ruta Deportiva',
                distance_km: Number(r.distance_km || 0),
                distancia_km: Number(r.distance_km || 0),
                duration_seconds: Number(r.duration_seconds || 0),
                tiempo_minutos: Math.max(1, Math.round(Number(r.duration_seconds || 0) / 60)),
                avg_speed: Number(r.avg_speed || 0),
                avg_speed_kmh: Number(r.avg_speed || 0),
                max_speed: Number(r.max_speed || 0),
                xp_earned: Number(r.xp_earned || 0),
                points_earned: Number(r.xp_earned || 0),
                created_at: r.created_at,
                fecha: r.created_at,
                route_coordinates: r.route_coordinates,
                ruta_json: r.route_coordinates,
                splits_data: r.splits_data,
                ai_feedback: r.ai_feedback
            }));
        }
    } catch (e) {
        console.warn("[obtenerRutasUnificadasUsuario] Error leyendo user_routes:", e);
    }

    // 2. Consultar tabla legacy rutas
    try {
        const { data: legData, error: legErr } = await supabaseClient
            .from('rutas')
            .select('id, distancia_km, tiempo_minutos, fecha, ruta_json, avg_speed_kmh, points_earned')
            .eq('user_id', userId)
            .order('fecha', { ascending: false });

        if (!legErr && Array.isArray(legData)) {
            legData.forEach(r => {
                if (!rutas.some(x => String(x.id) === String(r.id))) {
                    const dist = Number(r.distancia_km || 0);
                    const mins = Number(r.tiempo_minutos || 0);
                    const avg = Number(r.avg_speed_kmh || (mins > 0 ? (dist / (mins / 60)) : 0));
                    rutas.push({
                        id: r.id,
                        title: 'Travesía GPS',
                        distance_km: dist,
                        distancia_km: dist,
                        duration_seconds: mins * 60,
                        tiempo_minutos: mins,
                        avg_speed: avg,
                        avg_speed_kmh: avg,
                        max_speed: avg * 1.35,
                        xp_earned: Number(r.points_earned || (Math.round(dist * 10) + mins)),
                        points_earned: Number(r.points_earned || (Math.round(dist * 10) + mins)),
                        created_at: r.fecha,
                        fecha: r.fecha,
                        route_coordinates: r.ruta_json,
                        ruta_json: r.ruta_json
                    });
                }
            });
        }
    } catch (e) {
        console.warn("[obtenerRutasUnificadasUsuario] Error leyendo rutas:", e);
    }

    // Ordenar cronológicamente
    rutas.sort((a, b) => new Date(b.created_at || b.fecha).getTime() - new Date(a.created_at || a.fecha).getTime());

    // Sincronizar cachés globales
    if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
    if (!window.socialRoutesCache) window.socialRoutesCache = {};
    rutas.forEach(r => {
        window.__rutasUsuarioCache.set(String(r.id), r);
        window.socialRoutesCache[String(r.id)] = r;
    });

    return rutas;
}

/**
 * Renderiza el Grid de 4 tarjetas de Récords Personales (PRs).
 */
export function renderizarPRsGrid(stats) {
    if (!stats) return '';
    const { recordDistancia, recordVelocidad, recordDuracion, recordKcal } = stats;
    const formatFecha = (f) => f ? new Date(f).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '--';

    const renderCard = (icon, titulo, valor, unidad, bestObj) => {
        const tieneRuta = Boolean(bestObj && bestObj.rutaId);
        return `
            <div class="bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-850 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group relative overflow-hidden text-left">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-base">${icon}</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${formatFecha(bestObj?.fecha)}</span>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none mb-1">${titulo}</p>
                    <p class="text-base sm:text-lg font-black text-marine dark:text-white leading-tight">
                        ${valor}<span class="text-[10px] font-bold text-slate-400 ml-0.5">${unidad}</span>
                    </p>
                </div>
                <div class="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    ${tieneRuta ? `
                        <button type="button" onclick="if(window.abrirRutaSocialEnMapa) window.abrirRutaSocialEnMapa('${bestObj.rutaId}'); else if(window.verRutaEnMapa) window.verRutaEnMapa('${bestObj.rutaId}');" class="text-[9px] font-bold text-water dark:text-sky-400 hover:text-blue-600 flex items-center gap-1 active:scale-95 transition-transform cursor-pointer">
                            <span>🗺️</span><span>Ver mapa</span>
                        </button>
                    ` : `<span class="text-[9px] text-slate-300 dark:text-slate-600 font-medium">Sin registro</span>`}
                    <span class="text-[8px] font-black text-amber-500 bg-amber-50 dark:bg-amber-900/40 px-1 py-0.5 rounded border border-amber-200 dark:border-amber-700/50">PR</span>
                </div>
            </div>
        `;
    };

    const durH = Math.floor((recordDuracion?.durMin || 0) / 60);
    const durM = (recordDuracion?.durMin || 0) % 60;
    const durStr = durH > 0 ? `${durH}h ${durM}` : `${durM}`;
    const durUnit = durH > 0 ? 'm' : 'min';

    return `
        <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/80 rounded-3xl p-5 shadow-sm text-left mb-6">
            <div class="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🏅</span>
                    <h3 class="text-xs font-black text-marine dark:text-white uppercase tracking-widest">Récords Personales (PRs)</h3>
                </div>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Histórico</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                ${renderCard('📏', 'Distancia Máx', recordDistancia?.distKm ? recordDistancia.distKm.toFixed(2) : '0', 'km', recordDistancia)}
                ${renderCard('🚀', 'Vel. Media Máx', recordVelocidad?.velMedia ? recordVelocidad.velMedia.toFixed(1) : '0', 'km/h', recordVelocidad)}
                ${renderCard('⏱️', 'Mayor Duración', durStr, durUnit, recordDuracion)}
                ${renderCard('🔥', 'Gasto Calórico', recordKcal?.kcal ? recordKcal.kcal : '0', 'kcal', recordKcal)}
            </div>
        </div>
    `;
}

/**
 * Renderiza el widget de Meta Mensual SUP con selector rápido y racha activa.
 */
export function renderizarWidgetMetaMensual(stats) {
    const metaKm = Number(typeof localStorage !== 'undefined' ? (localStorage.getItem('ps_monthly_goal_km') || 50) : 50);
    const kmMesActual = Number(stats?.totales?.kmMesActual || 0);
    const pct = Math.min(100, Math.max(0, Math.round((kmMesActual / metaKm) * 100)));
    const racha = stats?.totales?.semanasRacha || 0;

    return `
        <div class="bg-gradient-to-br from-slate-900 to-indigo-950 border border-indigo-500/30 text-white rounded-3xl p-5 shadow-xl text-left mb-6 relative overflow-hidden">
            <div class="flex items-center justify-between mb-3 relative z-10">
                <div class="flex items-center gap-2">
                    <span class="text-xl">🎯</span>
                    <div>
                        <h3 class="text-xs font-black uppercase tracking-widest text-indigo-200">Meta Mensual SUP</h3>
                        <p class="text-[10px] text-slate-400">Objetivo de kilómetros para este mes</p>
                    </div>
                </div>
                <div class="bg-amber-500/20 border border-amber-400/40 text-amber-300 px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1">
                    <span>🔥</span>
                    <span>Racha: ${racha} ${racha === 1 ? 'semana' : 'semanas'}</span>
                </div>
            </div>

            <!-- Barra de Progreso -->
            <div class="mb-3 relative z-10">
                <div class="flex justify-between items-baseline mb-1.5">
                    <span class="text-lg font-black text-white">${kmMesActual.toFixed(1)} <span class="text-xs font-bold text-slate-400">/ ${metaKm} km</span></span>
                    <span class="text-xs font-black text-emerald-400">${pct}% completado</span>
                </div>
                <div class="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner border border-slate-700">
                    <div class="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-700 relative" style="width: ${pct}%">
                        <div class="absolute top-0 right-0 w-3 h-full bg-white/40 skew-x-12"></div>
                    </div>
                </div>
            </div>

            <!-- Selector rápido de objetivo -->
            <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 relative z-10">
                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ajustar Meta:</span>
                <div class="flex gap-1.5">
                    ${[30, 50, 100, 150].map(k => `
                        <button type="button" onclick="cambiarMetaMensual(${k})" class="px-2 py-0.5 rounded-lg text-[10px] font-black cursor-pointer transition-all ${metaKm === k ? 'bg-indigo-500 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}">
                            ${k}k
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

/**
 * Renderiza el gráfico de barras SVG responsive con el volumen de las últimas 8 semanas.
 */
export function renderizarGraficoVolumen8Semanas(volumen8Semanas = []) {
    const semanas = Array.isArray(volumen8Semanas) && volumen8Semanas.length > 0
        ? volumen8Semanas
        : Array.from({ length: 8 }, (_, i) => ({ label: `S-${7 - i}`, km: 0, salidas: 0 }));

    const maxKm = Math.max(10, ...semanas.map(s => s.km || 0));
    const total8SemKm = semanas.reduce((acc, s) => acc + (s.km || 0), 0).toFixed(1);

    const svgWidth = 320;
    const svgHeight = 110;
    const chartBottom = 88;
    const chartHeight = 65;
    const barWidth = 24;
    const totalBars = semanas.length;
    const step = (svgWidth - 20) / totalBars;

    const barsSvg = semanas.map((sem, idx) => {
        const kmVal = Number(sem.km || 0);
        const barH = kmVal > 0 ? Math.max(6, Math.round((kmVal / maxKm) * chartHeight)) : 2;
        const barX = Math.round(10 + idx * step + (step - barWidth) / 2);
        const barY = chartBottom - barH;
        const isCurrent = (idx === totalBars - 1);
        const fill = isCurrent ? '#06b6d4' : (kmVal > 0 ? '#0284c7' : '#94a3b8');
        const opacity = kmVal > 0 ? '1' : '0.2';

        return `
            <g class="transition-all hover:opacity-80 cursor-pointer" data-tooltip="${kmVal} km en ${sem.salidas || 0} salidas">
                <title>${sem.label}: ${kmVal} km (${sem.salidas || 0} salidas)</title>
                <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barH}" rx="4" fill="${fill}" opacity="${opacity}">
                    <animate attributeName="height" from="0" to="${barH}" dur="0.4s" fill="freeze" />
                </rect>
                ${kmVal > 0 ? `
                    <text x="${barX + barWidth / 2}" y="${barY - 3}" text-anchor="middle" font-size="8" font-weight="900" fill="#0284c7" class="dark:fill-sky-300">${kmVal}</text>
                ` : ''}
                <text x="${barX + barWidth / 2}" y="${chartBottom + 14}" text-anchor="middle" font-size="8" font-weight="700" fill="#94a3b8">${sem.label}</text>
            </g>
        `;
    }).join('');

    return `
        <div id="profileWeeklyChart" class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/80 rounded-3xl p-5 shadow-sm text-left mb-6">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="text-lg">📊</span>
                    <div>
                        <h3 class="text-xs font-black text-marine dark:text-white uppercase tracking-widest">Volumen 8 Semanas</h3>
                        <p class="text-[10px] text-slate-400">Consistencia y distancia semanal</p>
                    </div>
                </div>
                <span class="text-xs font-black text-marine dark:text-white bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-xl">
                    ${total8SemKm} <span class="text-[9px] font-bold text-slate-400">km total</span>
                </span>
            </div>
            <div class="w-full overflow-x-auto custom-scrollbar pt-2">
                <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="w-full h-28" preserveAspectRatio="none">
                    <line x1="8" y1="${chartBottom}" x2="${svgWidth - 8}" y2="${chartBottom}" stroke="#e2e8f0" stroke-width="1" class="dark:stroke-slate-700" />
                    ${barsSvg}
                </svg>
            </div>
        </div>
    `;
}

/**
 * Renderiza el escaparate de insignias y méritos ISA con cards iluminadas y barras de progreso.
 */
export function renderizarVitrinaLogrosMerito(logros = []) {
    if (!Array.isArray(logros) || logros.length === 0) {
        return `<p class="text-[10px] text-slate-400 font-medium">No hay insignias evaluadas aún.</p>`;
    }

    const cardsHtml = logros.map(l => {
        if (l.unlocked) {
            return `
                <div class="bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800/80 border-2 border-amber-300 dark:border-amber-500/50 rounded-2xl p-3 shadow-md flex flex-col justify-between text-center relative overflow-hidden group">
                    <div class="absolute top-1 right-1 bg-amber-400 text-slate-950 font-black text-[8px] px-1 rounded-full uppercase">✓</div>
                    <span class="text-3xl drop-shadow mb-1 transform group-hover:scale-110 transition-transform">${l.icono}</span>
                    <div>
                        <h4 class="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-wide leading-tight">${esc(l.nombre)}</h4>
                        <p class="text-[9px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-tight">${esc(l.descripcion)}</p>
                    </div>
                    <div class="mt-2 pt-1 border-t border-amber-100 dark:border-amber-900/30">
                        <span class="text-[8px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">DESBLOQUEADO</span>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-3 shadow-sm flex flex-col justify-between text-center opacity-70 hover:opacity-90 transition-opacity">
                    <span class="text-3xl grayscale mb-1 opacity-60">${l.icono}</span>
                    <div>
                        <h4 class="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wide leading-tight">${esc(l.nombre)}</h4>
                        <p class="text-[9px] text-slate-400 line-clamp-2 mt-0.5 leading-tight">${esc(l.descripcion)}</p>
                    </div>
                    <div class="mt-2 pt-1 border-t border-slate-100 dark:border-slate-700/40">
                        <div class="flex justify-between items-center text-[8px] text-slate-400 font-bold mb-1">
                            <span>Progreso</span>
                            <span>${l.progressText}</span>
                        </div>
                        <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-marine dark:bg-sky-500 h-full rounded-full" style="width: ${l.progressPct}%"></div>
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');

    return `
        <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/80 rounded-3xl p-5 shadow-sm text-left mb-6">
            <div class="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🏆</span>
                    <div>
                        <h3 class="text-xs font-black text-marine dark:text-white uppercase tracking-widest">Insignias y Méritos ISA</h3>
                        <p class="text-[10px] text-slate-400">Logros oficiales alcanzados en tus travesías</p>
                    </div>
                </div>
                <span class="text-[9px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-700/50">
                    ${logros.filter(x => x.unlocked).length} / ${logros.length}
                </span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                ${cardsHtml}
            </div>
        </div>
    `;
}

/**
 * Permite cambiar la meta mensual y actualiza la UI de forma reactiva instantánea.
 */
export function cambiarMetaMensual(metaKm) {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ps_monthly_goal_km', metaKm);
    }
    const metaEl = document.getElementById('perfilMetaMensualContainer');
    if (metaEl && window.__statsUsuarioActual) {
        metaEl.innerHTML = renderizarWidgetMetaMensual(window.__statsUsuarioActual);
    }
}

export async function cargarHistorialRutas() {
    const contenedor = document.getElementById('contenedorHistorial');
    if (!contenedor) return;
    
    if (appState.esInvitado) {
        const statsVacio = calcularRecordsYEstadisticasPerfil([]);
        const logrosVacio = evaluarLogrosUsuario(appState.perfilUsuario, statsVacio, []);
        
        const prsEl = document.getElementById('perfilPRsContainer');
        if (prsEl) prsEl.innerHTML = renderizarPRsGrid(statsVacio);

        const metaEl = document.getElementById('perfilMetaMensualContainer');
        if (metaEl) metaEl.innerHTML = renderizarWidgetMetaMensual(statsVacio);

        const chartEl = document.getElementById('profileWeeklyChartContainer');
        if (chartEl) chartEl.innerHTML = renderizarGraficoVolumen8Semanas(statsVacio.totales.volumen8Semanas);

        const vitrinaEl = document.getElementById('perfilVitrinaLogrosContainer');
        if (vitrinaEl) vitrinaEl.innerHTML = renderizarVitrinaLogrosMerito(logrosVacio);

        contenedor.innerHTML = `<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Los invitados no guardan historial.</p></div>`;
        return;
    }
    if (!appState.sesionActual?.user) return;

    contenedor.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs font-bold animate-pulse">Cargando tus rutas deportivas...</div>`;

    // 1. Obtener lista unificada de rutas (user_routes + rutas legacy)
    const rutas = await obtenerRutasUnificadasUsuario(appState.sesionActual.user.id);

    // 2. Calcular récords, totales y evaluar méritos
    const stats = calcularRecordsYEstadisticasPerfil(rutas);
    const logros = evaluarLogrosUsuario(appState.perfilUsuario, stats, rutas);
    window.__statsUsuarioActual = stats;

    // 3. Renderizar widgets de analítica y gamificación en el perfil
    const prsEl = document.getElementById('perfilPRsContainer');
    if (prsEl) prsEl.innerHTML = renderizarPRsGrid(stats);

    const metaEl = document.getElementById('perfilMetaMensualContainer');
    if (metaEl) metaEl.innerHTML = renderizarWidgetMetaMensual(stats);

    const chartEl = document.getElementById('profileWeeklyChartContainer');
    if (chartEl) chartEl.innerHTML = renderizarGraficoVolumen8Semanas(stats.totales.volumen8Semanas);

    const vitrinaEl = document.getElementById('perfilVitrinaLogrosContainer');
    if (vitrinaEl) vitrinaEl.innerHTML = renderizarVitrinaLogrosMerito(logros);

    if (rutas.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner px-4">
                <span class="text-3xl mb-2 block">🏄‍♂️</span>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Aún no has registrado rutas</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500">Pulsa en <b>"Subir GPX"</b> arriba para importar sesiones de tu reloj deportivo o app de móvil.</p>
            </div>`;
        return;
    }

    // 4. Renderizar tarjetas de rutas enriquecidas con telemetría y botones de acción
    contenedor.innerHTML = rutas.map(ruta => {
        const dist = Number(ruta.distance_km || ruta.distancia_km || 0).toFixed(2);
        const totalSecs = Number(ruta.duration_seconds || (ruta.tiempo_minutos ? ruta.tiempo_minutos * 60 : 0));
        const mins = Math.max(1, Math.round(totalSecs / 60));
        const avgSpd = Number(ruta.avg_speed || ruta.avg_speed_kmh || 0).toFixed(1);
        const maxSpd = Number(ruta.max_speed || (avgSpd * 1.3)).toFixed(1);
        const xp = Number(ruta.xp_earned || ruta.points_earned || 0);
        const fechaStr = (ruta.created_at || ruta.fecha) ? new Date(ruta.created_at || ruta.fecha).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Reciente';

        let kcal = ruta.kcal;
        if (!kcal) {
            if (typeof window !== 'undefined' && typeof window.calcularBiometriaSup === 'function') {
                try {
                    kcal = window.calcularBiometriaSup({ duracionMin: mins, distKm: Number(dist), velKmh: Number(avgSpd) })?.kcal;
                } catch {
                    kcal = null;
                }
            }
            if (!kcal) {
                kcal = Math.round((6.0 + (Number(avgSpd) > 5 ? 1.5 : 0)) * 75 * (mins / 60));
            }
        }

        return `
            <div onclick="verRutaEnMapa('${esc(ruta.id)}')" 
                 class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[24px] p-5 shadow-lg shadow-slate-200/40 dark:shadow-none hover:shadow-xl hover:border-water dark:hover:border-sky-500 transition-all duration-300 mb-4 relative overflow-hidden group cursor-pointer active:scale-[0.99]"
                 title="Haz clic para trazar esta ruta en el mapa">
                <div class="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-water/10 dark:from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                
                <div class="flex justify-between items-center mb-3 border-b border-slate-50 dark:border-slate-700/50 pb-3 relative z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-water/20 to-blue-500/10 dark:from-sky-900/40 dark:to-sky-800/20 text-water dark:text-sky-400 flex items-center justify-center text-xl border border-water/30 dark:border-sky-700/50 shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                            🗺️
                        </div>
                        <div>
                            <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none mb-1.5">${fechaStr}</p>
                            <h4 class="text-sm font-black text-marine dark:text-white truncate max-w-[150px] sm:max-w-[200px]">${esc(ruta.title)}</h4>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="event.stopPropagation(); abrirModalDetallesRuta('${esc(ruta.id)}')" class="bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer">
                            <span>🧠</span> Coach
                        </button>
                        <div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-sm">
                            <span class="text-amber-500 text-xs drop-shadow-sm">🏆</span>
                            <span class="text-[11px] font-black text-amber-600 dark:text-amber-400">+${xp} XP</span>
                        </div>
                        <span class="text-xs text-water dark:text-sky-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">📍</span>
                    </div>
                </div>

                <div class="grid grid-cols-4 gap-2 px-1 relative z-10 text-center">
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50 pr-1">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Distancia</span>
                        <p class="font-black text-marine dark:text-white text-base sm:text-lg tracking-tight">${dist}<span class="text-[9px] font-bold text-slate-400 ml-0.5">km</span></p>
                    </div>
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50 pr-1">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Tiempo</span>
                        <p class="font-black text-marine dark:text-white text-base sm:text-lg tracking-tight">${mins}<span class="text-[9px] font-bold text-slate-400 ml-0.5">m</span></p>
                    </div>
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50 pr-1">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Vel. Med</span>
                        <p class="font-black text-marine dark:text-white text-base sm:text-lg tracking-tight">${avgSpd}<span class="text-[9px] font-bold text-slate-400 ml-0.5">k/h</span></p>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-0.5">Vel. Máx</span>
                        <p class="font-black text-emerald-600 dark:text-emerald-400 text-base sm:text-lg tracking-tight">${maxSpd}<span class="text-[9px] font-bold text-slate-400 ml-0.5">k/h</span></p>
                    </div>
                </div>

                <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between flex-wrap gap-2 text-[10px]">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onclick="event.stopPropagation(); if(window.abrirRutaSocialEnMapa) window.abrirRutaSocialEnMapa('${esc(ruta.id)}'); else if(window.verRutaEnMapa) window.verRutaEnMapa('${esc(ruta.id)}');" class="px-2.5 py-1 bg-marine hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>🗺️</span><span>Mapa</span>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); if(window.descargarGpxRutaSocial) window.descargarGpxRutaSocial('${esc(ruta.id)}');" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>📲</span><span>GPX</span>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); if(window.mostrarModalSplitsKm) window.mostrarModalSplitsKm('${esc(ruta.id)}');" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>📊</span><span>Splits</span>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); abrirModalDetallesRuta('${esc(ruta.id)}');" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>🧠</span><span>Coach</span>
                        </button>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-black rounded-lg border border-amber-200 dark:border-amber-700/50">🔥 ~${kcal} kcal</span>
                    </div>
                </div>
            </div>`;
    }).join('');
}

export async function verRutaEnMapa(rutaId) {
    let ruta = window.__rutasUsuarioCache?.get(String(rutaId));
    if (!ruta && supabaseClient && rutaId) {
        try {
            const { data } = await supabaseClient.from('user_routes').select('*').eq('id', rutaId).maybeSingle();
            if (data) {
                ruta = data;
                if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
                window.__rutasUsuarioCache.set(String(data.id), data);
            } else {
                const { data: legacy } = await supabaseClient.from('rutas').select('*').eq('id', rutaId).maybeSingle();
                if (legacy) {
                    ruta = {
                        id: legacy.id,
                        title: 'Travesía GPS',
                        distance_km: Number(legacy.distancia_km || 0),
                        duration_seconds: Number(legacy.tiempo_minutos || 0) * 60,
                        avg_speed: Number(legacy.avg_speed_kmh || 0),
                        max_speed: Number(legacy.avg_speed_kmh || 0) * 1.35,
                        route_coordinates: legacy.ruta_json
                    };
                    if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
                    window.__rutasUsuarioCache.set(String(legacy.id), ruta);
                }
            }
        } catch (e) {
            console.warn('Error recuperando ruta para mapa:', e);
        }
    }
    if (!ruta) {
        alert("No se encontró la ruta seleccionada.");
        return;
    }
    if (typeof window.cargarRutaDeportivaEnMapa === 'function') {
        window.cargarRutaDeportivaEnMapa(ruta);
    } else {
        alert("El mapa no está listo todavía.");
    }
}

export async function actualizarBadgeRanking(totalXp) {
    const el = document.getElementById('perfilRankingTexto');
    if (!el) return;
    if (appState.esInvitado) {
        el.innerHTML = `<span class="text-slate-400 font-bold text-xs">Modo Invitado (Sin clasificar)</span>`;
        return;
    }
    try {
        const { posicion, totalUsuarios } = await obtenerPosicionRanking(totalXp);
        let medalla = '🎖️';
        if (posicion === 1) medalla = '🥇';
        else if (posicion === 2) medalla = '🥈';
        else if (posicion === 3) medalla = '🥉';

        el.innerHTML = `
            <span class="text-base">${medalla}</span>
            <span class="text-amber-400 font-black text-sm">#${posicion}</span>
            <span class="text-slate-200 font-bold text-xs">en el Ranking Global</span>
            <span class="text-indigo-300 text-[10px] font-normal">(${totalUsuarios} deportistas)</span>
        `;
    } catch (e) {
        el.innerHTML = `<span class="text-slate-300 font-bold text-xs">#-- en el Ranking</span>`;
    }
}

function generarAnalisisDeportivoFallback({ distance_km, duration_seconds, avg_speed, splits_data }) {
    const dist = Number(distance_km) || 0;
    const durSecs = Number(duration_seconds) || 0;
    const mins = Math.max(1, Math.round(durSecs / 60));
    const avg = Number(avg_speed) || (mins > 0 ? Number((dist / (mins / 60)).toFixed(1)) : 0);
    const splits = Array.isArray(splits_data) ? splits_data : [];

    if (splits.length >= 2) {
        let peorSplit = splits[0];
        let mejorSplit = splits[0];
        for (const s of splits) {
            if ((s.avg_speed_kmh || 0) < (peorSplit.avg_speed_kmh || 0)) peorSplit = s;
            if ((s.avg_speed_kmh || 0) > (mejorSplit.avg_speed_kmh || 0)) mejorSplit = s;
        }
        return {
            bien: `Iniciaste con potencia y gran cadencia, alcanzando en el km ${mejorSplit.km || 1} una velocidad de ${mejorSplit.avg_speed_kmh} km/h superior al promedio.`,
            mejora: `En el km ${peorSplit.km || 2} se registró la mayor caída de ritmo descendiendo a ${peorSplit.avg_speed_kmh} km/h por acumulación de fatiga.`,
            proxima_salida: `Dosifica en los primeros 1,000 metros para no caer de ${Number((avg * 0.95).toFixed(1))} km/h en el tramo final del recorrido.`
        };
    }
    return {
        bien: `Completaste una sesión continuada de ${dist} km a una velocidad media de ${avg} km/h.`,
        mejora: `En travesías breves la cadencia debe consolidarse desde la primera palada para evitar pérdidas de inercia.`,
        proxima_salida: `Alarga la sesión por encima de 3 km para testear tu resistencia en series más exigentes.`
    };
}

export async function solicitarFeedbackIARuta(ruta) {
    if (!ruta) return null;

    // 1. Comprobar si ya existe ai_feedback guardado (para NO volver a llamar a la IA)
    if (ruta.ai_feedback) {
        let f = ruta.ai_feedback;
        if (typeof f === 'string') {
            try { f = JSON.parse(f); } catch (e) { f = null; }
        }
        if (f && (f.bien || f.mejora || f.proxima_salida)) {
            return f;
        }
    }

    // 2. Si no está en memoria, verificar en la tabla user_routes
    if (ruta.id && supabaseClient) {
        try {
            const { data: dbData } = await supabaseClient
                .from('user_routes')
                .select('ai_feedback')
                .eq('id', ruta.id)
                .maybeSingle();

            if (dbData?.ai_feedback) {
                let fDb = dbData.ai_feedback;
                if (typeof fDb === 'string') {
                    try { fDb = JSON.parse(fDb); } catch (e) { fDb = null; }
                }
                if (fDb && (fDb.bien || fDb.mejora || fDb.proxima_salida)) {
                    ruta.ai_feedback = fDb;
                    if (window.__rutasUsuarioCache?.has(String(ruta.id))) {
                        window.__rutasUsuarioCache.get(String(ruta.id)).ai_feedback = fDb;
                    }
                    return fDb;
                }
            }
        } catch (errCheck) {
            console.warn('[solicitarFeedbackIARuta] Aviso consultando ai_feedback previo:', errCheck);
        }
    }

    // 3. Enviar datos de la ruta al backend para el análisis con IA (Gemini Flash)
    const payload = {
        routeId: ruta.id,
        distance_km: Number(ruta.distance_km || ruta.distancia_km || 0),
        duration_seconds: Number(ruta.duration_seconds || (ruta.tiempo_minutos ? ruta.tiempo_minutos * 60 : 0)),
        avg_speed: Number(ruta.avg_speed || 0),
        max_speed: Number(ruta.max_speed || 0),
        splits_data: Array.isArray(ruta.splits_data) ? ruta.splits_data : []
    };

    let feedbackResultado = null;

    try {
        const resp = await fetchConTimeout(`${BACKEND_API_URL}?action=analyze_route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 2500);

        const data = await resp.json();
        if (data.ok && data.ai_feedback && (data.ai_feedback.bien || data.ai_feedback.mejora || data.ai_feedback.proxima_salida)) {
            feedbackResultado = data.ai_feedback;
        }
    } catch (errApi) {
        console.warn('[solicitarFeedbackIARuta] Aviso en API remota, usando motor experto local:', errApi);
    }

    if (!feedbackResultado) {
        feedbackResultado = generarAnalisisDeportivoFallback(payload);
    }

    // 4. Guardar la respuesta en ai_feedback de esa ruta en base de datos para no volver a llamar a la IA
    if (ruta.id && supabaseClient && feedbackResultado) {
        try {
            await supabaseClient
                .from('user_routes')
                .update({ ai_feedback: feedbackResultado })
                .eq('id', ruta.id);
        } catch (errSave) {
            console.warn('[solicitarFeedbackIARuta] Error persistiendo ai_feedback en DB:', errSave);
        }
    }

    // Actualizar caché en memoria
    ruta.ai_feedback = feedbackResultado;
    if (window.__rutasUsuarioCache?.has(String(ruta.id))) {
        window.__rutasUsuarioCache.get(String(ruta.id)).ai_feedback = feedbackResultado;
    }

    return feedbackResultado;
}

export async function abrirModalDetallesRuta(rutaId) {
    const modal = document.getElementById('rutaDetalleModal');
    const content = document.getElementById('modalRutaContenido');
    const titleEl = document.getElementById('modalRutaTitulo');
    const dateEl = document.getElementById('modalRutaFecha');
    if (!modal || !content) return;

    let ruta = window.__rutasUsuarioCache?.get(String(rutaId));
    if (!ruta && supabaseClient && rutaId) {
        try {
            const { data } = await supabaseClient.from('user_routes').select('*').eq('id', rutaId).maybeSingle();
            if (data) {
                ruta = data;
                if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
                window.__rutasUsuarioCache.set(String(data.id), data);
            } else {
                const { data: legacy } = await supabaseClient.from('rutas').select('*').eq('id', rutaId).maybeSingle();
                if (legacy) {
                    ruta = {
                        id: legacy.id,
                        title: legacy.ubicacion || 'Travesía GPS',
                        distance_km: Number(legacy.distancia_km || 0),
                        duration_seconds: Number(legacy.tiempo_minutos || 0) * 60,
                        avg_speed: Number(legacy.avg_speed_kmh || 0),
                        max_speed: Number(legacy.avg_speed_kmh || 0) * 1.35,
                        route_coordinates: legacy.ruta_json,
                        created_at: legacy.fecha
                    };
                    if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
                    window.__rutasUsuarioCache.set(String(legacy.id), ruta);
                }
            }
        } catch (e) {
            console.warn('Error recuperando ruta para modal:', e);
        }
    }
    if (!ruta) {
        alert("No se encontró la ruta seleccionada.");
        return;
    }

    const dist = Number(ruta.distance_km || ruta.distancia_km || 0).toFixed(2);
    const durSecs = Number(ruta.duration_seconds || (ruta.tiempo_minutos ? ruta.tiempo_minutos * 60 : 0));
    const mins = Math.max(1, Math.round(durSecs / 60));
    const avgSpd = Number(ruta.avg_speed || 0).toFixed(1);
    const maxSpd = Number(ruta.max_speed || (avgSpd * 1.35)).toFixed(1);
    const fecha = ruta.created_at ? new Date(ruta.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha no registrada';

    titleEl.textContent = ruta.title || 'Ruta Deportiva';
    dateEl.textContent = fecha;

    // Splits por kilómetro
    const splits = Array.isArray(ruta.splits_data) ? ruta.splits_data : [];
    let splitsHTML = '';
    if (splits.length > 0) {
        splitsHTML = `
            <div class="bg-white dark:bg-slate-800/90 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <span>⏱️</span> Rendimiento por Kilómetro (Splits)
                </p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    ${splits.map(s => {
                        const sSecs = Math.max(1, Math.round(s.duration_seconds || 0));
                        const sMin = Math.floor(sSecs / 60);
                        const sRestSec = String(sSecs % 60).padStart(2, '0');
                        return `
                            <div class="bg-slate-50 dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                                <span class="text-[9px] font-black uppercase text-water dark:text-sky-400 block mb-0.5">Km ${s.km}</span>
                                <p class="text-sm font-black text-marine dark:text-white leading-tight">${Number(s.avg_speed_kmh || 0).toFixed(1)} <span class="text-[9px] font-bold text-slate-400">km/h</span></p>
                                <span class="text-[9px] text-slate-400 font-bold block mt-0.5">${sMin}:${sRestSec} min</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // Análisis deportivo inmediato del Coach (0ms delay - nunca se queda pensando)
    let feedback = ruta.ai_feedback;
    if (typeof feedback === 'string') {
        try { feedback = JSON.parse(feedback); } catch (e) { feedback = null; }
    }
    if (!feedback || (!feedback.bien && !feedback.mejora && !feedback.proxima_salida)) {
        feedback = generarAnalisisDeportivoFallback({
            distance_km: Number(ruta.distance_km || ruta.distancia_km || 0),
            duration_seconds: durSecs,
            avg_speed: Number(ruta.avg_speed || 0),
            splits_data: splits
        });
    }

    const renderFeedbackHTML = (fb) => `
        <div class="space-y-3.5">
            <div class="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl p-3.5">
                <p class="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1.5">
                    <span>🟢</span> 1. Qué hiciste bien según tus datos
                </p>
                <p class="text-xs text-slate-200 leading-relaxed font-medium">${esc(fb.bien || 'Buen rendimiento general y cadencia sólida.')}</p>
            </div>
            <div class="bg-amber-950/40 border border-amber-500/20 rounded-2xl p-3.5">
                <p class="text-[10px] font-black uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1.5">
                    <span>🟡</span> 2. Punto de mejora (Tramo de caída de ritmo)
                </p>
                <p class="text-xs text-slate-200 leading-relaxed font-medium">${esc(fb.mejora || 'Mantuviste el ritmo regular sin caídas pronunciadas.')}</p>
            </div>
            <div class="bg-sky-950/40 border border-sky-500/20 rounded-2xl p-3.5">
                <p class="text-[10px] font-black uppercase tracking-wider text-sky-400 mb-1 flex items-center gap-1.5">
                    <span>🔵</span> 3. Objetivo para tu próxima salida
                </p>
                <p class="text-xs text-slate-200 leading-relaxed font-medium">${esc(fb.proxima_salida || 'Conserva un 30% de energía para mantener la velocidad en el regreso.')}</p>
            </div>
        </div>
    `;

    // Renderizar estructura completa de forma instantánea a 0ms
    content.innerHTML = `
        <!-- MÉTRICAS CLAVE -->
        <div class="grid grid-cols-4 gap-2 text-center bg-white dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <div class="border-r border-slate-100 dark:border-slate-800/80 pr-1">
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-0.5">Distancia</span>
                <p class="font-black text-marine dark:text-white text-lg">${dist}<span class="text-[9px] font-bold text-slate-400 ml-0.5">km</span></p>
            </div>
            <div class="border-r border-slate-100 dark:border-slate-800/80 pr-1">
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-0.5">Tiempo</span>
                <p class="font-black text-marine dark:text-white text-lg">${mins}<span class="text-[9px] font-bold text-slate-400 ml-0.5">min</span></p>
            </div>
            <div class="border-r border-slate-100 dark:border-slate-800/80 pr-1">
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-0.5">Vel. Med</span>
                <p class="font-black text-marine dark:text-white text-lg">${avgSpd}<span class="text-[9px] font-bold text-slate-400 ml-0.5">k/h</span></p>
            </div>
            <div>
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-0.5">Vel. Máx</span>
                <p class="font-black text-emerald-500 dark:text-emerald-400 text-lg">${maxSpd}<span class="text-[9px] font-bold text-slate-400 ml-0.5">k/h</span></p>
            </div>
        </div>

        ${splitsHTML}

        <!-- CONTENEDOR DEL FEEDBACK DEL COACH -->
        <div id="contenedorFeedbackIA" class="bg-gradient-to-b from-slate-900 to-slate-950 p-5 rounded-3xl border border-emerald-500/30 shadow-xl text-left relative overflow-hidden">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div class="flex items-center gap-2">
                    <span class="text-xl">✨</span>
                    <h4 class="text-xs font-black text-emerald-400 uppercase tracking-widest">Análisis del Coach</h4>
                </div>
                <span class="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">Coach</span>
            </div>
            <div id="feedbackIAInner">
                ${renderFeedbackHTML(feedback)}
            </div>
        </div>

        <!-- ACCIONES -->
        <div class="pt-2 flex gap-3">
            <button type="button" onclick="cerrarModalDetallesRuta(); verRutaEnMapa('${esc(ruta.id)}');" class="flex-1 h-12 bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer">
                <span>🗺️</span> Trazar en el Mapa
            </button>
            <button type="button" onclick="cerrarModalDetallesRuta()" class="h-12 px-5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer">
                Cerrar
            </button>
        </div>
    `;

    // Mostrar modal con animación
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);

    // Consulta en segundo plano opcional (no bloqueante) para persistir o enriquecer en DB
    if (!ruta.ai_feedback) {
        solicitarFeedbackIARuta(ruta).then(nuevoFeedback => {
            if (nuevoFeedback && document.getElementById('feedbackIAInner')) {
                document.getElementById('feedbackIAInner').innerHTML = renderFeedbackHTML(nuevoFeedback);
            }
        }).catch(err => {
            console.warn('Aviso no crítico actualizando feedback en segundo plano:', err);
        });
    }
}

export function cerrarModalDetallesRuta() {
    const modal = document.getElementById('rutaDetalleModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

window.actualizarBotonPerfilNav = actualizarBotonPerfilNav;
window.abrirModalAuth = abrirModalAuth;
window.cerrarModalAuth = cerrarModalAuth;
window.enviarEmailRecuperacion = enviarEmailRecuperacion;
window.abrirModalRecuperacionFinal = abrirModalRecuperacionFinal;
window.guardarNuevaPassword = guardarNuevaPassword;
window.subirAvatar = subirAvatar;
window.guardarPerfil = guardarPerfil;
window.toggleAuthMode = toggleAuthMode;
window.procesarAuth = procesarAuth;
window.cerrarSesion = cerrarSesion;
window.entrarComoInvitado = entrarComoInvitado;
window.subirArchivoGPX = subirArchivoGPX;
window.verRutaEnMapa = verRutaEnMapa;
window.cargarHistorialRutas = cargarHistorialRutas;
window.actualizarBadgeRanking = actualizarBadgeRanking;
window.solicitarFeedbackIARuta = solicitarFeedbackIARuta;
window.abrirModalDetallesRuta = abrirModalDetallesRuta;
window.cerrarModalDetallesRuta = cerrarModalDetallesRuta;
window.restaurarFormularioAuth = restaurarFormularioAuth;
window.obtenerRutasUnificadasUsuario = obtenerRutasUnificadasUsuario;
window.renderizarPRsGrid = renderizarPRsGrid;
window.renderizarWidgetMetaMensual = renderizarWidgetMetaMensual;
window.renderizarGraficoVolumen8Semanas = renderizarGraficoVolumen8Semanas;
window.renderizarVitrinaLogrosMerito = renderizarVitrinaLogrosMerito;
window.cambiarMetaMensual = cambiarMetaMensual;
window.inicializarPresenciaRealtime = inicializarPresenciaRealtime;
window.actualizarMiEstadoPresencia = actualizarMiEstadoPresencia;