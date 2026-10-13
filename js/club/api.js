import { supabaseClient } from '../config.js';

export const ClubAPI = {
    async getMyClubs(userId) {
        return await supabaseClient.rpc('obtener_clubs_usuario', { p_user_id: userId });
    },
    async getClub(clubId) {
        return await supabaseClient.from('clubs').select('*').eq('id', clubId).single();
    },
    async updateField(clubId, payload) {
        // payload = { nombre: "Nuevo nombre" }
        return await supabaseClient.from('clubs').update(payload).eq('id', clubId);
    },
    async uploadImage(path, file, mime) {
        const { error } = await supabaseClient.storage.from('paddlesafe').upload(path, file, { upsert: true, contentType: mime });
        if (error) throw error;
        return supabaseClient.storage.from('paddlesafe').getPublicUrl(path).data.publicUrl;
    },
    async deleteClub(clubId) {
        // 1. Intentar con RPC si la función de base de datos está disponible
        try {
            const { error: rpcErr } = await supabaseClient.rpc('club_eliminar', { p_club: clubId });
            if (!rpcErr) return true;
        } catch (_) {}

        // 2. Eliminación directa sobre tabla clubs con limpieza preventiva en cascada
        try { await supabaseClient.from('clubs_invitaciones').delete().eq('club_id', clubId); } catch (_) {}
        try { await supabaseClient.from('clubs_solicitudes').delete().eq('club_id', clubId); } catch (_) {}
        try { await supabaseClient.from('club_chat').delete().eq('club_id', clubId); } catch (_) {}
        try { await supabaseClient.from('club_rutas').delete().eq('club_id', clubId); } catch (_) {}
        try { await supabaseClient.from('club_eventos').delete().eq('club_id', clubId); } catch (_) {}
        try { await supabaseClient.from('clubs_usuarios').delete().eq('club_id', clubId); } catch (_) {}

        const { error } = await supabaseClient.from('clubs').delete().eq('id', clubId);
        if (error) throw error;
        return true;
    }
};