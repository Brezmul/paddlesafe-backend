import { ClubState } from './state.js';
import { ClubRender } from './club.render.js';
import { ClubInfo } from './club.info.js';
import { ClubPhotos } from './club.photos.js';
import { ClubDelete } from './club.delete.js';
import { ClubPublic } from './club.public.js';
import { ClubChat } from './club.chat.js';
import { ClubEvents } from './club.events.js';
import { ClubRetos, abrirCreadorRetoClub, cerrarCreadorRetoClub, aplicarPlantillaRetoClub, crearRetoMensualClub, toggleParticipacionRetoClub, toggleDesplegarParticipantesReto } from './club.retos.js';
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
        ClubChat.desuscribirRealtime();
        const m = document.getElementById('clubsModal');
        if (m) {
            m.classList.add('opacity-0');
            const box = m.querySelector('div');
            if (box) box.classList.add('scale-95');
            setTimeout(() => m.classList.add('hidden'), 300);
        }
    },
    cambiarTabClubs(tab) {
        if (tab !== 'miclub') {
            ClubChat.desuscribirRealtime();
        }
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

        const helperActualizarBotonPublico = (texto, estilo, disabled = true) => {
            const joinBtn = document.getElementById('cpvJoinBtn');
            if (joinBtn) {
                joinBtn.textContent = texto;
                joinBtn.className = estilo;
                joinBtn.disabled = disabled;
                if (disabled) joinBtn.onclick = null;
            }
        };

        try {
            const userId = appState.sesionActual.user.id;

            // 1. Comprobación previa: ¿ya es miembro en el estado local o en la BD?
            const esMiembroLocal = ClubState.myClubs?.some(c => c.club_id === clubId);
            if (esMiembroLocal) {
                alert("Ya eres miembro de este club.");
                helperActualizarBotonPublico('✅ Ya eres Miembro', "w-full h-11 bg-emerald-600 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center");
                return;
            }

            const { data: cu } = await supabaseClient
                .from('clubs_usuarios')
                .select('rol')
                .eq('club_id', clubId)
                .eq('user_id', userId)
                .maybeSingle();

            if (cu) {
                alert("Ya eres miembro de este club.");
                helperActualizarBotonPublico('✅ Ya eres Miembro', "w-full h-11 bg-emerald-600 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center");
                return;
            }

            // 2. Comprobación previa: ¿ya tiene una solicitud pendiente?
            const { data: solExistente } = await supabaseClient
                .from('clubs_solicitudes')
                .select('id')
                .eq('club_id', clubId)
                .eq('user_id', userId)
                .eq('estado', 'pendiente')
                .maybeSingle();

            if (solExistente) {
                alert("⏳ Ya tienes una solicitud pendiente en este club.");
                helperActualizarBotonPublico('⏳ Solicitud Pendiente', "w-full h-11 bg-amber-500 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center");
                return;
            }

            // 3. Enviar solicitud
            const { error } = await supabaseClient.from('clubs_solicitudes').insert([{
                club_id: clubId,
                user_id: userId,
                estado: 'pendiente'
            }]);

            if (error) {
                if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
                    alert("⏳ Ya tienes una solicitud pendiente en este club.");
                    helperActualizarBotonPublico('⏳ Solicitud Pendiente', "w-full h-11 bg-amber-500 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center");
                } else {
                    throw error;
                }
            } else {
                alert("Solicitud enviada al club correctamente.");
                helperActualizarBotonPublico('⏳ Solicitud Pendiente', "w-full h-11 bg-amber-500 text-white font-bold rounded-xl shadow-md uppercase tracking-widest text-[11px] cursor-default flex items-center justify-center");
            }

            // Actualizar lista en buscador de clubes
            const input = document.getElementById('buscadorClubs');
            await ClubRender.cargarListaClubs(input ? input.value : '');

            // Actualizar estado en vista de club público si coincide
            if (window.ClubPublic && ClubState.publicId === clubId && ClubState.currentClubData) {
                ClubState.currentClubData.tieneSolicitud = true;
            }
        } catch (err) {
            console.error('[club] solicitarUnirseClub error:', err);
            alert("Error al solicitar unirse al club: " + (err.message || err));
        }
    },
    onSelectActive(clubId) {
        ClubState.activeId = clubId;
        ClubRender.renderTabMiClub();
    },
    cambiarClubActivo(clubId) {
        return this.onSelectActive(clubId);
    },
    async cambiarVistaInterna(vista) {
        if (vista !== 'chat') {
            ClubChat.desuscribirRealtime();
        }
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

        // Actualizar apariencia de las pestañas internas
        const internalTabs = {
            'tripulacion': document.getElementById('btnClubTabTripulacion') || document.querySelector('button[onclick*="cambiarVistaInterna(\'tripulacion\')"]'),
            'chat': document.getElementById('btnClubTabChat') || document.querySelector('button[onclick*="cambiarVistaInterna(\'chat\')"]'),
            'eventos': document.getElementById('btnClubTabEventos') || document.querySelector('button[onclick*="cambiarVistaInterna(\'eventos\')"]'),
            'retos': document.getElementById('btnClubTabRetos') || document.querySelector('button[onclick*="cambiarVistaInterna(\'retos\')"]'),
            'gestion': document.getElementById('btnClubTabGestion') || document.querySelector('button[onclick*="cambiarVistaInterna(\'gestion\')"]') || document.querySelector('button[onclick*="cambiarVistaInterna(\'admin\')"]')
        };

        const activeKey = (vista === 'admin') ? 'gestion' : vista;
        Object.keys(internalTabs).forEach(k => {
            const btn = internalTabs[k];
            if (!btn) return;
            if (k === activeKey) {
                btn.className = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 ps-pill-tab ps-pill-tab-active cursor-pointer transition-colors text-center";
            } else {
                btn.className = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 ps-pill-tab cursor-pointer transition-colors text-center";
            }
        });

        if (vista === 'chat') {
            return await ClubChat.render(contenedor, clubId, true);
        }

        if (vista === 'eventos') {
            return await ClubEvents.render(contenedor, clubId, true, soyAdmin);
        }

        if (vista === 'retos') {
            return await ClubRetos.render(contenedor, clubId, soyAdmin);
        }

        const esGestion = vista === 'gestion' || vista === 'admin';

        if (esGestion) {
            const puedeEliminar = soyCreador || soyAdmin;
            const rolTextoPeligro = soyCreador ? 'creador del club' : 'administrador del club';
            const zonaPeligroHTML = puedeEliminar ? `
                <div class="mt-6 pt-5 border-t border-rose-200 dark:border-rose-900/40">
                    <div class="p-4 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl">
                        <div class="flex items-center gap-2 mb-1.5">
                            <span class="text-lg">⚠️</span>
                            <h4 class="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-wider">Zona de Peligro</h4>
                        </div>
                        <p class="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                            Como <strong>${rolTextoPeligro}</strong>, puedes eliminar este club permanentemente. Esta acción disolverá el club para todos sus miembros y no se puede deshacer.
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
                                <div data-solicitud-id="${esc(sId)}" class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
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
            // Vista Miembros (antes tripulacion)
            contenedor.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando miembros...</p>';
            try {
                const { data: miembros, error } = await supabaseClient.rpc('obtener_miembros_club', { p_club_id: clubId });
                if (error) {
                    console.error('[club] obtener_miembros_club error:', error);
                    contenedor.innerHTML = `<div class="text-center py-6 text-red-500 text-xs font-bold">Error al cargar miembros: ${esc(error.message)}</div>`;
                    return;
                }

                if (!miembros || miembros.length === 0) {
                    contenedor.innerHTML = `
                        <div class="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <span class="text-3xl block mb-2 opacity-50">👥</span>
                            <p class="text-slate-400 text-xs font-bold">Sin miembros en el club</p>
                        </div>`;
                    return;
                }

                contenedor.innerHTML = `
                    <div class="space-y-3">
                        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Miembros (${miembros.length})</p>
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
                                    botones.push(`<button onclick="window.Club.expulsarMiembro('${esc(mUserId)}', '${esc(mRol)}')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[10px] font-bold active:scale-95 transition-transform" title="Expulsar del club">🚫 Expulsar</button>`);
                                }
                                if (botones.length) {
                                    accionesHTML = `<div class="flex items-center gap-1.5 flex-wrap justify-end">${botones.join('')}</div>`;
                                }
                            }

                            return `
                                <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 gap-3">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <div class="relative shrink-0">
                                            <img src="${esc(mAvatar)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-10 h-10 rounded-full object-cover bg-white shrink-0">
                                            <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-300" data-user-presence-id="${esc(mUserId)}"></div>
                                        </div>
                                        <div class="min-w-0">
                                            <p class="font-bold text-sm text-slate-800 dark:text-white truncate">${esc(mNombre)}</p>
                                            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}">${badgeTexto}</span>
                                        </div>
                                    </div>
                                    ${accionesHTML}
                                </div>`;
                        }).join('')}
                    </div>`;
                window.actualizarUIPresencia?.();
            } catch (e) {
                console.error('[club] tripulacion error:', e);
                contenedor.innerHTML = `<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar miembros.</p>`;
            }
        }
    },

    // Métodos para administración de tripulación sobre clubs_usuarios
    async ascenderMiembro(userId) {
        if (!confirm("¿Deseas ascender a este usuario a Administrador?")) return;
        try {
            const { data, error } = await supabaseClient
                .from('clubs_usuarios')
                .update({ rol: 'admin' })
                .eq('club_id', ClubState.activeId)
                .eq('user_id', userId)
                .select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("No se pudo actualizar el rol. Comprueba tus permisos de administrador.");
            }
            alert("Miembro ascendido a Administrador correctamente.");
            await this.cambiarVistaInterna('tripulacion');
            if (window.ClubPublic && ClubState.publicId === ClubState.activeId && typeof window.ClubPublic.cambiarTab === 'function') {
                await window.ClubPublic.cambiarTab('miembros');
            }
        } catch (err) {
            console.error('[club] ascenderMiembro error:', err);
            alert("Error al ascender miembro: " + (err.message || err));
        }
    },

    async degradarMiembro(userId) {
        if (!confirm("¿Deseas degradar a este administrador a Miembro?")) return;
        try {
            const { data, error } = await supabaseClient
                .from('clubs_usuarios')
                .update({ rol: 'miembro' })
                .eq('club_id', ClubState.activeId)
                .eq('user_id', userId)
                .select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("No se pudo actualizar el rol. Comprueba tus permisos de administrador.");
            }
            alert("Administrador degradado a Miembro correctamente.");
            await this.cambiarVistaInterna('tripulacion');
            if (window.ClubPublic && ClubState.publicId === ClubState.activeId && typeof window.ClubPublic.cambiarTab === 'function') {
                await window.ClubPublic.cambiarTab('miembros');
            }
        } catch (err) {
            console.error('[club] degradarMiembro error:', err);
            alert("Error al degradar miembro: " + (err.message || err));
        }
    },

    async expulsarMiembro(userId, userRol) {
        const rolNorm = (userRol || '').toLowerCase();
        if (rolNorm === 'creador') {
            alert("No es posible expulsar al creador del club.");
            return;
        }
        if (!confirm("¿Estás seguro de que deseas expulsar a este miembro del club?")) return;
        try {
            const { data, error } = await supabaseClient
                .from('clubs_usuarios')
                .delete()
                .eq('club_id', ClubState.activeId)
                .eq('user_id', userId)
                .select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("No se pudo expulsar al miembro. Comprueba tus permisos.");
            }
            alert("Miembro expulsado del club correctamente.");
            await this.cambiarVistaInterna('tripulacion');
            if (window.ClubPublic && ClubState.publicId === ClubState.activeId && typeof window.ClubPublic.cambiarTab === 'function') {
                await window.ClubPublic.cambiarTab('miembros');
            }
        } catch (err) {
            console.error('[club] expulsarMiembro error:', err);
            alert("Error al expulsar miembro: " + (err.message || err));
        }
    },

    async procesarSolicitud(solicitudId, aprobar, userId) {
        try {
            // Eliminar o desvanecer inmediatamente la tarjeta en el DOM para feedback instantáneo
            const cardInDom = document.querySelector(`[data-solicitud-id="${solicitudId}"]`) 
                || document.querySelector(`button[onclick*="'${solicitudId}'"]`)?.closest('.flex.items-center.justify-between');
            if (cardInDom) {
                cardInDom.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
                cardInDom.style.opacity = '0';
                cardInDom.style.transform = 'scale(0.95)';
                setTimeout(() => cardInDom.remove(), 250);
            }

            // Firma canónica exacta según RPC public.procesar_solicitud_club(p_solicitud, p_accion)
            const { error } = await supabaseClient.rpc('procesar_solicitud_club', {
                p_solicitud: solicitudId,
                p_accion: aprobar ? 'aceptar' : 'rechazar'
            });

            if (error) throw error;
            alert(aprobar ? "Solicitud aceptada correctamente." : "Solicitud rechazada.");

            // 1. Refrescar vista interna de gestión si está en #clubsModal
            const vistaContent = document.getElementById('vistaClubContent');
            if (vistaContent && ClubState.activeId) {
                await this.cambiarVistaInterna('gestion');
            }

            // 2. Si #clubProfileViewModal está abierto, refrescar tab 'solicitudes' y 'miembros'
            const publicModal = document.getElementById('clubProfileViewModal') || document.getElementById('clubPublicViewModal');
            if (publicModal && !publicModal.classList.contains('hidden') && window.ClubPublic) {
                if (typeof window.ClubPublic.cambiarTab === 'function') {
                    await window.ClubPublic.cambiarTab('solicitudes');
                    await window.ClubPublic.cambiarTab('miembros');
                    const reqCont = document.getElementById('cpvRequestsContainer');
                    if (reqCont && !reqCont.classList.contains('hidden')) {
                        await window.ClubPublic.cambiarTab('solicitudes');
                    }
                }
            }

            // 3. Si modal flotante #clubAdminRequestsModal está abierto, refrescar solicitudes
            const adminReqModal = document.getElementById('clubAdminRequestsModal');
            if (adminReqModal && !adminReqModal.classList.contains('hidden') && typeof window.abrirPanelSolicitudes === 'function') {
                const activeCId = ClubState.activeId || ClubState.publicId;
                if (activeCId) await window.abrirPanelSolicitudes(activeCId);
            }
        } catch (err) {
            console.error('[club] procesarSolicitud error:', err);
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

    // 4. Peligro y Abandono
    onDelete(clubId, event) {
        ClubDelete.execute(clubId, event);
    },

    async abandonarClub(clubId) {
        if (!confirm("¿Estás seguro de que deseas abandonar este club?")) return;
        const myId = appState.sesionActual?.user?.id;
        if (!myId) return alert("Debes iniciar sesión.");
        try {
            const { error } = await supabaseClient
                .from('clubs_usuarios')
                .delete()
                .eq('club_id', clubId)
                .eq('user_id', myId);
            if (error) throw error;
            alert("Has abandonado el club correctamente.");
            ClubState.myClubs = ClubState.myClubs.filter(c => c.club_id !== clubId);
            ClubState.activeId = ClubState.myClubs[0]?.club_id || null;
            await ClubRender.renderTabMiClub();
        } catch (err) {
            console.error('[club] abandonarClub error:', err);
            alert("Error al abandonar club: " + (err.message || err));
        }
    },

    // 5. Creación e Invitaciones
    async onCreate() {
        const input = document.getElementById('newClubName');
        const nom = input ? input.value.trim() : '';
        if (!nom) return alert("Introduce un nombre para el club.");
        try {
            const { data: newClubId, error } = await supabaseClient.rpc('crear_club_multiclub', { p_nombre: nom });
            if (error) throw error;
            ClubState.activeId = newClubId;
            await ClubRender.renderTabMiClub();
        } catch (e) {
            console.error('[club] onCreate error:', e);
            alert("Error al crear club: " + (e.message || e));
        }
    },

    async invitarPaddler(userId, clubId) {
        if (!appState.sesionActual || appState.esInvitado) return alert("Debes iniciar sesión.");
        const myId = appState.sesionActual.user.id;
        try {
            let invId = null;
            try {
                const { data: invRow } = await supabaseClient.from('clubs_invitaciones').insert([{
                    club_id: clubId,
                    user_id: userId,
                    invitado_por: myId,
                    estado: 'pendiente'
                }]).select().single();
                invId = invRow?.id;
            } catch (_) {}

            const activeClub = ClubState.myClubs?.find(c => c.club_id === clubId);
            const clubNom = activeClub?.nombre || 'un club';
            await supabaseClient.from('notificaciones').insert([{
                user_id: userId,
                tipo: 'invitacion_club',
                contenido: `Has recibido una invitación para unirte a ${clubNom}.`,
                data: { invitacion_id: invId, club_id: clubId },
                leida: false
            }]);
            alert("¡Invitación enviada con éxito!");
        } catch (err) {
            console.error('[club] invitarPaddler error:', err);
            alert("Error al enviar invitación: " + (err.message || err));
        }
    },

    // 6. Perfil Público y Chat del Club
    openClubProfile(clubId) {
        ClubPublic.open(clubId);
    },
    cerrarClubProfileView() {
        ClubPublic.close();
    },
    cambiarTabClub(tab) {
        ClubPublic.cambiarTab(tab);
    },
    enviarMensajeChat(clubId) {
        ClubChat.enviarMensaje(clubId);
    },
    toggleAsistenciaEvento(eventoId, clubId) {
        ClubEvents.toggleAsistencia(eventoId, clubId);
    },
    eliminarEventoClub(eventoId, clubId) {
        ClubEvents.eliminarEvento(eventoId, clubId);
    },
    abrirRutaEnMapaGrande(coordsStr, nombre) {
        const fn = (typeof window !== 'undefined' && window.cargarRutaEnMapaGrande) || (typeof cargarRutaEnMapaGrande === 'function' ? cargarRutaEnMapaGrande : null);
        if (fn) {
            fn(coordsStr, nombre);
        }
    },
    abrirRutaEvento(eventoId) {
        const ev = ClubEvents._eventosCache && ClubEvents._eventosCache[eventoId];
        const fn = (typeof window !== 'undefined' && window.cargarRutaEnMapaGrande) || (typeof cargarRutaEnMapaGrande === 'function' ? cargarRutaEnMapaGrande : null);
        if (ev && ev.ruta_json && fn) {
            fn(ev.ruta_json, ev.nombre || 'Ruta del evento');
        }
    },

    // 7. Retos del Club
    abrirCreadorRetoClub() {
        abrirCreadorRetoClub();
    },
    cerrarCreadorRetoClub() {
        cerrarCreadorRetoClub();
    },
    aplicarPlantillaRetoClub(presetId) {
        aplicarPlantillaRetoClub(presetId);
    },
    crearRetoMensualClub(e) {
        crearRetoMensualClub(e);
    },
    toggleParticipacionRetoClub(retoId) {
        toggleParticipacionRetoClub(retoId);
    },
    toggleDesplegarParticipantesReto(retoId) {
        toggleDesplegarParticipantesReto(retoId);
    },

    // 8. Solicitudes de Club
    abrirPanelSolicitudes(clubId) {
        if (typeof window.abrirPanelSolicitudes === 'function') {
            window.abrirPanelSolicitudes(clubId);
        }
    },
    cerrarPanelSolicitudes() {
        if (typeof window.cerrarPanelSolicitudes === 'function') {
            window.cerrarPanelSolicitudes();
        }
    },

    // 9. Procesamiento de Invitaciones
    async procesarInvitacion(invitacionId, accion) {
        if (!invitacionId) return;
        if (!appState.sesionActual || appState.esInvitado) {
            if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
            else alert("Debes iniciar sesión.");
            return;
        }

        try {
            let processed = false;
            try {
                const { error: rpcErr } = await supabaseClient.rpc('procesar_invitacion_club', {
                    p_invitacion_id: invitacionId,
                    p_accion: accion
                });
                if (!rpcErr) processed = true;
            } catch (_) {}

            if (!processed) {
                // Fallback directo a tablas clubs_invitaciones y clubs_usuarios
                const { data: inv } = await supabaseClient
                    .from('clubs_invitaciones')
                    .select('*')
                    .eq('id', invitacionId)
                    .maybeSingle();

                if (inv) {
                    if (accion === 'aceptar') {
                        await supabaseClient.from('clubs_usuarios').insert([{
                            club_id: inv.club_id,
                            user_id: inv.user_id,
                            rol: 'miembro'
                        }]);
                    }
                    await supabaseClient.from('clubs_invitaciones').delete().eq('id', invitacionId);
                }
            }

            if (accion === 'aceptar') {
                await ClubRender.renderTabMiClub();
                alert("¡Te has unido al club con éxito!");
            } else {
                alert("Invitación rechazada.");
            }

            if (window.socialNotifications && typeof window.socialNotifications.cargarNotificaciones === 'function') {
                window.socialNotifications.cargarNotificaciones();
            }
        } catch (err) {
            console.error('[club] procesarInvitacion error:', err);
            alert("Error al procesar invitación: " + (err.message || err));
        }
    }
};

// Exposición global para que el HTML y main.js los encuentren
window.Club = ClubFacade;
window.ClubChat = ClubChat;
window.ClubEvents = ClubEvents;
window.ClubRetos = ClubRetos;
window.abrirCreadorRetoClub = abrirCreadorRetoClub;
window.cerrarCreadorRetoClub = cerrarCreadorRetoClub;
window.aplicarPlantillaRetoClub = aplicarPlantillaRetoClub;
window.crearRetoMensualClub = crearRetoMensualClub;
window.toggleParticipacionRetoClub = toggleParticipacionRetoClub;
window.toggleDesplegarParticipantesReto = toggleDesplegarParticipantesReto;
window.cambiarTabClubs = (tab) => ClubFacade.cambiarTabClubs(tab);
window.abrirModalClubs = () => ClubFacade.abrirModal();
window.cerrarModalClubs = () => ClubFacade.cerrarModal();
window.cambiarClubActivo = (clubId) => ClubFacade.onSelectActive(clubId);
window.procesarInvitacionClub = (id, accion) => ClubFacade.procesarInvitacion(id, accion);

// Perfil público del club y sub-pestañas
window.openClubProfile = (id) => ClubFacade.openClubProfile(id);
window.cerrarClubProfileView = () => ClubFacade.cerrarClubProfileView();
window.cambiarTabClub = (tab) => ClubFacade.cambiarTabClub(tab);

// Panel de administración de solicitudes de club
window.abrirPanelSolicitudes = async (clubId) => {
    const cId = clubId || ClubState.activeId;
    const m = document.getElementById('clubAdminRequestsModal');
    if (!m) return;
    m.classList.remove('hidden');
    setTimeout(() => {
        m.classList.remove('opacity-0');
        const box = m.querySelector('div');
        if (box) box.classList.remove('scale-95');
    }, 10);

    const cont = document.getElementById('adminRequestsContainer');
    if (cont && cId) {
        cont.innerHTML = '<p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando solicitudes...</p>';
        try {
            const { data: solicitudes, error } = await supabaseClient.rpc('obtener_solicitudes_club', { p_club_id: cId });
            if (error || !solicitudes || solicitudes.length === 0) {
                cont.innerHTML = '<div class="text-center py-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700"><p class="text-slate-400 text-xs font-bold">No hay solicitudes pendientes.</p></div>';
            } else {
                cont.innerHTML = solicitudes.map(s => {
                    const sId = s.id || s.solicitud_id || s.user_id;
                    const uId = s.user_id || s.id;
                    const sNom = s.nombre || 'Paddler';
                    const sAva = safeUrl(s.avatar_url, IMG_FALLBACK);
                    return `
                        <div data-solicitud-id="${esc(sId)}" class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                            <div class="flex items-center gap-3 min-w-0">
                                <img src="${esc(sAva)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-10 h-10 rounded-full object-cover shrink-0">
                                <div class="min-w-0">
                                    <p class="font-bold text-sm text-marine dark:text-white truncate">${esc(sNom)}</p>
                                    <p class="text-[10px] text-slate-400">Solicitud pendiente</p>
                                </div>
                            </div>
                            <div class="flex gap-2 shrink-0">
                                <button onclick="window.Club.procesarSolicitud('${esc(sId)}', true, '${esc(uId)}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold active:scale-95 cursor-pointer">Aceptar</button>
                                <button onclick="window.Club.procesarSolicitud('${esc(sId)}', false, '${esc(uId)}')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold active:scale-95 cursor-pointer">Rechazar</button>
                            </div>
                        </div>`;
                }).join('');
            }
        } catch (e) {
            cont.innerHTML = '<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar solicitudes.</p>';
        }
    }
};

window.cerrarPanelSolicitudes = () => {
    const m = document.getElementById('clubAdminRequestsModal');
    if (m) {
        m.classList.add('opacity-0');
        const box = m.querySelector('div');
        if (box) box.classList.add('scale-95');
        setTimeout(() => m.classList.add('hidden'), 300);
    }
};

// Exportación para que main.js la pueda invocar
export default ClubFacade;