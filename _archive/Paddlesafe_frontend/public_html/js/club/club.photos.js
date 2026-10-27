import { ClubAPI } from './api.js';
import { validarImagen, comprimirImagenCliente } from '../utils.js';
import { ClubRender } from './club.render.js';
import { ClubState } from './state.js';

export const ClubPhotos = {
    async onImageUpload(event, clubId, type) {
        const file = event.target.files[0];
        if (!file) return;

        const errImg = validarImagen(file); 
        if (errImg) { alert(errImg); event.target.value = ''; return; }

        const isLogo = type === 'logo';
        const previewId = isLogo ? 'logoClubPreview' : 'cpvHeaderPortada';
        const filePath = `clubs/${type}-${clubId}.jpg`; // Nombre estático para sobreescribir y ahorrar espacio
        
        const previewEl = document.getElementById(previewId);
        if (previewEl && isLogo) previewEl.style.opacity = '0.5';

        try {
            const maxW = isLogo ? 600 : 1600;
            let fileToUpload = file;
            try {
                fileToUpload = await comprimirImagenCliente(file, maxW, 0.84);
            } catch (eCompress) {
                console.warn('[club.photos] Error en compresión, usando original:', eCompress);
            }

            const url = await ClubAPI.uploadImage(filePath, fileToUpload, fileToUpload.type || 'image/jpeg');
            const urlConCacheBuster = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`; // Fuerza render saltando el Service Worker
            
            const payload = isLogo 
                ? { logo_url: urlConCacheBuster } 
                : { portada_url: urlConCacheBuster, banner_url: urlConCacheBuster };
            
            await ClubAPI.updateField(clubId, payload);
            
            // Actualizar estados en memoria RAM
            if (Array.isArray(ClubState.myClubs)) {
                const cl = ClubState.myClubs.find(c => c.club_id === clubId || c.id === clubId);
                if (cl) {
                    if (isLogo) {
                        cl.logo_url = urlConCacheBuster;
                    } else {
                        cl.portada_url = urlConCacheBuster;
                        cl.banner_url = urlConCacheBuster;
                    }
                }
            }
            if (ClubState.currentClubData && (ClubState.currentClubData.id === clubId || ClubState.currentClubData.club_id === clubId)) {
                if (isLogo) {
                    ClubState.currentClubData.logo_url = urlConCacheBuster;
                } else {
                    ClubState.currentClubData.portada_url = urlConCacheBuster;
                    ClubState.currentClubData.banner_url = urlConCacheBuster;
                }
            }

            // Actualizamos la UI inmediatamente
            if (isLogo) {
                if (previewEl) previewEl.src = urlConCacheBuster;
                const cpvLogo = document.getElementById('cpvLogo');
                if (cpvLogo) cpvLogo.src = urlConCacheBuster;
            } else {
                await ClubRender.renderTabMiClub(); // Recarga la vista para la portada
                const coverEl = document.getElementById(previewId);
                if (coverEl) coverEl.style.backgroundImage = `url("${urlConCacheBuster}")`;
            }
        } catch (error) {
            console.error(`[club] Error al actualizar ${type}:`, error);
            alert(`❌ Error al actualizar ${type}: ${error.message || error}`);
        } finally {
            if (previewEl && isLogo) previewEl.style.opacity = '1';
            event.target.value = '';
        }
    }
};