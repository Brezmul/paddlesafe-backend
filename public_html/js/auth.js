// ====================================================
// js/auth.js - AUTENTICACIÓN, PERFIL Y STORAGE
// ====================================================

import { supabaseClient, appState } from './config.js';
import { esc, safeUrl, validarImagen, calcularRangoMaritimo, IMG_FALLBACK, fetchConTimeout } from './utils.js';
import { parseGPX } from './gpxParser.js';
import { calcularNivelYProgreso, obtenerPosicionRanking, guardarRutaDeportivaConGamificacion } from './gamification.js';

export function comprobarRecuperacionPasswordUrl() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const params = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

    const errorDesc = hashParams.get('error_description') || params.get('error_description');
    if (errorDesc) {
        alert("⚠️ El enlace de recuperación no es válido o ha expirado: " + decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
        window.history.replaceState(null, null, window.location.pathname);
        return false;
    }

    const esRecovery = hash.includes('type=recovery') || 
                       search.includes('type=recovery') || 
                       params.get('type') === 'recovery' ||
                       hashParams.get('type') === 'recovery' ||
                       hash.toLowerCase() === '#recovery';

    if (esRecovery) {
        appState.isPasswordRecoveryMode = true;
        setTimeout(() => {
            abrirModalRecuperacionFinal();
        }, 200);
        return true;
    }
    return false;
}

export function initAuthListeners() {
    comprobarRecuperacionPasswordUrl();

    if (supabaseClient && supabaseClient.auth) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                appState.isPasswordRecoveryMode = true;
                setTimeout(abrirModalRecuperacionFinal, 300);
                return;
            }
            if (event === 'INITIAL_SESSION') return;
            
            const mismoUsuario = session?.user?.id && session.user.id === appState.perfilUsuario?.id;
            appState.sesionActual = session;
            appState.esInvitado = false;
            
            if (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && mismoUsuario)) return;
            
            setTimeout(async () => {
                if (session) {
                    await cargarPerfilUsuarioActivo();
                    if (event === 'SIGNED_IN') window.sincronizarRutasPendientes?.();
                }
                else { appState.perfilUsuario = null; actualizarBotonCabecera(); }
                
                // Si el usuario está en proceso de restablecer su contraseña, preservar el modal
                if (appState.isPasswordRecoveryMode || document.getElementById('nuevaPassword')) {
                    abrirModalRecuperacionFinal();
                    return;
                }

                const modal = document.getElementById('authModal');
                if (modal && !modal.classList.contains('hidden') && appState.sesionActual && appState.perfilUsuario) {
                    cerrarModalAuth();
                }
            }, 0);
        });
    }
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
    if (!data) {
        const u = appState.sesionActual.user;
        const nombreMeta = u.user_metadata?.full_name || u.user_metadata?.name || (u.email || 'Paddler').split('@')[0];
        data = {
            id: userId,
            nombre: nombreMeta,
            avatar_url: u.user_metadata?.avatar_url || null,
            nivel: 1,
            current_level: 1,
            puntos: 0,
            total_xp: 0,
            km_totales: 0,
            total_distance_km: 0,
            tiempo_total: 0,
            insignias: [],
            is_private: false,
            titulo: 'Paddler en Ascenso'
        };
    }
    if (data.insignias && typeof data.insignias === 'string') {
        try {
            data.insignias = JSON.parse(data.insignias);
        } catch (_) {
            data.insignias = data.insignias.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    if (!Array.isArray(data.insignias)) {
        data.insignias = [];
    }

    appState.perfilUsuario = data; 
    actualizarBotonCabecera(); 
    if (window.socialNotifications && typeof window.socialNotifications.cargarNotificaciones === 'function') {
        window.socialNotifications.cargarNotificaciones();
    }
}

export function actualizarBotonCabecera() {
    const btn = document.getElementById('btnCabeceraPerfil');
    if (!btn) return;
    if ((appState.sesionActual || appState.esInvitado) && appState.perfilUsuario) {
        btn.innerHTML = `
            <div class="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-700 rounded-full pr-3 pl-1 py-1 border border-slate-700 transition-colors">
                <img src="${esc(safeUrl(appState.perfilUsuario.avatar_url, `https://api.dicebear.com/9.x/adventurer/svg?seed=guest`))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-7 h-7 rounded-full object-cover border border-slate-600">
                <span class="text-[10px] sm:text-xs font-bold text-white truncate max-w-[80px]">${esc(appState.perfilUsuario.nombre)}</span>
            </div>`;
    } else {
        btn.innerHTML = `
            <svg class="h-7 w-7 sm:h-8 sm:w-8 drop-shadow-md text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-[11px] sm:text-xs font-black mt-1 uppercase tracking-widest text-white/80">Perfil</span>`;
    }
}

export async function abrirModalAuth() {
    // Defensive UX: Bloqueamos apertura si el usuario está en plena travesía GPS
    const trackingPanel = document.getElementById('liveTrackingPanel');
    if (trackingPanel && !trackingPanel.classList.contains('hidden')) {
        return alert("⚠️ Finaliza o cancela la grabación de la travesía GPS antes de abrir los menús.");
    }

    if (!appState.sesionActual && !appState.esInvitado && supabaseClient?.auth) {
        try {
            const { data: sData } = await supabaseClient.auth.getSession();
            if (sData?.session) {
                appState.sesionActual = sData.session;
            }
        } catch (e) {
            console.warn('[abrirModalAuth] Error recuperando sesión:', e);
        }
    }

    if (appState.sesionActual && !appState.perfilUsuario) {
        await cargarPerfilUsuarioActivo();
    }

    restaurarFormularioAuth();
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.remove('hidden');
        setTimeout(() => { m.classList.remove('opacity-0'); m.querySelector('div')?.classList.remove('scale-95'); }, 10);
    }
}

export function cerrarModalAuth() {
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.add('opacity-0'); m.querySelector('div').classList.add('scale-95');
        setTimeout(() => { m.classList.add('hidden'); }, 300);
    }
}

export function restaurarFormularioAuth() {
    const c = document.getElementById('authModalContent');
    if(!c) return;
    appState.isLoginMode = true;

    // Si hay sesión pero el perfil aún está cargando, mostrar estado transitorio seguro
    if (appState.sesionActual && !appState.perfilUsuario && !appState.esInvitado) {
        c.innerHTML = `
            <div class="text-center py-16 dark:bg-slate-900 rounded-3xl">
                <div class="w-12 h-12 border-4 border-water border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p class="text-sm font-bold text-marine dark:text-white">Cargando tu perfil...</p>
            </div>
        `;
        cargarPerfilUsuarioActivo().then(() => {
            restaurarFormularioAuth();
        }).catch(() => {
            const u = appState.sesionActual?.user;
            if (u) {
                appState.perfilUsuario = {
                    id: u.id,
                    nombre: u.user_metadata?.full_name || (u.email || 'Paddler').split('@')[0],
                    nivel: 1,
                    current_level: 1,
                    puntos: 0,
                    total_xp: 0,
                    km_totales: 0,
                    total_distance_km: 0,
                    tiempo_total: 0,
                    insignias: [],
                    is_private: false,
                    titulo: 'Paddler en Ascenso'
                };
            }
            restaurarFormularioAuth();
        });
        return;
    }

    if ((appState.sesionActual && appState.perfilUsuario) || appState.esInvitado) {
        const avatarSrc = appState.perfilUsuario?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=guest`;
        const horasNav = Math.floor((appState.perfilUsuario?.tiempo_total || 0) / 60);
        const minNav = (appState.perfilUsuario?.tiempo_total || 0) % 60;
        const pts = Number(appState.perfilUsuario?.total_xp ?? appState.perfilUsuario?.puntos ?? 0);
        const distTot = Number(appState.perfilUsuario?.total_distance_km ?? appState.perfilUsuario?.km_totales ?? 0).toFixed(1);
        const progresoGamif = calcularNivelYProgreso(pts);
        const nivelActual = appState.perfilUsuario?.current_level || appState.perfilUsuario?.nivel || progresoGamif.nivel;
        const rango = calcularRangoMaritimo(pts, nivelActual);
        const tituloPerfil = appState.perfilUsuario?.titulo || rango.titulo;
        
        let insigniasHTML = `<p class="text-[10px] text-slate-400 dark:text-slate-500 font-medium my-2">Aún no has ganado insignias en quedadas.</p>`;
        const rawInsignias = appState.perfilUsuario?.insignias;
        let listaInsignias = [];
        if (Array.isArray(rawInsignias)) {
            listaInsignias = rawInsignias;
        } else if (typeof rawInsignias === 'string') {
            try {
                const parsed = JSON.parse(rawInsignias);
                if (Array.isArray(parsed)) listaInsignias = parsed;
            } catch (_) {
                listaInsignias = rawInsignias.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
            }
        }

        if (listaInsignias.length > 0) {
            insigniasHTML = `<div class="grid grid-cols-3 sm:grid-cols-4 gap-3 justify-items-center mt-3">`;
            insigniasHTML += listaInsignias.map(rawIns => {
                const ins = typeof rawIns === 'string' ? { nombre: rawIns.replace(/_/g, ' '), icono: '🏅' } : (rawIns || { nombre: 'Insignia', icono: '🏅' }); 
                return `
                    <div class="flex flex-col items-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-md hover:shadow-xl hover:-translate-y-2 transition-all duration-300 text-center w-full relative group">
                        <div class="absolute inset-0 bg-gradient-to-tr from-amber-200/20 to-transparent dark:from-amber-900/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span class="text-4xl drop-shadow-lg mb-3 transform group-hover:scale-110 transition-transform">${esc(ins.icono || '🏅')}</span>
                        <span class="text-[9px] sm:text-[10px] font-black text-marine dark:text-white uppercase tracking-widest leading-tight z-10 break-words w-full">${esc(ins.nombre || 'Insignia')}</span>
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
                    <img id="avatarPreview" src="${avatarSrc}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-28 h-28 sm:w-32 sm:h-32 mx-auto rounded-full border-[6px] border-white dark:border-slate-800 shadow-xl bg-slate-50 dark:bg-slate-800 object-cover transition-all group-hover:scale-105">
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
                        <span class="text-xs sm:text-sm font-black text-water dark:text-sky-400 uppercase tracking-widest">${esc(tituloPerfil)}</span>
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

                <!-- ACCESO RÁPIDO A AMIGOS Y COMUNIDAD -->
                <div class="flex gap-2 mb-4">
                    <button type="button" onclick="if(window.abrirPanelMisAmigos) window.abrirPanelMisAmigos();" class="w-full h-11 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-black text-xs uppercase tracking-wider rounded-2xl border border-sky-400/30 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm">
                        <span>🤝</span> Mis Amigos & Solicitudes
                    </button>
                </div>

                <!-- BOTÓN DESTACADO: SUBIR RUTA PARA SUMAR XP Y ESCALAR EN EL RANKING -->
                <div class="mb-8">
                    <button type="button" onclick="window.abrirDialogoSubirGPX()" class="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white p-4 sm:p-5 rounded-3xl shadow-xl shadow-teal-900/30 active:scale-[0.98] transition-all flex items-center justify-between cursor-pointer group border border-emerald-400/30 relative overflow-hidden ${appState.esInvitado ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}">
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

                <div class="mb-8 text-left">
                    <h3 class="text-[11px] sm:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b-2 border-slate-100 dark:border-slate-800 pb-3 mb-4 flex items-center gap-2"><svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg> Vitrina Premium</h3>
                    ${insigniasHTML}
                </div>
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
                        <button type="button" onclick="window.abrirDialogoSubirGPX()" class="cursor-pointer bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 ${appState.esInvitado ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}">
                            <span>📥</span> Subir GPX
                        </button>
                    </div>
                    <div id="contenedorHistorial" class="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar pb-4"></div>
                </div>
                <div class="mb-3">
                    <button type="button" onclick="window.abrirModalRecuperacionFinal()" class="w-full h-11 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm">
                        <span>🔑</span> Cambiar Contraseña
                    </button>
                </div>
                <button onclick="cerrarSesion()" class="w-full h-14 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-black uppercase tracking-widest text-[11px] rounded-2xl border-2 border-red-100 dark:border-red-900/30 transition-all shadow-sm active:scale-95">
                    ${appState.esInvitado ? 'Salir del Modo Invitado' : 'Cerrar Sesión'}
                </button>
                <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PaddleSafe v5.37</p>
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
            <div class="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4"></div>
            <img src="/icons/PaddleSafe_192x192.png" alt="PaddleSafe Logo" class="w-16 h-16 rounded-2xl mx-auto mb-3 shadow-md border border-slate-200 dark:border-slate-700 object-contain">
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
            <button type="button" id="btnRecuperarPass" onclick="mostrarVistaSolicitarRecuperacion()" class="text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-water dark:hover:text-sky-400 uppercase tracking-widest transition-colors cursor-pointer">¿Olvidaste tu contraseña?</button>
        </div>
    `;
}

export function mostrarVistaSolicitarRecuperacion() {
    const c = document.getElementById('authModalContent');
    if (!c) return;
    const emailPrevio = document.getElementById('authEmail')?.value?.trim() || '';
    c.innerHTML = `
        <div class="text-center mb-6 dark:bg-slate-900 pt-6 rounded-t-3xl">
            <div class="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
            <div class="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-inner">
                📧
            </div>
            <h2 class="text-2xl sm:text-3xl font-black text-marine dark:text-white mb-2 tracking-tight">Recuperar Contraseña</h2>
            <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium px-4">
                Introduce el correo electrónico asociado a tu cuenta de PaddleSafe y te enviaremos un enlace seguro para restablecerla.
            </p>
        </div>
        <div class="space-y-4 w-full dark:bg-slate-900 pb-4 px-2">
            <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path></svg>
                </span>
                <input type="email" id="recuperarEmailInput" value="${esc(emailPrevio)}" class="block w-full h-14 pl-12 pr-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-water dark:focus:ring-sky-500 outline-none transition-all shadow-sm" placeholder="tu-email@ejemplo.com" autofocus>
            </div>
            <button type="button" id="btnEnviarRecuperacion" onclick="enviarEmailRecuperacion()" class="w-full h-14 bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-water/30 dark:shadow-none transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-2">
                <span>Enviar Enlace de Recuperación</span>
                <span>📨</span>
            </button>
            <button type="button" onclick="restaurarFormularioAuth()" class="w-full h-12 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer">
                ⬅️ Volver al Inicio de Sesión
            </button>
        </div>
    `;
}

export function mostrarVistaConfirmacionEmailEnviado(email) {
    const c = document.getElementById('authModalContent');
    if (!c) return;
    c.innerHTML = `
        <div class="text-center mb-6 dark:bg-slate-900 pt-6 rounded-t-3xl">
            <div class="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
            <div class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-inner">
                ✅
            </div>
            <h2 class="text-2xl sm:text-3xl font-black text-marine dark:text-white mb-2 tracking-tight">¡Correo Enviado!</h2>
            <p class="text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-medium px-4 mb-2">
                Hemos enviado un correo a:
            </p>
            <p class="text-sm font-black text-water dark:text-sky-400 bg-sky-50 dark:bg-slate-800 py-1.5 px-3 rounded-xl inline-block mb-4 border border-sky-100 dark:border-slate-700">
                ${esc(email)}
            </p>
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4 mx-2 text-left mb-4">
                <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    💡 <strong>Siguientes pasos:</strong><br>
                    1. Revisa tu bandeja de entrada (o carpeta de spam).<br>
                    2. Haz clic en el enlace recibido en el correo.<br>
                    3. Se abrirá automáticamente esta aplicación en el espacio seguro para que introduzcas tu nueva contraseña.
                </p>
            </div>
        </div>
        <div class="space-y-3 w-full dark:bg-slate-900 pb-4 px-2">
            <button type="button" onclick="abrirModalRecuperacionFinal()" class="w-full h-13 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-2">
                <span>¿Ya abriste el enlace? Escribir Nueva Contraseña</span>
                <span>🔑</span>
            </button>
            <button type="button" onclick="restaurarFormularioAuth()" class="w-full h-11 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer">
                Volver a Iniciar Sesión
            </button>
        </div>
    `;
}

export async function enviarEmailRecuperacion() {
    const input = document.getElementById('recuperarEmailInput') || document.getElementById('authEmail');
    const email = input?.value?.trim();
    if (!email || !email.includes('@')) {
        alert("Por favor, introduce un correo electrónico válido.");
        return;
    }
    const btn = document.getElementById('btnEnviarRecuperacion') || document.getElementById('btnRecuperarPass');
    if (btn) { btn.disabled = true; btn.textContent = "Enviando enlace..."; }
    
    try {
        const redirectToUrl = `${window.location.origin}${window.location.pathname}#recovery`;
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: redirectToUrl });
        if (error) {
            alert("Error: " + error.message);
            if (btn) { btn.disabled = false; btn.textContent = "Enviar Enlace de Recuperación"; }
        } else {
            mostrarVistaConfirmacionEmailEnviado(email);
        }
    } catch (err) {
        alert("Ocurrió un error al enviar el correo: " + (err.message || err));
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Enlace de Recuperación"; }
    }
}

export function toggleVerPassword(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (btnEl) btnEl.innerHTML = '🙈';
    } else {
        input.type = 'password';
        if (btnEl) btnEl.innerHTML = '👁️';
    }
}

export function abrirModalRecuperacionFinal() {
    appState.isPasswordRecoveryMode = true;
    const c = document.getElementById('authModalContent');
    if (!c) return;
    c.innerHTML = `
        <div class="text-center mb-6 dark:bg-slate-900 pt-6 rounded-t-3xl">
            <div class="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
            <div class="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg shadow-emerald-500/30">
                🔑
            </div>
            <h2 class="text-2xl sm:text-3xl font-black text-marine dark:text-white mb-2 tracking-tight">Establecer Nueva Contraseña</h2>
            <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium px-4">
                Elige una contraseña segura (mínimo 6 caracteres) para acceder a tu cuenta de PaddleSafe.
            </p>
        </div>
        <div class="space-y-4 w-full dark:bg-slate-900 pb-6 px-2">
            <div class="space-y-1">
                <label class="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-1">Nueva Contraseña</label>
                <div class="relative">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    </span>
                    <input type="password" id="nuevaPassword" class="block w-full h-14 pl-12 pr-12 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm" placeholder="Mínimo 6 caracteres" autofocus>
                    <button type="button" onclick="window.toggleVerPassword('nuevaPassword', this)" class="absolute inset-y-0 right-0 pr-4 flex items-center text-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                        👁️
                    </button>
                </div>
            </div>

            <div class="space-y-1">
                <label class="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-1">Confirmar Contraseña</label>
                <div class="relative">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </span>
                    <input type="password" id="confirmarPassword" class="block w-full h-14 pl-12 pr-12 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm" placeholder="Repite tu nueva contraseña">
                    <button type="button" onclick="window.toggleVerPassword('confirmarPassword', this)" class="absolute inset-y-0 right-0 pr-4 flex items-center text-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                        👁️
                    </button>
                </div>
            </div>

            <div id="passwordErrorMsg" class="hidden text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-200 dark:border-red-800/40"></div>

            <button type="button" id="btnGuardarPassword" onclick="guardarNuevaPassword()" class="w-full h-14 mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/30 dark:shadow-none transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-2">
                <span>Guardar Nueva Contraseña</span>
                <span>✨</span>
            </button>
            <button type="button" onclick="cerrarModalAuth()" class="w-full h-11 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer">
                Cancelar
            </button>
        </div>
    `;
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.remove('hidden');
        setTimeout(() => { 
            m.classList.remove('opacity-0'); 
            m.querySelector('div')?.classList.remove('scale-95'); 
        }, 10);
    }
}

export async function guardarNuevaPassword() {
    const pass = document.getElementById('nuevaPassword')?.value;
    const confirmPass = document.getElementById('confirmarPassword')?.value;
    const errBox = document.getElementById('passwordErrorMsg');
    const mostrarError = (msg) => {
        if (errBox) {
            errBox.textContent = msg;
            errBox.classList.remove('hidden');
        } else {
            alert(msg);
        }
    };

    if (!pass || pass.length < 6) {
        return mostrarError("La contraseña debe tener al menos 6 caracteres.");
    }
    if (confirmPass !== undefined && pass !== confirmPass) {
        return mostrarError("Las dos contraseñas no coinciden. Por favor, verifícalas.");
    }

    if (errBox) errBox.classList.add('hidden');

    const btn = document.getElementById('btnGuardarPassword');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>Guardando...</span> <span class="animate-spin">⏳</span>`;
    }

    try {
        const { data, error } = await supabaseClient.auth.updateUser({ password: pass });
        if (error) {
            mostrarError("Error al guardar: " + error.message);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>Guardar Nueva Contraseña</span> <span>✨</span>`;
            }
            return;
        }

        appState.isPasswordRecoveryMode = false;
        alert("✅ ¡Contraseña actualizada con éxito! Ahora ya puedes continuar navegando con tu nueva clave.");
        
        // Limpiar hash y parámetros de recuperación de la URL
        window.history.replaceState(null, null, window.location.pathname);
        
        // Cargar perfil activo y restaurar vista
        await cargarPerfilUsuarioActivo();
        restaurarFormularioAuth();
    } catch (err) {
        mostrarError("Ocurrió un error inesperado: " + (err.message || err));
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>Guardar Nueva Contraseña</span> <span>✨</span>`;
        }
    }
}

export async function subirAvatar(event) {
    if (appState.esInvitado) return alert("Los invitados no pueden subir foto.");
    if (!appState.sesionActual?.user) return alert("Sesión inválida.");
    const fileInput = event?.target || document.getElementById('avatarUpload');
    const file = fileInput?.files?.[0];
    if (!file) return;
    
    const errImg = validarImagen(file); 
    if (errImg) { alert(errImg); if (fileInput) fileInput.value = ''; return; }
    
    const preview = document.getElementById('avatarPreview');
    if (preview) preview.style.opacity = '0.5';
    
    const mime = file.type || 'image/jpeg';
    const userId = appState.sesionActual.user.id;
    const filePath = `avatars/${userId}.jpg`;
    
    try {
        const { error: uploadError } = await supabaseClient.storage.from('paddlesafe').upload(filePath, file, { upsert: true, contentType: mime });
        if (uploadError) throw uploadError;
        
        const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(filePath);
        const urlConCacheBuster = `${data.publicUrl}?t=${Date.now()}`;
        
        const { error: updErr } = await supabaseClient.from('perfiles').update({ avatar_url: urlConCacheBuster }).eq('id', userId);
        if (updErr) {
            await supabaseClient.from('perfiles').upsert({ id: userId, avatar_url: urlConCacheBuster }, { onConflict: 'id' });
        }
        
        // Mantener metadatos de usuario sincronizados
        await supabaseClient.auth.updateUser({ data: { avatar_url: urlConCacheBuster } }).catch(() => {});

        if (!appState.perfilUsuario) appState.perfilUsuario = {};
        appState.perfilUsuario.avatar_url = urlConCacheBuster;
        if (preview) preview.src = urlConCacheBuster;
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
    if (!appState.sesionActual?.user) return alert("No hay sesión activa.");
    const inputNombre = document.getElementById('perfilNombre');
    const inputPrivado = document.getElementById('perfilPrivado');
    if (!inputNombre) return;

    const nuevoNombre = inputNombre.value.trim().slice(0, 30);
    if (nuevoNombre.length < 2) return alert("El nombre debe tener entre 2 y 30 caracteres.");
    const esPrivado = inputPrivado ? inputPrivado.checked : false;
    const btn = document.getElementById('btnGuardarPerfil');
    
    if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
    
    try {
        const userId = appState.sesionActual.user.id;
        const { error } = await supabaseClient.from('perfiles').update({ nombre: nuevoNombre, is_private: esPrivado }).eq('id', userId);
        if (error) {
            alert("❌ Error al guardar: " + error.message);
            if (btn) { btn.textContent = "Guardar"; btn.disabled = false; }
            return;
        }

        // Sincronizar nombre en metadatos de autenticación Supabase
        await supabaseClient.auth.updateUser({ data: { full_name: nuevoNombre } }).catch(() => {});

        if (!appState.perfilUsuario) appState.perfilUsuario = {};
        appState.perfilUsuario.nombre = nuevoNombre;
        appState.perfilUsuario.is_private = esPrivado;
        actualizarBotonCabecera();
        if (btn) {
            btn.textContent = "✅ Guardado!";
            setTimeout(() => { btn.textContent = "Guardar"; btn.disabled = false; }, 2000);
        }
    } catch (err) {
        alert("❌ Error al guardar: " + (err.message || err));
        if (btn) { btn.textContent = "Guardar"; btn.disabled = false; }
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

export function abrirDialogoSubirGPX() {
    if (appState.esInvitado) {
        return alert("Los usuarios invitados no pueden guardar rutas. ¡Regístrate gratis!");
    }
    if (!appState.sesionActual?.user) {
        alert("Debes iniciar sesión para subir tus rutas.");
        if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
        return;
    }
    let input = document.getElementById('gpxUploadInputGlobal');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'gpxUploadInputGlobal';
        input.accept = '.gpx,application/gpx+xml';
        input.className = 'hidden';
        input.onchange = (e) => {
            if (typeof window.subirArchivoGPX === 'function') {
                window.subirArchivoGPX(e);
            }
        };
        document.body.appendChild(input);
    }
    input.click();
}

export async function subirArchivoGPX(event) {
    if (appState.esInvitado) return alert("Los usuarios invitados no pueden guardar rutas. ¡Regístrate gratis!");
    if (!appState.sesionActual?.user) return alert("Debes iniciar sesión para subir tus rutas.");

    const fileInput = event?.target || document.getElementById('gpxUploadInputGlobal') || document.getElementById('gpxUploadInputSPA') || document.getElementById('gpxUploadInput');
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

            // Si el modal de perfil SPA (/user/:id) está abierto, refrescar su pestaña de rutas
            const spaModal = document.getElementById('userProfileModal');
            if (spaModal && !spaModal.classList.contains('hidden') && typeof window.cambiarTabPerfilSPA === 'function') {
                window.cambiarTabPerfilSPA('rutas');
            }

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

            // Abrir automáticamente la vista interactiva de detalles con mapa y análisis Coach de la ruta subida
            if (resGuardado.ruta?.id && typeof window.abrirModalDetallesRuta === 'function') {
                window.abrirModalDetallesRuta(resGuardado.ruta.id);
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

export async function cargarHistorialRutas() {
    const contenedor = document.getElementById('contenedorHistorial');
    if (!contenedor) return;
    
    if (appState.esInvitado) {
        contenedor.innerHTML = `<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Los invitados no guardan historial.</p></div>`;
        return;
    }
    if (!appState.sesionActual?.user) return;

    contenedor.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs font-bold animate-pulse">Cargando tus rutas deportivas...</div>`;

    const rutas = [];

    // 1. Consultar tabla user_routes
    try {
        const { data: urData, error: urErr } = await supabaseClient
            .from('user_routes')
            .select('id, title, distance_km, duration_seconds, avg_speed, max_speed, xp_earned, created_at, route_coordinates, splits_data, ai_feedback')
            .eq('user_id', appState.sesionActual.user.id)
            .order('created_at', { ascending: false });

        if (!urErr && Array.isArray(urData)) {
            urData.forEach(r => rutas.push({
                id: r.id,
                title: r.title || 'Ruta Deportiva',
                distance_km: Number(r.distance_km || 0),
                duration_seconds: Number(r.duration_seconds || 0),
                avg_speed: Number(r.avg_speed || 0),
                max_speed: Number(r.max_speed || 0),
                xp_earned: Number(r.xp_earned || 0),
                created_at: r.created_at,
                route_coordinates: r.route_coordinates,
                splits_data: r.splits_data,
                ai_feedback: r.ai_feedback
            }));
        }
    } catch (e) {
        console.warn("[cargarHistorialRutas] Error leyendo user_routes:", e);
    }

    // 2. Consultar tabla legacy rutas para compatibilidad
    try {
        const { data: legData, error: legErr } = await supabaseClient
            .from('rutas')
            .select('id, distancia_km, tiempo_minutos, fecha, ruta_json, avg_speed_kmh, points_earned')
            .eq('user_id', appState.sesionActual.user.id)
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
                        duration_seconds: mins * 60,
                        avg_speed: avg,
                        max_speed: avg * 1.35,
                        xp_earned: Number(r.points_earned || (Math.round(dist * 10) + mins)),
                        created_at: r.fecha,
                        route_coordinates: r.ruta_json
                    });
                }
            });
        }
    } catch (e) {
        console.warn("[cargarHistorialRutas] Error leyendo rutas:", e);
    }

    // Ordenar cronológicamente
    rutas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Almacenar en caché en memoria para dibujado instantáneo en el mapa
    window.__rutasUsuarioCache = new Map();
    rutas.forEach(r => window.__rutasUsuarioCache.set(String(r.id), r));

    if (rutas.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner px-4">
                <span class="text-3xl mb-2 block">🏄‍♂️</span>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Aún no has registrado rutas</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500">Pulsa en <b>"Subir GPX"</b> arriba para importar sesiones de tu reloj deportivo o app de móvil.</p>
            </div>`;
        return;
    }

    contenedor.innerHTML = rutas.map(ruta => {
        const dist = Number(ruta.distance_km || 0).toFixed(2);
        const totalSecs = Number(ruta.duration_seconds || 0);
        const mins = Math.max(1, Math.round(totalSecs / 60));
        const avgSpd = Number(ruta.avg_speed || 0).toFixed(1);
        const maxSpd = Number(ruta.max_speed || (avgSpd * 1.3)).toFixed(1);
        const xp = Number(ruta.xp_earned || 0);
        const fechaStr = ruta.created_at ? new Date(ruta.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Reciente';

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

                <div class="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-water dark:group-hover:text-sky-400 transition-colors">
                    <span class="flex items-center gap-1 font-bold">📍 Ver en mapa interactivo</span>
                    <span class="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">🧠 Ver Análisis IA →</span>
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
    const BACKEND_API_URL = 'https://paddlesafe-backend.vercel.app/api/backend';
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

window.abrirModalAuth = abrirModalAuth;
window.cerrarModalAuth = cerrarModalAuth;
window.mostrarVistaSolicitarRecuperacion = mostrarVistaSolicitarRecuperacion;
window.mostrarVistaConfirmacionEmailEnviado = mostrarVistaConfirmacionEmailEnviado;
window.enviarEmailRecuperacion = enviarEmailRecuperacion;
window.toggleVerPassword = toggleVerPassword;
window.abrirModalRecuperacionFinal = abrirModalRecuperacionFinal;
window.guardarNuevaPassword = guardarNuevaPassword;
window.subirAvatar = subirAvatar;
window.guardarPerfil = guardarPerfil;
window.toggleAuthMode = toggleAuthMode;
window.procesarAuth = procesarAuth;
window.cerrarSesion = cerrarSesion;
window.entrarComoInvitado = entrarComoInvitado;
window.subirArchivoGPX = subirArchivoGPX;
window.abrirDialogoSubirGPX = abrirDialogoSubirGPX;
window.verRutaEnMapa = verRutaEnMapa;
window.cargarHistorialRutas = cargarHistorialRutas;
window.actualizarBadgeRanking = actualizarBadgeRanking;
window.solicitarFeedbackIARuta = solicitarFeedbackIARuta;
window.abrirModalDetallesRuta = abrirModalDetallesRuta;
window.cerrarModalDetallesRuta = cerrarModalDetallesRuta;
window.restaurarFormularioAuth = restaurarFormularioAuth;