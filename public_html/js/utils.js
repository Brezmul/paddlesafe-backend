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

/**
 * Comprime y escala proporcionalmente una imagen en el cliente usando un canvas HTML5
 * @param {File|Blob} file - Archivo o Blob de imagen a comprimir
 * @param {number} maxWidth - Ancho o alto máximo permitido (default 1600)
 * @param {number} quality - Calidad de compresión JPEG (0.1 a 1.0, default 0.84)
 * @returns {Promise<File|Blob>} - Archivo o Blob comprimido en formato image/jpeg
 */
export async function comprimirImagenCliente(file, maxWidth = 1600, quality = 0.84) {
    if (!file) return file;
    // Si no estamos en entorno navegador con canvas, fallback inmediato
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
        return file;
    }

    return new Promise((resolve) => {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        let { width, height } = img;
                        if (!width || !height) return resolve(file);

                        // Si ya está por debajo del límite y pesa menos de 400KB, no tocar
                        if (width <= maxWidth && height <= maxWidth && file.size && file.size < 400 * 1024) {
                            return resolve(file);
                        }

                        // Escalar proporcionalmente respetando ratio de aspecto
                        if (width > maxWidth || height > maxWidth) {
                            if (width > height) {
                                height = Math.round((height * maxWidth) / width);
                                width = maxWidth;
                            } else {
                                width = Math.round((width * maxWidth) / height);
                                height = maxWidth;
                            }
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return resolve(file);

                        ctx.drawImage(img, 0, 0, width, height);

                        if (typeof canvas.toBlob === 'function') {
                            canvas.toBlob(
                                (blob) => {
                                    if (!blob) return resolve(file);
                                    try {
                                        const originalName = file.name ? file.name.replace(/\.[^/.]+$/, '.jpg') : 'compressed.jpg';
                                        const compressedFile = new File([blob], originalName, {
                                            type: 'image/jpeg',
                                            lastModified: Date.now()
                                        });
                                        resolve(compressedFile);
                                    } catch (_) {
                                        resolve(blob);
                                    }
                                },
                                'image/jpeg',
                                quality
                            );
                        } else {
                            resolve(file);
                        }
                    } catch (err) {
                        console.warn('[comprimirImagenCliente] Fallo en compresión, usando archivo original:', err);
                        resolve(file);
                    }
                };
                img.onerror = () => resolve(file);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(file);
            reader.readAsDataURL(file);
        } catch (err) {
            console.warn('[comprimirImagenCliente] Error iniciando compresión:', err);
            resolve(file);
        }
    });
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
    'Riesgo meteorológico estimado': 'text-amber-500 bg-amber-950/80 border border-amber-500 rounded-lg',
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

export function actualizarUIPresencia() {
    if (typeof document === 'undefined') return;
    const elements = document.querySelectorAll('[data-user-presence-id]');
    const onlineMap = (typeof window !== 'undefined' && window.appState?.onlineUsers) || {};
    
    elements.forEach(el => {
        const uid = el.getAttribute('data-user-presence-id');
        if (!uid) return;
        const presence = onlineMap[uid];
        const status = presence ? presence.status : null;

        // Reset base classes
        el.className = "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-300 z-10";
        el.innerHTML = '';

        if (status === 'in_water') {
            el.className = "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-900 bg-sky-500 animate-pulse transition-colors duration-300 z-10 flex items-center justify-center text-[7px]";
            el.innerHTML = '🌊';
            el.setAttribute('title', 'Remando en el agua');
        } else if (status === 'online') {
            el.className = "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 bg-emerald-500 transition-colors duration-300 z-10";
            el.setAttribute('title', 'En línea');
        } else if (status === 'away') {
            el.className = "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 bg-amber-400 transition-colors duration-300 z-10";
            el.setAttribute('title', 'Ausente');
        } else {
            el.className = "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-900 bg-slate-500/70 transition-colors duration-300 z-10";
            el.setAttribute('title', 'Desconectado');
        }
    });
}


/**
 * Generador ultra-rápido de mini trazados SVG para tarjetas de rutas tipo Strava / Garmin (Batch #21)
 * @param {Array|string} coordenadas - Array [[lat, lon], ...] o [{lat, lng}, ...] o string JSON
 * @param {string} colorHex - Color hexadecimal del trazado (defecto: '#38bdf8')
 * @returns {string} Markup SVG inline listo para inyectar en DOM
 */
export function generarMiniSvgTrazadoRuta(coordenadas, colorHex = '#38bdf8') {
    let pts = coordenadas;
    if (typeof pts === 'string') {
        try { pts = JSON.parse(pts); } catch (_) { pts = []; }
    }

    const normPts = [];
    if (Array.isArray(pts)) {
        for (const p of pts) {
            if (!p) continue;
            let lat, lon;
            if (Array.isArray(p) && p.length >= 2) {
                lat = Number(p[0]);
                lon = Number(p[1]);
            } else if (typeof p === 'object') {
                lat = Number(p.lat ?? p.latitude);
                lon = Number(p.lon ?? p.lng ?? p.longitude);
            }
            if (!isNaN(lat) && !isNaN(lon)) {
                normPts.push({ lat, lon });
            }
        }
    }

    if (normPts.length < 2) {
        return `<svg viewBox="0 0 160 90" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full text-sky-400/50" aria-label="Trazado decorativo"><path d="M 15 45 Q 45 25, 80 45 T 145 45" stroke="${colorHex}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.5"/><circle cx="80" cy="45" r="3" fill="${colorHex}" opacity="0.7"/></svg>`;
    }

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    for (const p of normPts) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
    }

    let latSpan = maxLat - minLat;
    let lonSpan = maxLon - minLon;
    if (latSpan <= 0.000001) latSpan = 0.0001;
    if (lonSpan <= 0.000001) lonSpan = 0.0001;

    const padX = 160 * 0.12; // 19.2px
    const padY = 90 * 0.12;  // 10.8px
    const drawW = 160 - (padX * 2);
    const drawH = 90 - (padY * 2);

    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    const geoW = lonSpan * Math.max(0.1, Math.abs(cosLat));
    const geoH = latSpan;

    const scaleX = drawW / geoW;
    const scaleY = drawH / geoH;
    const scale = Math.min(scaleX, scaleY);

    const usedW = geoW * scale;
    const usedH = geoH * scale;
    const offX = padX + (drawW - usedW) / 2;
    const offY = padY + (drawH - usedH) / 2;

    const svgPoints = normPts.map(p => {
        const x = offX + (p.lon - minLon) * Math.abs(cosLat) * scale;
        const y = (90 - offY) - (p.lat - minLat) * scale;
        return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });

    const startPt = svgPoints[0];
    const endPt = svgPoints[svgPoints.length - 1];
    const pointsAttr = svgPoints.map(p => `${p.x},${p.y}`).join(' ');
    const safeId = Math.random().toString(36).substring(2, 7);

    return `<svg viewBox="0 0 160 90" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full overflow-visible" aria-label="Trazado de ruta GPS"><defs><filter id="psGlow-${safeId}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="${colorHex}" flood-opacity="0.6"/></filter></defs><polyline points="${pointsAttr}" fill="none" stroke="${colorHex}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#psGlow-${safeId})"/><circle cx="${startPt.x}" cy="${startPt.y}" r="3.5" fill="#10b981" stroke="#ffffff" stroke-width="1.5" /><circle cx="${endPt.x}" cy="${endPt.y}" r="3.5" fill="#f43f5e" stroke="#ffffff" stroke-width="1.5" /></svg>`;
}

/**
 * Asesor humano de equipamiento, neopreno térmico y tabla para SUP
 * @param {number|null} tempAireC Temperatura ambiente en °C
 * @param {number|null} vientoKt Velocidad de viento en nudos
 * @param {number|null} olasM Altura de ola significativa en metros
 * @param {number|null} score Safety score (0-100)
 * @param {number|null} mesIndex Mes del año (0-11, opcional para estacionalidad)
 * @returns {{ vestimenta: string, tabla: string, estrategia: string, html: string }}
 */
export function generarGuiaHumanaEquipamiento(tempAireC = 20, vientoKt = 5, olasM = 0.2, score = 80, mesIndex = null) {
    const t = Number(tempAireC ?? 20);
    const v = Number(vientoKt ?? 5);
    const o = Number(olasM ?? 0.2);
    const s = Number(score ?? 80);

    // Sensación térmica y recomendación de vestimenta / neopreno (windchill náutico simplificado)
    const sensacionTermica = t - (v > 10 ? (v - 10) * 0.4 : 0);

    let vestimenta = '';
    let vestimentaIcono = '👕';
    if (sensacionTermica >= 23) {
        vestimenta = '🩳 Bañador y Lycra UV (>23°C) + 🧴 Protección Solar Alta';
        vestimentaIcono = '🩳';
    } else if (sensacionTermica >= 19) {
        vestimenta = '🩱 Neopreno Corto / Shorty 2mm (19-22°C)';
        vestimentaIcono = '🩱';
    } else if (sensacionTermica >= 15) {
        vestimenta = '🧥 Neopreno 3/2mm o Cortavientos (15-18°C)';
        vestimentaIcono = '🧥';
    } else {
        vestimenta = '🧤 Neopreno 4/3mm + Escarpines (<15°C)';
        vestimentaIcono = '🧤';
    }

    // Tabla recomendada
    let tabla = '';
    let tablaIcono = '🏄';
    if (s < 40 || v >= 15 || o >= 0.9) {
        tabla = '⚠️ Solo expertos / Downwind técnico (Tabla rígida o race con experiencia)';
        tablaIcono = '⚠️';
    } else if (v >= 10 || o >= 0.5) {
        tabla = '🧭 Recomendado tabla Touring 12\'6" o rígida para vencer la deriva';
        tablaIcono = '🧭';
    } else {
        tabla = '✅ Apto para cualquier tabla (All-Round / Hinchable)';
        tablaIcono = '✅';
    }

    // Estrategia de Salida náutica en lenguaje claro
    let estrategia = '';
    let estrategiaIcono = '🧭';
    if (v >= 7) {
        estrategia = '💡 Empieza remando contra el viento para asegurar un regreso cómodo a favor';
        estrategiaIcono = '💡';
    } else if (o >= 0.6) {
        estrategia = '🌊 Atención en la orilla: mantén el remo firme al pasar la rompiente';
        estrategiaIcono = '🌊';
    } else {
        estrategia = '🌊 Mar en calma: Navega con libertad manteniendo siempre referencia visual de la costa';
        estrategiaIcono = '✨';
    }

    const html = `
        <div id="humanQuickBriefingBar" class="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-950/80 backdrop-blur-md rounded-2xl border border-sky-500/30 text-white shadow-lg animate-fadeIn">
            <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-900/70 border border-slate-800">
                <span class="text-xl shrink-0">${vestimentaIcono}</span>
                <div class="min-w-0">
                    <div class="text-[9px] font-black uppercase tracking-wider text-sky-400">Vestimenta Sugerida</div>
                    <div class="text-[11px] font-semibold text-slate-200 truncate" title="${vestimenta}">${vestimenta}</div>
                </div>
            </div>
            <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-900/70 border border-slate-800">
                <span class="text-xl shrink-0">${tablaIcono}</span>
                <div class="min-w-0">
                    <div class="text-[9px] font-black uppercase tracking-wider text-emerald-400">Tabla Recomendada</div>
                    <div class="text-[11px] font-semibold text-slate-200 truncate" title="${tabla}">${tabla}</div>
                </div>
            </div>
            <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-900/70 border border-slate-800">
                <span class="text-xl shrink-0">${estrategiaIcono}</span>
                <div class="min-w-0">
                    <div class="text-[9px] font-black uppercase tracking-wider text-amber-400">Estrategia en el Agua</div>
                    <div class="text-[11px] font-semibold text-slate-200 truncate" title="${estrategia}">${estrategia}</div>
                </div>
            </div>
            <button type="button" onclick="if(typeof window.abrirCalculadoraTermica==='function')window.abrirCalculadoraTermica({tempAire:${t},viento:${v}})" class="col-span-full py-1.5 px-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all" title="Abrir Calculadora Térmica Interactiva">
                <span>🌡️</span> <span>Personalizar Neopreno en Calculadora Térmica Interactiva</span> <span>→</span>
            </button>
        </div>
    `;

    return { vestimenta, tabla, estrategia, html };
}

/**
 * Calculadora térmica avanzada de confort, neopreno y equipamiento según física náutica
 * @param {Object} [params]
 * @param {number} [params.tempAguaC=18] Temperatura del agua en °C
 * @param {number} [params.tempAireC=21] Temperatura del aire en °C
 * @param {number} [params.vientoKt=8] Velocidad del viento en nudos
 * @param {('paseo'|'travesia'|'race')} [params.intensidad='paseo'] Nivel de esfuerzo metabólico
 * @param {('friolero'|'normal'|'caluroso')} [params.toleranciaFrio='normal'] Sensibilidad personal al frío
 * @param {boolean} [params.nublado=false] Si el cielo está cubierto
 * @returns {Object} Recomendación térmica estructurada
 */
export function calcularEquipamientoTermicoDetallado({
    tempAguaC = 18,
    tempAireC = 21,
    vientoKt = 8,
    intensidad = 'paseo',
    toleranciaFrio = 'normal',
    nublado = false
} = {}) {
    const tAgua = Number(tempAguaC ?? 18);
    const tAire = Number(tempAireC ?? 21);
    const vKt = Number(vientoKt ?? 8);
    const esNublado = Boolean(nublado);

    // 1. Sensación térmica por Windchill náutico
    const sensacionTermicaC = Number((tAire - (vKt > 7 ? (vKt - 7) * 0.45 : 0) - (esNublado ? 1.5 : 0)).toFixed(1));

    // 2. Offsets por esfuerzo metabólico y tolerancia personal
    const metabolicOffset = intensidad === 'race' ? 2.5 : (intensidad === 'travesia' ? 1.0 : 0.0);
    const personalOffset = toleranciaFrio === 'friolero' ? -2.0 : (toleranciaFrio === 'caluroso' ? 1.5 : 0.0);

    // 3. Índice térmico combinado (60% agua en caso de caída / inmersión, 40% ambiente percibido)
    const indiceTermico = Number(((tAgua * 0.6) + ((sensacionTermicaC + metabolicOffset + personalOffset) * 0.4)).toFixed(1));

    // 4. Regla del 30 (Regla de seguridad náutica internacional: Temp Agua + Temp Aire < 30°C = Cold Water Shock)
    const sumaTemps = tAgua + tAire;
    const regla30Activa = sumaTemps < 30;
    const alertaRegla30 = regla30Activa
        ? `⚠️ Alerta Shock Térmico (Regla del 30): Agua (${tAgua}°C) + Aire (${tAire}°C) = ${sumaTemps}°C (< 30°C). Caer al agua puede provocar reflejo de boqueo involuntario e hipotermia rápida. Obligatorio chaleco salvavidas 50N y traje sellado.`
        : null;

    // 5. Traje principal / Neopreno recomendado
    let trajePrincipal = { titulo: '', grosorMm: '', icono: '', explicacion: '' };
    if (indiceTermico >= 22) {
        trajePrincipal = {
            titulo: 'Bañador y Lycra UV',
            grosorMm: '0mm',
            icono: '🩳',
            explicacion: 'Excelente confort térmico. Protección solar UV50+ y máxima ligereza sin sobrecalentamiento.'
        };
    } else if (indiceTermico >= 18) {
        trajePrincipal = {
            titulo: 'Neopreno Shorty 2mm',
            grosorMm: '2mm',
            icono: '🩱',
            explicacion: 'Mantiene el core caliente frente al viento y salpicaduras con hombros y rodillas libres.'
        };
    } else if (indiceTermico >= 14) {
        trajePrincipal = {
            titulo: 'Neopreno Integral 3/2mm Sellado',
            grosorMm: '3/2mm',
            icono: '🧥',
            explicacion: 'Aislamiento ideal para aguas frescas y viento moderado. Costuras estancas (GBS) recomendadas.'
        };
    } else if (indiceTermico >= 10) {
        trajePrincipal = {
            titulo: 'Neopreno Integral 4/3mm + Cinta Térmica',
            grosorMm: '4/3mm',
            icono: '🧤',
            explicacion: 'Protección térmica avanzada para agua fría. Evita la pérdida rápida de calor en brazos y piernas.'
        };
    } else {
        trajePrincipal = {
            titulo: 'Traje Seco o 5/4mm con Capucha Integrada',
            grosorMm: '5/4mm',
            icono: '❄️',
            explicacion: 'Condiciones invernales severas. Requiere traje estanco o neopreno de máximo grosor con barrera craneal.'
        };
    }

    // 6. Calzado náutico
    let calzado = { tipo: '', icono: '', explicacion: '' };
    if (tAgua >= 18 && tAire >= 18) {
        calzado = {
            tipo: 'Descalzo',
            icono: '🦶',
            explicacion: 'Máxima sensibilidad y agarre natural sobre el pad de EVA de la tabla.'
        };
    } else if (tAgua >= 14) {
        calzado = {
            tipo: 'Escarpines bajos 2mm',
            icono: '🧦',
            explicacion: 'Protección para dedos y suela con aislamiento ligero sin perder tacto.'
        };
    } else {
        calzado = {
            tipo: 'Escarpines altos 3-5mm con suela reforzada',
            icono: '🥾',
            explicacion: 'Suela de goma antideslizante y caña alta sobre el tobillo para retener calor.'
        };
    }

    // 7. Accesorios e hidratación recomendada
    const accesorios = [];
    const tasaHidratacion = intensidad === 'race' ? '1.0 L/h isotónico con sales' : (intensidad === 'travesia' ? '0.8 L/h agua y electrolitos' : '0.5 L/h agua fresca');
    accesorios.push(`💧 Hidratación: mínimo ${tasaHidratacion}`);

    if (vKt >= 12) {
        accesorios.push('💨 Cortavientos náutico ligero de secado rápido sobre el neopreno');
    }
    if (indiceTermico < 13) {
        accesorios.push('🧤 Guantes térmicos de neopreno con palma antideslizante');
        accesorios.push('🧢 Gorro de neopreno o cinta cubre-orejas');
    }
    if (!esNublado) {
        accesorios.push('🧴 Crema solar mineral SPF50 resistente al agua');
        accesorios.push('🕶️ Gafas polarizadas con flotador y cinta de seguridad');
    }

    // 8. Nivel de confort global
    let nivelConfort = '';
    let nivelBadgeColor = '';
    if (indiceTermico >= 20) {
        nivelConfort = 'Óptimo / Confort Pleno';
        nivelBadgeColor = 'emerald';
    } else if (indiceTermico >= 15) {
        nivelConfort = 'Templado / Muy Favorable';
        nivelBadgeColor = 'teal';
    } else if (indiceTermico >= 11) {
        nivelConfort = 'Fresco / Precaución Térmica';
        nivelBadgeColor = 'amber';
    } else {
        nivelConfort = 'Frío Intenso / Riesgo Hipotermia';
        nivelBadgeColor = 'rose';
    }

    return {
        tempAguaC: tAgua,
        tempAireC: tAire,
        vientoKt: vKt,
        sensacionTermicaC,
        metabolicOffset,
        personalOffset,
        indiceTermico,
        regla30Activa,
        alertaRegla30,
        trajePrincipal,
        calzado,
        accesorios,
        nivelConfort,
        nivelBadgeColor
    };
}

if (typeof window !== 'undefined') {
    window.calcularSolYCrepusculo = calcularSolYCrepusculo;
    window.actualizarUIPresencia = actualizarUIPresencia;
    window.comprimirImagenCliente = comprimirImagenCliente;
    window.generarMiniSvgTrazadoRuta = generarMiniSvgTrazadoRuta;
    window.generarGuiaHumanaEquipamiento = generarGuiaHumanaEquipamiento;
    window.calcularEquipamientoTermicoDetallado = calcularEquipamientoTermicoDetallado;
}