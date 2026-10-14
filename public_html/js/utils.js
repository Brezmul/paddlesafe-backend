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
    'PROHIBIDO': 4
};
export const CLASES_RIESGO = {
    'SEGURO':     'text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-lg',
    'PRECAUCIÓN': 'text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg',
    'RIESGO ELEVADO': 'text-orange-600 bg-orange-50 border border-orange-200 rounded-lg',
    'PELIGROSO':  'text-red-500 bg-red-50 border border-red-200 rounded-lg',
    'RIESGO EXTREMO': 'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg',
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

export function kmhANudos(kmh) {
    if (kmh === null || kmh === undefined || kmh === '') return null;
    return Number.isFinite(Number(kmh)) ? Number((Number(kmh) / 1.852).toFixed(1)) : null;
}

export function calcularMotorExpertoPaddleSafe({
    vientoKmh,
    rachasKmh,
    olaM,
    direccionViento,
    componenteViento,
    alerta,
    tormenta
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

    if (vientoKt === null) factoresCriticos.push('No hay medición de viento; se aplica precaución por falta de datos.');
    else if (vientoKt >= 12) factoresCriticos.push(`Viento sostenido de ${vientoKt} kt.`);

    if (rachasKt !== null && (vientoKt === null || rachasKt - vientoKt >= 5)) {
        factoresCriticos.push(`Rachas de ${rachasKt} kt${vientoKt === null ? '' : ` frente a ${vientoKt} kt de viento sostenido`}.`);
    }
    if (oleaje === null) factoresCriticos.push('No hay medición de oleaje; se aplica precaución hasta confirmar el estado del mar.');
    else if (oleaje >= 1) factoresCriticos.push(`Oleaje de ${oleaje.toFixed(1)} m.`);
    if (direccionViento !== null && direccionViento !== undefined && Number.isFinite(Number(direccionViento))) {
        factoresCriticos.push(`Dirección meteorológica del viento: ${Math.round(Number(direccionViento))}°; la componente respecto a costa requiere la orientación local de la costa.`);
    }

    const textoAlerta = String(alerta?.tipo || '').toLowerCase();
    const tormentaInminente = tormenta === 'inminente'
        || /inminente|inmediata|en curso|rayos detectados|actividad eléctrica activa/.test(textoAlerta);
    const tormentaPosible = tormenta === 'posible'
        || /tormenta|thunderstorm|lightning/.test(textoAlerta);

    if (tormentaInminente) {
        nivel = Math.max(nivel, 4);
        factoresCriticos.push('Tormenta inminente o actividad eléctrica detectada.');
    } else if (tormentaPosible) {
        nivel = Math.max(nivel, 3);
        factoresCriticos.push('Posibilidad relevante de tormenta: la navegación recreativa no es recomendable.');
    }

    if (alerta?.activa) {
        const nivelAlerta = String(alerta.nivel || '').toUpperCase();
        const nivelPorAlerta = nivelAlerta === 'ROJA' ? 4
            : nivelAlerta === 'NARANJA' ? 3
                : nivelAlerta === 'AMARILLA' ? 1 : 2;
        nivel = Math.max(nivel, nivelPorAlerta);
        factoresCriticos.push(`Aviso meteorológico activo: ${alerta.tipo || nivelAlerta || 'consulta el parte oficial'}.`);
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
        derivaScore += 10;
        factoresCriticos.push('Orientación del viento y distancia a costa no disponibles; se añade margen preventivo y no se puede descartar deriva offshore.');
    }
    derivaScore = Math.max(0, Math.min(100, Math.round(derivaScore)));

    const scoreSeguridad = [100, 80, 60, 35, 0][nivel];
    const nivelTexto = NIVELES_SEGURIDAD[nivel];
    const vientoTexto = vientoKt === null ? 'viento sin medición' : `viento de ${vientoKt} kt`;
    const oleajeTexto = oleaje === null ? 'oleaje sin medición' : `oleaje de ${oleaje.toFixed(1)} m`;
    const mensaje = nivel === 0
        ? `${vientoTexto} y ${oleajeTexto}: condiciones favorables según los datos disponibles.`
        : nivel === 1
            ? `${vientoTexto} y ${oleajeTexto}: navega con precaución y confirma el parte local.`
            : nivel === 2
                ? `${vientoTexto} y ${oleajeTexto}: condiciones de riesgo elevado, recomendadas solo para usuarios experimentados.`
                : nivel === 3
                    ? `${vientoTexto} y ${oleajeTexto}: condiciones peligrosas para Paddle Surf recreativo.`
                    : `${vientoTexto} y ${oleajeTexto}: riesgo extremo; salida desaconsejada.`;
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
        cls: CLASES_RIESGO[nivelTexto],
        seguridad: { nivel: nivelTexto, score: scoreSeguridad },
        riesgoDeriva: { nivel: derivaNivel, score: derivaScore, descripcion: derivaDescripcion },
        factoresCriticos,
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
    tormenta
}) {
    return calcularMotorExpertoPaddleSafe({
        alerta,
        vientoKmh,
        olaM,
        rachasKmh,
        direccionViento,
        componenteViento,
        tormenta: tormenta || alerta?.tormenta
    });
}