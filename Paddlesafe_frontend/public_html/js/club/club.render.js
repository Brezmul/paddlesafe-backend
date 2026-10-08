import { appState } from '../config.js';
import { ClubState } from './state.js';
import { ClubAPI } from './api.js';
import { esc, safeUrl, IMG_FALLBACK } from '../utils.js';

export const ClubRender = {
    async renderTabMiClub() {
        const container = document.getElementById('clubsContent');
        if (!container) return;
        if (!appState.sesionActual) {
            container.innerHTML = `<div class="text-center py-10 w-full"><p class="text-sm font-bold text-slate-500">Inicia sesión para gestionar tus clubes.</p></div>`;
            return;
        }

        container.innerHTML = '<p class="text-center text-slate-400 mt-5 animate-pulse">Cargando tus sedes...</p>';
        
        try {
            const { data: relaciones } = await ClubAPI.getMyClubs(appState.sesionActual.user.id);
            if (!relaciones || relaciones.length === 0) {
                container.innerHTML = this.templateSinClub();
                return;
            }

            ClubState.myClubs = relaciones;
            if (!ClubState.activeId || !relaciones.some(c => c.club_id === ClubState.activeId)) {
                ClubState.activeId = relaciones[0].club_id;
            }

            const activeClub = relaciones.find(x => x.club_id === ClubState.activeId);
            ClubState.initSaveState(activeClub.club_id, activeClub);
            
            const isAdmin = activeClub.club_rol === 'creador' || activeClub.club_rol === 'admin';

            container.innerHTML = this.templateClubActivo(activeClub, isAdmin);
            
            // Disparar carga de la primera pestaña interna
            window.Club.cambiarVistaInterna('tripulacion');
        } catch (e) {
            container.innerHTML = '<p class="text-center text-red-500">Error al cargar.</p>';
        }
    },

    templateSinClub() {
        return `
        <div class="text-center w-full py-4">
            <span class="text-5xl block mb-2 opacity-40">🏴‍☠️</span>
            <h3 class="font-black text-marine dark:text-white mb-2 text-lg">Sin clubes</h3>
            <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                <input type="text" id="newClubName" placeholder="Nombre de tu club" class="w-full h-12 px-4 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-water">
                <button onclick="window.Club.onCreate()" class="w-full h-12 bg-water text-white font-bold rounded-xl active:scale-95">➕ Crear Club</button>
            </div>
        </div>`;
    },

    templateClubActivo(cl, isAdmin) {
        // Selector de clubes
        const selectorHTML = ClubState.myClubs.length > 1 ? `
            <select onchange="window.Club.onSelectActive(this.value)" class="w-full mb-4 bg-slate-50 h-10 px-3 rounded-lg outline-none font-bold">
                ${ClubState.myClubs.map(c => `<option value="${c.club_id}" ${c.club_id === cl.club_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
            </select>` : '';

        // Campos Auto-guardables
        const titleField = isAdmin ? 
            `<input type="text" id="info_nombre" value="${esc(cl.nombre)}" oninput="window.Club.onInput('${cl.club_id}', 'info_nombre', 'nombre')" class="w-full bg-transparent text-xl font-black outline-none border-b-2 border-transparent focus:border-water">` : 
            `<h3 class="text-xl font-black">${esc(cl.nombre)}</h3>`;

        const extraFields = isAdmin ? `
            <div class="mt-4 pt-4 border-t border-slate-100 relative">
                <div class="absolute -top-3 right-0">
                    <span id="autoSaveIndicator" class="hidden"></span>
                </div>
                <input type="text" id="info_ubi" value="${esc(cl.ubicacion || '')}" oninput="window.Club.onInput('${cl.club_id}', 'info_ubi', 'ubicacion')" placeholder="Ubicación (Ej: Cala Blanca)" class="w-full h-10 px-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-water mb-3 text-sm">
                <textarea id="info_desc" oninput="window.Club.onInput('${cl.club_id}', 'info_desc', 'descripcion')" placeholder="Descripción..." class="w-full h-20 p-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-water mb-3 text-sm">${esc(cl.descripcion || '')}</textarea>
                <textarea id="info_normas" oninput="window.Club.onInput('${cl.club_id}', 'info_normas', 'normas')" placeholder="Normas..." class="w-full h-16 p-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-water text-sm">${esc(cl.normas || '')}</textarea>
            </div>` : '';

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
                        <p class="text-[10px] font-bold text-slate-400 mt-1">Nvl ${cl.nivel || 1} • ${cl.puntos || 0} pts</p>
                    </div>
                </div>
                ${extraFields}
                <div class="flex gap-2 mt-5 pt-4 border-t border-slate-100 overflow-x-auto custom-scrollbar pb-1">
                    <button onclick="window.Club.cambiarVistaInterna('tripulacion')" class="px-4 py-2.5 rounded-lg bg-marine text-white font-bold text-[10px] uppercase tracking-widest">Tripulación</button>
                    ${isAdmin ? `<button onclick="window.Club.cambiarVistaInterna('admin')" class="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-widest">Gestión</button>` : ''}
                </div>
            </div>
        </div>
        <div id="vistaClubContent" class="w-full"></div>`;
    }
};