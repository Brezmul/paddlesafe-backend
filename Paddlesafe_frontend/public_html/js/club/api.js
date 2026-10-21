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
        const { data, error } = await supabaseClient
            .from('clubs')
            .update(payload)
            .eq('id', clubId)
            .select();
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error("No tienes permisos suficientes de administración para modificar este club.");
        }
        return { data, error: null };
    },
    async uploadImage(path, file, mime) {
        const { error } = await supabaseClient.storage.from('paddlesafe').upload(path, file, { upsert: true, contentType: mime });
        if (error) throw error;
        return supabaseClient.storage.from('paddlesafe').getPublicUrl(path).data.publicUrl;
    },
    async deleteClub(clubId) {
        const { data, error } = await supabaseClient.rpc('club_eliminar', { p_club: clubId });
        if (error) throw error;
        if (data !== true) throw new Error('La base de datos no confirmó la eliminación del club.');
        return true;
    }
};