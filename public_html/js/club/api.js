import { supabaseClient } from '../config.js';

export const ClubAPI = {
    async getMyClubs(userId) {
        return await supabaseClient.rpc('obtener_clubs_usuario', { p_user_id: userId });
    },

    async getClub(clubId) {
        return await supabaseClient.from('clubs').select('*').eq('id', clubId).single();
    },

    async getMembers(clubId) {
        return await supabaseClient.rpc('obtener_miembros_club', { p_club_id: clubId });
    },

    async getRequests(clubId) {
        return await supabaseClient.rpc('obtener_solicitudes_club', { p_club_id: clubId });
    },

    async processRequest(solicitudId, accion) {
        return await supabaseClient.rpc('procesar_solicitud_club', {
            p_solicitud: solicitudId,
            p_accion: accion
        });
    },

    async createClub(nombre) {
        return await supabaseClient.rpc('crear_club_multiclub', { p_nombre: nombre });
    },

    async updateField(clubId, payload) {
        // Normalización canónica con public.clubs en PADDLESAFE_MASTER_DATABASE_V3_FIXED.sql
        // Columnas válidas: creador_id, nombre, descripcion, logo_url, banner_url, ubicacion, nivel
        const cleanPayload = {};
        const allowedColumns = ['creador_id', 'nombre', 'descripcion', 'logo_url', 'banner_url', 'ubicacion', 'nivel'];

        Object.keys(payload || {}).forEach(key => {
            if (key === 'portada_url') {
                cleanPayload.banner_url = payload[key];
            } else if (allowedColumns.includes(key)) {
                cleanPayload[key] = payload[key];
            }
        });

        if (Object.keys(cleanPayload).length === 0) {
            return { data: null, error: null };
        }

        const { data, error } = await supabaseClient
            .from('clubs')
            .update(cleanPayload)
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
