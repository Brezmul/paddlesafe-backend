import { ClubAPI } from './api.js';
import { ClubState } from './state.js';
import { ClubRender } from './club.render.js';

export const ClubDelete = {
    async execute(clubId) {
        if (!clubId) return alert("Error interno: ID de club no válido.");
        if (!confirm("⚠️ ATENCIÓN: ¿Seguro que deseas ELIMINAR el club para siempre? Esta acción no se puede deshacer.")) return;
        
        // Bloquear UI para evitar dobles clics
        const btn = event.currentTarget;
        if (btn) { btn.disabled = true; btn.textContent = "Eliminando..."; }

        try {
            // Intentar borrar en la API (RLS lo rechazará si no es el creador)
            await ClubAPI.deleteClub(clubId);
            
            alert("✅ Club eliminado correctamente.");
            
            // Limpieza absoluta del estado
            ClubState.activeId = null;
            ClubState.currentClubData = null;
            delete ClubState.lastSaved[clubId];
            
            // Forzar renderizado fresco
            await ClubRender.renderTabMiClub();
        } catch (err) {
            console.error("Fallo al eliminar:", err);
            alert("❌ No se pudo eliminar el club. Asegúrate de ser el creador.");
            if (btn) { btn.disabled = false; btn.textContent = "Eliminar Club para Siempre"; }
        }
    }
};