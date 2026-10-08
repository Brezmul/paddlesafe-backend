import { ClubAPI } from './api.js';
import { validarImagen } from '../utils.js';
import { ClubRender } from './club.render.js';

export const ClubPhotos = {
    async onImageUpload(event, clubId, type) {
        const file = event.target.files[0];
        if (!file) return;

        const errImg = validarImagen(file); 
        if (errImg) { alert(errImg); event.target.value = ''; return; }

        const isLogo = type === 'logo';
        const previewId = isLogo ? 'logoClubPreview' : 'cpvHeaderPortada';
        const dbColumn = isLogo ? 'logo_url' : 'portada_url';
        const filePath = `clubs/${type}-${clubId}.jpg`; // Nombre estático para sobreescribir y ahorrar espacio
        
        const previewEl = document.getElementById(previewId);
        if (previewEl && isLogo) previewEl.style.opacity = '0.5';

        try {
            const url = await ClubAPI.uploadImage(filePath, file, file.type || 'image/jpeg');
            const urlConCacheBuster = `${url}?t=${Date.now()}`; // Fuerza render saltando el Service Worker
            
            await ClubAPI.updateField(clubId, { [dbColumn]: urlConCacheBuster });
            
            // Actualizamos la UI inmediatamente
            if (isLogo) {
                if (previewEl) previewEl.src = urlConCacheBuster;
            } else {
                ClubRender.renderTabMiClub(); // Recarga la vista para la portada
            }
        } catch (error) {
            alert(`❌ Error al actualizar ${type}.`);
        } finally {
            if (previewEl && isLogo) previewEl.style.opacity = '1';
            event.target.value = '';
        }
    }
};