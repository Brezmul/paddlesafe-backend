// ====================================================
// js/auth.js - AUTENTICACIÓN, PERFIL Y STORAGE
// ====================================================

import { supabaseClient, appState } from './config.js';
import { esc, safeUrl, validarImagen, calcularRangoMaritimo, IMG_FALLBACK } from './utils.js';

export function initAuthListeners() {
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') { setTimeout(abrirModalRecuperacionFinal, 500); return; }
            if (event === 'INITIAL_SESSION') return;
            
            const mismoUsuario = session?.user?.id && session.user.id === appState.perfilUsuario?.id;
            appState.sesionActual = session;
            appState.esInvitado = false;
            
            if (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && mismoUsuario)) return;
            
            setTimeout(async () => {
                if (session) await cargarPerfilUsuarioActivo();
                else { appState.perfilUsuario = null; actualizarBotonCabecera(); }
                
                const modal = document.getElementById('authModal');
                if (modal && !modal.classList.contains('hidden') && appState.sesionActual && !document.getElementById('nuevaPassword') && appState.perfilUsuario) cerrarModalAuth();
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
    if (data) { appState.perfilUsuario = data; actualizarBotonCabecera(); }
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
        setTimeout(() => { m.classList.add('hidden'); }, 300);
    }
}

export function restaurarFormularioAuth() {
    const c = document.getElementById('authModalContent');
    if(!c) return;
    appState.isLoginMode = true;
    if ((appState.sesionActual && appState.perfilUsuario) || appState.esInvitado) {
        const avatarSrc = appState.perfilUsuario?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=guest`;
        const horasNav = Math.floor((appState.perfilUsuario?.tiempo_total || 0) / 60);
        const minNav = (appState.perfilUsuario?.tiempo_total || 0) % 60;
        const pts = appState.perfilUsuario?.puntos || 0;
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
                        <span class="text-xs sm:text-sm font-black text-water dark:text-sky-400 uppercase tracking-widest">${rango.titulo}</span>
                    </div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-[24px] p-6 mb-6 grid grid-cols-3 gap-4 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div class="absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br from-water/20 dark:from-sky-500/10 to-blue-500/5 rounded-full blur-3xl"></div>
                    <div class="flex flex-col items-center justify-center min-w-0 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-700/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-600 shadow-sm relative z-10 hover:-translate-y-1 transition-transform group">
                        <div class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-2 text-blue-500 group-hover:scale-110 transition-transform"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg></div>
                        <p class="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-widest mb-0.5">Puntos</p>
                        <p class="text-marine dark:text-white text-xl font-black">${pts}</p>
                    </div>
                    <div class="flex flex-col items-center justify-center min-w-0 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-700/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-600 shadow-sm relative z-10 hover:-translate-y-1 transition-transform group">
                        <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-2 text-emerald-500 group-hover:scale-110 transition-transform"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg></div>
                        <p class="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-widest mb-0.5">Distancia</p>
                        <p class="text-marine dark:text-white text-xl font-black">${Number(appState.perfilUsuario?.km_totales || 0).toFixed(1)}<span class="text-[10px] ml-0.5 text-slate-400">km</span></p>
                    </div>
                    <div class="flex flex-col items-center justify-center min-w-0 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-700/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-600 shadow-sm relative z-10 hover:-translate-y-1 transition-transform group">
                        <div class="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-2 text-amber-500 group-hover:scale-110 transition-transform"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                        <p class="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-widest mb-0.5">Tiempo</p>
                        <p class="text-marine dark:text-white text-xl font-black">${horasNav}h<span class="text-[10px] ml-0.5 text-slate-400">${minNav}m</span></p>
                    </div>
                </div>
                <div class="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-6 mb-8 shadow-inner text-left relative overflow-hidden">
                    <div class="flex justify-between items-end mb-3">
                        <span class="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nivel ${rango.nivel}</span>
                        <span class="text-[11px] font-bold text-water dark:text-sky-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">${rango.nivel === 99 ? 'Nivel Máximo' : rango.puntosParaSubir + ' pts para Nivel ' + (rango.nivel + 1)}</span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden shadow-inner relative">
                        <div class="absolute top-0 left-0 h-full w-full bg-white/20"></div>
                        <div class="bg-gradient-to-r from-water to-blue-500 h-4 rounded-full shadow-md transition-all duration-1000 relative" style="width: ${rango.progresoPorcentaje}%"><div class="absolute top-0 right-0 w-4 h-full bg-white/30 skew-x-12"></div></div>
                    </div>
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
                    <h3 class="text-[11px] sm:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b-2 border-slate-100 dark:border-slate-800 pb-3 mb-5 flex items-center gap-2"><svg class="w-4 h-4 text-water dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg> Diario de Aventuras</h3>
                    <div id="contenedorHistorial" class="space-y-5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar pb-4"></div>
                </div>
                <button onclick="cerrarSesion()" class="w-full h-14 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-black uppercase tracking-widest text-[11px] rounded-2xl border-2 border-red-100 dark:border-red-900/30 transition-all shadow-sm active:scale-95">
                    ${appState.esInvitado ? 'Salir del Modo Invitado' : 'Cerrar Sesión'}
                </button>
            </div>
        `;
        cargarHistorialRutas();
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
            <p class="text-slate-500 dark:text-slate-400 text-sm font-medium">Ingresa tu nueva contraseña para acceder.</p>
        </div>
        <div class="space-y-4 w-full dark:bg-slate-900 pb-6 px-2">
            <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></span>
                <input type="password" id="nuevaPassword" class="block w-full h-14 pl-12 pr-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm" placeholder="Nueva contraseña (mín. 6 caracteres)">
            </div>
            <button type="button" onclick="guardarNuevaPassword()" class="w-full h-14 mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/30 dark:shadow-none transition-transform active:scale-95 cursor-pointer">Guardar Contraseña</button>
        </div>
    `;
    const m = document.getElementById('authModal');
    if (m) {
        m.classList.remove('hidden');
        setTimeout(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); }, 10);
    }
}

export async function guardarNuevaPassword() {
    const pass = document.getElementById('nuevaPassword').value;
    if (!pass || pass.length < 6) return alert("La contraseña debe tener al menos 6 caracteres.");
    const { error } = await supabaseClient.auth.updateUser({ password: pass });
    if (error) { alert("Error: " + error.message); } 
    else {
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
        const { error: uploadError } = await supabaseClient.storage.from('paddlesafe').upload(filePath, file, { upsert: true, contentType: mime });
        if (uploadError) throw uploadError;
        
        const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(filePath);
        
        // Cache-Buster para forzar al navegador a renderizar la nueva imagen
        const urlConCacheBuster = `${data.publicUrl}?t=${Date.now()}`;
        
        await supabaseClient.from('perfiles').upsert({ id: appState.sesionActual.user.id, avatar_url: urlConCacheBuster });
        
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
    if (!appState.sesionActual) return alert("No hay sesión activa.");
    const nuevoNombre = document.getElementById('perfilNombre').value.trim().slice(0, 30);
    if (nuevoNombre.length < 2) return alert("El nombre debe tener entre 2 y 30 caracteres.");
    const esPrivado = document.getElementById('perfilPrivado').checked;
    const btn = document.getElementById('btnGuardarPerfil');
    
    btn.disabled = true; btn.textContent = "Guardando...";
    
    const { error } = await supabaseClient.from('perfiles').update({ nombre: nuevoNombre, is_private: esPrivado }).eq('id', appState.sesionActual.user.id);
    if (error) {
        alert("❌ Error al guardar: " + error.message);
        btn.textContent = "Guardar";
        btn.disabled = false;
    } else {
        if (!appState.perfilUsuario) appState.perfilUsuario = {};
        appState.perfilUsuario.nombre = nuevoNombre;
        appState.perfilUsuario.is_private = esPrivado;
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
    if (appState.esInvitado) { 
        appState.esInvitado = false; 
        appState.perfilUsuario = null; 
        actualizarBotonCabecera(); 
        cerrarModalAuth(); 
        window.location.reload(); 
        return; 
    }
    
    // Mostramos un feedback visual mientras cerramos sesión y forzamos reinicio limpio de la memoria RAM
    document.body.innerHTML = '<div class="h-screen w-full flex items-center justify-center bg-marine text-white font-bold animate-pulse">Cerrando sesión de forma segura...</div>';
    
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

export async function cargarHistorialRutas() {
    const contenedor = document.getElementById('contenedorHistorial');
    if (appState.esInvitado) return contenedor.innerHTML = `<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Los invitados no guardan historial.</p></div>`;
    if (!contenedor || !appState.sesionActual) return;
    
    // Evitamos descargar el pesado ruta_json restringiendo el SELECT a la metadata básica
    const { data, error } = await supabaseClient
        .from('rutas')
        .select('id, distancia_km, tiempo_minutos, fecha, imagen_url')
        .eq('user_id', appState.sesionActual.user.id)
        .order('fecha', { ascending: false });
        
    if (error || !data || data.length === 0) return contenedor.innerHTML = `<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Aún no has registrado rutas.</p></div>`;
    
    contenedor.innerHTML = data.map(ruta => {
        const pts = Math.round(ruta.distancia_km * 10) + ruta.tiempo_minutos;
        return `
            <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[24px] p-5 shadow-lg shadow-slate-200/40 dark:shadow-none hover:shadow-xl hover:border-water dark:hover:border-sky-500 transition-all duration-300 mb-5 relative overflow-hidden group cursor-default">
                <div class="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-water/10 dark:from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div class="flex justify-between items-center mb-4 border-b border-slate-50 dark:border-slate-700/50 pb-4 relative z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-orange-800/20 text-orange-500 flex items-center justify-center text-xl border border-orange-200 dark:border-orange-700/50 shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">🗺️</div>
                        <div>
                            <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none mb-1.5">Travesía</p>
                            <span class="text-sm font-black text-marine dark:text-white">${new Date(ruta.fecha).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'})}</span>
                        </div>
                    </div>
                    <div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm">
                        <span class="text-amber-500 text-xs drop-shadow-sm">🏆</span>
                        <span class="text-[11px] font-black text-amber-600 dark:text-amber-400">+${pts} pts</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4 px-2 relative z-10">
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50">
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg> Distancia</span>
                        <p class="font-black text-marine dark:text-white text-3xl tracking-tighter">${Number(ruta.distancia_km).toFixed(1)} <span class="text-xs text-slate-500 dark:text-slate-400 font-bold">km</span></p>
                    </div>
                    <div class="flex flex-col pl-4">
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Tiempo</span>
                        <p class="font-black text-marine dark:text-white text-3xl tracking-tighter">${ruta.tiempo_minutos} <span class="text-xs text-slate-500 dark:text-slate-400 font-bold">min</span></p>
                    </div>
                </div>
            </div>`;
    }).join('');
}

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