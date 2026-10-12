import { supabaseClient, appState } from '../config.js';
import { esc, safeUrl, IMG_FALLBACK } from '../utils.js';
import { ClubState } from './state.js';

export const ClubPublic = {
    async open(clubId) {
        const modal = document.getElementById('clubPublicViewModal');
        if (!modal) return;

        ClubState.publicId = clubId;
        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            const box = modal.querySelector('div');
            if (box) box.classList.remove('scale-95');
        });

        // 1. Cargar datos del club
        const { data: club, error } = await supabaseClient.from('clubs').select('*').eq('id', clubId).maybeSingle();
        if (error || !club) {
            console.error('[club] error al cargar perfil del club:', error);
            alert("No se pudo cargar la información del club.");
            return this.close();
        }

        // 2. Poblar cabecera e info
        const logoEl = document.getElementById('cpvLogo');
        if (logoEl) logoEl.src = safeUrl(club.logo_url, IMG_FALLBACK);

        const nameEl = document.getElementById('cpvName');
        if (nameEl) nameEl.textContent = club.nombre || 'Club';

        const statsEl = document.getElementById('cpvStats');
        if (statsEl) {
            statsEl.textContent = `${club.ubicacion ? `📍 ${club.ubicacion} • ` : ''}Nivel ${club.nivel || 1} • ${club.puntos || 0} pts`;
        }

        const descEl = document.getElementById('cpvDescription');
        if (descEl) descEl.textContent = club.descripcion || 'Sin descripción disponible.';

        // 3. Comprobar si el usuario actual es miembro o tiene solicitud
        const myId = appState.sesionActual?.user?.id;
        let miRol = null;
        let esMiembro = false;
        let tieneSolicitud = false;

        if (myId) {
            try {
                const { data: cu } = await supabaseClient
                    .from('clubs_usuarios')
                    .select('rol')
                    .eq('club_id', clubId)
                    .eq('user_id', myId)
                    .maybeSingle();
                if (cu) {
                    miRol = cu.rol;
                    esMiembro = true;
                } else {
                    const { data: sol } = await supabaseClient
                        .from('clubs_solicitudes')
                        .select('id')
                        .eq('club_id', clubId)
                        .eq('user_id', myId)
                        .eq('estado', 'pendiente')
                        .maybeSingle();
                    if (sol) tieneSolicitud = true;
                }
            } catch (err) {
                console.warn('[club] comprobación rol público:', err);
            }
        }

        // 4. Botón de Unirse
        const joinBtn = document.getElementById('cpvJoinBtn');
        if (joinBtn) {
            if (esMiembro) {
                const rolTexto = miRol === 'creador' ? '👑 Eres el Creador' : (miRol === 'admin' ? '⭐ Eres Administrador' : '✅ Eres Miembro');
                joinBtn.textContent = rolTexto;
                joinBtn.className = "w-full h-11 bg-emerald-600 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center";
                joinBtn.onclick = null;
            } else if (tieneSolicitud) {
                joinBtn.textContent = '⏳ Solicitud Pendiente';
                joinBtn.className = "w-full h-11 bg-amber-500 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center";
                joinBtn.onclick = null;
            } else {
                joinBtn.textContent = '🌊 Unirse al Club';
                joinBtn.className = "w-full h-11 bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-bold rounded-xl shadow-md active:scale-95 transition-transform uppercase tracking-widest text-[11px] cursor-pointer flex items-center justify-center";
                joinBtn.onclick = () => window.Club.solicitarUnirseClub(clubId);
            }
        }

        // 5. Visibilidad de pestañas de administración
        const esAdmin = miRol === 'creador' || miRol === 'admin';
        const tabAdmin = document.getElementById('cpvTabAdmin');
        const tabSol = document.getElementById('cpvTabSolicitudes');
        if (tabAdmin) tabAdmin.classList.toggle('hidden', !esAdmin);
        if (tabSol) tabSol.classList.toggle('hidden', !esAdmin);

        ClubState.currentClubData = club;
        await this.cambiarTab('info');
    },

    close() {
        const modal = document.getElementById('clubPublicViewModal');
        if (modal) {
            modal.classList.add('opacity-0');
            const box = modal.querySelector('div');
            if (box) box.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
        ClubState.publicId = null;
        ClubState.currentClubData = null;
    },

    async cambiarTab(tab) {
        const clubId = ClubState.publicId;
        const club = ClubState.currentClubData;
        if (!clubId) return;

        const tabs = ['info', 'miembros', 'rutas', 'vitrina', 'chat', 'admin', 'solicitudes'];
        tabs.forEach(t => {
            const btn = document.getElementById(`cpvTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if (btn) {
                if (t === tab) {
                    btn.className = "h-10 px-3 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 cursor-pointer transition-colors";
                } else {
                    btn.className = "h-10 px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
                }
            }
        });

        const containers = {
            'info': document.getElementById('cpvInfoContainer'),
            'miembros': document.getElementById('cpvMembersContainer'),
            'rutas': document.getElementById('cpvRoutesContainerFull'),
            'vitrina': document.getElementById('cpvShowcaseContainer'),
            'chat': document.getElementById('cpvChatContainer'),
            'admin': document.getElementById('cpvAdminPanel'),
            'solicitudes': document.getElementById('cpvRequestsContainer')
        };

        Object.keys(containers).forEach(k => {
            const c = containers[k];
            if (c) c.classList.toggle('hidden', k !== tab);
        });

        // Contenedor de rutas preview inicial (ocultar cuando se exploran pestañas)
        const routesPreview = document.getElementById('cpvRoutesContainer');
        if (routesPreview) routesPreview.classList.add('hidden');

        // Renderizado según tab
        if (tab === 'info') {
            const c = containers.info;
            if (c && club) {
                c.innerHTML = `
                    <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 space-y-3 shadow-sm">
                        ${club.ubicacion ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Ubicación</p><p class="text-sm font-bold text-marine dark:text-white">📍 ${esc(club.ubicacion)}</p></div>` : ''}
                        ${club.normas ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Normas del Club</p><p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${esc(club.normas)}</p></div>` : ''}
                        <div><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Descripción</p><p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${esc(club.descripcion || 'Sin descripción.')}</p></div>
                    </div>`;
            }
        } else if (tab === 'miembros') {
            const c = containers.miembros;
            if (c) {
                c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando tripulación...</p>';
                try {
                    const { data: miembros } = await supabaseClient.rpc('obtener_miembros_club', { p_club_id: clubId });
                    if (!miembros || miembros.length === 0) {
                        c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold">Sin miembros registrados en este club.</p>';
                    } else {
                        c.innerHTML = `
                            <div class="space-y-2.5">
                                ${miembros.map(m => {
                                    const mRol = (m.rol || 'miembro').toLowerCase();
                                    const badgeColor = mRol === 'creador' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : (mRol === 'admin' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300');
                                    const badgeTexto = mRol === 'creador' ? '👑 Creador' : (mRol === 'admin' ? '⭐ Admin' : 'Miembro');
                                    return `
                                        <div onclick="if(window.navigateSPA) window.navigateSPA('/user/${esc(m.user_id)}')" class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 cursor-pointer hover:shadow-md transition-shadow">
                                            <div class="flex items-center gap-3 min-w-0">
                                                <img src="${esc(safeUrl(m.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-10 h-10 rounded-full object-cover shrink-0">
                                                <div class="min-w-0">
                                                    <p class="font-bold text-sm text-marine dark:text-white truncate">${esc(m.nombre || 'Paddler')}</p>
                                                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}">${badgeTexto}</span>
                                                </div>
                                            </div>
                                            <span class="text-xs font-bold text-amber-500">${m.puntos || 0} pts</span>
                                        </div>`;
                                }).join('')}
                            </div>`;
                    }
                } catch (e) {
                    c.innerHTML = '<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar tripulación.</p>';
                }
            }
        } else if (tab === 'rutas') {
            const c = containers.rutas;
            if (c) {
                c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando rutas...</p>';
                try {
                    const { data: rutas } = await supabaseClient
                        .from('club_rutas')
                        .select('created_at, rutas(id, ubicacion, distancia_km, tiempo_minutos, fecha, imagen_url)')
                        .eq('club_id', clubId)
                        .order('created_at', { ascending: false })
                        .limit(20);
                    if (!rutas || rutas.length === 0) {
                        c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold">Sin rutas registradas por el club.</p>';
                    } else {
                        c.innerHTML = `
                            <div class="space-y-2.5">
                                ${rutas.map(r => {
                                    const ruta = r.rutas;
                                    if (!ruta) return '';
                                    return `
                                        <div class="flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                            <div class="flex items-center gap-3 min-w-0">
                                                <div class="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center text-xl shrink-0">🗺️</div>
                                                <div class="min-w-0">
                                                    <p class="font-bold text-sm text-marine dark:text-white truncate">${esc(ruta.ubicacion || 'Travesía GPS')}</p>
                                                    <p class="text-[10px] text-slate-400">${ruta.fecha ? new Date(ruta.fecha).toLocaleDateString() : ''} • ${ruta.tiempo_minutos || 0} min</p>
                                                </div>
                                            </div>
                                            <span class="px-2.5 py-1 bg-water/10 text-water dark:bg-sky-500/20 dark:text-sky-400 rounded-lg text-xs font-black shrink-0">${ruta.distancia_km || 0} km</span>
                                        </div>`;
                                }).join('')}
                            </div>`;
                    }
                } catch (e) {
                    c.innerHTML = '<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar rutas.</p>';
                }
            }
        } else if (tab === 'vitrina') {
            const c = containers.vitrina;
            if (c) {
                c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando vitrina...</p>';
                try {
                    const [resT, resS] = await Promise.allSettled([
                        supabaseClient.from('trofeos_club').select('*').eq('club_id', clubId).order('fecha', { ascending: false }),
                        supabaseClient.from('club_showcase').select('*').eq('club_id', clubId).order('created_at', { ascending: false })
                    ]);
                    const trofeos = resT.status === 'fulfilled' && resT.value?.data ? resT.value.data : [];
                    const showcase = resS.status === 'fulfilled' && resS.value?.data ? resS.value.data : [];
                    if (trofeos.length === 0 && showcase.length === 0) {
                        c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold">Vitrina vacía.</p>';
                    } else {
                        let html = '<div class="space-y-2.5">';
                        trofeos.forEach(t => {
                            html += `
                                <div class="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50 to-white dark:from-slate-800 dark:to-slate-800/80 rounded-xl border border-amber-200/60 dark:border-slate-700 shadow-sm">
                                    <span class="text-3xl">${t.icono || '🏆'}</span>
                                    <div>
                                        <p class="font-bold text-sm text-marine dark:text-white">${esc(t.nombre)}</p>
                                        <p class="text-[10px] text-slate-400">${t.fecha ? new Date(t.fecha).toLocaleDateString() : ''}</p>
                                    </div>
                                </div>`;
                        });
                        showcase.forEach(s => {
                            html += `
                                <div class="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                    <p class="text-xs text-slate-700 dark:text-slate-300">${esc(s.contenido)}</p>
                                </div>`;
                        });
                        html += '</div>';
                        c.innerHTML = html;
                    }
                } catch (e) {
                    c.innerHTML = '<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar vitrina.</p>';
                }
            }
        } else if (tab === 'chat') {
            const c = containers.chat;
            if (c) {
                const myId = appState.sesionActual?.user?.id;
                let esMiembro = false;
                if (myId) {
                    const { data: cu } = await supabaseClient.from('clubs_usuarios').select('id').eq('club_id', clubId).eq('user_id', myId).maybeSingle();
                    if (cu) esMiembro = true;
                }
                if (!esMiembro) {
                    c.innerHTML = `
                        <div class="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <span class="text-3xl block mb-2 opacity-50">🔒</span>
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Chat exclusivo de tripulación</p>
                            <p class="text-[11px] text-slate-400 mt-1">Únete a este club para participar en las conversaciones de su tripulación.</p>
                        </div>`;
                } else {
                    c.innerHTML = `
                        <div class="flex flex-col h-80 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-inner">
                            <div id="clubChatMessages" class="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
                                <p class="text-center text-slate-400 py-4 text-xs font-bold animate-pulse">Cargando mensajes...</p>
                            </div>
                            <div class="p-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex gap-2">
                                <input type="text" id="clubChatInput" placeholder="Escribe un mensaje a la tripulación..." class="flex-1 h-9 px-3 bg-white dark:bg-slate-700 rounded-xl text-xs outline-none focus:ring-1 focus:ring-water border border-slate-200 dark:border-slate-600" onkeydown="if(event.key==='Enter') window.Club.enviarMensajeChat('${esc(clubId)}')">
                                <button type="button" onclick="window.Club.enviarMensajeChat('${esc(clubId)}')" class="px-3.5 h-9 bg-water hover:bg-sky-600 text-white font-bold rounded-xl text-xs shadow-sm active:scale-95 transition-transform cursor-pointer">Enviar</button>
                            </div>
                        </div>`;
                    this.cargarMensajesChat(clubId);
                }
            }
        } else if (tab === 'admin' || tab === 'solicitudes') {
            const c = containers[tab];
            if (c) {
                c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando solicitudes...</p>';
                try {
                    const { data: solicitudes, error } = await supabaseClient.rpc('obtener_solicitudes_club', { p_club_id: clubId });
                    if (error || !solicitudes || solicitudes.length === 0) {
                        c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold">No hay solicitudes pendientes.</p>';
                    } else {
                        c.innerHTML = `
                            <div class="space-y-2.5">
                                ${solicitudes.map(s => {
                                    const sId = s.solicitud_id || s.id;
                                    const uId = s.user_id || s.id;
                                    return `
                                        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                            <div class="flex items-center gap-3 min-w-0">
                                                <img src="${esc(safeUrl(s.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-10 h-10 rounded-full object-cover shrink-0">
                                                <div class="min-w-0">
                                                    <p class="font-bold text-sm text-marine dark:text-white truncate">${esc(s.nombre || 'Paddler')}</p>
                                                    <p class="text-[10px] text-slate-400">Solicitud pendiente</p>
                                                </div>
                                            </div>
                                            <div class="flex gap-2 shrink-0">
                                                <button onclick="window.Club.procesarSolicitud('${esc(sId)}', true, '${esc(uId)}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold active:scale-95 cursor-pointer">Aceptar</button>
                                                <button onclick="window.Club.procesarSolicitud('${esc(sId)}', false, '${esc(uId)}')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold active:scale-95 cursor-pointer">Rechazar</button>
                                            </div>
                                        </div>`;
                                }).join('')}
                            </div>`;
                    }
                } catch (e) {
                    c.innerHTML = '<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar solicitudes.</p>';
                }
            }
        }
    },

    async cargarMensajesChat(clubId) {
        const msgContainer = document.getElementById('clubChatMessages');
        if (!msgContainer) return;
        try {
            const { data: msgs } = await supabaseClient
                .from('club_chat')
                .select('id, user_id, mensaje, created_at, perfiles(nombre, avatar_url)')
                .eq('club_id', clubId)
                .order('created_at', { ascending: true })
                .limit(50);

            if (!msgs || msgs.length === 0) {
                msgContainer.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold">No hay mensajes aún. ¡Inicia la conversación!</p>';
                return;
            }

            const myId = appState.sesionActual?.user?.id;
            msgContainer.innerHTML = msgs.map(m => {
                const esMio = m.user_id === myId;
                return `
                    <div class="flex gap-2 ${esMio ? 'justify-end' : 'justify-start'}">
                        ${!esMio ? `<img src="${esc(safeUrl(m.perfiles?.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-7 h-7 rounded-full object-cover shrink-0 mt-1">` : ''}
                        <div class="max-w-[75%] ${esMio ? 'bg-marine text-white rounded-2xl rounded-tr-none' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white rounded-2xl rounded-tl-none'} p-2.5 text-xs">
                            ${!esMio ? `<p class="text-[9px] font-bold text-water mb-0.5">${esc(m.perfiles?.nombre || 'Paddler')}</p>` : ''}
                            <p class="leading-relaxed">${esc(m.mensaje)}</p>
                        </div>
                    </div>`;
            }).join('');
            msgContainer.scrollTop = msgContainer.scrollHeight;
        } catch (e) {
            console.error('[club] cargarMensajesChat error:', e);
        }
    },

    async enviarMensaje(clubId) {
        const input = document.getElementById('clubChatInput');
        if (!input) return;
        const texto = input.value.trim();
        if (!texto) return;
        const myId = appState.sesionActual?.user?.id;
        if (!myId) return alert("Debes iniciar sesión para comentar en el chat.");

        try {
            const { error } = await supabaseClient.from('club_chat').insert([{
                club_id: clubId,
                user_id: myId,
                mensaje: texto
            }]);
            if (error) throw error;
            input.value = '';
            await this.cargarMensajesChat(clubId);
        } catch (e) {
            alert("Error al enviar mensaje: " + (e.message || e));
        }
    }
};
