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
        // Esto fallará si RLS bloquea al usuario (no es el creador)
        const { error } = await supabaseClient.from('clubs').delete().eq('id', clubId);
        if (error) throw error;
        return true;
    }
};