// ====================================================
// js/social.js - AMISTADES, FEED Y NOTIFICACIONES
// ====================================================

import { supabaseClient, appState } from './config.js';
import { esc, safeUrl, IMG_FALLBACK } from './utils.js';

// ====================================================
// NOTIFICACIONES INTERNAS (socialNotifications)
// ====================================================
export const socialNotifications = {
    async crear(datos) {
        try {
            const payload = Array.isArray(datos) ? datos : [datos];
            await supabaseClient.from('notificaciones').insert(payload);
        } catch (err) {
            console.warn("Aviso no crítico (Crear Notificación):", err);
        }
    },
    async cargarNotificaciones() {
        if (!appState.sesionActual || appState.esInvitado) return;
        try {
            const { data } = await supabaseClient
                .from('notificaciones')
                .select('*')
                .eq('user_id', appState.sesionActual.user.id)
                .order('created_at', { ascending: false })
                .limit(30);
                
            const badge = document.getElementById('notifBadge');
            const noLeidas = data?.filter(n => !n.leida).length || 0;
            if (badge) {
                if (noLeidas > 0) {
                    badge.textContent = noLeidas > 9 ? '9+' : noLeidas;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            
            const c = document.getElementById('notifContainerList');
            if (!c) return;
            if (!data || data.length === 0) {
                c.innerHTML = `<div class="text-center py-10 opacity-60"><p class="text-[10px] font-bold uppercase dark:text-slate-400">Sin novedades</p></div>`;
                return;
            }
            
            c.innerHTML = data.map(n => {
                const icon = n.tipo === 'solicitud_club' || n.tipo === 'resolucion_club' ? '⚓' : n.tipo === 'mensaje_chat' ? '💬' : '🔔';
                const estilo = n.leida ? 'bg-white dark:bg-slate-800 opacity-75 border-slate-200 dark:border-slate-700' : 'bg-sky-50 dark:bg-sky-900/20 shadow-sm border-sky-100 dark:border-sky-800/50';
                const btnLeida = !n.leida ? `<button onclick="socialNotifications.marcarLeida('${n.id}')" class="text-[9px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 btn-marcar dark:text-white transition-colors">Leída</button>` : '';
                return `
                    <div id="notif-${n.id}" class="flex gap-3 p-3 border rounded-xl mb-2 transition-colors ${estilo}">
                        <div class="text-2xl">${icon}</div>
                        <div class="flex-1">
                            <p class="text-xs font-bold text-marine dark:text-white leading-tight mb-1">${esc(n.contenido)}</p>
                            <div class="flex justify-end">${btnLeida}</div>
                        </div>
                    </div>`;
            }).join('');
        } catch (err) {
            console.warn("Aviso no crítico (Cargar notificaciones):", err);
        }
    },
    async marcarLeida(id) {
        try {
            await supabaseClient.from('notificaciones').update({ leida: true }).eq('id', id);
            const t = document.getElementById(`notif-${id}`);
            if (t) {
                t.classList.remove('bg-sky-50', 'dark:bg-sky-900/20', 'border-sky-100', 'dark:border-sky-800/50', 'shadow-sm');
                t.classList.add('bg-white', 'dark:bg-slate-800', 'opacity-75', 'border-slate-200', 'dark:border-slate-700');
                const b = t.querySelector('.btn-marcar');
                if (b) b.remove();
            }
            this.cargarNotificaciones();
        } catch (err) {
            console.warn("Aviso no crítico (Marcar leída):", err);
        }
    },
    async marcarTodasLeidas() {
        try {
            await supabaseClient.from('notificaciones').update({ leida: true }).eq('user_id', appState.sesionActual.user.id).eq('leida', false);
            this.cargarNotificaciones();
        } catch (err) {
            console.warn("Aviso no crítico (Marcar todas leídas):", err);
        }
    }
};

export function mostrarPanelAvisos() {
    let m = document.getElementById('notificationsModal');
    if (!m) {
        const modalHTML = `
        <div id="notificationsModal" class="fixed inset-0 z-[9999] hidden flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity opacity-0">
            <div class="bg-slate-50 dark:bg-slate-900 w-[90%] max-w-md rounded-[32px] shadow-2xl p-6 transform scale-95 transition-transform relative max-h-[80vh] flex flex-col">
                <div class="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-3">
                    <h3 class="text-lg font-black text-marine dark:text-white uppercase tracking-widest">Avisos</h3>
                    <div class="flex gap-3">
                        <button onclick="socialNotifications.marcarTodasLeidas()" class="text-[10px] text-water dark:text-sky-400 font-bold uppercase tracking-widest bg-sky-50 dark:bg-sky-900/30 px-3 py-1.5 rounded-lg active:scale-95 transition-transform">✓ Leídas</button>
                        <button onclick="cerrarPanelAvisos()" class="text-slate-400 hover:text-red-500 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>
                <div id="notifContainerList" class="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        m = document.getElementById('notificationsModal');
    }
    m.classList.remove('hidden');
    m.classList.add('flex');
    requestAnimationFrame(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); });
    socialNotifications.cargarNotificaciones();
}

export function cerrarPanelAvisos() {
    const m = document.getElementById('notificationsModal');
    if (!m) return;
    m.classList.add('opacity-0');
    m.querySelector('div').classList.add('scale-95');
    setTimeout(() => { m.classList.add('hidden'); m.classList.remove('flex'); }, 300);
}

// ====================================================
// SISTEMA DE AMISTADES
// ====================================================
export async function enviarSolicitudAmistad(amigoId) {
    if (!appState.sesionActual || appState.esInvitado) return alert("Inicia sesión para añadir amigos.");
    const btn = document.getElementById('btnAñadirAmigoSPA');
    if(btn) { btn.disabled = true; btn.textContent = "Procesando..."; }
    
    try {
        const { error } = await supabaseClient.from('amistades').insert([{ usuario_id: appState.sesionActual.user.id, amigo_id: amigoId, estado: 'pendiente' }]);
        if (error) throw error;
        alert("Solicitud enviada");
        if(window.verificarEstadoAmistad) window.verificarEstadoAmistad(amigoId);
        
        if (appState.sesionActual && appState.perfilUsuario) {
            socialNotifications.crear({
                user_id: amigoId,
                tipo: 'solicitud_amistad',
                contenido: `👋 ¡${appState.perfilUsuario.nombre} te envió solicitud de amistad!`
            });
        }
    } catch (e) { 
        console.warn('Aviso no crítico:', e); 
        alert("Error al enviar solicitud."); 
        if(btn) { btn.disabled = false; btn.textContent = "Añadir Amigo"; } 
    }
}

export async function responderSolicitudAmistad(amistadId, accion) {
    try {
        const { data: amistadRel } = await supabaseClient.from('amistades').select('usuario_id').eq('id', amistadId).single();
        const est = accion === 'aceptar' ? 'aceptada' : 'rechazada';
        const { error } = await supabaseClient.from('amistades').update({ estado: est }).eq('id', amistadId);
        if (error) throw error;
        
        if (document.getElementById('friendSystemModal') && !document.getElementById('friendSystemModal').classList.contains('hidden')) {
            cambiarTabAmistades('solicitudes');
        }
        
        if (amistadRel && appState.sesionActual) {
            socialNotifications.crear({
                user_id: amistadRel.usuario_id,
                tipo: 'resolucion_amistad',
                contenido: `${appState.perfilUsuario.nombre} ha ${accion} tu solicitud.`
            });
        }
    } catch (e) { 
        console.warn('Aviso no crítico:', e); 
        alert("Error al responder."); 
    }
}

export async function verificarEstadoAmistad(targetUserId) {
    if (!appState.sesionActual || appState.esInvitado) return;
    const btn = document.getElementById('btnAñadirAmigoSPA');
    if (!btn) return;
    
    const { data } = await supabaseClient.from('amistades').select('*').or(`and(usuario_id.eq.${appState.sesionActual.user.id},amigo_id.eq.${targetUserId}),and(usuario_id.eq.${targetUserId},amigo_id.eq.${appState.sesionActual.user.id})`).order('created_at', { ascending: false }).limit(1);
    
    if (data && data.length > 0) {
        const rel = data[0];
        if (rel.estado === 'aceptada') {
            btn.textContent = "🤝 Amigos"; btn.disabled = true; btn.className = "mt-2 mb-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-5 py-2 rounded-full uppercase cursor-default";
        } else if (rel.estado === 'pendiente') {
            if (rel.usuario_id === appState.sesionActual.user.id) {
                btn.textContent = "⏳ Pendiente"; btn.disabled = true; btn.className = "mt-2 mb-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[10px] font-bold px-5 py-2 rounded-full uppercase cursor-default";
            } else {
                btn.outerHTML = `<div class="flex gap-2 mt-2 mb-2 justify-center"><button onclick="responderSolicitudAmistad('${rel.id}', 'aceptar'); setTimeout(()=>verificarEstadoAmistad('${targetUserId}'), 500);" class="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold px-4 py-2 rounded-full uppercase transition-colors">Aceptar</button><button onclick="responderSolicitudAmistad('${rel.id}', 'rechazar'); setTimeout(()=>verificarEstadoAmistad('${targetUserId}'), 500);" class="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-4 py-2 rounded-full uppercase transition-colors">Rechazar</button></div>`;
            }
        } else if (rel.estado === 'rechazada') {
            btn.textContent = "Añadir Amigo"; btn.disabled = false;
        }
    } else {
        // Corrección: Devolver el botón al estado original si la amistad se borró o no existe
        btn.textContent = "Añadir Amigo";
        btn.disabled = false;
        btn.className = "bg-water hover:bg-sky-600 text-white text-[10px] font-bold px-5 py-2 rounded-full uppercase transition-colors shadow-sm active:scale-95 cursor-pointer";
        btn.onclick = () => { if(window.enviarSolicitudAmistad) window.enviarSolicitudAmistad(targetUserId); };
    }
}

export async function cargarTabAmigosSPA() {
    if (!appState.spaCurrentUser) return;
    const content = document.getElementById('userProfileContent');
    content.innerHTML = 'Cargando amigos...';
    
    ['spaTabInsignias','spaTabRutas', 'spaTabAmigos'].forEach(id => {
        const b = document.getElementById(id);
        if(b) b.className="h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
    });
    
    const activeBtn = document.getElementById('spaTabAmigos');
    if(activeBtn) activeBtn.className="h-10 px-2 bg-marine dark:bg-water text-white shadow text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
    
    const { data } = await supabaseClient.from('amistades').select('usuario_id, amigo_id, perfiles!usuario_id(id,nombre,avatar_url), perfiles_amigo:perfiles!amigo_id(id,nombre,avatar_url)').eq('estado', 'aceptada').or(`usuario_id.eq.${appState.spaCurrentUser.id},amigo_id.eq.${appState.spaCurrentUser.id}`);
    if (!data || !data.length) return content.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Aún no tiene amigos.</p></div>';
    
    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pb-4">';
    html += data.map(rel => {
        const amigo = rel.usuario_id === appState.spaCurrentUser.id ? rel.perfiles_amigo : rel.perfiles;
        if (!amigo) return '';
        return `
            <div role="button" tabindex="0" onclick="if(window.navigateSPA) window.navigateSPA('/user/${amigo.id}')" class="bg-white dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700 rounded-[20px] shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-water dark:hover:border-sky-500 cursor-pointer transition-all duration-300 flex items-center gap-4 group">
                <div class="relative"><img src="${esc(safeUrl(amigo.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-14 h-14 rounded-full object-cover border-4 border-slate-50 dark:border-slate-700 shadow-md group-hover:border-water dark:group-hover:border-sky-500 transition-colors duration-300"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-black text-marine dark:text-white truncate group-hover:text-water dark:group-hover:text-sky-400 transition-colors">${esc(amigo.nombre)}</p>
                    <div class="flex items-center gap-1.5 mt-0.5"><span class="w-1.5 h-1.5 rounded-full bg-water dark:bg-sky-400"></span><p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest truncate">Paddler</p></div>
                </div>
                <div class="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-water dark:group-hover:bg-sky-500 group-hover:text-white transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></div>
            </div>`;
    }).join('');
    content.innerHTML = html + '</div>';
}

export function abrirPanelMisAmigos() {
    if (window.cerrarModalAuth) window.cerrarModalAuth();
    const modal = document.getElementById('friendSystemModal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); }, 10);
        cambiarTabAmistades('lista');
    }
}

export function cerrarPanelMisAmigos() {
    const modal = document.getElementById('friendSystemModal');
    if (modal) {
        modal.classList.add('opacity-0'); modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); if(window.abrirModalAuth) window.abrirModalAuth(); }, 300);
    }
}

export async function cambiarTabAmistades(tab) {
    const btnLista = document.getElementById('tabMisAmigos');
    const btnSol = document.getElementById('tabSolicitudesAmistad');
    const c = document.getElementById('friendSystemContent');
    
    if(tab === 'lista') {
        btnLista.className = "h-10 px-2 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 cursor-pointer transition-colors";
        btnSol.className = "h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors relative";
        c.innerHTML = '<p class="text-center text-slate-400 dark:text-slate-500 mt-5 animate-pulse">Cargando...</p>';
        
        const { data } = await supabaseClient.from('amistades').select('usuario_id, amigo_id, perfiles!usuario_id(id,nombre,avatar_url), perfiles_amigo:perfiles!amigo_id(id,nombre,avatar_url)').eq('estado', 'aceptada').or(`usuario_id.eq.${appState.sesionActual.user.id},amigo_id.eq.${appState.sesionActual.user.id}`);
        if (!data || !data.length) { c.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">No tienes amigos añadidos.</p></div>'; return; }
        
        let html = '<div class="space-y-4 mt-4 pb-4">';
        html += data.map(rel => {
            const amigo = rel.usuario_id === appState.sesionActual.user.id ? rel.perfiles_amigo : rel.perfiles;
            if(!amigo) return '';
            return `
                <div role="button" tabindex="0" onclick="cerrarPanelMisAmigos(); setTimeout(()=>{ if(window.navigateSPA) window.navigateSPA('/user/${amigo.id}') }, 350);" class="bg-white dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700 rounded-[20px] shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-water dark:hover:border-sky-500 cursor-pointer transition-all duration-300 flex items-center gap-4 group">
                    <div class="relative"><img src="${esc(safeUrl(amigo.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-14 h-14 rounded-full object-cover border-4 border-slate-50 dark:border-slate-700 shadow-md group-hover:border-water dark:group-hover:border-sky-500 transition-colors duration-300"></div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-black text-marine dark:text-white truncate group-hover:text-water dark:group-hover:text-sky-400 transition-colors">${esc(amigo.nombre)}</p>
                        <div class="flex items-center gap-1.5 mt-0.5"><span class="w-1.5 h-1.5 rounded-full bg-water dark:bg-sky-400"></span><p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest truncate">Paddler</p></div>
                    </div>
                    <div class="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-water dark:group-hover:bg-sky-500 group-hover:text-white transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></div>
                </div>`;
        }).join('');
        c.innerHTML = html + '</div>';
    } else {
        btnSol.className = "h-10 px-2 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 cursor-pointer transition-colors relative";
        btnLista.className = "h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
        c.innerHTML = '<p class="text-center text-slate-400 dark:text-slate-500 mt-5 animate-pulse">Cargando...</p>';
        
        const { data } = await supabaseClient.from('amistades').select('id, usuario_id, created_at, perfiles!usuario_id(nombre,avatar_url)').eq('amigo_id', appState.sesionActual.user.id).eq('estado', 'pendiente');
        comprobarNuevasSolicitudesSilencioso();
        
        if (!data || !data.length) { c.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">No hay solicitudes pendientes.</p></div>'; return; }
        
        let html = '<div class="space-y-4 mt-4 pb-4">';
        html += data.map(sol => {
            const p = sol.perfiles;
            return `
                <div class="bg-white dark:bg-slate-800 p-5 border border-slate-200 dark:border-slate-700 rounded-[20px] shadow-sm flex flex-col gap-4">
                    <div class="flex items-center gap-4">
                        <img src="${esc(safeUrl(p.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-14 h-14 rounded-full object-cover border-4 border-slate-50 dark:border-slate-700 shadow-md">
                        <div class="flex flex-col min-w-0">
                            <span class="text-sm font-black text-marine dark:text-white truncate">${esc(p.nombre)}</span>
                            <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Te ha enviado una solicitud</span>
                        </div>
                    </div>
                    <div class="flex gap-3 mt-1">
                        <button onclick="responderSolicitudAmistad('${sol.id}', 'aceptar')" class="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors shadow-md shadow-emerald-500/20 dark:shadow-none">Aceptar</button>
                        <button onclick="responderSolicitudAmistad('${sol.id}', 'rechazar')" class="flex-1 h-11 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors">Rechazar</button>
                    </div>
                </div>`;
        }).join('');
        c.innerHTML = html + '</div>';
    }
}

export async function comprobarNuevasSolicitudesSilencioso() {
    if(!appState.sesionActual || appState.esInvitado) return;
    const badge = document.getElementById('badgeSolicitudesAmistad');
    if(!badge) return;
    const { count } = await supabaseClient.from('amistades').select('*', { count: 'exact', head: true }).eq('amigo_id', appState.sesionActual.user.id).eq('estado', 'pendiente');
    if(count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
}

// ====================================================
// FEED SOCIAL (socialFeed)
// ====================================================
export const socialFeed = {
    async obtenerFiltrosUsuario() {
        if (!appState.sesionActual || appState.esInvitado) return { misClubsIds: [], misAmigosIds: [], miId: null };
        const miId = appState.sesionActual.user.id;
        let misClubsIds = [];
        let misAmigosIds = [];
        try {
            const { data: clubs } = await supabaseClient.from('clubs_usuarios').select('club_id').eq('user_id', miId);
            if (clubs && clubs.length) misClubsIds = clubs.map(c => c.club_id);
            
            const { data: amistades } = await supabaseClient.from('amistades').select('usuario_id, amigo_id').eq('estado', 'aceptada').or(`usuario_id.eq.${miId},amigo_id.eq.${miId}`);
            if (amistades && amistades.length) misAmigosIds = amistades.map(a => a.usuario_id === miId ? a.amigo_id : a.usuario_id);
        } catch (e) { console.warn('Aviso no crítico (Filtros feed):', e); }
        return { misClubsIds, misAmigosIds, miId };
    },
    async cargarActividad(filtro = 'global') {
        const c = document.getElementById('feedContainerList');
        if (!c) return;
        c.innerHTML = `<p class="text-center text-slate-400 dark:text-slate-500 text-[10px] animate-pulse py-10 uppercase font-bold tracking-widest">Buscando actividad...</p>`;
        try {
            const { misClubsIds, misAmigosIds } = await this.obtenerFiltrosUsuario();
            
            const qMiembros = supabaseClient.from('clubs_usuarios').select('joined_at, club_id, user_id, perfiles(nombre, avatar_url), clubs(nombre)').order('joined_at', { ascending: false }).limit(15);
            const qRutas = supabaseClient.from('club_rutas').select('created_at, club_id, ruta_id, rutas(ubicacion, distancia_km), clubs(nombre)').order('created_at', { ascending: false }).limit(15);
            const qChat = supabaseClient.from('club_chat').select('created_at, club_id, user_id, mensaje, perfiles(nombre, avatar_url), clubs(nombre)').order('created_at', { ascending: false }).limit(15);
            
            const [resM, resR, resC] = await Promise.all([qMiembros, qRutas, qChat]);
            let acts = [];
            
            if (resM.data) resM.data.forEach(i => { acts.push({ date: new Date(i.joined_at), clubId: i.club_id, userId: i.user_id, html: `<div class="flex items-center gap-4"><img src="${esc(safeUrl(i.perfiles?.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full border-2 border-emerald-100 dark:border-emerald-800 object-cover shadow-sm"><p class="text-sm text-slate-600 dark:text-slate-300 leading-snug"><strong class="text-marine dark:text-white font-black">${esc(i.perfiles?.nombre)}</strong> se unió a <strong class="text-emerald-600 dark:text-emerald-400 font-bold">${esc(i.clubs?.nombre)}</strong>.</p></div>` }); });
            if (resR.data) resR.data.forEach(i => { acts.push({ date: new Date(i.created_at), clubId: i.club_id, userId: null, html: `<div class="flex items-center gap-4"><div class="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-900/30 border border-sky-100 dark:border-sky-800/50 flex items-center justify-center text-xl shadow-sm text-sky-500">🗺️</div><div class="flex-1 min-w-0"><p class="text-sm text-slate-600 dark:text-slate-300 leading-snug">El club <strong class="text-marine dark:text-white font-black">${esc(i.clubs?.nombre)}</strong> trazó ruta en <strong class="text-marine dark:text-white">${esc(i.rutas?.ubicacion)}</strong>.</p><div class="inline-block mt-1 bg-water/10 dark:bg-sky-500/20 px-2 py-0.5 rounded text-[10px] font-black text-water dark:text-sky-400 uppercase tracking-widest">${i.rutas?.distancia_km} km</div></div></div>` }); });
            if (resC.data) resC.data.forEach(i => { acts.push({ date: new Date(i.created_at), clubId: i.club_id, userId: i.user_id, html: `<div class="flex items-start gap-4"><img src="${esc(safeUrl(i.perfiles?.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700 shadow-sm mt-1"><div class="flex-1 min-w-0"><p class="text-sm text-slate-600 dark:text-slate-300 leading-snug"><strong class="text-marine dark:text-white font-black">${esc(i.perfiles?.nombre)}</strong> comentó en <strong class="text-marine dark:text-white font-bold">${esc(i.clubs?.nombre)}</strong>.</p><div class="mt-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 p-3 rounded-2xl rounded-tl-sm text-sm text-slate-700 dark:text-slate-300 italic shadow-sm">"${esc(i.mensaje)}"</div></div></div>` }); });
            
            if (filtro === 'mis_clubs' && misClubsIds.length) acts = acts.filter(i => misClubsIds.includes(i.clubId));
            else if (filtro === 'mis_amigos' && misAmigosIds.length) acts = acts.filter(i => i.userId && misAmigosIds.includes(i.userId));
            
            acts.sort((a, b) => b.date - a.date);
            
            if (acts.length === 0) return c.innerHTML = `<div class="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner"><span class="text-5xl block mb-4 opacity-40 drop-shadow-md">📭</span><p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">No hay actividad reciente.</p></div>`;
            
            let h = '<div class="space-y-4">';
            h += acts.map(i => `<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 rounded-[24px] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">${i.html}<div class="mt-4 pt-3 border-t border-slate-50 dark:border-slate-700/50 flex justify-end"><span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md">${i.date.toLocaleDateString(undefined, {month:'short', day:'numeric'})} • ${i.date.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'})}</span></div></div>`).join('');
            c.innerHTML = h + '</div>';
        } catch (e) { 
            c.innerHTML = `<p class="text-center text-red-400 text-xs">Error de conexión al cargar feed.</p>`; 
            console.warn('Aviso no crítico:', e); 
        }
    },
    abrirModal() {
        if (!appState.sesionActual || appState.esInvitado) return alert("Inicia sesión.");
        const m = document.getElementById('socialFeedModal'); if (!m) return;
        m.classList.remove('hidden'); requestAnimationFrame(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); });
        this.cambiarFiltro('global');
    },
    cerrarModal() {
        const m = document.getElementById('socialFeedModal'); if (!m) return;
        m.classList.add('opacity-0'); m.querySelector('div').classList.add('scale-95');
        setTimeout(() => m.classList.add('hidden'), 300);
    },
    cambiarFiltro(filtro) {
        ['tabFeedGlobal', 'tabFeedClubs', 'tabFeedAmigos'].forEach(id => { const btn = document.getElementById(id); if (btn) btn.className = "h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold rounded-lg flex-1 transition-colors"; });
        const activeId = filtro === 'mis_clubs' ? 'tabFeedClubs' : filtro === 'mis_amigos' ? 'tabFeedAmigos' : 'tabFeedGlobal';
        const btnA = document.getElementById(activeId); if (btnA) btnA.className = "h-10 px-2 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 transition-colors";
        this.cargarActividad(filtro);
    }
};

// ====================================================
// FUNCIÓN PARA INYECTAR BOTONES SIN MUTATION OBSERVER
// ====================================================
export function inicializarBotonesSociales() {
    const headerBtnContainer = document.querySelector('.w-full.flex.justify-between.items-start.relative.z-20 .flex.items-center.gap-2');
    if (headerBtnContainer && appState.sesionActual && !appState.esInvitado && !document.getElementById('btnNotificacionesTop')) {
        const btnCampanaHTML = `<button type="button" id="btnNotificacionesTop" onclick="mostrarPanelAvisos()" class="relative text-white/70 hover:text-white transition-all hover:scale-105 flex flex-col items-center cursor-pointer mr-3"><svg class="h-7 w-7 sm:h-8 sm:w-8 drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg><span class="text-[11px] sm:text-xs font-black mt-1 uppercase tracking-widest">Avisos</span><span id="notifBadge" class="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full hidden border-2 border-marine font-black shadow-lg">0</span></button>`;
        headerBtnContainer.insertAdjacentHTML('afterbegin', btnCampanaHTML);
        
        // Ejecución inmediata inicial
        socialNotifications.cargarNotificaciones();
        
        // NUEVO SISTEMA RECURSIVO (Evita apilamiento de promesas en redes lentas)
        if (!window._notifTimerActivo) {
            window._notifTimerActivo = true;
            
            const cicloNotificaciones = async () => {
                if (appState.sesionActual && !appState.esInvitado && !document.hidden) {
                    try {
                        await socialNotifications.cargarNotificaciones();
                    } catch (e) {
                        console.warn("Fallo silencioso en notificaciones en segundo plano");
                    }
                }
                // Programar la siguiente llamada solo cuando esta termina
                setTimeout(cicloNotificaciones, 60000); 
            };
            
            setTimeout(cicloNotificaciones, 60000);
        }
    }
    
    const topBarGroups = document.querySelector('.w-full.flex.justify-between.items-start.relative.z-20 .flex.gap-4');
    if (topBarGroups && !document.getElementById('btnModalFeed')) {
        const btnFeedHTML = `<button type="button" id="btnModalFeed" onclick="socialFeed.abrirModal()" class="text-white/70 hover:text-white transition-transform hover:scale-105 flex flex-col items-center cursor-pointer"><span class="text-2xl sm:text-3xl drop-shadow-md">📰</span><span class="text-[11px] sm:text-xs font-black mt-1 uppercase tracking-widest">Feed</span></button>`;
        topBarGroups.insertAdjacentHTML('beforeend', btnFeedHTML);
    }
}

window.socialNotifications = socialNotifications;
window.mostrarPanelAvisos = mostrarPanelAvisos;
window.cerrarPanelAvisos = cerrarPanelAvisos;
window.enviarSolicitudAmistad = enviarSolicitudAmistad;
window.responderSolicitudAmistad = responderSolicitudAmistad;
window.verificarEstadoAmistad = verificarEstadoAmistad;
window.cargarTabAmigosSPA = cargarTabAmigosSPA;
window.abrirPanelMisAmigos = abrirPanelMisAmigos;
window.cerrarPanelMisAmigos = cerrarPanelMisAmigos;
window.cambiarTabAmistades = cambiarTabAmistades;
window.comprobarNuevasSolicitudesSilencioso = comprobarNuevasSolicitudesSilencioso;
window.socialFeed = socialFeed;
window.inicializarBotonesSociales = inicializarBotonesSociales;