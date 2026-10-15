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
    const campos = [
        [vientoKmh, 20],
        [rachasKmh, 8],
        [olaM, 20],
        [periodoOla, 5],
        [precipitacion, 5],
        [probabilidadPrecipitacion, 5],
        [direccionViento, 8]
    ];
    let confianza = campos.reduce((total, [valor, peso]) =>
        total + (datoNumericoDisponible(valor) ? peso : 0), 0);
    if (componenteViento) confianza += 10;
    if (aemetDisponible) confianza += 12;
    if (datoNumericoDisponible(datos.weatherCode ?? datos.weather_code)) confianza += 7;
    if (nivelUsuario) confianza += 5;

    const actualizado = datos.dataUpdatedAt ?? datos.data_updated_at
        ?? datos.lastUpdated ?? datos.last_updated ?? datos.updatedAt ?? datos.updated_at
        ?? datos.issuedAt ?? datos.issued_at;
    if (actualizado) {
        const fecha = Date.parse(actualizado);
        if (Number.isFinite(fecha) && Date.now() - fecha > 6 * 60 * 60 * 1000) confianza -= 25;
    }
    if (datos.sourceConflict === true || datos.source_conflict === true
        || datos.conflictingSources === true || datos.conflicting_sources === true) confianza -= 20;
    if (aemetDisponible === false) confianza -= 15;

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
    const convertirKmhANudos = kmh => kmh === null || kmh === undefined || kmh === ''
        ? null
        : Number.isFinite(Number(kmh)) ? Number(kmh) / 1.852 : null;
    const vientoKtRaw = convertirKmhANudos(vientoKmh);
    const rachasKtRaw = convertirKmhANudos(rachasKmh);
    const vientoKt = vientoKtRaw === null ? null : Number(vientoKtRaw.toFixed(1));
    const rachasKt = rachasKtRaw === null ? null : Number(rachasKtRaw.toFixed(1));
    const oleaje = olaM === null || olaM === undefined || olaM === ''
        ? null
        : Number.isFinite(Number(olaM)) ? Number(olaM) : null;
    let nivel = Math.max(
        vientoKtRaw === null ? 1 : nivelVientoNudos(vientoKtRaw),
        rachasKtRaw === null ? 0 : nivelVientoNudos(rachasKtRaw),
        oleaje === null ? 1 : nivelOleaje(oleaje)
    );
    const factoresCriticos = [];
    const nivelesUsuario = {
        Principiante: { viento: 12, ola: 0.3, racha: 16 },
        Intermedio: { viento: 14, ola: 0.8, racha: 28 },
        Avanzado: { viento: 20, ola: 1.2, racha: 35 }
    };
    const umbralUsuario = nivelesUsuario[nivelUsuario];
    if (umbralUsuario && (
        (vientoKtRaw !== null && vientoKtRaw >= umbralUsuario.viento)
        || (rachasKtRaw !== null && rachasKtRaw >= umbralUsuario.racha)
        || (oleaje !== null && oleaje >= umbralUsuario.ola)
    )) {
        nivel = Math.max(nivel, 1);
        factoresCriticos.push(`Las condiciones alcanzan el umbral preventivo recomendado para el nivel ${nivelUsuario.toLowerCase()}.`);
    }

    if (vientoKt === null) factoresCriticos.push('No hay medición de viento; se aplica precaución por falta de datos.');
    else if (vientoKt >= 12) factoresCriticos.push(`Viento sostenido de ${vientoKt} kt.`);

    if (rachasKt !== null && (vientoKt === null || rachasKt - vientoKt >= 5)) {
        factoresCriticos.push(`Rachas de ${rachasKt} kt${vientoKt === null ? '' : ` frente a ${vientoKt} kt de viento sostenido`}.`);
    }
    if (oleaje === null) factoresCriticos.push('No hay medición de oleaje; se aplica precaución hasta confirmar el estado del mar.');
    else if (oleaje >= 1) factoresCriticos.push(`Oleaje de ${oleaje.toFixed(1)} m.`);
    if (datoNumericoDisponible(periodoOla) && Number(periodoOla) >= 10 && oleaje !== null && oleaje >= 0.5) {
        nivel = Math.max(nivel, 2);
        factoresCriticos.push(`Periodo de oleaje largo (${Number(periodoOla).toFixed(0)} s): aumenta la energía de las olas y requiere mayor cautela.`);
    }
    if (datoNumericoDisponible(precipitacion) && Number(precipitacion) >= 5) {
        nivel = Math.max(nivel, 2);
        factoresCriticos.push('Se prevé precipitación significativa; la visibilidad y la evolución de las condiciones pueden deteriorarse.');
    } else if (datoNumericoDisponible(probabilidadPrecipitacion) && Number(probabilidadPrecipitacion) >= 70) {
        nivel = Math.max(nivel, 1);
        factoresCriticos.push('La probabilidad de precipitación es elevada; confirma la evolución meteorológica antes de salir.');
    }
    if (!datoNumericoDisponible(periodoOla)) factoresCriticos.push('No hay información del periodo del oleaje.');
    if (!datoNumericoDisponible(precipitacion) || !datoNumericoDisponible(probabilidadPrecipitacion)) {
        factoresCriticos.push('La precipitación no se puede valorar completamente con los datos disponibles.');
    }
    if (direccionViento !== null && direccionViento !== undefined && Number.isFinite(Number(direccionViento))) {
        factoresCriticos.push(`Dirección meteorológica del viento: ${Math.round(Number(direccionViento))}°; la componente respecto a costa requiere la orientación local de la costa.`);
    }
    if (!datoNumericoDisponible(datos.weatherCode ?? datos.weather_code)) {
        factoresCriticos.push('No se puede confirmar la presencia o ausencia de actividad eléctrica con la información disponible.');
    }

    const textoAlerta = String(alerta?.tipo || '').toLowerCase();
    const tormentaElectrica = Boolean(tormenta)
        || /tormenta|thunderstorm|lightning|descarga electrica|actividad electrica|rayo detectado/.test(textoAlerta)
        || [95, 96, 99].includes(Number(datos.weatherCode ?? datos.weather_code));
    if (tormentaElectrica) {
        nivel = 4;
        factoresCriticos.push('Riesgo de tormenta eléctrica: no se debe salir a remar.');
    }

    if (alerta?.activa) {
        const nivelAlerta = String(alerta.nivel || '').toUpperCase();
        const nivelPorAlerta = nivelAlerta === 'ROJA' ? 4
            : nivelAlerta === 'NARANJA' ? 3
                : nivelAlerta === 'AMARILLA' ? 1 : 2;
        nivel = Math.max(nivel, nivelPorAlerta);
        const origenAviso = alerta.origen === 'AEMET' ? 'Aviso AEMET' : 'Aviso meteorológico';
        factoresCriticos.push(`${origenAviso} activo: ${alerta.tipo || nivelAlerta || 'consulta el parte oficial'}.`);
    }
    if (!alerta?.disponible) {
        factoresCriticos.push('No se ha podido confirmar la disponibilidad de avisos AEMET para esta consulta.');
    }
    if (datos.sourceConflict === true || datos.source_conflict === true
        || datos.conflictingSources === true || datos.conflicting_sources === true) {
        factoresCriticos.push('Las fuentes meteorológicas presentan datos en conflicto; se aplica un margen de seguridad.');
    }
    const actualizado = datos.dataUpdatedAt ?? datos.data_updated_at
        ?? datos.lastUpdated ?? datos.last_updated ?? datos.updatedAt ?? datos.updated_at
        ?? datos.issuedAt ?? datos.issued_at;
    if (actualizado) {
        const fecha = Date.parse(actualizado);
        if (Number.isFinite(fecha) && Date.now() - fecha > 6 * 60 * 60 * 1000) {
            factoresCriticos.push('Los datos meteorológicos están desactualizados; vuelve a consultar antes de decidir.');
        }
    }

    const componenteNormalizada = String(componenteViento || '').toLowerCase().replace(/\s+/g, '-');
    const componente = ['offshore', 'onshore', 'side-shore'].includes(componenteNormalizada)
        ? componenteNormalizada
        : null;
    let derivaScore = vientoKtRaw === null ? 25
        : vientoKtRaw > 25 ? 100
            : vientoKtRaw >= 20 ? 80
                : vientoKtRaw >= 16 ? 60
                    : vientoKtRaw >= 12 ? 30
                        : vientoKtRaw >= 8 ? 25
                            : vientoKtRaw >= 5 ? 15 : 10;

    if (rachasKt !== null && vientoKt !== null) {
        if (rachasKt - vientoKt >= 10) derivaScore += 20;
        else if (rachasKt - vientoKt >= 5) derivaScore += 10;
    }
    if (oleaje !== null && oleaje >= 2) derivaScore += 20;
    else if (oleaje !== null && oleaje >= 1) derivaScore += 10;

    if (componente === 'offshore') {
        derivaScore += vientoKtRaw >= 20 ? 25 : vientoKtRaw >= 16 ? 20 : vientoKtRaw >= 8 ? 25 : 15;
        factoresCriticos.push('Componente offshore: el viento aleja de la costa y dificulta el retorno.');
    } else if (componente === 'onshore') {
        derivaScore -= 10;
        factoresCriticos.push('Componente onshore: reduce la deriva mar adentro, pero no elimina el riesgo de viento y oleaje.');
    } else if (componente === 'side-shore') {
        derivaScore += 10;
        factoresCriticos.push('Componente side-shore: puede desplazar la tabla paralelamente a la costa.');
    } else {
        derivaScore += 20;
        factoresCriticos.push('Orientación del viento y distancia a costa no disponibles; se añade margen preventivo y no se puede descartar deriva offshore.');
    }
    derivaScore = Math.max(0, Math.min(100, Math.round(derivaScore)));

    const confianza = calcularConfianzaAnalisis({
        vientoKmh,
        rachasKmh,
        olaM,
        periodoOla,
        precipitacion,
        probabilidadPrecipitacion,
        direccionViento,
        componenteViento: componente,
        aemetDisponible: alerta?.disponible,
        nivelUsuario,
        datos
    });
    const analisisCompleto = [
        vientoKmh, rachasKmh, oleaje, periodoOla, precipitacion,
        probabilidadPrecipitacion, direccionViento
    ].every(datoNumericoDisponible)
        && Boolean(componente)
        && alerta?.disponible === true
        && datoNumericoDisponible(datos.weatherCode ?? datos.weather_code);
    let scoreSeguridad = Math.min([100, 80, 60, 35, 0][nivel], confianza);
    if (!analisisCompleto) scoreSeguridad = Math.min(scoreSeguridad, 79);
    let nivelTexto = NIVELES_SEGURIDAD[nivel];
    let recomendacion = nivel >= 3 ? 'NO RECOMENDADO' : 'REVISAR CONDICIONES';
    let mensaje;

    if (tormentaElectrica) {
        scoreSeguridad = 0;
        nivelTexto = 'NO RECOMENDADO';
        recomendacion = 'NO RECOMENDADO';
        mensaje = MENSAJE_TORMENTA_ELECTRICA;
    } else if (confianza < 60) {
        scoreSeguridad = Math.min(scoreSeguridad, 50);
        nivelTexto = 'ANÁLISIS INCOMPLETO';
        recomendacion = 'NO RECOMENDADO';
        mensaje = MENSAJE_DATOS_INSUFICIENTES;
        factoresCriticos.push('Información meteorológica insuficiente para confirmar la seguridad de la salida.');
    }

    const limitesAlerta = { AMARILLA: 70, NARANJA: 50, ROJA: 25 };
    const nivelAlerta = String(alerta?.nivel || '').toUpperCase();
    if (alerta?.activa && limitesAlerta[nivelAlerta] !== undefined) {
        scoreSeguridad = Math.min(scoreSeguridad, limitesAlerta[nivelAlerta]);
        if (nivelAlerta === 'AMARILLA') {
            if (nivelTexto === 'SEGURO') nivelTexto = 'PRECAUCIÓN';
            recomendacion = 'PRECAUCIÓN';
        } else if (nivelAlerta === 'NARANJA') {
            nivelTexto = 'RIESGO ELEVADO';
            recomendacion = 'NO RECOMENDADO';
        } else {
            nivelTexto = 'NO RECOMENDADO';
            recomendacion = 'NO RECOMENDADO';
        }
    }

    if (!tormentaElectrica && nivelTexto !== 'ANÁLISIS INCOMPLETO' && nivelTexto !== 'NO RECOMENDADO') {
        const rangoPorScore = scoreSeguridad < 30 ? 'RIESGO EXTREMO'
            : scoreSeguridad < 50 ? 'PELIGROSO'
                : scoreSeguridad < 65 ? 'RIESGO ELEVADO'
                    : scoreSeguridad < 80 ? 'PRECAUCIÓN' : 'SEGURO';
        const rangos = { 'SEGURO': 0, 'PRECAUCIÓN': 1, 'RIESGO ELEVADO': 2, 'PELIGROSO': 3, 'RIESGO EXTREMO': 4 };
        if (rangos[rangoPorScore] > rangos[nivelTexto]) nivelTexto = rangoPorScore;
    }

    const vientoTexto = vientoKt === null ? 'viento sin medición' : `viento de ${vientoKt} kt`;
    const oleajeTexto = oleaje === null ? 'oleaje sin medición' : `oleaje de ${oleaje.toFixed(1)} m`;
    if (!mensaje) {
        mensaje = !analisisCompleto || confianza < 80
            ? `La confianza del análisis es parcial (${confianza}%). No se puede confirmar con fiabilidad que la salida sea segura; vuelve a consultar cuando haya datos meteorológicos más completos.`
            : nivel === 0
            ? `Con los datos disponibles, el viento se mantiene débil (${vientoKt} kt) y el oleaje es bajo (${oleaje.toFixed(1)} m). Aun así, confirma las condiciones locales antes de entrar al agua.`
            : nivel === 1
                ? `${vientoTexto} y ${oleajeTexto}: conviene extremar la prudencia y confirmar el parte local antes de salir.`
                : nivel === 2
                    ? `${vientoTexto} y ${oleajeTexto}: las condiciones requieren experiencia, una ruta protegida y una evaluación local antes de decidir.`
                    : nivel === 3
                        ? `${vientoTexto} y ${oleajeTexto}: las condiciones presentan un riesgo elevado para el paddle surf recreativo.`
                        : `${vientoTexto} y ${oleajeTexto}: riesgo extremo; no se recomienda salir.`;
    }
    if (recomendacion !== 'NO RECOMENDADO' && alerta?.activa) {
        recomendacion = 'PRECAUCIÓN';
    }
    if (!tormentaElectrica && analisisCompleto && !alerta?.activa && alerta?.disponible === true
        && componente && nivelTexto === 'SEGURO' && scoreSeguridad >= 80 && confianza >= 80) {
        recomendacion = 'SALIDA RECOMENDADA';
    } else if (recomendacion !== 'NO RECOMENDADO' && recomendacion !== 'PRECAUCIÓN') {
        recomendacion = 'REVISAR CONDICIONES';
    }
    const derivaNivel = nivelDeriva(derivaScore);
    const derivaDescripcion = componente === 'offshore'
        ? `Viento offshore de ${vientoKt ?? 'N/D'} kt${direccionViento == null ? '' : ` (dirección ${Math.round(direccionViento)}°)`}: aumenta el riesgo de deriva mar adentro. Nivel ${derivaNivel.toLowerCase()}.`
        : componente === 'onshore'
            ? `El viento onshore reduce la deriva mar adentro, pero las rachas y el oleaje mantienen un riesgo ${derivaNivel.toLowerCase()}.`
            : componente === 'side-shore'
                ? `El viento side-shore puede desplazar la tabla a lo largo de la costa; el riesgo de deriva es ${derivaNivel.toLowerCase()}.`
                : `Riesgo de deriva ${derivaNivel.toLowerCase()} por viento${vientoKt === null ? ' sin medición' : ` de ${vientoKt} kt`}, rachas y oleaje. La componente respecto a costa no está disponible.`;

    return {
        estado: nivelTexto,
        mensaje,
        recomendacion,
        cls: CLASES_RIESGO[nivelTexto],
        seguridad: { nivel: nivelTexto, score: scoreSeguridad },
        analysisConfidence: confianza,
        confianzaAnalisis: confianza,
        aemet: alerta || { activa: false, disponible: false },
        tormentaElectrica,
        riesgoDeriva: { nivel: derivaNivel, score: derivaScore, descripcion: derivaDescripcion },
        factoresCriticos: deduplicateInsights(factoresCriticos),
        vientoNudos: vientoKt
    };
}

export function calcularVeredicto({
    alerta,
    vientoKmh,
    olaM,
    rachasKmh,
    direccionViento,
    componenteViento,
    tormenta,
    periodoOla,
    precipitacion,
    probabilidadPrecipitacion,
    nivelUsuario,
    datos
}) {
    return calcularMotorExpertoPaddleSafe({
        alerta,
        vientoKmh,
        olaM,
        rachasKmh,
        periodoOla,
        precipitacion,
        probabilidadPrecipitacion,
        direccionViento,
        componenteViento,
        tormenta: tormenta || alerta?.tormenta,
        nivelUsuario,
        datos
    });
}