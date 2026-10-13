// ====================================================
// js/utils.js - UTILIDADES, SANITIZACIÓN Y LÓGICA
// ====================================================

export const IMG_FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="#e2e8f0"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
);

// Sanitización estricta contra XSS
export function esc(v) {
    if (v === null || v === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(v).replace(/[&<>"']/g, match => map[match]);
}

export function safeUrl(u, fallback = IMG_FALLBACK) {
    if (!u || typeof u !== 'string') return fallback;
    if (u.startsWith('data:image/')) return u;
    try {
        const x = new URL(u, window.location.origin);
        return ['http:', 'https:'].includes(x.protocol) ? x.href : fallback;
    } catch (e) {
        return fallback;
    }
}

export function fetchConTimeout(url, opts = {}, ms = 15000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export function validarImagen(file, maxMB = 5) {
    if (!file) return 'No se ha seleccionado ningún archivo.';
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) return 'Formato no válido. Usa JPG, PNG o WebP.';
    if (file.size > maxMB * 1024 * 1024) return `La imagen supera los ${maxMB} MB permitidos.`;
    return null;
}

export function formatearTiempo(minutos) {
    const m = Math.round(minutos);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const resto = m % 60;
    return resto === 0 ? `${h}h` : `${h}h ${resto} min`;
}

export function calcularRangoMaritimo(puntos) {
    const nivel = Math.min(99, 1 + Math.floor(puntos / 500));
    const titulos = [
        "Grumete de Agua Dulce", "Marinero de Cala", "Navegante Costero",
        "Timonel de Travesía", "Contramaestre de Oleaje", "Patrón de Bajura",
        "Capitán de Altura", "Comodoro del Viento", "Almirante del Océano",
        "Poseidón de la Costa", "Leyenda del Mar"
    ];
    const index = Math.min(Math.floor(nivel / 10), titulos.length - 1);
    const titulo = titulos[index];
    
    const puntosNivelActual = (nivel - 1) * 500;
    const puntosParaSubir = nivel === 99 ? 0 : (nivel * 500) - puntos;
    const progresoPorcentaje = nivel === 99 ? 100 : (((puntos - puntosNivelActual) / 500) * 100);
    
    return { nivel, titulo, progresoPorcentaje, puntosParaSubir };
}

export const UMBRALES_SEGURIDAD = {
    Principiante: { viento: 12, ola: 0.3, racha: 16 },
    Intermedio:   { viento: 14, ola: 0.8, racha: 28 },
    Avanzado:     { viento: 20, ola: 1.2, racha: 35 },
    default:      { viento: 20, ola: 0.9, racha: 30 }
};

export const RIESGO = { 'SEGURO': 0, 'PRECAUCIÓN': 1, 'PELIGROSO': 2, 'PROHIBIDO': 3 };
export const CLASES_RIESGO = {
    'SEGURO':     'text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-lg',
    'PRECAUCIÓN': 'text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg',
    'PELIGROSO':  'text-red-500 bg-red-50 border border-red-200 rounded-lg',
    'PROHIBIDO':  'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg'
};

export function calcularVeredicto({ alerta, vientoKmh, olaM, rachasKmh, nivelUsuario }) {
    const lim = UMBRALES_SEGURIDAD[nivelUsuario] || UMBRALES_SEGURIDAD.default;
    let actual = { estado: 'SEGURO', mensaje: 'Condiciones seguras.' };

    const updateWorst = (newState, newMsg) => {
        if (RIESGO[newState] > RIESGO[actual.estado]) {
            actual = { estado: newState, mensaje: newMsg };
        }
    };

    if (alerta?.activa) {
        if (alerta.origen === 'AEMET' || alerta.nivel === 'ROJA' || alerta.nivel === 'NARANJA') {
            updateWorst('PROHIBIDO', alerta.tipo || 'Alerta Meteorológica Activa. No salir.');
        } else if (alerta.nivel === 'PELIGROSO') {
            updateWorst('PELIGROSO', 'Tormenta o riesgo activo.');
        } else {
            updateWorst('PRECAUCIÓN', 'Precaución meteorológica.');
        }
    }

    if (Number.isFinite(vientoKmh) && vientoKmh > lim.viento) updateWorst('PELIGROSO', 'Viento excede tu nivel.');
    if (Number.isFinite(olaM) && olaM > lim.ola) updateWorst('PELIGROSO', 'Oleaje excede tu nivel.');
    if (Number.isFinite(rachasKmh) && rachasKmh > lim.racha) updateWorst('PRECAUCIÓN', 'Rachas fuertes para tu nivel.');

    if (actual.estado === 'SEGURO' && !Number.isFinite(olaM)) {
        actual.mensaje += ' (Sin datos de oleaje: navega con precaución visual)';
    }

    return { ...actual, cls: CLASES_RIESGO[actual.estado] };
}