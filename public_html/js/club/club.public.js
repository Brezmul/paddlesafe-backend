import { supabaseClient, appState } from '../config.js';
import { esc, safeUrl, IMG_FALLBACK } from '../utils.js';
import { ClubState } from './state.js';
import { ClubChat } from './club.chat.js';
import { ClubEvents } from './club.events.js';

export const ClubPublic = {
    async open(clubId) {
        const modal = document.getElementById('clubProfileViewModal') || document.getElementById('clubPublicViewModal');
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
                // Comprobar si es el creador registrado en la tabla clubs
                if (club.creador_id && club.creador_id === myId) {
                    miRol = 'creador';
                    esMiembro = true;
                }

                const { data: cu } = await supabaseClient
                    .from('clubs_usuarios')
                    .select('rol')
                    .eq('club_id', clubId)
                    .eq('user_id', myId)
                    .maybeSingle();
                if (cu) {
                    miRol = cu.rol || miRol || 'miembro';
                    esMiembro = true;
                } else if (!esMiembro) {
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
                joinBtn.disabled = true;
            } else if (tieneSolicitud) {
                joinBtn.textContent = '⏳ Solicitud Pendiente';
                joinBtn.className = "w-full h-11 bg-amber-500 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center";
                joinBtn.onclick = null;
                joinBtn.disabled = true;
            } else {
                joinBtn.textContent = '🌊 Unirse al Club';
                joinBtn.className = "w-full h-11 bg-gradient-to-r from-water to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-bold rounded-xl shadow-md active:scale-95 transition-transform uppercase tracking-widest text-[11px] cursor-pointer flex items-center justify-center";
                joinBtn.disabled = false;
                joinBtn.onclick = () => window.Club.solicitarUnirseClub(clubId);
            }
        }

        // 5. Visibilidad de pestañas de administración
        const esAdmin = miRol === 'creador' || miRol === 'admin' || (club.creador_id && club.creador_id === myId);
        const tabAdmin = document.getElementById('cpvTabAdmin');
        const tabSol = document.getElementById('cpvTabSolicitudes');
        if (tabAdmin) tabAdmin.classList.toggle('hidden', !esAdmin);
        if (tabSol) tabSol.classList.toggle('hidden', !esAdmin);

        ClubState.currentClubData = club;
        await this.cambiarTab('info');
    },

    close() {
        ClubChat.desuscribirRealtime();
        const modal = document.getElementById('clubProfileViewModal') || document.getElementById('clubPublicViewModal');
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

        const tabs = ['info', 'miembros', 'eventos', 'rutas', 'vitrina', 'chat', 'admin', 'solicitudes'];
        tabs.forEach(t => {
            const btn = document.getElementById(`cpvTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if (btn) {
                if (t === tab) {
                    btn.className = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 ps-pill-tab ps-pill-tab-active cursor-pointer transition-colors";
                } else {
                    btn.className = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 ps-pill-tab cursor-pointer transition-colors";
                }
            }
        });

        const containers = {
            'info': document.getElementById('cpvInfoContainer'),
            'miembros': document.getElementById('cpvMembersContainer'),
            'eventos': document.getElementById('cpvEventsContainer'),
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
                        ${club.ubicacion ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Ubicación</p><p class="text-sm font-bold text-slate-900 dark:text-white">📍 ${esc(club.ubicacion)}</p></div>` : ''}
                        ${club.normas ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Normas del Club</p><p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">${esc(club.normas)}</p></div>` : ''}
                        <div><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Descripción</p><p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">${esc(club.descripcion || 'Sin descripción.')}</p></div>
                    </div>`;
            }
        } else if (tab === 'miembros') {
            const c = containers.miembros;
            if (c) {
                c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando miembros...</p>';
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
                                                <div class="relative shrink-0">
                                                    <img src="${esc(safeUrl(m.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-10 h-10 rounded-full object-cover shrink-0">
                                                    <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-300" data-user-presence-id="${esc(m.user_id)}"></div>
                                                </div>
                                                <div class="min-w-0">
                                                    <p class="font-bold text-sm text-marine dark:text-white truncate">${esc(m.nombre || 'Paddler')}</p>
                                                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}">${badgeTexto}</span>
                                                </div>
                                            </div>
                                            <span class="text-xs font-bold text-amber-500">${m.puntos || 0} pts</span>
                                        </div>`;
                                }).join('')}
                            </div>`;
                        window.actualizarUIPresencia?.();
                    }
                } catch (e) {
                    c.innerHTML = '<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar miembros.</p>';
                }
            }
        } else if (tab === 'rutas') {
            const c = containers.rutas;
            if (c) {
                c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando rutas...</p>';
                try {
                    const { data: clubRutasData, error: crErr } = await supabaseClient
                        .from('club_rutas')
                        .select('created_at, ruta_id')
                        .eq('club_id', clubId)
                        .order('created_at', { ascending: false })
                        .limit(20);
                    if (crErr) throw crErr;

                    if (!clubRutasData || clubRutasData.length === 0) {
                        c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold">Sin rutas registradas por el club.</p>';
                    } else {
                        const rutaIds = Array.from(new Set(clubRutasData.map(cr => cr.ruta_id).filter(Boolean)));
                        const rutas = [];
                        if (rutaIds.length > 0) {
                            const [resLeg, resUr] = await Promise.allSettled([
                                supabaseClient
                                    .from('rutas')
                                    .select('id, user_id, ubicacion, distancia_km, tiempo_minutos, avg_speed_kmh, fecha, created_at, imagen_url, ruta_json, splits_data, weather_snapshot, wind_speed_kt, wave_height_m, conditions_score')
                                    .in('id', rutaIds),
                                supabaseClient
                                    .from('user_routes')
                                    .select('id, user_id, title, distance_km, duration_seconds, avg_speed, created_at, route_coordinates, splits_data, weather_snapshot, wind_speed_kt, wave_height_m, conditions_score')
                                    .in('id', rutaIds)
                            ]);
                            if (resLeg.status === 'fulfilled' && resLeg.value?.data) {
                                rutas.push(...resLeg.value.data);
                            }
                            if (resUr.status === 'fulfilled' && resUr.value?.data) {
                                resUr.value.data.forEach(ur => {
                                    if (!rutas.some(r => String(r.id) === String(ur.id))) {
                                        rutas.push(ur);
                                    }
                                });
                            }
                        }

                        if (rutas.length === 0) {
                            c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold">Sin rutas registradas por el club.</p>';
                        } else {
                            c.innerHTML = `
                                <div class="space-y-3">
                                    ${rutas.map(ruta => {
                                        if (!ruta) return '';
                                        if (typeof window.renderTarjetaRutaSocial === 'function') {
                                            return `<div class="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">${window.renderTarjetaRutaSocial(ruta, null)}</div>`;
                                        }
                                        return `
                                            <div class="flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                                <div class="flex items-center gap-3 min-w-0">
                                                    <div class="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center text-xl shrink-0">🗺️</div>
                                                    <div class="min-w-0">
                                                        <p class="font-bold text-sm text-marine dark:text-white truncate">${esc(ruta.ubicacion || ruta.title || 'Travesía GPS')}</p>
                                                        <p class="text-[10px] text-slate-400">${ruta.fecha || ruta.created_at ? new Date(ruta.fecha || ruta.created_at).toLocaleDateString() : ''} • ${ruta.tiempo_minutos || (ruta.duration_seconds ? Math.round(ruta.duration_seconds / 60) : 0)} min</p>
                                                    </div>
                                                </div>
                                                <span class="px-2.5 py-1 bg-water/10 text-water dark:bg-sky-500/20 dark:text-sky-400 rounded-lg text-xs font-black shrink-0">${Number(ruta.distancia_km || ruta.distance_km || 0).toFixed(2)} km</span>
                                            </div>`;
                                    }).join('')}
                                </div>`;
                        }
                    }
                } catch (e) {
                    console.warn('[club.public] Error al cargar rutas del club:', e);
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
        } else if (tab === 'eventos') {
            const c = containers.eventos;
            if (c) {
                const myId = appState.sesionActual?.user?.id;
                let esMiembro = false;
                let esAdmin = false;
                if (myId) {
                    const { data: cu } = await supabaseClient.from('clubs_usuarios').select('rol').eq('club_id', clubId).eq('user_id', myId).maybeSingle();
                    if (cu) {
                        esMiembro = true;
                        esAdmin = cu.rol === 'creador' || cu.rol === 'admin';
                    }
                }
                await ClubEvents.render(c, clubId, esMiembro, esAdmin);
            }
        } else if (tab === 'chat') {
            const c = containers.chat;
            if (c) {
                const myId = appState.sesionActual?.user?.id;
                let esMiembro = false;
                if (myId) {
                    const { data: cu } = await supabaseClient.from('clubs_usuarios').select('user_id, rol').eq('club_id', clubId).eq('user_id', myId).maybeSingle();
                    if (cu) esMiembro = true;
                }
                await ClubChat.render(c, clubId, esMiembro);
            }
        } else if (tab === 'admin' || tab === 'solicitudes') {
            const c = containers[tab];
            if (c) {
                const myId = appState.sesionActual?.user?.id;
                let esAdmin = false;
                if (myId) {
                    try {
                        const { data: cu } = await supabaseClient.from('clubs_usuarios').select('rol').eq('club_id', clubId).eq('user_id', myId).maybeSingle();
                        if (cu) esAdmin = cu.rol === 'creador' || cu.rol === 'admin';
                    } catch (_) {}
                }

                const zonaPeligroHTML = esAdmin ? `
                    <div class="mt-6 pt-5 border-t border-rose-200 dark:border-rose-900/40">
                        <div class="p-4 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl">
                            <div class="flex items-center gap-2 mb-1.5">
                                <span class="text-lg">⚠️</span>
                                <h4 class="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-wider">Zona de Peligro</h4>
                            </div>
                            <p class="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                                Como <strong>administrador o creador</strong>, puedes disolver y eliminar este club permanentemente.
                            </p>
                            <button type="button" onclick="window.Club.onDelete('${esc(clubId)}', event)" class="w-full h-11 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-rose-600/20 cursor-pointer flex items-center justify-center gap-2">
                                🗑️ Eliminar Club para Siempre
                            </button>
                        </div>
                    </div>` : '';

                c.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando solicitudes...</p>';
                try {
                    const { data: solicitudes, error } = await supabaseClient.rpc('obtener_solicitudes_club', { p_club_id: clubId });
                    if (error || !solicitudes || solicitudes.length === 0) {
                        c.innerHTML = `
                            <div class="text-center py-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                <p class="text-slate-400 text-xs font-bold">No hay solicitudes pendientes.</p>
                            </div>
                            ${zonaPeligroHTML}`;
                    } else {
                        c.innerHTML = `
                            <div class="space-y-2.5">
                                ${solicitudes.map(s => {
                                    const sId = s.solicitud_id || s.id;
                                    const uId = s.user_id || s.id;
                                    return `
                                        <div data-solicitud-id="${esc(sId)}" class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
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
                            </div>
                            ${zonaPeligroHTML}`;
                    }
                } catch (e) {
                    c.innerHTML = `<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar solicitudes.</p>${zonaPeligroHTML}`;
                }
            }
        }
    },

    async cargarMensajesChat(clubId) {
        await ClubChat.cargarMensajes(clubId);
    },

    async enviarMensaje(clubId) {
        await ClubChat.enviarMensaje(clubId);
    },

    async solicitarUnirseClub(clubId) {
        if (window.Club && typeof window.Club.solicitarUnirseClub === 'function') {
            return await window.Club.solicitarUnirseClub(clubId);
        }
    }
};

