import { ClubAPI } from './api.js';
import { ClubState } from './state.js';
import { ClubRender } from './club.render.js';
import { appState } from '../config.js';

export const ClubDelete = {
    async execute(clubId, event) {
        if (!clubId) return alert("Error interno: ID de club no válido.");

        // Verificación de permisos: Solo creadores y administradores
        const miUserId = appState.sesionActual?.user?.id;
        const activeClub = ClubState.myClubs?.find(c => c.club_id === clubId) || ClubState.currentClubData;
        const clubRol = (activeClub?.club_rol || '').toLowerCase();
        const esCreador = clubRol === 'creador' || (activeClub?.creador_id && activeClub.creador_id === miUserId);
        const esAdmin = esCreador || clubRol === 'admin';

        if (activeClub && !esAdmin) {
            return alert("⚠️ Permiso denegado: Solo los creadores y administradores pueden eliminar el club.");
        }

        if (!confirm("⚠️ ATENCIÓN: ¿Seguro que deseas ELIMINAR el club para siempre? Esta acción disolverá el club para todos sus miembros y no se puede deshacer.")) return;
        
        // Bloquear UI para evitar dobles clics
        const btn = event?.currentTarget;
        const textoOriginal = btn ? btn.textContent : "🗑️ Eliminar Club";
        if (btn) { btn.disabled = true; btn.textContent = "Eliminando..."; }

        try {
            // Intentar borrar en la API (RPC seguro o en cascada)
            await ClubAPI.deleteClub(clubId);
            
            alert("✅ Club eliminado correctamente.");
            
            // Limpieza absoluta del estado
            ClubState.activeId = null;
            ClubState.currentClubData = null;
            if (ClubState.lastSaved) delete ClubState.lastSaved[clubId];
            if (Array.isArray(ClubState.myClubs)) {
                ClubState.myClubs = ClubState.myClubs.filter(c => c.club_id !== clubId);
            }

            // Cerrar vista de perfil público si estaba abierta
            if (window.cerrarClubProfileView) window.cerrarClubProfileView();
            
            // Forzar renderizado fresco
            await ClubRender.renderTabMiClub();
        } catch (err) {
            console.error("Fallo al eliminar:", err);
            alert("❌ No se pudo eliminar el club: " + (err.message || "Asegúrate de ser creador o administrador."));
            if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
        }
    }
};