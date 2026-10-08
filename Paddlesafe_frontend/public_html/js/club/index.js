import { ClubState } from './state.js';
import { ClubRender } from './club.render.js';
import { ClubInfo } from './club.info.js';
import { ClubPhotos } from './club.photos.js';
import { ClubDelete } from './club.delete.js';
import { supabaseClient } from '../config.js'; // Para crear el club directamente aquí

// Fachada que agrupa todas las acciones
const ClubFacade = {
    // 1. Navegación
    abrirModal() {
        const trackingPanel = document.getElementById('liveTrackingPanel');
        if (trackingPanel && !trackingPanel.classList.contains('hidden')) {
            return alert("⚠️ Finaliza o cancela la grabación GPS antes.");
        }
        const m = document.getElementById('clubsModal');
        if (m) {
            m.classList.remove('hidden');
            setTimeout(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); }, 10);
            ClubRender.renderTabMiClub();
        }
    },
    cerrarModal() {
        const m = document.getElementById('clubsModal');
        if(m) {
            m.classList.add('opacity-0');
            m.querySelector('div').classList.add('scale-95');
            setTimeout(() => m.classList.add('hidden'), 300);
        }
    },
    onSelectActive(clubId) {
        ClubState.activeId = clubId;
        ClubRender.renderTabMiClub();
    },
    cambiarVistaInterna(vista) {
        // Redirige al renderizador interno correspondiente (tripulación, admin, etc.)
        // Aquí conectas las funciones que ya tenías de renderizado de pestañas inferiores
        // (Renderizar tripulación, renderizar admin, etc.)
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
    onDelete(clubId) {
        ClubDelete.execute(clubId);
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

// Exportación para que main.js la pueda invocar
export default ClubFacade;