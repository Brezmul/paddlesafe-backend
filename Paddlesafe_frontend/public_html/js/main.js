// ====================================================
// js/main.js - ORQUESTADOR PRINCIPAL (PUNTO DE ENTRADA)
// ====================================================

import { supabaseClient, appState } from './config.js';
import { IMG_FALLBACK, esc, safeUrl } from './utils.js'; // AÑADIDO: esc y safeUrl
import * as Auth from './auth.js';
import * as MapModule from './map.js';
import * as Social from './social.js';

// NUEVA IMPORTACIÓN MODULAR DEL CLUB
import ClubFacade from './club/index.js';

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

// Exponemos la nueva Fachada del Club globalmente
window.Club = ClubFacade;

// Adaptadores defensivos de retrocompatibilidad para el DOM
window.abrirModalClubs = () => window.Club && window.Club.abrirModal ? window.Club.abrirModal() : null;
window.cerrarModalClubs = () => window.Club && window.Club.cerrarModal ? window.Club.cerrarModal() : null;

const openClubProfileSafe = (id) => {
    if (window.Club && typeof window.Club.openClubProfile === 'function') window.Club.openClubProfile(id);
    else if (typeof window.openClubProfile === 'function') window.openClubProfile(id);
};

const closeClubProfileSafe = () => {
    if (window.Club && typeof window.Club.cerrarClubProfileView === 'function') window.Club.cerrarClubProfileView();
    else if (typeof window.cerrarClubProfileView === 'function') window.cerrarClubProfileView();
};

// ====================================================
// 2. INICIALIZACIÓN PRINCIPAL (Load)
// ====================================================
window.addEventListener('load', async () => {
    if (!supabaseClient) console.warn("Aviso: Supabase aún no cargado.");
    
    // Escuchar cambios en el historial (botón atrás del navegador o móvil)
    window.addEventListener('popstate', handleSPA);
    
    ['btnModalRanking', 'btnModalClubs', 'btnCabeceraPerfil', 'btnPro'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });
    });
    
    const btnPro = document.getElementById("btnPro");
    const panelPro = document.getElementById("panelPro");
    const btnProIcon = document.getElementById("btnProIcon");
    let proPanelOpen = false;
    
    if (btnPro && panelPro && btnProIcon) {
        btnPro.addEventListener("click", () => {
            proPanelOpen = !proPanelOpen;
            panelPro.style.gridTemplateRows = proPanelOpen ? "1fr" : "0fr";
            if (proPanelOpen) {
                 btnProIcon.classList.add("rotate-180");
                 setTimeout(() => {
                     if(MapModule.inicializarMapa) MapModule.inicializarMapa();
                     if (MapModule.map) {
                         MapModule.map.invalidateSize();
                         setTimeout(() => MapModule.map.invalidateSize(), 400);
                     }
                }, 350);
             } else {
                btnProIcon.classList.remove("rotate-180");
            }
        });
    }
    
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const strHoy = `${hoy.getFullYear()}-${mes}-${dia}`;
    if(document.getElementById('date')) document.getElementById('date').value = strHoy;
    if(document.getElementById('proDate')) document.getElementById('proDate').value = strHoy;
    
    if (supabaseClient) {
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
        if (Auth.initAuthListeners) Auth.initAuthListeners();
    }
    handleSPA();
});

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
        
        // BLOQUE DE CONTROL DE PRIVACIDAD
        if (!isMe && user.is_private) {
            const btnContainer = document.getElementById('spaBtnContainer');
            if (btnContainer) btnContainer.innerHTML = '';
            
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
            return; // Detenemos la ejecución para evitar que se carguen las rutas
        } else {
            // Aseguramos que las pestañas sean visibles
            ['spaTabInsignias', 'spaTabRutas'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('hidden');
            });
        }
        
        // Contenedor dinámico y ordenado para las acciones de perfil
        let btnContainer = document.getElementById('spaBtnContainer');
        if (!btnContainer && levelEl) {
            btnContainer = document.createElement('div');
            btnContainer.id = 'spaBtnContainer';
            btnContainer.className = 'flex justify-center gap-2 mt-2 mb-4';
            levelEl.insertAdjacentElement('afterend', btnContainer);
        }
        
        if (btnContainer) {
            btnContainer.innerHTML = ''; // Limpiar botones anteriores

            // Botón 1: Añadir Amigo (Solo visible si no soy yo)
            if (appState.sesionActual && !isMe) {
                const btnAmigo = document.createElement('button');
                btnAmigo.id = 'btnAñadirAmigoSPA';
                btnAmigo.className = 'bg-water hover:bg-sky-600 text-white text-[10px] font-bold px-5 py-2 rounded-full uppercase transition-colors shadow-sm active:scale-95 cursor-pointer';
                btnAmigo.textContent = 'Añadir Amigo';
                btnAmigo.onclick = () => { if(window.enviarSolicitudAmistad) window.enviarSolicitudAmistad(userId); };
                btnContainer.appendChild(btnAmigo);
            }

            // Botón 2: Invitar al Club (Requiere integración con el nuevo estado modular)
            if (appState.sesionActual && !isMe) {
                let activeClubId = null;
                // Intentamos obtener el ID del club activo de manera segura
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

        // Privacidad de la Pestaña Amigos (Solo visible si es mi propio perfil)
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
        
        if (window.verificarEstadoAmistad && appState.sesionActual && !isMe) {
            window.verificarEstadoAmistad(userId);
        }
        cambiarTabPerfilSPA('rutas');
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
        // PREVENCIÓN DE COLAPSO DE RAM: Seleccionamos estrictamente la metadata omitiendo ruta_json
        const { data } = await supabaseClient
            .from('rutas')
            .select('id, distancia_km, tiempo_minutos, fecha')
            .eq('user_id', spaCurrentUser.id)
            .order('fecha', { ascending: false });
            
        if(!data || !data.length) return content.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Aún no tiene rutas registradas.</p></div>';
        
        let html = '<div class="space-y-4 mt-4 pb-4">';
        html += data.map(ruta => {
            const dist = Number(ruta.distancia_km || 0);
            const time = Number(ruta.tiempo_minutos || 0);
            const pts = Math.round(dist * 10) + time;
            const fechaFormateada = ruta.fecha ? new Date(ruta.fecha).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}) : '--/--';
            
            return `
            <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[24px] p-5 shadow-md shadow-slate-200/40 dark:shadow-none hover:shadow-xl hover:border-water dark:hover:border-sky-500 transition-all duration-300 relative overflow-hidden group cursor-pointer">
                <div class="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-water/10 dark:from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div class="flex justify-between items-center mb-4 border-b border-slate-50 dark:border-slate-700/50 pb-4 relative z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-800/20 text-sky-500 flex items-center justify-center text-lg border border-sky-200 dark:border-sky-700/50 shadow-inner group-hover:scale-110 transition-transform duration-300">🗺️</div>
                        <div>
                            <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none mb-1.5">Exploración</p>
                            <span class="text-sm font-black text-marine dark:text-white">${fechaFormateada}</span>
                        </div>
                    </div>
                    <div class="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm">
                        <span class="text-emerald-500 font-black text-[11px] uppercase tracking-widest">Validada</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4 px-2 relative z-10">
                    <div class="flex flex-col border-r border-slate-100 dark:border-slate-700/50">
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1.5">Distancia</span>
                        <p class="font-black text-marine dark:text-white text-2xl tracking-tighter">${dist.toFixed(1)}<span class="text-xs text-slate-400 font-bold ml-1">km</span></p>
                    </div>
                    <div class="flex flex-col pl-4">
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1.5">Puntuación</span>
                        <p class="font-black text-amber-500 text-2xl tracking-tighter">${pts}<span class="text-xs text-amber-400/80 font-bold ml-1">pts</span></p>
                    </div>
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
                        <span class="text-4xl drop-shadow-md">${item.icono || '🏅'}</span>
                    </div>
                    <p class="text-[11px] font-black text-marine dark:text-white uppercase tracking-widest leading-tight relative z-10 px-1">${nombreEsc}</p>
                    ${item.descripcion ? `<p class="text-[9px] text-slate-400 dark:text-slate-500 mt-2 font-bold leading-relaxed relative z-10 px-2 hidden group-hover:block transition-all">${item.descripcion}</p>` : ''}
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
            <div role="button" tabindex="0" onclick="navigateSPA('/user/${pd.id}')" class="flex items-center gap-3 p-3 border border-slate-100 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 hover:shadow-md cursor-pointer w-full mb-2 transition-shadow">
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