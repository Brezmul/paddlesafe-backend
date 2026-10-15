// ==============================================================================
// PADDLESAFE NEXT-GEN - ORQUESTADOR DE VEREDICTO EXPERTO (verdict.js)
// Genera la respuesta definitiva de seguridad en 5 estados categóricos y
// una justificación náutica profesional inspirada en PredictWind y Windy.
// ==============================================================================

import { calcularConsensoModelos } from './consensus.js';
import { resolverOrientacionCostera, calcularComponenteVientoAuto, calcularIndiceDerivaPaddleSafe } from './coastal.js';
import { calcularBeginnerIndex, evaluarCondicionesDeporte } from './sports.js';
import { detectarVentanasOptimas } from './windows.js';

export const ESTADOS_VEREDICTO = {
    FAVORABLE: {
        titulo: 'Favorable',
        icono: '🟢',
        badgeCls: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
        cardBorder: 'border-emerald-500/30 bg-emerald-950/10'
    },
    PRECAUCION: {
        titulo: 'Precaución',
        icono: '🟡',
        badgeCls: 'bg-yellow-950/80 text-yellow-300 border-yellow-500/40',
        cardBorder: 'border-yellow-500/30 bg-yellow-950/10'
    },
    EXIGENTE: {
        titulo: 'Condiciones exigentes',
        icono: '🟠',
        badgeCls: 'bg-orange-950/80 text-orange-300 border-orange-500/40',
        cardBorder: 'border-orange-500/30 bg-orange-950/10'
    },
    NO_RECOMENDADO: {
        titulo: 'No recomendado',
        icono: '🔴',
        badgeCls: 'bg-rose-950/80 text-rose-300 border-rose-500/40',
        cardBorder: 'border-rose-500/30 bg-rose-950/10'
    },
    TORMENTA_ELECTRICA: {
        titulo: 'Tormenta eléctrica',
        icono: '⛔',
        badgeCls: 'bg-red-950 text-white border-red-600 animate-pulse',
        cardBorder: 'border-red-600 bg-red-950/40'
    }
};

/**
 * Orquesta la evaluación experta completa de PaddleSafe Next-Gen
 */
export function generarVeredictoNextGen(params = {}) {
    const spotNombre = params.spotNombre || params.nombreSpot || params.location || '';
    const lat = params.lat ?? params.coordenadas?.latitude ?? null;
    const lon = params.lon ?? params.coordenadas?.longitude ?? null;
    const userLevel = params.userLevel || params.nivelUsuario || 'Intermedio';
    const deporteKey = params.deporteKey || params.deporte || 'paddle_surf';

    // Conversión km/h a nudos si no vienen directamente en nudos
    let vientoKt = params.vientoKt ?? null;
    if (vientoKt === null && params.vientoKmh !== null && params.vientoKmh !== undefined) {
        vientoKt = Number((params.vientoKmh / 1.852).toFixed(1));
    }
    let rachasKt = params.rachasKt ?? null;
    if (rachasKt === null && params.rachasKmh !== null && params.rachasKmh !== undefined) {
        rachasKt = Number((params.rachasKmh / 1.852).toFixed(1));
    }

    const dirVientoDeg = params.dirVientoDeg ?? params.direccionViento ?? null;
    const oleajeM = params.oleajeM ?? params.olaM ?? null;
    const periodoOlaS = params.periodoOlaS ?? params.periodoOla ?? null;
    const swellM = params.swellM ?? null;
    const swellPeriodoS = params.swellPeriodoS ?? params.periodoSwell ?? null;
    const swellDirDeg = params.swellDirDeg ?? params.direccionSwell ?? null;
    const tempAireC = params.tempAireC ?? params.tempAire ?? null;
    const tempAguaC = params.tempAguaC ?? params.tempAgua ?? null;
    const presionHpa = params.presionHpa ?? params.presion ?? null;
    const humedadPct = params.humedadPct ?? params.humedad ?? null;
    const visibilidadKm = params.visibilidadKm ?? params.visibilidad ?? null;
    const lluviaMm = params.lluviaMm ?? params.precipitacion ?? 0;
    const probLluviaPct = params.probLluviaPct ?? params.probabilidadPrecipitacion ?? 0;
    const weatherCode = params.weatherCode ?? null;

    // Alertas y tormenta
    const alertaOficial = params.alertaOficial ?? params.alerta ?? null;
    const tormentaElectricaDetectada = Boolean(params.tormentaElectricaDetectada || params.tormenta);
    const horasDiurnas = params.horasDiurnas || [];

    // Modelos para consenso
    const ecmwfVientoKt = params.ecmwfVientoKt ?? params.modelosPronostico?.valoresPorModelo?.ecmwf ?? null;
    const gfsVientoKt = params.gfsVientoKt ?? params.modelosPronostico?.valoresPorModelo?.gfs ?? null;
    const iconVientoKt = params.iconVientoKt ?? params.modelosPronostico?.valoresPorModelo?.icon ?? null;
    const ecmwfDirDeg = params.ecmwfDirDeg ?? null;
    const gfsDirDeg = params.gfsDirDeg ?? null;
    const iconDirDeg = params.iconDirDeg ?? null;

    // 1. REGLA ABSOLUTA: Tormenta eléctrica (Caso E)
    const code = Number(weatherCode ?? 0);
    const textoAlerta = `${alertaOficial?.tipo || ''} ${alertaOficial?.descripcion || ''}`.toLowerCase();
    const esTormentaElectrica = Boolean(tormentaElectricaDetectada)
        || [95, 96, 99].includes(code)
        || /tormenta\s*electrica|actividad\s*electrica|descarga\s*electrica|rayos?|lightning/.test(textoAlerta);

    if (esTormentaElectrica) {
        return {
            estado: 'Tormenta eléctrica',
            icono: '⛔',
            claseUI: ESTADOS_VEREDICTO.TORMENTA_ELECTRICA,
            scoreSeguridad: 0,
            respuestaDirecta: '⛔ NO SALIR AL AGUA',
            justificacion: 'Riesgo confirmado de tormenta eléctrica en la zona. La práctica de cualquier deporte acuático queda estrictamente desaconsejada por peligro vital de descargas eléctricas y cambios súbitos de viento.',
            detallesTecnicos: {
                vientoKt,
                oleajeM,
                alerta: 'Tormenta eléctrica activa'
            },
            beginnerIndex: { nivel: 'No Recomendado', motivo: 'Peligro por tormenta eléctrica' },
            ventanas: null,
            consenso: null,
            deriva: null
        };
    }

    // 2. Resolver orientación costera y vector de viento
    const infoCosta = resolverOrientacionCostera(spotNombre, lat, lon);
    const compViento = calcularComponenteVientoAuto(dirVientoDeg, infoCosta.seawardDeg);
    const deriva = calcularIndiceDerivaPaddleSafe({
        vientoKt: vientoKt || 0,
        rachasKt: rachasKt || vientoKt || 0,
        oleajeM: oleajeM || 0,
        componente: compViento.componente,
        esCosta: infoCosta.esCosta
    });

    // 3. Consenso de modelos
    const consenso = params.modelosPronostico?.nivelConsenso ? params.modelosPronostico : calcularConsensoModelos({
        ecmwfVientoKt,
        gfsVientoKt,
        iconVientoKt,
        ecmwfDirDeg,
        gfsDirDeg,
        iconDirDeg,
        fallbackVientoKt: vientoKt,
        fallbackDirDeg: dirVientoDeg
    });

    // 4. Beginner Index
    const beginner = calcularBeginnerIndex({
        vientoKt: vientoKt || 0,
        rachasKt: rachasKt || vientoKt || 0,
        oleajeM: oleajeM || 0,
        componente: compViento.componente,
        esCosta: infoCosta.esCosta
    });

    // 5. Evaluación por deporte
    const evalDeporte = evaluarCondicionesDeporte({
        deporteKey,
        nivelUsuario: userLevel,
        vientoKt: vientoKt || 0,
        rachasKt: rachasKt || vientoKt || 0,
        oleajeM: oleajeM || 0,
        periodoOlaS: periodoOlaS || 0,
        swellM: swellM || 0,
        componente: compViento.componente
    });

    // 6. Ventana óptima horaria
    const ventanas = detectarVentanasOptimas(horasDiurnas, userLevel);

    // 7. Cálculo del PaddleSafe Score (0 a 100)
    let score = 95;
    const vReal = vientoKt || 0;
    const oReal = oleajeM || 0;

    if (vReal >= 20) score -= 60;
    else if (vReal >= 15) score -= 40;
    else if (vReal >= 11) score -= 20;
    else if (vReal <= 6 && oReal <= 0.3) score = 98;

    if (oReal >= 1.5) score -= 35;
    else if (oReal >= 0.8) score -= 20;
    else if (oReal >= 0.5) score -= 10;

    if (compViento.componente === 'offshore') score -= 15;
    if (alertaOficial?.activa) {
        if (alertaOficial.nivel === 'AMARILLA') score = Math.min(score, 70);
        else if (alertaOficial.nivel === 'NARANJA') score = Math.min(score, 45);
        else if (alertaOficial.nivel === 'ROJA') score = Math.min(score, 20);
    }
    score = Math.max(0, Math.min(100, Math.round(score)));

    // 8. Determinación del Estado Categórico Final
    let estadoKey = 'FAVORABLE';
    let respuestaDirecta = '🟢 Salida Recomendada';

    if (score < 30 || vReal >= 20 || oReal >= 1.8 || (alertaOficial?.activa && ['NARANJA', 'ROJA'].includes(alertaOficial.nivel))) {
        estadoKey = 'NO_RECOMENDADO';
        respuestaDirecta = '🔴 No recomendado';
    } else if (score < 55 || vReal >= 15 || oReal >= 1.0 || (userLevel === 'Principiante' && (vReal >= 10 || oReal >= 0.5))) {
        estadoKey = 'EXIGENTE';
        respuestaDirecta = '🟠 Condiciones exigentes';
    } else if (score < 75 || vReal >= 10 || oReal >= 0.5 || compViento.componente === 'offshore' || alertaOficial?.activa) {
        estadoKey = 'PRECAUCION';
        respuestaDirecta = '🟡 Precaución';
    }

    const confEstado = ESTADOS_VEREDICTO[estadoKey];

    // 9. Justificación náutica profesional
    let justificacion = '';
    if (estadoKey === 'FAVORABLE') {
        justificacion = `Viento débil (${vReal} kt) y mar en calma (${oReal.toFixed(1)} m). Condiciones excelentes para navegar con estabilidad y mínimo esfuerzo físico.`;
    } else if (estadoKey === 'PRECAUCION') {
        justificacion = compViento.componente === 'offshore'
            ? `Viento de ${vReal} kt de componente offshore (hacia mar abierto). Conviene remar paralelo a la orilla y no alejarse.`
            : `Viento de ${vReal} kt y mar con leve ondulación (${oReal.toFixed(1)} m). Condiciones navegables dosificando el esfuerzo.`;
    } else if (estadoKey === 'EXIGENTE') {
        justificacion = `Viento notable de ${vReal} kt y oleaje de ${oReal.toFixed(1)} m. Requiere técnica consolidada, lectura del mar y buena forma física.`;
    } else {
        justificacion = `Condiciones adversas (viento de ${vReal} kt y olas de ${oReal.toFixed(1)} m). Alto riesgo de caída, deriva mar adentro y agotamiento muscular.`;
    }

    return {
        estado: confEstado.titulo,
        icono: confEstado.icono,
        claseUI: confEstado,
        scoreSeguridad: score,
        respuestaDirecta,
        justificacion,
        deporte: evalDeporte,
        beginnerIndex: beginner,
        deriva,
        consenso,
        ventanas,
        componenteCostera: compViento,
        entorno: infoCosta.tipoEntorno,
        detallesTecnicos: {
            vientoKt: vReal,
            rachasKt: rachasKt || vReal,
            direccionDeg: dirVientoDeg,
            oleajeM: oReal,
            periodoOlaS,
            swellM,
            tempAireC,
            tempAguaC,
            presionHpa,
            humedadPct,
            visibilidadKm,
            probLluviaPct
        }
    };
}
