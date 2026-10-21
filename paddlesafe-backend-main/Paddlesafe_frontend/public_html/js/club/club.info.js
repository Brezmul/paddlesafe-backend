import { ClubAPI } from './api.js';
import { ClubState } from './state.js';

let autoSaveTimer = null;

export const ClubInfo = {
    onFieldChange(clubId, fieldId, dbColumn) {
        const input = document.getElementById(fieldId);
        if (!input) return;
        
        const newValue = input.value.trim();
        this.triggerAutoSave(clubId, dbColumn, newValue, fieldId);
    },

    triggerAutoSave(clubId, dbColumn, newValue, fieldId) {
        const indicator = document.getElementById('autoSaveIndicator');
        if (indicator) {
            indicator.textContent = "Escribiendo...";
            indicator.className = "text-[9px] text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-md transition-all block";
        }

        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => this.commitSave(clubId, dbColumn, newValue, fieldId), 800);
    },

    async commitSave(clubId, dbColumn, newValue, fieldId) {
        // Prevención de guardado si el valor no ha cambiado realmente
        if (ClubState.lastSaved[clubId] && ClubState.lastSaved[clubId][dbColumn] === newValue) {
            this.hideIndicator();
            return;
        }

        // Validación estricta: El nombre no puede estar vacío
        if (dbColumn === 'nombre' && !newValue) {
            const input = document.getElementById(fieldId);
            if (input) input.value = ClubState.lastSaved[clubId]?.[dbColumn] ?? '';
            this.hideIndicator();
            return;
        }

        try {
            const payload = { [dbColumn]: newValue };
            await ClubAPI.updateField(clubId, payload);
            
            // Actualizar memoria RAM
            ClubState.lastSaved[clubId][dbColumn] = newValue;
            
            // Actualizar selector visual si es el nombre
            if (dbColumn === 'nombre') {
                const selectOpt = document.querySelector(`select option[value="${clubId}"]`);
                if (selectOpt) selectOpt.textContent = newValue;
            }

            this.showSuccess();
        } catch (error) {
            console.error("Fallo auto-guardado:", error);
            this.showError();
        }
    },

    hideIndicator() {
        const i = document.getElementById('autoSaveIndicator');
        if (i) i.classList.add('hidden');
    },
    showSuccess() {
        const i = document.getElementById('autoSaveIndicator');
        if (i) { i.textContent = "✅ Guardado"; i.className = "text-[9px] text-emerald-500 font-bold bg-slate-100 px-2 py-1 rounded-md block"; setTimeout(() => i.classList.add('hidden'), 2000); }
    },
    showError() {
        const i = document.getElementById('autoSaveIndicator');
        if (i) { i.textContent = "❌ Error al guardar"; i.className = "text-[9px] text-red-500 font-bold bg-slate-100 px-2 py-1 rounded-md block"; }
    }
};