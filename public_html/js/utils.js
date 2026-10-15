// ====================================================
// js/utils.js - UTILIDADES, SANITIZACIÓN Y LÓGICA
// ====================================================

import { generarVeredictoNextGen, ESTADOS_VEREDICTO, CLASES_RIESGO as CLASES_RIESGO_CANONICAS, ICONOS_SEGURIDAD as ICONOS_SEGURIDAD_CANONICOS } from './engine/verdict.js';

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

export const RIESGO = {
    'SEGURO': 0,
    'PRECAUCIÓN': 1,
    'RIESGO ELEVADO': 2,
    'PELIGROSO': 3,
    'RIESGO EXTREMO': 4,
    'ANÁLISIS INCOMPLETO': 4,
    'NO RECOMENDADO': 4,
    'PROHIBIDO': 4
};
export const CLASES_RIESGO = {
    'Favorable': 'text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-lg',
    'Precaución': 'text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg',
    'Condiciones exigentes': 'text-orange-600 bg-orange-50 border border-orange-200 rounded-lg',
    'No recomendado': 'text-red-700 bg-red-100 border border-red-400 rounded-lg',
    'Tormenta eléctrica': 'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg',
    'SEGURO':     'text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-lg',
    'PRECAUCIÓN': 'text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg',
    'RIESGO ELEVADO': 'text-orange-600 bg-orange-50 border border-orange-200 rounded-lg',
    'PELIGROSO':  'text-red-500 bg-red-50 border border-red-200 rounded-lg',
    'RIESGO EXTREMO': 'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg',
    'ANÁLISIS INCOMPLETO': 'text-amber-700 bg-amber-50 border border-amber-300 rounded-lg',
    'NO RECOMENDADO': 'text-red-700 bg-red-100 border border-red-400 rounded-lg',
    'PROHIBIDO': 'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg'
};

const NIVELES_SEGURIDAD = [
    'SEGURO',
    'PRECAUCIÓN',
    'RIESGO ELEVADO',
    'PELIGROSO',
    'RIESGO EXTREMO'
];

function nivelVientoNudos(nudos) {
    if (nudos > 25) return 4;
    if (nudos >= 20) return 3;
    if (nudos >= 16) return 2;
    if (nudos >= 12) return 1;
    return 0;
}

function nivelOleaje(oleajeM) {
    if (oleajeM > 3) return 4;
    if (oleajeM >= 2) return 3;
    if (oleajeM >= 1.5) return 2;
    if (oleajeM >= 1) return 1;
    return 0;
}

function nivelDeriva(score) {
    if (score > 80) return 'EXTREMO';
    if (score > 60) return 'MUY ALTO';
    if (score > 40) return 'ALTO';
    if (score > 20) return 'MODERADO';
    return 'BAJO';
}

const MENSAJE_TORMENTA_ELECTRICA = 'Se ha detectado riesgo de tormenta eléctrica en la zona analizada.\n\nLa práctica del paddle surf no se considera segura bajo estas condiciones debido al riesgo de descargas eléctricas, cambios bruscos del viento y deterioro rápido del estado del mar.\n\nSe recomienda cancelar o posponer la salida y volver a consultar el pronóstico más adelante.';
const MENSAJE_DATOS_INSUFICIENTES = 'Las fuentes consultadas no disponen actualmente de información suficiente o suficientemente detallada para realizar una evaluación fiable de la seguridad.\n\nSe recomienda repetir el análisis más adelante cuando los proveedores meteorológicos dispongan de datos más completos y actualizados.';

function datoNumericoDisponible(valor) {
    return valor !== null && valor !== undefined && valor !== ''
        && valor !== '--' && valor !== 'N/D' && Number.isFinite(Number(valor));
}

export function deduplicateInsights(insights = []) {
    const equivalencias = [
        [/\b(?:riesgo (?:significativo )?(?:de )?)?tormentas? electricas?\b|\bactividad electrica\b|\bthunderstorms?\b|\blightning\b|\bdescargas electricas?\b|\brayos?\b/g, 'tormenta electrica'],
        [/\bwind gusts?\b|\brachas? de viento\b|\bracha\b/g, 'rachas'],
        [/\bwave height\b|\bhigh waves?\b|\boleajes?\b|\bolas?\b|\bmar de fondo\b/g, 'oleaje'],
        [/\bstrong winds?\b|\bvientos? fuertes?\b/g, 'viento fuerte'],
        [/\boffshore\b|\bviento de tierra\b/g, 'viento que aleja de la costa']
    ];
    const normalizar = texto => {
        let normalizado = String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        equivalencias.forEach(([expresion, reemplazo]) => {
            normalizado = normalizado.replace(expresion, reemplazo);
        });
        normalizado = normalizado.replace(/\balt[oa]s?\b/g, 'alto').replace(/\bprevist[oa]s?\b/g, 'previsto');
        normalizado = normalizado.replace(/\b(?:riesgo|risk|of|de|la|el|un|una|se|ha|hay|posible|previsto|detectado|detectada)\b/g, ' ');
        return normalizado.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    };
    const vistos = new Set();
    return (Array.isArray(insights) ? insights : [insights])
        .filter(insight => typeof insight === 'string' && insight.trim())
        .filter(insight => {
            const clave = normalizar(insight);
            if (!clave || vistos.has(clave)) return false;
            vistos.add(clave);
            return true;
        });
}

export function calcularConfianzaAnalisis({
    vientoKmh,
    rachasKmh,
    olaM,
    periodoOla,
    precipitacion,
    probabilidadPrecipitacion,
    direccionViento,
    componenteViento,
    aemetDisponible,
    nivelUsuario,
    datos = {}
}) {
    // ======================================================
    // JERARQUÍA DE FUENTES:
    // NIVEL 1 - FUENTES PRINCIPALES (Open-Meteo, marina, viento, oleaje)
    // Permiten generar el análisis por sí solas con confianza suficiente.
    // ======================================================
    const campos = [
        [vientoKmh, 25],
        [rachasKmh, 10],
        [olaM, 25],
        [periodoOla, 10],
        [direccionViento, 10]
    ];
    let confianza = campos.reduce((total, [valor, peso]) =>
        total + (datoNumericoDisponible(valor) ? peso : 0), 0);

    if (datoNumericoDisponible(precipitacion) || datoNumericoDisponible(probabilidadPrecipitacion)) confianza += 5;
    if (datoNumericoDisponible(datos.weatherCode ?? datos.weather_code)) confianza += 5;
    if (nivelUsuario) confianza += 5;
    if (componenteViento) confianza += 5;

    // Antigüedad de datos (solo penaliza si supera 24h)
    const actualizado = datos.dataUpdatedAt ?? datos.data_updated_at
        ?? datos.lastUpdated ?? datos.last_updated ?? datos.updatedAt ?? datos.updated_at
        ?? datos.issuedAt ?? datos.issued_at;
    if (actualizado) {
        const fecha = Date.parse(actualizado);
        if (Number.isFinite(fecha) && Date.now() - fecha > 24 * 60 * 60 * 1000) confianza -= 15;
    }
    if (datos.sourceConflict === true || datos.source_conflict === true
        || datos.conflictingSources === true || datos.conflicting_sources === true) confianza -= 10;

    // ======================================================
    // NIVEL 2 - FUENTES COMPLEMENTARIAS (AEMET)
    // Modifican y enriquecen el análisis, pero NO impiden que el sistema funcione.
    // Caso A: AEMET responde sin alertas -> confirmación oficial (+5%).
    // Caso B: AEMET no disponible -> leve reducción (-5%), nunca invalida ni bloquea.
    // ======================================================
    if (aemetDisponible === true) {
        confianza += 5;
    } else if (aemetDisponible === false) {
        confianza -= 5;
    }

    return Math.max(0, Math.min(100, Math.round(confianza)));
}

export function kmhANudos(kmh) {
    if (kmh === null || kmh === undefined || kmh === '') return null;
    return Number.isFinite(Number(kmh)) ? Number((Number(kmh) / 1.852).toFixed(1)) : null;
}

export function calcularMotorExpertoPaddleSafe({
    vientoKmh,
    rachasKmh,
    olaM,
    periodoOla,
    precipitacion,
    probabilidadPrecipitacion,
    direccionViento,
    componenteViento,
    alerta,
    tormenta,
    nivelUsuario,
    datos = {}
}) {
    return generarVeredictoNextGen({
        vientoKmh,
        rachasKmh,
        olaM,
        periodoOla,
        precipitacion,
        probabilidadPrecipitacion,
        direccionViento,
        componenteViento,
        alerta,
        tormenta,
        nivelUsuario,
        datos,
        coordenadas: datos.coordinates || (Number.isFinite(datos.latitude) && Number.isFinite(datos.longitude) ? { latitude: datos.latitude, longitude: datos.longitude } : null),
        nombreSpot: datos.location || datos.nombreSpot || ''
    });
}

export function calcularVeredicto(params) {
    return calcularMotorExpertoPaddleSafe(params);
}

// ==============================================================================
// RE-EXPORTS DEL MOTOR PADDLESAFE NEXT GENERATION
// ==============================================================================
export { calcularConsensoModelos } from './engine/consensus.js';
export { resolverOrientacionCostera, calcularComponenteVientoAuto, calcularIndiceDerivaPaddleSafe } from './engine/coastal.js';
export { calcularBeginnerIndex, evaluarCondicionesDeporte, DEPORTES } from './engine/sports.js';
export { detectarVentanasOptimas } from './engine/windows.js';
export { generarVeredictoNextGen, ESTADOS_VEREDICTO, ICONOS_SEGURIDAD } from './engine/verdict.js';
export { generarConsejoCoach } from './engine/coach.js';