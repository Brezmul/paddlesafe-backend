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

function datoNumericoDisponible(valor) {
    return valor !== null && valor !== undefined && valor !== ''
        && valor !== '--' && valor !== 'N/D' && Number.isFinite(Number(valor));
}

/**
 * Evalúa si dos textos o consejos transmiten esencialmente la misma recomendación o significado (equivalencia semántica).
 * Detecta tanto textos idénticos como variaciones del tipo:
 * "Ante cualquier duda, vuelve a la orilla." vs "Si las condiciones empeoran, regresa a la costa."
 */
export function sonMensajesEquivalentes(textoA, textoB, umbral = 0.5) {
    if (!textoA || !textoB) return false;
    if (typeof textoA !== 'string' || typeof textoB !== 'string') return false;

    const a = textoA.trim();
    const b = textoB.trim();
    if (!a || !b) return false;
    if (a.toLowerCase() === b.toLowerCase()) return true;

    // Normalización de texto base (sin acentos, minúsculas, sin puntuación)
    const limpiar = t => t.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normA = limpiar(a);
    const normB = limpiar(b);
    if (normA === normB) return true;
    if (normA.length > 20 && normB.length > 20 && (normA.includes(normB) || normB.includes(normA))) return true;

    // Diccionario de conceptos semánticos náuticos / Paddle Surf
    const CONCEPTOS = [
        { id: 'RETORNO', regex: /\b(regres[a-z]*|retorn[a-z]*|volv[a-z]*|vuelta|regreso|escap[a-z]*)\b/g },
        { id: 'ORILLA', regex: /\b(orilla|costa|playa|tierra|tierra firme|arena)\b/g },
        { id: 'RODILLAS', regex: /\b(rodill[a-z]*|arrodill[a-z]*|agach[a-z]*|centro de gravedad|gravedad bajo)\b/g },
        { id: 'ALERTA', regex: /\b(duda|dudas|empeor[a-z]*|desequilibri[a-z]*|inestab[a-z]*|cansanci[a-z]*|fatiga|racha|rachas|dificultad[a-z]*|problema[a-z]*|miedo|vacil[a-z]*)\b/g },
        { id: 'PARALELO', regex: /\b(paralel[a-z]*|linea de costa|bordeando|costeand[a-z]*)\b/g },
        { id: 'PACING', regex: /\b(pacing|dosific[a-z]*|reserv[a-z]*|guard[a-z]*|tercio|30%|35%|fuerza[a-z]*|energia|cansad[a-z]*)\b/g },
        { id: 'CHALECO', regex: /\b(chaleco|flotabilid[a-z]*|50n|salvavidas)\b/g },
        { id: 'LEASH', regex: /\b(leash|invento|amarr[a-z]*|tobillo)\b/g },
        { id: 'POSPONER', regex: /\b(aplaz[a-z]*|suspend[a-z]*|cancel[a-z]*|quedarse en tierra|quedate en tierra|no salir|techo)\b/g },
        { id: 'EMERGENCIA', regex: /\b(emergenci[a-z]*|aviso|avisos|112|aemet|proteccion civil)\b/g },
        { id: 'OFFSHORE', regex: /\b(offshore|terral|tierra mar|mar abierto|mar adentro|alejarse|aleja)\b/g },
        { id: 'CALIDAD_TECNICA', regex: /\b(tecnica pura|postura erguida|respiracion|perfeccionamiento|palada limpia)\b/g },
        { id: 'HIDRATACION', regex: /\b(hidrat[a-z]*|agua|beber|liquido)\b/g }
    ];

    const extraerConceptos = t => {
        const encontrados = new Set();
        CONCEPTOS.forEach(({ id, regex }) => {
            regex.lastIndex = 0;
            if (regex.test(t)) encontrados.add(id);
        });
        return encontrados;
    };

    const conceptosA = extraerConceptos(normA);
    const conceptosB = extraerConceptos(normB);

    // 1. Núcleo: Volver a la orilla / costa ante duda o racha
    const retornoOrillaA = conceptosA.has('RETORNO') && conceptosA.has('ORILLA');
    const retornoOrillaB = conceptosB.has('RETORNO') && conceptosB.has('ORILLA');
    if (retornoOrillaA && retornoOrillaB) return true;

    // 2. Núcleo: Ponerse de rodillas por estabilidad o ante racha
    if (conceptosA.has('RODILLAS') && conceptosB.has('RODILLAS')) return true;

    // 3. Núcleo: Quedarse en tierra / suspender por emergencias
    if (conceptosA.has('POSPONER') && conceptosB.has('POSPONER')) {
        if (conceptosA.has('EMERGENCIA') || conceptosB.has('EMERGENCIA') || conceptosA.has('ORILLA') || conceptosB.has('ORILLA')) {
            return true;
        }
    }

    // 4. Núcleo: Navegación paralela a la costa
    if (conceptosA.has('PARALELO') && conceptosB.has('PARALELO') && (conceptosA.has('ORILLA') || conceptosB.has('ORILLA'))) {
        return true;
    }

    // 5. Núcleo: Dosificación y reserva de energía para regreso
    if (conceptosA.has('PACING') && conceptosB.has('PACING') && (conceptosA.has('RETORNO') || conceptosB.has('RETORNO'))) {
        return true;
    }

    // 6. Solapamiento de conceptos múltiples
    const interseccion = [...conceptosA].filter(c => conceptosB.has(c));
    const union = new Set([...conceptosA, ...conceptosB]);
    if (union.size > 0 && (interseccion.length / union.size) >= 0.5) return true;

    // 7. Similitud léxica Jaccard sin stop words
    const STOP_WORDS = new Set([
        'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a',
        'en', 'con', 'por', 'para', 'sin', 'sobre', 'ante', 'bajo', 'entre', 'hacia',
        'hasta', 'durante', 'mediante', 'si', 'se', 'que', 'como', 'cuando', 'donde',
        'es', 'son', 'fue', 'era', 'sea', 'ha', 'han', 'hay', 'muy', 'mas', 'pero',
        'tu', 'tus', 'su', 'sus', 'mi', 'mis', 'este', 'esta', 'estos', 'estas', 'y',
        'o', 'u', 'e', 'ni', 'cada', 'todo', 'toda', 'todos', 'todas', 'cualquier'
    ]);

    const palabrasA = new Set(normA.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w)));
    const palabrasB = new Set(normB.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w)));

    if (palabrasA.size > 0 && palabrasB.size > 0) {
        const comunes = [...palabrasA].filter(p => palabrasB.has(p));
        const jaccard = comunes.length / (palabrasA.size + palabrasB.size - comunes.length);
        const minContainment = comunes.length / Math.min(palabrasA.size, palabrasB.size);
        if (jaccard >= umbral || minContainment >= 0.65) return true;
    }

    return false;
}

/**
 * Filtra una lista de mensajes descartando los que sean semánticamente redundantes
 * con respecto a las referencias prioritarias dadas o entre sí.
 */
export function filtrarConsejosRedundantes(lista = [], referenciasPrioritarias = []) {
    const refs = (Array.isArray(referenciasPrioritarias) ? referenciasPrioritarias : [referenciasPrioritarias])
        .filter(r => typeof r === 'string' && r.trim());
    const aceptados = [];

    (Array.isArray(lista) ? lista : [lista]).forEach(item => {
        if (!item || typeof item !== 'string' || !item.trim()) return;
        const texto = item.trim();
        const duplicadoConRef = refs.some(ref => sonMensajesEquivalentes(texto, ref));
        if (duplicadoConRef) return;
        const duplicadoInterno = aceptados.some(prev => sonMensajesEquivalentes(texto, prev));
        if (duplicadoInterno) return;
        aceptados.push(texto);
    });

    return aceptados;
}

export function deduplicateInsights(insights = []) {
    const list = (Array.isArray(insights) ? insights : [insights])
        .filter(insight => typeof insight === 'string' && insight.trim());
    const vistos = [];
    return list.filter(item => {
        if (vistos.some(existente => sonMensajesEquivalentes(item, existente))) {
            return false;
        }
        vistos.push(item);
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

// ==============================================================================
// CÁLCULO ASTRONÓMICO DE AMANECER, OCASO Y CREPÚSCULO CIVIL (NOAA OFFLINE)
// ==============================================================================
export function calcularSolYCrepusculo(lat, lon, fechaStr) {
    const latNum = Number(lat) || 0;
    const lonNum = Number(lon) || 0;
    const d = fechaStr ? new Date(fechaStr) : new Date();

    const startOfYear = new Date(d.getFullYear(), 0, 0);
    const diff = d - startOfYear;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

    const rad = Math.PI / 180;
    const latRad = latNum * rad;

    const calcZenith = (zenithDeg) => {
        const cosHA = (Math.cos(zenithDeg * rad) / (Math.cos(latRad) * Math.cos(decl))) - (Math.tan(latRad) * Math.tan(decl));
        if (cosHA > 1) return null;
        if (cosHA < -1) return null;
        const haRad = Math.acos(cosHA);
        return haRad / rad;
    };

    const haSunrise = calcZenith(90.833);
    const haDusk = calcZenith(96.0);

    const targetDateAtNoon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
    const tzOffsetHoras = -(targetDateAtNoon.getTimezoneOffset() / 60);

    let sunriseMin = 420;
    let sunsetMin = 1200;
    let duskMin = 1230;

    if (haSunrise !== null) {
        const solarNoonMin = 720 - (4 * lonNum) - eqtime + (tzOffsetHoras * 60);
        sunriseMin = Math.round(solarNoonMin - (haSunrise * 4));
        sunsetMin = Math.round(solarNoonMin + (haSunrise * 4));
    }
    if (haDusk !== null) {
        const solarNoonMin = 720 - (4 * lonNum) - eqtime + (tzOffsetHoras * 60);
        duskMin = Math.round(solarNoonMin + (haDusk * 4));
    }

    const toHHMM = (m) => {
        const norm = ((m % 1440) + 1440) % 1440;
        const hh = String(Math.floor(norm / 60)).padStart(2, '0');
        const mm = String(norm % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const result = {
        sunriseStr: toHHMM(sunriseMin),
        sunsetStr: toHHMM(sunsetMin),
        civilDuskStr: toHHMM(duskMin),
        sunriseMin,
        sunsetMin,
        duskMin
    };

    return result;
}

if (typeof window !== 'undefined') {
    window.calcularSolYCrepusculo = calcularSolYCrepusculo;
}