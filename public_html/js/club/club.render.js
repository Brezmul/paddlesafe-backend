import { appState, supabaseClient } from '../config.js';
import { ClubState } from './state.js';
import { ClubAPI } from './api.js';
import { esc, safeUrl, IMG_FALLBACK } from '../utils.js';

export const ClubRender = {
    // ----------------------------------------------------
    // TAB: MI CLUB (Gestión de clubes del usuario)
    // ----------------------------------------------------
    async renderTabMiClub() {
        const container = document.getElementById('clubsContent');
        if (!container) return;
        if (!appState.sesionActual || appState.esInvitado) {
            container.innerHTML = `
                <div class="text-center py-10 w-full bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 p-6">
                    <span class="text-4xl block mb-2 opacity-50">🔒</span>
                    <h3 class="font-black text-marine dark:text-white mb-2 text-base">Inicia sesión</h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">Necesitas una cuenta registrada para fundar o gestionar tus clubes náuticos.</p>
                    <button type="button" onclick="if(window.abrirModalAuth) window.abrirModalAuth(); if(window.Club) window.Club.cerrarModal();" class="px-5 py-2.5 bg-water text-white font-bold text-xs rounded-xl shadow active:scale-95 transition-transform cursor-pointer">Iniciar Sesión / Registrarse</button>
                </div>`;
            return;
        }

        container.innerHTML = '<p class="text-center text-slate-400 mt-5 text-xs font-bold animate-pulse">Cargando tus sedes...</p>';
        
        try {
            const { data: relaciones, error } = await ClubAPI.getMyClubs(appState.sesionActual.user.id);
            if (error) {
                console.error('[club] getMyClubs error:', error);
                container.innerHTML = `
                    <div class="text-center py-8 text-xs font-bold text-red-500">
                        Error al cargar tus clubes: ${esc(error.message)}
                        <div class="mt-3">
                            <button type="button" onclick="window.Club.cambiarTabClubs('miclub')" class="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">Reintentar</button>
                        </div>
                    </div>`;
                return;
            }

            if (!relaciones || relaciones.length === 0) {
                ClubState.myClubs = [];
                ClubState.activeId = null;
                container.innerHTML = this.templateSinClub();
                return;
            }

            ClubState.myClubs = relaciones;
            if (!ClubState.activeId || !relaciones.some(c => c.club_id === ClubState.activeId)) {
                ClubState.activeId = relaciones[0].club_id;
            }

            const activeClub = relaciones.find(x => x.club_id === ClubState.activeId) || relaciones[0];
            ClubState.initSaveState(activeClub.club_id, activeClub);
            
            const miUserId = appState.sesionActual?.user?.id;
            const clubRol = (activeClub.club_rol || '').toLowerCase();
            const isCreator = clubRol === 'creador' || (activeClub.creador_id && activeClub.creador_id === miUserId);
            const isAdmin = isCreator || clubRol === 'admin';

            container.innerHTML = this.templateClubActivo(activeClub, isAdmin, isCreator);
            
            // Disparar carga de la primera pestaña interna
            window.Club.cambiarVistaInterna('tripulacion');
        } catch (e) {
            console.error('[club] renderTabMiClub error:', e);
            container.innerHTML = `
                <div class="text-center py-8 text-xs font-bold text-red-500">
                    Error de conexión al cargar clubes.
                    <div class="mt-3">
                        <button type="button" onclick="window.Club.cambiarTabClubs('miclub')" class="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">Reintentar</button>
                    </div>
                </div>`;
        }
    },

    templateSinClub() {
        return `
        <div class="text-center w-full py-4">
            <span class="text-5xl block mb-2 opacity-40">🏴‍☠️</span>
            <h3 class="font-black text-marine dark:text-white mb-2 text-lg">Sin clubes</h3>
            <p class="text-xs text-slate-400 mb-4">Aún no perteneces a ningún club náutico. ¡Funda el tuyo o únete a uno existente!</p>
            <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <input type="text" id="newClubName" placeholder="Nombre de tu club" class="w-full h-12 px-4 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-water bg-white dark:bg-slate-800 text-sm">
                <button type="button" onclick="window.Club.onCreate()" class="w-full h-12 bg-water text-white font-bold rounded-xl active:scale-95 shadow cursor-pointer text-sm">➕ Fundar Club</button>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onclick="window.Club.cambiarTabClubs('buscar_club')" class="text-water text-xs font-bold hover:underline cursor-pointer">O busca clubes existentes en la flota →</button>
            </div>
        </div>`;
    },

    templateClubActivo(cl, isAdmin, isCreator = false) {
        // Selector de clubes
        const selectorHTML = ClubState.myClubs.length > 1 ? `
            <select onchange="window.Club.onSelectActive(this.value)" class="w-full mb-4 bg-slate-50 dark:bg-slate-800 h-10 px-3 rounded-lg outline-none font-bold border border-slate-200 dark:border-slate-700 text-sm">
                ${ClubState.myClubs.map(c => `<option value="${c.club_id}" ${c.club_id === cl.club_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
            </select>` : '';

        // Campos Auto-guardables
        const titleField = isAdmin ? 
            `<input type="text" id="info_nombre" value="${esc(cl.nombre)}" oninput="window.Club.onInput('${cl.club_id}', 'info_nombre', 'nombre')" class="w-full bg-transparent text-xl font-black outline-none border-b-2 border-transparent focus:border-water">` : 
            `<h3 class="text-xl font-black">${esc(cl.nombre)}</h3>`;

        const extraFields = isAdmin ? `
            <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 relative">
                <div class="absolute -top-3 right-0">
                    <span id="autoSaveIndicator" class="hidden"></span>
                </div>
                <input type="text" id="info_ubi" value="${esc(cl.ubicacion || '')}" oninput="window.Club.onInput('${cl.club_id}', 'info_ubi', 'ubicacion')" placeholder="Ubicación (Ej: Cala Blanca)" class="w-full h-10 px-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl outline-none focus:ring-1 focus:ring-water mb-3 text-sm">
                <textarea id="info_desc" oninput="window.Club.onInput('${cl.club_id}', 'info_desc', 'descripcion')" placeholder="Descripción..." class="w-full h-20 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl outline-none focus:ring-1 focus:ring-water mb-3 text-sm">${esc(cl.descripcion || '')}</textarea>
                <textarea id="info_normas" oninput="window.Club.onInput('${cl.club_id}', 'info_normas', 'normas')" placeholder="Normas..." class="w-full h-16 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl outline-none focus:ring-1 focus:ring-water text-sm">${esc(cl.normas || '')}</textarea>
            </div>` : '';

        const canDeleteClub = isCreator || isAdmin;
        const dangerZoneCard = canDeleteClub ? `
            <div class="mt-4 pt-3 border-t border-rose-100 dark:border-rose-950/40 flex items-center justify-between gap-2 flex-wrap">
                <span class="text-[10px] font-bold text-rose-500 uppercase tracking-wider">${isCreator ? 'Zona de Creador' : 'Zona de Administración'}</span>
                <div class="flex items-center gap-2">
                    ${!isCreator ? `<button type="button" onclick="window.Club.abandonarClub('${esc(cl.club_id)}')" class="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700/50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 font-bold text-[11px] rounded-lg border border-slate-200 dark:border-slate-600 transition-colors flex items-center gap-1 active:scale-95 cursor-pointer">🏃 Salir</button>` : ''}
                    <button type="button" onclick="window.Club.onDelete('${esc(cl.club_id)}', event)" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-bold text-[11px] rounded-lg border border-rose-200 dark:border-rose-900/50 transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer">
                        🗑️ Eliminar Club
                    </button>
                </div>
            </div>` : `
            <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Membresía</span>
                <button type="button" onclick="window.Club.abandonarClub('${esc(cl.club_id)}')" class="px-3 py-1.5 bg-slate-50 hover:bg-rose-50 dark:bg-slate-700/50 dark:hover:bg-rose-950/30 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 font-bold text-[11px] rounded-lg border border-slate-200 dark:border-slate-600 transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer">
                    🏃 Abandonar Club
                </button>
            </div>`;

        const rolLabel = isCreator ? 'Creador' : (cl.club_rol === 'admin' ? 'Administrador' : 'Miembro');

        return `
        ${selectorHTML}
        <div class="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4 overflow-hidden border border-slate-200 dark:border-slate-700">
            <div id="cpvHeaderPortada" class="h-32 w-full bg-slate-200 bg-cover bg-center relative" style="background-image: url('${esc(safeUrl(cl.portada_url, ''))}')">
                ${isAdmin ? `<label class="absolute top-2 right-2 bg-marine/60 text-white px-3 py-1.5 rounded-lg cursor-pointer text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm">📷 Cambiar Portada <input type="file" class="hidden" accept="image/*" onchange="window.Club.onPhotoUpload(event, '${cl.club_id}', 'portada')"></label>` : ''}
            </div>
            <div class="px-5 pb-5 pt-3 relative">
                <div class="flex items-end gap-4 -mt-12 mb-3">
                    <div class="relative z-10">
                        <img id="logoClubPreview" src="${esc(safeUrl(cl.logo_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-24 h-24 rounded-full object-cover shadow-xl border-4 border-white bg-white">
                        ${isAdmin ? `<label class="absolute bottom-0 right-0 bg-marine text-white p-2 rounded-full cursor-pointer shadow-lg">📷<input type="file" class="hidden" accept="image/*" onchange="window.Club.onPhotoUpload(event, '${cl.club_id}', 'logo')"></label>` : ''}
                    </div>
                    <div class="flex-1 min-w-0 pb-1">
                        ${titleField}
                        <p class="text-[10px] font-bold text-slate-400 mt-1">Nvl ${cl.nivel || 1} • ${cl.puntos || 0} pts • <span class="capitalize text-water font-semibold">${esc(rolLabel)}</span></p>
                    </div>
                </div>
                ${extraFields}
                ${dangerZoneCard}
                <div class="flex gap-1.5 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700 overflow-x-auto custom-scrollbar pb-1">
                    <button type="button" id="btnClubTabTripulacion" onclick="window.Club.cambiarVistaInterna('tripulacion')" class="flex-1 min-w-[85px] px-2.5 py-2.5 rounded-xl bg-marine text-white font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors text-center">👥 Tripulación</button>
                    <button type="button" id="btnClubTabChat" onclick="window.Club.cambiarVistaInterna('chat')" class="flex-1 min-w-[70px] px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors text-center">💬 Chat</button>
                    <button type="button" id="btnClubTabEventos" onclick="window.Club.cambiarVistaInterna('eventos')" class="flex-1 min-w-[80px] px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors text-center">📅 Quedadas</button>
                    <button type="button" id="btnClubTabRutas" onclick="window.Club.cambiarVistaInterna('rutas')" class="flex-1 min-w-[70px] px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors text-center">🧭 Rutas</button>
                    <button type="button" id="btnClubTabVitrina" onclick="window.Club.cambiarVistaInterna('vitrina')" class="flex-1 min-w-[70px] px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors text-center">🏆 Vitrina</button>
                    ${isAdmin ? `<button type="button" id="btnClubTabGestion" onclick="window.Club.cambiarVistaInterna('gestion')" class="flex-1 min-w-[75px] px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors text-center">⚙️ Gestión</button>` : ''}
                </div>
            </div>
        </div>
        <div id="vistaClubContent" class="w-full"></div>`;
    },

    // ----------------------------------------------------
    // TAB: BUSCAR CLUBES (TABLA public.clubs)
    // ----------------------------------------------------
    async renderTabBuscarClubs() {
        const container = document.getElementById('clubsContent');
        if (!container) return;
        container.innerHTML = `
            <div class="mb-4">
                <div class="relative">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">🔍</span>
                    <input type="text" id="buscadorClubs" oninput="window.Club.onBuscarClubs(event)" placeholder="Buscar clubes por nombre..." class="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-water">
                </div>
            </div>
            <div id="listaBusquedaClubs" class="space-y-3">
                <p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando flota de clubes...</p>
            </div>`;

        await this.cargarListaClubs('');
    },

    async cargarListaClubs(query = '') {
        const lista = document.getElementById('listaBusquedaClubs');
        if (!lista) return;

        try {
            // Esquema exacto de public.clubs: id, nombre, logo_url, portada_url, puntos, nivel, creador_id, descripcion, ubicacion, normas
            let q = supabaseClient.from('clubs')
                .select('id, nombre, logo_url, portada_url, puntos, nivel, creador_id, descripcion, ubicacion, normas')
                .order('puntos', { ascending: false })
                .limit(25);

            if (query && query.trim()) {
                q = q.ilike('nombre', `%${query.trim()}%`);
            }

            const { data: clubes, error } = await q;

            if (error) {
                console.error('[club] buscar clubes error:', error);
                lista.innerHTML = `
                    <div class="text-center py-6 text-red-500 text-xs font-bold">
                        Error al cargar clubes: ${esc(error.message)}
                    </div>`;
                return;
            }

            if (!clubes || clubes.length === 0) {
                lista.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <span class="text-3xl mb-2 opacity-50">⛵</span>
                        <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">No se encontraron clubes</p>
                        <p class="text-[11px] text-slate-400 mt-1">${query ? 'Prueba con otro término de búsqueda.' : 'Aún no se ha fundado ningún club.'}</p>
                    </div>`;
                return;
            }

            // Consultar solicitudes pendientes del usuario si tiene sesión
            let solicitudesPendientes = new Set();
            if (appState.sesionActual?.user?.id) {
                try {
                    const { data: sol } = await supabaseClient
                        .from('clubs_solicitudes')
                        .select('club_id')
                        .eq('user_id', appState.sesionActual.user.id)
                        .eq('estado', 'pendiente');
                    if (sol) sol.forEach(s => solicitudesPendientes.add(s.club_id));
                } catch (e) {
                    // Si no existe aún o no hay permisos, continuamos sin romper
                }
            }

            const misClubsIds = new Set(ClubState.myClubs?.map(c => c.club_id) || []);

            lista.innerHTML = clubes.map(c => {
                const esMiembro = misClubsIds.has(c.id);
                const tieneSolicitud = solicitudesPendientes.has(c.id);
                const logoUrl = safeUrl(c.logo_url, IMG_FALLBACK);

                let actionBtn = '';
                if (esMiembro) {
                    actionBtn = `<span class="px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 rounded-lg text-xs font-bold">Tu club</span>`;
                } else if (tieneSolicitud) {
                    actionBtn = `<span class="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 rounded-lg text-xs font-bold">Pendiente</span>`;
                } else {
                    actionBtn = `<button type="button" onclick="window.Club.solicitarUnirseClub('${esc(c.id)}')" class="px-3.5 py-1.5 bg-water hover:bg-sky-600 text-white rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-transform cursor-pointer">Unirse</button>`;
                }

                return `
                    <div class="flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm gap-3 hover:shadow-md transition-shadow">
                        <div onclick="if(window.navigateSPA) window.navigateSPA('/club/${esc(c.id)}')" class="flex items-center gap-3 min-w-0 cursor-pointer flex-1 group">
                            <img src="${esc(logoUrl)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-xl object-cover bg-slate-100 shrink-0 border border-slate-100 dark:border-slate-700 group-hover:scale-105 transition-transform">
                            <div class="min-w-0">
                                <h4 class="font-black text-sm text-marine dark:text-white truncate group-hover:text-water transition-colors">${esc(c.nombre)}</h4>
                                <p class="text-[10px] text-slate-400 font-bold truncate">${c.ubicacion ? `📍 ${esc(c.ubicacion)} • ` : ''}Nvl ${c.nivel || 1} • ${c.puntos || 0} pts</p>
                            </div>
                        </div>
                        <div class="shrink-0">
                            ${actionBtn}
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            console.error('[club] cargarListaClubs error:', e);
            lista.innerHTML = `<div class="text-center py-6 text-red-500 text-xs font-bold">Error de conexión al buscar clubes.</div>`;
        }
    },

    // ----------------------------------------------------
    // TAB: BUSCAR PADDLERS (TABLA public.perfiles)
    // ----------------------------------------------------
    async renderTabBuscarPaddlers() {
        const container = document.getElementById('clubsContent');
        if (!container) return;
        container.innerHTML = `
            <div class="mb-4">
                <div class="relative">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">🔍</span>
                    <input type="text" id="buscadorPaddlers" oninput="window.Club.onBuscarPaddlers(event)" placeholder="Buscar paddlers por nombre..." class="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-water">
                </div>
            </div>
            <div id="listaBusquedaPaddlers" class="space-y-3">
                <p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando paddlers...</p>
            </div>`;

        await this.cargarListaPaddlers('');
    },

    async cargarListaPaddlers(query = '') {
        const lista = document.getElementById('listaBusquedaPaddlers');
        if (!lista) return;

        try {
            // Esquema exacto de public.perfiles: NO existen club_id ni club_rol en perfiles
            let q = supabaseClient.from('perfiles')
                .select('id, nombre, avatar_url, km_totales, nivel, titulo, puntos, is_vip, is_private')
                .eq('is_private', false)
                .order('puntos', { ascending: false })
                .limit(25);

            if (query && query.trim()) {
                q = q.ilike('nombre', `%${query.trim()}%`);
            }

            const { data: paddlers, error } = await q;

            if (error) {
                console.error('[paddlers] error al buscar:', error);
                lista.innerHTML = `
                    <div class="text-center py-6 text-red-500 text-xs font-bold">
                        Error al cargar paddlers: ${esc(error.message)}
                    </div>`;
                return;
            }

            if (!paddlers || paddlers.length === 0) {
                lista.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <span class="text-3xl mb-2 opacity-50">🏄</span>
                        <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">No se encontraron paddlers</p>
                        <p class="text-[11px] text-slate-400 mt-1">${query ? 'Prueba con otro término de búsqueda.' : 'No hay perfiles públicos disponibles.'}</p>
                    </div>`;
                return;
            }

            lista.innerHTML = paddlers.map(p => {
                const avatar = safeUrl(p.avatar_url, IMG_FALLBACK);
                const vipTag = p.is_vip ? `<span class="bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-[9px] px-1.5 py-0.5 rounded uppercase font-black ml-1">VIP</span>` : '';

                return `
                    <div class="flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm gap-3 hover:shadow-md transition-shadow">
                        <div class="flex items-center gap-3 min-w-0">
                            <img src="${esc(avatar)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full object-cover bg-slate-100 shrink-0 border border-slate-100 dark:border-slate-700">
                            <div class="min-w-0">
                                <h4 class="font-bold text-sm text-marine dark:text-white truncate">${esc(p.nombre || 'Paddler Anónimo')} ${vipTag}</h4>
                                <p class="text-[10px] text-slate-400 font-bold truncate">Nivel ${p.nivel || 1} • ${p.puntos || 0} pts • ${Number(p.km_totales || 0).toFixed(1)} km</p>
                            </div>
                        </div>
                        <button type="button" onclick="if(window.navigateSPA) window.navigateSPA('/user/${esc(p.id)}'); else if(window.abrirPerfilPublicoSPA) window.abrirPerfilPublicoSPA('${esc(p.id)}'); if(window.Club) window.Club.cerrarModal();" class="px-3.5 py-1.5 bg-water hover:bg-sky-600 text-white rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-transform shrink-0 cursor-pointer">Ver Perfil</button>
                    </div>`;
            }).join('');
        } catch (e) {
            console.error('[paddlers] error cargarListaPaddlers:', e);
            lista.innerHTML = `<div class="text-center py-6 text-red-500 text-xs font-bold">Error de conexión al buscar paddlers.</div>`;
        }
    }
};