import { ClubState } from './state.js';
import { ClubRender } from './club.render.js';
import { ClubInfo } from './club.info.js';
import { ClubPhotos } from './club.photos.js';
import { ClubDelete } from './club.delete.js';
import { supabaseClient, appState } from '../config.js';
import { esc, safeUrl, IMG_FALLBACK } from '../utils.js';

let searchClubsTimer = null;
let searchPaddlersTimer = null;

// Fachada que agrupa todas las acciones
const ClubFacade = {
    // 1. Navegación
    getActiveClubId() {
        return ClubState.activeId;
    },
    abrirModal() {
        const trackingPanel = document.getElementById('liveTrackingPanel');
        if (trackingPanel && !trackingPanel.classList.contains('hidden')) {
            return alert("⚠️ Finaliza o cancela la grabación GPS antes.");
        }
        const m = document.getElementById('clubsModal');
        if (m) {
            m.classList.remove('hidden');
            m.classList.remove('opacity-0');
            const box = m.querySelector('div');
            if (box) box.classList.remove('scale-95');
            try {
                this.cambiarTabClubs('miclub');
            } catch (err) {
                console.error('[club] Error al cambiar a tab miclub:', err);
            }
        }
    },
    cerrarModal() {
        const m = document.getElementById('clubsModal');
        if (m) {
            m.classList.add('opacity-0');
            const box = m.querySelector('div');
            if (box) box.classList.add('scale-95');
            setTimeout(() => m.classList.add('hidden'), 300);
        }
    },
    cambiarTabClubs(tab) {
        const tabs = {
            'miclub': document.getElementById('tabMiClub'),
            'buscar_club': document.getElementById('tabBuscarClub'),
            'paddlers': document.getElementById('tabPaddlers')
        };
        Object.keys(tabs).forEach(t => {
            const btn = tabs[t];
            if (!btn) return;
            if (t === tab) {
                btn.className = "h-10 px-2 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 cursor-pointer transition-colors";
            } else {
                btn.className = "h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
            }
        });

        if (tab === 'buscar_club') {
            ClubRender.renderTabBuscarClubs();
        } else if (tab === 'paddlers') {
            ClubRender.renderTabBuscarPaddlers();
        } else {
            ClubRender.renderTabMiClub();
        }
    },
    onBuscarClubs(event) {
        const val = event?.target?.value ?? '';
        clearTimeout(searchClubsTimer);
        searchClubsTimer = setTimeout(() => {
            ClubRender.cargarListaClubs(val);
        }, 300);
    },
    onBuscarPaddlers(event) {
        const val = event?.target?.value ?? '';
        clearTimeout(searchPaddlersTimer);
        searchPaddlersTimer = setTimeout(() => {
            ClubRender.cargarListaPaddlers(val);
        }, 300);
    },
    async solicitarUnirseClub(clubId) {
        if (!appState.sesionActual || appState.esInvitado) {
            alert("Debes iniciar sesión para unirte a un club.");
            if (window.abrirModalAuth) window.abrirModalAuth();
            return;
        }
        try {
            const userId = appState.sesionActual.user.id;
            const { error } = await supabaseClient.from('clubs_solicitudes').insert([{
                club_id: clubId,
                user_id: userId,
                estado: 'pendiente'
            }]);
            if (error) {
                if (error.code === '23505') {
                    alert("Ya tienes una solicitud pendiente para este club.");
                } else {
                    throw error;
                }
            } else {
                alert("Solicitud enviada al club correctamente.");
            }
            const input = document.getElementById('buscadorClubs');
            await ClubRender.cargarListaClubs(input ? input.value : '');
        } catch (err) {
            console.error('[club] solicitarUnirseClub error:', err);
            alert("Error al solicitar unirse al club: " + (err.message || err));
        }
    },
    onSelectActive(clubId) {
        ClubState.activeId = clubId;
        ClubRender.renderTabMiClub();
    },
    async cambiarVistaInterna(vista) {
        const contenedor = document.querySelector('#clubsModal #vistaClubContent') || document.getElementById('vistaClubContent');
        if (!contenedor) return;
        const clubId = ClubState.activeId;
        if (!clubId) {
            contenedor.innerHTML = '<p class="text-center text-slate-400 py-4 text-xs font-bold">Selecciona un club.</p>';
            return;
        }

        const activeClub = ClubState.myClubs?.find(c => c.club_id === clubId);
        const miUserId = appState.sesionActual?.user?.id;
        const miRol = (activeClub?.club_rol || '').toLowerCase();
        const soyCreador = miRol === 'creador' || (activeClub?.creador_id && activeClub.creador_id === miUserId);
        const soyAdmin = soyCreador || miRol === 'admin';

        // Actualizar apariencia de las pestañas
        const btnTrip = document.querySelector('button[onclick*="cambiarVistaInterna(\'tripulacion\')"]');
        const btnAdmin = document.querySelector('button[onclick*="cambiarVistaInterna(\'admin\')"]') ||
                         document.querySelector('button[onclick*="cambiarVistaInterna(\'gestion\')"]');

        const esGestion = vista === 'gestion' || vista === 'admin';

        if (btnTrip && btnAdmin) {
            if (esGestion) {
                btnTrip.className = "px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-widest";
                btnAdmin.className = "px-4 py-2.5 rounded-lg bg-marine text-white font-bold text-[10px] uppercase tracking-widest";
            } else {
                btnTrip.className = "px-4 py-2.5 rounded-lg bg-marine text-white font-bold text-[10px] uppercase tracking-widest";
                btnAdmin.className = "px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-widest";
            }
        }

        if (esGestion) {
            const zonaPeligroHTML = soyCreador ? `
                <div class="mt-6 pt-5 border-t border-rose-200 dark:border-rose-900/40">
                    <div class="p-4 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl">
                        <div class="flex items-center gap-2 mb-1.5">
                            <span class="text-lg">⚠️</span>
                            <h4 class="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-wider">Zona de Peligro</h4>
                        </div>
                        <p class="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                            Como <strong>creador del club</strong>, puedes eliminarlo permanentemente. Esta acción disolverá el club para todos sus miembros y no se puede deshacer.
                        </p>
                        <button type="button" onclick="window.Club.onDelete('${esc(clubId)}', event)" class="w-full h-11 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-rose-600/20 cursor-pointer flex items-center justify-center gap-2">
                            🗑️ Eliminar Club para Siempre
                        </button>
                    </div>
                </div>` : '';

            // Vista Gestión de solicitudes
            contenedor.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando solicitudes...</p>';
            try {
                const { data: solicitudes, error } = await supabaseClient.rpc('obtener_solicitudes_club', { p_club_id: clubId });
                if (error) {
                    console.error('[club] obtener_solicitudes_club error:', error);
                    contenedor.innerHTML = `<div class="text-center py-6 text-red-500 text-xs font-bold">Error al cargar solicitudes: ${esc(error.message)}</div>${zonaPeligroHTML}`;
                    return;
                }

                if (!solicitudes || solicitudes.length === 0) {
                    contenedor.innerHTML = `
                        <div class="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <span class="text-3xl block mb-2 opacity-50">📬</span>
                            <p class="text-slate-400 text-xs font-bold">No hay solicitudes pendientes</p>
                        </div>
                        ${zonaPeligroHTML}`;
                    return;
                }

                contenedor.innerHTML = `
                    <div class="space-y-3">
                        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Solicitudes de ingreso (${solicitudes.length})</p>
                        ${solicitudes.map(s => {
                            const sId = s.id || s.solicitud_id || s.user_id;
                            const uId = s.user_id || s.id;
                            const sNombre = s.nombre || s.user_nombre || s.email || 'Paddler';
                            const sAvatar = safeUrl(s.avatar_url, IMG_FALLBACK);
                            return `
                                <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <img src="${esc(sAvatar)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-10 h-10 rounded-full object-cover bg-white">
                                        <div class="min-w-0">
                                            <p class="font-bold text-sm text-slate-800 dark:text-white truncate">${esc(sNombre)}</p>
                                            <p class="text-[10px] text-slate-400">${s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Pendiente'}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button onclick="window.Club.procesarSolicitud('${esc(sId)}', true, '${esc(uId)}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform cursor-pointer">Aceptar</button>
                                        <button onclick="window.Club.procesarSolicitud('${esc(sId)}', false, '${esc(uId)}')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform cursor-pointer">Rechazar</button>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>
                    ${zonaPeligroHTML}`;
            } catch (e) {
                console.error('[club] gestion error:', e);
                contenedor.innerHTML = `<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar solicitudes.</p>${zonaPeligroHTML}`;
            }
        } else {
            // Vista Tripulación (miembros)
            contenedor.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando tripulación...</p>';
            try {
                const { data: miembros, error } = await supabaseClient.rpc('obtener_miembros_club', { p_club_id: clubId });
                if (error) {
                    console.error('[club] obtener_miembros_club error:', error);
                    contenedor.innerHTML = `<div class="text-center py-6 text-red-500 text-xs font-bold">Error al cargar tripulación: ${esc(error.message)}</div>`;
                    return;
                }

                if (!miembros || miembros.length === 0) {
                    contenedor.innerHTML = `
                        <div class="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <span class="text-3xl block mb-2 opacity-50">👥</span>
                            <p class="text-slate-400 text-xs font-bold">Sin miembros en la tripulación</p>
                        </div>`;
                    return;
                }

                contenedor.innerHTML = `
                    <div class="space-y-3">
                        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tripulación (${miembros.length})</p>
                        ${miembros.map(m => {
                            const mUserId = m.user_id || m.id;
                            const mNombre = m.nombre || m.user_nombre || m.email || 'Paddler';
                            const mAvatar = safeUrl(m.avatar_url, IMG_FALLBACK);
                            const mRol = (m.rol || m.club_rol || 'miembro').toLowerCase();
                            const esPropioUsuario = mUserId === miUserId;

                            let badgeColor = 'bg-slate-100 text-slate-600';
                            let badgeTexto = 'Miembro';
                            if (mRol === 'creador') {
                                badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200';
                                badgeTexto = '👑 Creador';
                            } else if (mRol === 'admin') {
                                badgeColor = 'bg-water/20 text-water dark:bg-sky-900/50 dark:text-sky-300';
                                badgeTexto = '⭐ Admin';
                            }

                            // Botones de acción administrativa
                            let accionesHTML = '';
                            if (soyAdmin && !esPropioUsuario && mRol !== 'creador') {
                                const botones = [];
                                if (mRol === 'miembro') {
                                    botones.push(`<button onclick="window.Club.ascenderMiembro('${esc(mUserId)}')" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-[10px] font-bold active:scale-95 transition-transform" title="Ascender a Admin">⭐ Ascender</button>`);
                                } else if (mRol === 'admin' && soyCreador) {
                                    botones.push(`<button onclick="window.Club.degradarMiembro('${esc(mUserId)}')" class="px-2.5 py-1 bg-slate-500 hover:bg-slate-600 text-white rounded-md text-[10px] font-bold active:scale-95 transition-transform" title="Degradar a Miembro">⬇️ Degradar</button>`);
                                }
                                if (soyCreador || (soyAdmin && mRol === 'miembro')) {
                                    botones.push(`<button onclick="window.Club.expulsarMiembro('${esc(mUserId)}')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[10px] font-bold active:scale-95 transition-transform" title="Expulsar del club">🚫 Expulsar</button>`);
                                }
                                if (botones.length) {
                                    accionesHTML = `<div class="flex items-center gap-1.5 flex-wrap justify-end">${botones.join('')}</div>`;
                                }
                            }

                            return `
                                <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 gap-3">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <img src="${esc(mAvatar)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-10 h-10 rounded-full object-cover bg-white shrink-0">
                                        <div class="min-w-0">
                                            <p class="font-bold text-sm text-slate-800 dark:text-white truncate">${esc(mNombre)}</p>
                                            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}">${badgeTexto}</span>
                                        </div>
                                    </div>
                                    ${accionesHTML}
                                </div>`;
                        }).join('')}
                    </div>`;
            } catch (e) {
                console.error('[club] tripulacion error:', e);
                contenedor.innerHTML = `<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar tripulación.</p>`;
            }
        }
    },

    // Métodos para administración de tripulación sobre clubs_usuarios
    async ascenderMiembro(userId) {
        if (!confirm("¿Deseas ascender a este usuario a Administrador?")) return;
        try {
            const { error } = await supabaseClient
                .from('clubs_usuarios')
                .update({ rol: 'admin' })
                .eq('club_id', ClubState.activeId)
                .eq('user_id', userId);
            if (error) throw error;
            await this.cambiarVistaInterna('tripulacion');
        } catch (err) {
            alert("Error al ascender miembro: " + (err.message || err));
        }
    },

    async degradarMiembro(userId) {
        if (!confirm("¿Deseas degradar a este administrador a Miembro?")) return;
        try {
            const { error } = await supabaseClient
                .from('clubs_usuarios')
                .update({ rol: 'miembro' })
                .eq('club_id', ClubState.activeId)
                .eq('user_id', userId);
            if (error) throw error;
            await this.cambiarVistaInterna('tripulacion');
        } catch (err) {
            alert("Error al degradar miembro: " + (err.message || err));
        }
    },

    async expulsarMiembro(userId) {
        if (!confirm("¿Estás seguro de que deseas expulsar a este miembro del club?")) return;
        try {
            const { error } = await supabaseClient
                .from('clubs_usuarios')
                .delete()
                .eq('club_id', ClubState.activeId)
                .eq('user_id', userId);
            if (error) throw error;
            await this.cambiarVistaInterna('tripulacion');
        } catch (err) {
            alert("Error al expulsar miembro: " + (err.message || err));
        }
    },

    async procesarSolicitud(solicitudId, aprobar, userId) {
        try {
            let error = null;
            // 1. Intentar con firma { p_solicitud_id, p_aprobar }
            const res = await supabaseClient.rpc('procesar_solicitud_club', {
                p_solicitud_id: solicitudId,
                p_aprobar: aprobar
            });
            error = res.error;

            // 2. Si falla por firma, intentar con { p_club_id, p_user_id, p_accion }
            if (error) {
                const resAlt = await supabaseClient.rpc('procesar_solicitud_club', {
                    p_club_id: ClubState.activeId,
                    p_user_id: userId || solicitudId,
                    p_accion: aprobar ? 'aprobar' : 'rechazar'
                });
                error = resAlt.error;
            }

            if (error) throw error;
            alert(aprobar ? "Solicitud aprobada." : "Solicitud rechazada.");
            await this.cambiarVistaInterna('gestion');
        } catch (err) {
            alert("Error al procesar solicitud: " + (err.message || err));
        }
    },

    // 2. Auto-Guardado
    onInput(clubId, elementId, dbColumn) {
        ClubInfo.onFieldChange(clubId, elementId, dbColumn);
    },

    // 3. Imágenes
    onPhotoUpload(event, clubId, type) {
        ClubPhotos.onImageUpload(event, clubId, type);
    },

    // 4. Peligro
    onDelete(clubId, event) {
        ClubDelete.execute(clubId, event);
    },

    // 5. Creación
    async onCreate() {
        const input = document.getElementById('newClubName');
        const nom = input ? input.value.trim() : '';
        if (!nom) return alert("Introduce un nombre.");
        try {
            const { data: newClubId, error } = await supabaseClient.rpc('crear_club_multiclub', { p_nombre: nom });
            if (error) throw error;
            ClubState.activeId = newClubId;
            ClubRender.renderTabMiClub();
        } catch (e) { alert("Error al crear club."); }
    }
};

// Exposición global para que el HTML la encuentre
window.Club = ClubFacade;
window.cambiarTabClubs = (tab) => ClubFacade.cambiarTabClubs(tab);
window.abrirModalClubs = () => ClubFacade.abrirModal();
window.cerrarModalClubs = () => ClubFacade.cerrarModal();

// Exportación para que main.js la pueda invocar
export default ClubFacade;