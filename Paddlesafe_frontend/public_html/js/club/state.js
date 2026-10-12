export const ClubState = {
    activeId: null,
    publicId: null,
    myClubs: [],
    currentClubData: null,
    lastSaved: {}, // { 'club_id_1': { nombre: 'X', descripcion: 'Y' } }
    
    initSaveState(clubId, data) {
        if (!this.lastSaved[clubId]) {
            this.lastSaved[clubId] = {
                nombre: data.nombre || '',
                descripcion: data.descripcion || '',
                normas: data.normas || '',
                ubicacion: data.ubicacion || ''
            };
        }
    }
};