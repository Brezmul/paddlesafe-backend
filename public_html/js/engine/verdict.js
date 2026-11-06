// ==============================================================================
// PADDLESAFE NEXT-GEN - ORQUESTADOR DE VEREDICTO EXPERTO (verdict.js)
// Genera la respuesta definitiva de seguridad en 5 estados categóricos y
// una justificación náutica profesional unificada.
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
    },
    RIESGO_METEOROLOGICO_ESTIMADO: {
        titulo: 'Riesgo meteorológico estimado',
        icono: '⚠️',
        badgeCls: 'bg-amber-950/90 text-amber-200 border-amber-500/50',
        cardBorder: 'border-amber-500/40 bg-amber-950/20'
    },
    ALERTA_EMERGENCIA: {
        titulo: 'Prohibido salir por emergencia',
        icono: '⛔',
        badgeCls: 'bg-red-950 text-red-200 border-red-600 animate-pulse shadow-lg',
        cardBorder: 'border-red-600 bg-red-950/60'
    },
    SIN_DATOS: {
        titulo: 'Sin datos meteorológicos',
        icono: '❓',
        badgeCls: 'bg-zinc-800 text-zinc-300 border-zinc-600',
        cardBorder: 'border-zinc-700 bg-zinc-900/40'
    }
};

export const CLASES_RIESGO = {
    'Favorable': 'text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-lg',
    'Precaución': 'text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg',
    'Condiciones exigentes': 'text-orange-600 bg-orange-50 border border-orange-200 rounded-lg',
    'No recomendado': 'text-red-700 bg-red-100 border border-red-400 rounded-lg',
    'Tormenta eléctrica': 'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg',
    'Riesgo meteorológico estimado': 'text-amber-500 bg-amber-950/80 border border-amber-500 rounded-lg',
    'Prohibido salir por emergencia': 'text-red-500 font-black animate-pulse bg-red-950/80 border border-red-600 rounded-lg',
    'Sin datos meteorológicos': 'text-zinc-400 bg-zinc-900/80 border border-zinc-700 rounded-lg',
    'SIN DATOS': 'text-zinc-400 bg-zinc-900/80 border border-zinc-700 rounded-lg',
    // Compatibilidad legacy
    'SEGURO': 'text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-lg',
    'PRECAUCIÓN': 'text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg',
    'RIESGO ELEVADO': 'text-orange-600 bg-orange-50 border border-orange-200 rounded-lg',
    'PELIGROSO': 'text-red-500 bg-red-50 border border-red-200 rounded-lg',
    'RIESGO EXTREMO': 'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg',
    'PROHIBIDO': 'text-red-600 animate-pulse bg-red-950/80 border border-red-600 rounded-lg'
};

export const ICONOS_SEGURIDAD = {
    'Favorable': '🟢',
    'Precaución': '🟡',
    'Condiciones exigentes': '🟠',
    'No recomendado': '🔴',
    'Tormenta eléctrica': '⛔',
    'Riesgo meteorológico estimado': '⚠️',
    'Prohibido salir por emergencia': '⛔',
    'SEGURO': '🟢',
    'PRECAUCIÓN': '🟡',
    'RIESGO ELEVADO': '🟠',
    'PELIGROSO': '🔴',
    'RIESGO EXTREMO': '⛔',
    'NO RECOMENDADO': '⛔',
    'PROHIBIDO': '⛔'
};

/**
 * Número finito o cadena numérica. false, true, arrays y objetos no son 0.
 * El cero numérico y la cadena "0" sí lo son. No recorta el rango: un ángulo o
 * una temperatura negativos siguen siendo válidos aquí.
 */
export function medicionNumerica(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    if (typeof valor === 'string') {
        const texto = valor.trim();
        if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(texto)) return null;
        const n = Number(texto);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Magnitud física (viento u oleaje): negativa o ilegible no es calma. */
export function magnitudNoNegativa(valor) {
    const n = medicionNumerica(valor);
    return n === null || n < 0 ? null : n;
}

/**
 * Viento de una hora en nudos.
 * vientoKt ya está en nudos; viento_kmh está en km/h; wind_speed_10m, en este
 * proyecto, es el campo de Open-Meteo en m/s. Un 0 medido se conserva. Si no
 * hay ninguna lectura legítima, el resultado es null, no 0.
 */
export function lecturaVientoHora(hora) {
    if (!hora || typeof hora !== 'object' || Array.isArray(hora)) return { v: null, r: null };
    let v = magnitudNoNegativa(hora.vientoKt);
    if (v === null) {
        const kmh = magnitudNoNegativa(hora.viento_kmh);
        if (kmh !== null) v = kmh / 1.852;
    }
    if (v === null) {
        const ms = magnitudNoNegativa(hora.wind_speed_10m);
        if (ms !== null) v = ms * 3.6 / 1.852;
    }
    let r = magnitudNoNegativa(hora.rachasKt);
    if (r === null) {
        const kmh = magnitudNoNegativa(hora.rachas_kmh);
        if (kmh !== null) r = kmh / 1.852;
    }
    if (r === null) {
        const ms = magnitudNoNegativa(hora.wind_gusts_10m);
        if (ms !== null) r = ms * 3.6 / 1.852;
    }
    return { v, r };
}

/**
 * Análisis de Evolución Próxima (+3h) para detectar subidas térmicas o roladas bruscas
 */
export function analizarEvolucionProxima(params = {}, vReal = null, rReal = null, dirVientoDeg = null, seawardDeg = null) {
    const isArrayParams = Array.isArray(params);
    const hourly = isArrayParams ? null : (params.hourly || params.dx?.hourly || null);
    const horasDiurnas = isArrayParams
        ? params
        : ((Array.isArray(params.horasDiurnas) && params.horasDiurnas.length > 0)
            ? params.horasDiurnas
            : (Array.isArray(hourly) ? hourly : []));

    let hActualNum = new Date().getHours();
    if (!isArrayParams && params.horaSalida) {
        const p = String(params.horaSalida).split(':');
        if (p[0]) hActualNum = parseInt(p[0], 10) || hActualNum;
    }

    // 1. Array de horas diurnas procesadas o array de objetos horarios
    if (Array.isArray(horasDiurnas) && horasDiurnas.length > 0) {
        let idxActual = horasDiurnas.findIndex(h => {
            const hNum = parseInt(String(h.hora || h.time || '').replace(/\D/g, '').slice(0, 2), 10);
            return hNum === hActualNum;
        });
        const startIdx = idxActual >= 0 ? idxActual : 0;
        const lectura = lecturaVientoHora(horasDiurnas[startIdx]);
        if ((vReal === null || vReal === undefined) && lectura.v !== null) {
            vReal = lectura.v;
            rReal = lectura.r ?? vReal;
        }
        if (vReal === null || vReal === undefined || !Number.isFinite(Number(vReal))) {
            return null;
        }

        for (let offset = 1; offset <= 3; offset++) {
            const target = horasDiurnas[startIdx + offset];
            if (!target) continue;
            const futuro = lecturaVientoHora(target);
            const vFuturo = futuro.v;
            if (vFuturo === null) continue;
            const rFuturo = futuro.r ?? vFuturo;
            const dirFutura = Number(target.dirDeg ?? target.dirViento ?? target.wind_direction_10m ?? dirVientoDeg);
            const compFutura = seawardDeg !== null ? calcularComponenteVientoAuto(dirFutura, seawardDeg) : null;
            const esOffshoreFutura = compFutura?.componente === 'offshore';

            const subeViento = (vFuturo - vReal) >= 5;
            const subeRacha = (rFuturo - rReal) >= 7;
            const rolaOffshore = esOffshoreFutura && vFuturo >= 10;

            if (subeViento || subeRacha || rolaOffshore) {
                const horaLabel = target.hora || target.time || `+${offset}h`;
                let desc = `en +${offset}h (${horaLabel}) el viento sube a ${vFuturo.toFixed(1)} kt (Racha ${rFuturo.toFixed(1)} kt)`;
                if (rolaOffshore) desc += ' con rolada hacia mar adentro (Offshore)';
                return {
                    detectada: true,
                    deltaHoras: offset,
                    horaSurge: horaLabel,
                    vientoFuturoKt: Number(vFuturo.toFixed(1)),
                    rachaFuturaKt: Number(rFuturo.toFixed(1)),
                    deltaVientoKt: Number((vFuturo - vReal).toFixed(1)),
                    deltaRachaKt: Number((rFuturo - rReal).toFixed(1)),
                    esOffshore: rolaOffshore,
                    mensaje: `📈 Atención: ${desc}`
                };
            }
        }
    }

    // 2. Open-Meteo hourly object
    if (hourly && Array.isArray(hourly.time)) {
        let idx = hourly.time.findIndex(t => t.includes(`T${String(hActualNum).padStart(2, '0')}:`));
        if (idx === -1) idx = 0;

        for (let offset = 1; offset <= 3; offset++) {
            const tIdx = idx + offset;
            if (tIdx >= hourly.time.length) break;

            const timeStr = hourly.time[tIdx];
            const horaPaso = new Date(timeStr.includes('Z') ? timeStr : timeStr + 'Z').toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const aNudosHeuristica = (raw) => raw > 35 ? raw / 1.852 : (raw > 0 && raw <= 25 ? raw * 3.6 / 1.852 : raw / 1.852);
            const rawV = magnitudNoNegativa(hourly.wind_speed_10m?.[tIdx] ?? hourly.windspeed_10m?.[tIdx]);
            if (rawV === null) continue;
            const rawR = magnitudNoNegativa(hourly.wind_gusts_10m?.[tIdx] ?? hourly.windgusts_10m?.[tIdx]) ?? rawV;
            const vFuturo = aNudosHeuristica(rawV);
            const rFuturo = aNudosHeuristica(rawR);
            const dirFutura = Number(hourly.wind_direction_10m?.[tIdx] ?? hourly.winddirection_10m?.[tIdx] ?? dirVientoDeg);
            const compFutura = seawardDeg !== null ? calcularComponenteVientoAuto(dirFutura, seawardDeg) : null;
            const esOffshoreFutura = compFutura?.componente === 'offshore';

            const subeViento = (vFuturo - vReal) >= 5;
            const subeRacha = (rFuturo - rReal) >= 7;
            const rolaOffshore = esOffshoreFutura && vFuturo >= 10;

            if (subeViento || subeRacha || rolaOffshore) {
                let desc = `en +${offset}h (${horaPaso}) el viento sube a ${vFuturo.toFixed(1)} kt (Racha ${rFuturo.toFixed(1)} kt)`;
                if (rolaOffshore) desc += ' con rolada hacia mar adentro (Offshore)';
                return {
                    detectada: true,
                    deltaHoras: offset,
                    horaSurge: horaPaso,
                    vientoFuturoKt: Number(vFuturo.toFixed(1)),
                    rachaFuturaKt: Number(rFuturo.toFixed(1)),
                    deltaVientoKt: Number((vFuturo - vReal).toFixed(1)),
                    deltaRachaKt: Number((rFuturo - rReal).toFixed(1)),
                    esOffshore: rolaOffshore,
                    mensaje: `📈 Atención: ${desc}`
                };
            }
        }
    }

    return null;
}

/**
 * Orquesta la evaluación experta canónica y definitiva de PaddleSafe Next-Gen
 */
export function generarVeredictoNextGen(params = {}) {
    const spotNombre = params.spotNombre || params.nombreSpot || params.location || '';
    const lat = params.lat ?? params.coordenadas?.latitude ?? params.coordenadas?.lat ?? null;
    const lon = params.lon ?? params.coordenadas?.longitude ?? params.coordenadas?.lng ?? null;
    const userLevel = params.userLevel || params.nivelUsuario || params.nivel_usuario || 'Intermedio';
    const deporteKey = params.deporteKey || params.deporte || 'paddle_surf';

    const numOrNull = medicionNumerica;
    const aNudos = (kmh) => {
        const n = magnitudNoNegativa(kmh);
        return n === null ? null : Number((n / 1.852).toFixed(1));
    };

    // Conversión segura km/h a nudos si no vienen directamente en nudos
    let vientoKt = magnitudNoNegativa(params.vientoKt ?? params.viento_kt ?? null);
    if (vientoKt === null) vientoKt = aNudos(params.vientoKmh);
    if (vientoKt === null) vientoKt = aNudos(params.viento_kmh);

    let rachasKt = magnitudNoNegativa(params.rachasKt ?? params.rachas_kt ?? null);
    if (rachasKt === null) rachasKt = aNudos(params.rachasKmh);
    if (rachasKt === null) rachasKt = aNudos(params.rachas_kmh);

    const dirVientoDeg = numOrNull(params.dirVientoDeg ?? params.dir_viento_deg ?? params.direccionViento ?? null);
    const oleajeM = magnitudNoNegativa(params.oleajeM ?? params.olaM ?? params.altura_ola_m ?? null);
    const periodoOlaS = numOrNull(params.periodoOlaS ?? params.periodoOla ?? params.periodo_ola_s ?? params.wavePeriod ?? params.wave_period ?? null);
    const swellM = numOrNull(params.swellM ?? params.swell_height ?? null);
    const swellPeriodoS = numOrNull(params.swellPeriodoS ?? params.periodoSwell ?? params.swell_period ?? null);
    const swellDirDeg = numOrNull(params.swellDirDeg ?? params.direccionSwell ?? params.swell_direction ?? null);
    const tempAireC = params.tempAireC ?? params.tempAire ?? params.temp_c ?? params.temperature_2m ?? null;
    const tempAguaC = params.tempAguaC ?? params.tempAgua ?? params.temp_agua_c ?? params.sea_surface_temperature ?? null;
    const presionHpa = params.presionHpa ?? params.presion ?? params.presion_hpa ?? null;
    const humedadPct = params.humedadPct ?? params.humedad ?? params.humedad_pct ?? null;
    const visibilidadKm = params.visibilidadKm ?? params.visibilidad ?? null;
    const lluviaMm = params.lluviaMm ?? params.precipitacion ?? params.precipitacion_mm ?? 0;
    const probLluviaPct = params.probLluviaPct ?? params.probabilidadPrecipitacion ?? params.prob_precipitacion_pct ?? 0;
    const weatherCode = params.weatherCode ?? params.weather_code ?? null;

    // Alertas y tormenta
    let alertaOficial = params.alertaOficial ?? params.alerta ?? null;
    const alertasArray = Array.isArray(params.alertas_aemet) ? params.alertas_aemet 
        : Array.isArray(params.alertas) ? params.alertas 
        : (Array.isArray(alertaOficial?.alertas) ? alertaOficial.alertas : (alertaOficial ? [alertaOficial] : []));
    if (!alertaOficial && alertasArray.length > 0) {
        const top = alertasArray[0];
        alertaOficial = {
            ...top,
            activa: top.activa !== undefined ? top.activa : (top.esVigente === true && top.estadoTemporal === 'ACTIVA_AHORA'),
            origen: top.origen || 'AEMET',
            nivel: String(top.nivel || 'AMARILLA').toUpperCase(),
            tipo: top.tipo || top.fenomeno || 'Aviso costero',
            descripcion: top.descripcion || top.tipo || ''
        };
    } else if (alertaOficial && alertaOficial.activa === undefined) {
        alertaOficial = {
            ...alertaOficial,
            activa: alertaOficial.esVigente === true && alertaOficial.estadoTemporal === 'ACTIVA_AHORA',
            origen: alertaOficial.origen || 'AEMET',
            nivel: String(alertaOficial.nivel || 'AMARILLA').toUpperCase(),
            tipo: alertaOficial.tipo || 'Aviso meteorológico',
            descripcion: alertaOficial.descripcion || ''
        };
    }

    const tormentaElectricaDetectada = Boolean(params.tormentaElectricaDetectada || params.tormenta);
    const horasDiurnas = params.horasDiurnas || [];

    // Orientación costera directa si se suministra
    const orientacionCostaDeg = params.seawardDeg ?? params.orientacionCostaDeg ?? params.orientacion_costa_deg ?? null;

    // Modelos para consenso
    const ecmwfVientoKt = params.ecmwfVientoKt ?? params.modelosPronostico?.valoresPorModelo?.ecmwf ?? null;
    const gfsVientoKt = params.gfsVientoKt ?? params.modelosPronostico?.valoresPorModelo?.gfs ?? null;
    const iconVientoKt = params.iconVientoKt ?? params.modelosPronostico?.valoresPorModelo?.icon ?? null;
    const ecmwfDirDeg = params.ecmwfDirDeg ?? null;
    const gfsDirDeg = params.gfsDirDeg ?? null;
    const iconDirDeg = params.iconDirDeg ?? null;

    // 1. REGLA ABSOLUTA: Tormenta eléctrica OFICIAL (AEMET o Protección Civil activo para la fecha consultada)
    const code = Number(weatherCode ?? 0);
    const alertasArrayActivas = alertasArray.filter(a => a?.esVigente === true && a?.estadoTemporal === 'ACTIVA_AHORA');
    const textoAlertaActiva = `${alertasArrayActivas.map(a => `${a?.tipo || ''} ${a?.descripcion || ''}`).join(' ')} ${alertaOficial?.activa && alertaOficial?.esVigente === true && alertaOficial?.estadoTemporal === 'ACTIVA_AHORA' ? `${alertaOficial?.tipo || ''} ${alertaOficial?.descripcion || ''}` : ''}`.toLowerCase();
    
    const aemetTormentaOficial = Boolean(
        params.alertaTormentaOficialActiva ||
        params.tormentaElectricaOficial ||
        ((alertaOficial?.activa && alertaOficial?.esVigente === true && alertaOficial?.estadoTemporal === 'ACTIVA_AHORA') &&
         /tormenta|thunderstorm|lightning|descarga\s*electrica|actividad\s*electrica|rayos?/.test(textoAlertaActiva))
    );

    if (aemetTormentaOficial) {
        const confEstado = ESTADOS_VEREDICTO.TORMENTA_ELECTRICA;
        const explicacionHumana = params.explicacionAvisoAemet || alertaOficial?.explicacionHumana
            || 'Aviso Oficial AEMET por tormenta eléctrica activo en la zona. La práctica del paddle surf queda terminantemente desaconsejada por peligro vital de descargas eléctricas y cambios súbitos de viento.';
        const factoresCriticos = [
            `Aviso Oficial: ${explicacionHumana}`,
            'Peligro severo de descargas eléctricas en superficie plana y ráfagas súbitas de viento.'
        ];
        const resultadoTormenta = {
            estado: confEstado.titulo,
            icono: confEstado.icono,
            claseUI: confEstado,
            cls: CLASES_RIESGO[confEstado.titulo],
            scoreSeguridad: 0,
            score: 0,
            seguridad: { nivel: confEstado.titulo, score: 0 },
            respuestaDirecta: '⛔ NO SALIR AL AGUA',
            recomendacion: 'NO RECOMENDADO',
            justificacion: explicacionHumana,
            mensaje: explicacionHumana,
            explicacionNautica: explicacionHumana,
            factoresCriticos,
            analysisConfidence: 95,
            confianzaAnalisis: 95,
            tormentaElectrica: true,
            tormentaElectricaOficial: true,
            alertaOficialActiva: true,
            alertaEmergenciaActiva: ['NARANJA', 'ROJA'].includes(String(alertaOficial?.nivel || '').toUpperCase()),
            aemet: alertaOficial || { activa: true, disponible: true },
            vientoNudos: vientoKt,
            detallesTecnicos: {
                vientoKt,
                rachasKt,
                oleajeM,
                alerta: 'Aviso Oficial AEMET: Tormentas'
            },
            beginnerIndex: { nivel: 'No Recomendado', motivo: 'Aviso Oficial AEMET por tormenta eléctrica' },
            deporte: { deporte: deporteKey, estado: 'No Recomendado', motivo: 'Aviso Oficial AEMET por tormenta eléctrica' },
            ventanas: null,
            ventanaRecomendada: null,
            consenso: null,
            deriva: null,
            riesgoDeriva: { nivel: 'EXTREMO', score: 100, descripcion: 'Riesgo extremo por turbonadas y tormenta.' },
            derivaCostera: null,
            componenteCostera: { componente: 'desconocida', anguloIncidencia: 0 },
            entorno: 'costa'
        };
        resultadoTormenta.nextGen = resultadoTormenta;
        return resultadoTormenta;
    }

    // 1.1 SISTEMA A: Estimación de riesgo convectivo / inestabilidad por modelo de pronóstico (Regla 1 & Regla 6)
    const cape = Number(params.cape ?? params.convective_available_potential_energy ?? params.convection ?? 0);
    const lightningProb = Number(params.lightningProb ?? params.probabilidad_rayos ?? 0);
    const esRiesgoModeloConvectivo = !aemetTormentaOficial && (
        params.riesgoModeloConvectivo === true ||
        params.riesgoMeteorologicoEstimado === true ||
        cape >= 1000 ||
        [95, 96, 99].includes(code) ||
        lightningProb >= 40
    );

    if (esRiesgoModeloConvectivo) {
        const confEstado = ESTADOS_VEREDICTO.RIESGO_METEOROLOGICO_ESTIMADO || {
            titulo: 'Riesgo meteorológico estimado',
            icono: '⚠️',
            badgeCls: 'bg-amber-950/90 text-amber-200 border-amber-500/50',
            cardBorder: 'border-amber-500/40 bg-amber-950/20'
        };
        const scoreEstimado = (cape >= 1500 || [96, 99].includes(code)) ? 25 : 45;
        const recomendacionTexto = cape >= 1500 ? 'NO RECOMENDADO' : 'PRECAUCIÓN';
        const mensajeModelo = cape >= 1000
            ? '⚠️ Condiciones favorables para desarrollo tormentoso.'
            : '⚠️ Posible inestabilidad atmosférica.';
        const justificacionModelo = `${mensajeModelo} Los modelos numéricos señalan inestabilidad atmosférica${cape > 0 ? ` (CAPE: ${Math.round(cape)} J/kg)` : ''}. No existe aviso oficial de AEMET activo.`;

        const resultadoRiesgoModelo = {
            estado: confEstado.titulo,
            icono: confEstado.icono,
            claseUI: confEstado,
            cls: CLASES_RIESGO[confEstado.titulo] || 'text-amber-500 bg-amber-950/80 border border-amber-500 rounded-lg',
            scoreSeguridad: scoreEstimado,
            score: scoreEstimado,
            seguridad: { nivel: confEstado.titulo, score: scoreEstimado },
            respuestaDirecta: cape >= 1500 ? '⚠️ CONDICIONES DESACONSEJADAS' : '⚠️ PRECAUCIÓN',
            recomendacion: recomendacionTexto,
            justificacion: justificacionModelo,
            mensaje: mensajeModelo,
            explicacionNautica: justificacionModelo,
            factoresCriticos: [
                justificacionModelo,
                'Vigila la evolución de las nubes en el horizonte y regresa de inmediato si arrecian rachas o el cielo se oscurece.'
            ],
            analysisConfidence: 80,
            confianzaAnalisis: 80,
            tormentaElectrica: false,
            tormentaElectricaOficial: false,
            riesgoMeteorologicoEstimado: true,
            riesgoModeloConvectivo: true,
            etiquetaRiesgoModelo: '⚠️ Riesgo Meteorológico Estimado',
            mensajeRiesgoModelo: mensajeModelo,
            alertaOficialActiva: false,
            alertaEmergenciaActiva: false,
            aemet: alertaOficial || { activa: false, disponible: true },
            vientoNudos: vientoKt,
            detallesTecnicos: {
                vientoKt,
                rachasKt,
                oleajeM,
                cape,
                alerta: '⚠️ Riesgo Meteorológico Estimado'
            },
            beginnerIndex: { nivel: 'Precaución', motivo: 'Inestabilidad meteorológica estimada' },
            deporte: { deporte: deporteKey, estado: recomendacionTexto, motivo: 'Riesgo meteorológico estimado' },
            ventanas: null,
            ventanaRecomendada: null,
            consenso: null,
            deriva: null,
            riesgoDeriva: { nivel: 'MODERADO', score: 50, descripcion: 'Posible alteración del viento por inestabilidad.' },
            derivaCostera: null,
            componenteCostera: { componente: 'desconocida', anguloIncidencia: 0 },
            entorno: 'costa'
        };
        resultadoRiesgoModelo.nextGen = resultadoRiesgoModelo;
        return resultadoRiesgoModelo;
    }

    // 2. REGLA ABSOLUTA: Alerta Oficial de Emergencias (112 / Protección Civil / AEMET Naranja o Roja) - PROHIBIDO SALIR A REMAR
    // Solo aplica veto vital inmediato si la alerta está temporalmente activa para la jornada consultada
    let esAlertaEmergencia = false;
    if (params.alertaEmergencia !== undefined) {
        esAlertaEmergencia = Boolean(params.alertaEmergencia);
    } else if (alertaOficial && alertaOficial.esEmergencia !== undefined) {
        esAlertaEmergencia = Boolean(alertaOficial.esEmergencia);
    } else {
        esAlertaEmergencia = Boolean(
            params.alertaEmergencias
            || (alertaOficial?.activa && alertaOficial?.esVigente === true && alertaOficial?.estadoTemporal === 'ACTIVA_AHORA' && (
                alertaOficial.esEspecial ||
                /^1-?1-?2/i.test(alertaOficial.origen || '') ||
                /protecci[oó]n\s*civil/i.test(alertaOficial.origen || alertaOficial.tipo || '') ||
                ['NARANJA', 'ROJA'].includes(String(alertaOficial.nivel || '').toUpperCase()) ||
                /emergencia|inundaci|avenida|temporal\s*costero|galerna|ciclon|borrasca/i.test(`${alertaOficial.tipo || ''} ${alertaOficial.descripcion || ''}`)
            ))
            || alertasArray.some(a => 
                a?.esVigente === true && a?.estadoTemporal === 'ACTIVA_AHORA' && (
                    a?.esEspecial || 
                    /^1-?1-?2/i.test(a?.origen || '') || 
                    /protecci[oó]n\s*civil/i.test(a?.origen || a?.tipo || '') ||
                    ['NARANJA', 'ROJA'].includes(String(a?.nivel || '').toUpperCase()) ||
                    /emergencia|inundaci|avenida|temporal\s*costero|galerna|ciclon|borrasca/i.test(`${a?.tipo || ''} ${a?.descripcion || ''}`)
                )
            )
        );
    }

    const avisoPreventivo = Boolean(params.avisoPreventivo)
        || (!esAlertaEmergencia && (
            alertaOficial?.estadoTemporal === 'FUTURA_PREVENTIVA'
            || alertasArray.some(a => a?.estadoTemporal === 'FUTURA_PREVENTIVA')
        ));
    const datosPreventivo = params.datosAlertaPreventiva
        || (alertaOficial?.estadoTemporal === 'FUTURA_PREVENTIVA' ? alertaOficial : null)
        || alertasArray.find(a => a?.estadoTemporal === 'FUTURA_PREVENTIVA')
        || null;

    if (esAlertaEmergencia) {
        const confEstado = ESTADOS_VEREDICTO.ALERTA_EMERGENCIA || ESTADOS_VEREDICTO.NO_RECOMENDADO;
        const alertaPrioritaria = alertasArray.find(a => /^1-?1-?2/i.test(a?.origen || '')) || alertaOficial || alertasArray[0] || {};
        const nombreAutoridad = alertaPrioritaria.origen || 'Protección Civil / 112';
        const planEmergencias = alertaPrioritaria.plan || 'Plan Especial de Emergencias y Protección Civil';

        const factoresCriticos = [
            `🚨 ALERTA OFICIAL DE EMERGENCIAS (${nombreAutoridad}): Salida a remar estrictamente desaconsejada y prohibida.`,
            `Activado protocolo bajo el ${planEmergencias}: riesgo severo en el litoral marítimo.`,
            'Prohibido entrar al agua por corrientes súbitas de arrastre, oleaje peligroso y riesgo extremo de rescate.'
        ];

        const resultadoEmergencia = {
            estado: confEstado.titulo,
            icono: confEstado.icono,
            claseUI: confEstado,
            cls: CLASES_RIESGO[confEstado.titulo] || 'text-red-500 font-black animate-pulse bg-red-950/80 border border-red-600 rounded-lg',
            scoreSeguridad: 0,
            score: 0,
            seguridad: { nivel: confEstado.titulo, score: 0 },
            respuestaDirecta: '⛔ PROHIBIDO SALIR A REMAR',
            recomendacion: 'PROHIBIDO POR EMERGENCIA',
            justificacion: `Existe una ALERTA OFICIAL DE EMERGENCIAS ACTIVA emitida por ${nombreAutoridad}. Queda terminantemente prohibido salir a remar debido al riesgo vital extremo, corrientes de arrastre y condiciones marítimas adversas. Por seguridad, permanece en tierra firme.`,
            mensaje: `Existe una ALERTA OFICIAL DE EMERGENCIAS ACTIVA emitida por ${nombreAutoridad}. Queda terminantemente prohibido salir a remar debido al riesgo vital extremo, corrientes de arrastre y condiciones marítimas adversas. Por seguridad, permanece en tierra firme.`,
            explicacionNautica: `Alerta oficial de emergencias decretada por ${nombreAutoridad}. Queda prohibida la actividad en el agua. Respeta las indicaciones de las autoridades y no te acerques a espigones ni desembocaduras.`,
            factoresCriticos,
            analysisConfidence: 99,
            confianzaAnalisis: 99,
            tormentaElectrica: false,
            tormentaElectricaOficial: false,
            alertaOficialActiva: true,
            alertaEmergenciaActiva: true,
            aemet: alertaOficial || { activa: true, disponible: true },
            vientoNudos: vientoKt,
            detallesTecnicos: {
                vientoKt,
                rachasKt,
                oleajeM,
                alerta: `Alerta oficial de emergencias activa (${nombreAutoridad})`
            },
            beginnerIndex: {
                nivel: 'Prohibido por Emergencia',
                score: 0,
                color: 'text-red-600 bg-red-100 border-red-500 font-bold',
                motivo: 'Alerta oficial de emergencias activa (112 / Protección Civil). Queda prohibida la actividad.',
                consejo: 'Bajo alerta oficial de emergencias está terminantemente prohibido salir al agua.'
            },
            deporte: {
                deporte: deporteKey,
                recomendable: false,
                estado: 'Prohibido por Emergencia',
                motivo: `Alerta oficial de emergencias activa (${nombreAutoridad}). Salida al agua desaconsejada y prohibida por riesgo extremo.`,
                consejo: 'Cancela de inmediato la salida y permanece en tierra firme.'
            },
            ventanas: null,
            ventanaRecomendada: null,
            consenso: null,
            deriva: null,
            riesgoDeriva: { nivel: 'EXTREMO', score: 100, descripcion: 'Riesgo crítico de corrientes de arrastre mar adentro y rompiente por situación de emergencia.' },
            derivaCostera: null,
            componenteCostera: { componente: 'desconocida', anguloIncidencia: 0 },
            entorno: 'costa'
        };
        resultadoEmergencia.nextGen = resultadoEmergencia;
        return resultadoEmergencia;
    }

    // Sin viento medio ni oleaje solo se corta aquí si tampoco hay racha ni aviso
    // que ya dispare un umbral existente (10 kt de precaución, aviso activo).
    const sinViento = vientoKt === null;
    const sinOleaje = oleajeM === null;
    const avisoOficialAhora = Boolean(
        (alertaOficial?.esVigente === true && alertaOficial?.estadoTemporal === 'ACTIVA_AHORA')
        || alertasArray.some(a => a?.esVigente === true && a?.estadoTemporal === 'ACTIVA_AHORA')
    );
    const rachaConUmbral = rachasKt !== null && rachasKt >= 10;
    if (sinViento && sinOleaje && !avisoOficialAhora && !rachaConUmbral) {
        const confEstado = ESTADOS_VEREDICTO.SIN_DATOS || {
            titulo: 'Sin datos meteorológicos',
            icono: '❓',
            badgeCls: 'bg-zinc-800 text-zinc-300 border-zinc-600',
            cardBorder: 'border-zinc-700 bg-zinc-900/40'
        };
        const msgSinDatos = 'No se dispone de datos meteorológicos suficientes (viento u oleaje) para evaluar la seguridad en este spot y horario.';
        const resultadoSinDatos = {
            estado: confEstado.titulo,
            icono: confEstado.icono,
            claseUI: confEstado,
            cls: CLASES_RIESGO[confEstado.titulo] || 'text-zinc-400 bg-zinc-900/80 border border-zinc-700 rounded-lg',
            scoreSeguridad: 0,
            score: 0,
            seguridad: { nivel: confEstado.titulo, score: 0 },
            respuestaDirecta: '❓ SIN DATOS METEOROLÓGICOS',
            recomendacion: 'SIN DATOS',
            justificacion: msgSinDatos,
            mensaje: msgSinDatos,
            explicacionNautica: msgSinDatos,
            factoresCriticos: ['Datos de viento y oleaje no disponibles o no concluyentes.'],
            analysisConfidence: 0,
            confianzaAnalisis: 0,
            confianza: 'baja',
            tormentaElectrica: false,
            tormentaElectricaOficial: false,
            alertaOficialActiva: false,
            alertaEmergenciaActiva: false,
            aemet: alertaOficial || { activa: false, disponible: false },
            vientoNudos: null,
            detallesTecnicos: { vientoKt: null, rachasKt: null, oleajeM: null },
            beginnerIndex: { nivel: 'Sin Datos', score: 0, motivo: msgSinDatos },
            deporte: { deporte: deporteKey, recomendable: false, estado: 'Sin datos', motivo: msgSinDatos },
            ventanas: null,
            ventanaRecomendada: null,
            consenso: null,
            deriva: null,
            riesgoDeriva: { nivel: 'INDEFINIDO', score: 0, descripcion: 'Sin datos meteorológicos.' },
            derivaCostera: null,
            componenteCostera: { componente: 'desconocida', anguloIncidencia: 0 },
            entorno: 'costa'
        };
        resultadoSinDatos.nextGen = resultadoSinDatos;
        return resultadoSinDatos;
    }

    // 2. Resolver orientación costera y vector de viento
    const infoCosta = orientacionCostaDeg !== null
        ? { seawardDeg: orientacionCostaDeg, esCosta: true, esEmbalse: false, tipoEntorno: 'mar_abierto' }
        : resolverOrientacionCostera(spotNombre, lat, lon);
    const compViento = orientacionCostaDeg !== null
        ? calcularComponenteVientoAuto(dirVientoDeg, orientacionCostaDeg)
        : calcularComponenteVientoAuto(lat, lon, dirVientoDeg, spotNombre);
    const equipoUsuario = params.equipoUsuario || null;
    const boardType = params.boardType || equipoUsuario?.tipoTabla || null;
    const driftMod = Number(params.driftMod || equipoUsuario?.driftMod || 1.0);
    const deriva = calcularIndiceDerivaPaddleSafe({
        vientoKt: vientoKt || 0,
        rachasKt: rachasKt || vientoKt || 0,
        oleajeM: oleajeM || 0,
        componente: compViento.componente,
        esCosta: infoCosta.esCosta,
        driftMod,
        boardType
    });

    // 3. Consenso de modelos meteorológicos
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

    // 7. Cálculo del Safety Score. Un cero numérico es una medición; null, vacío o NaN no lo son.
    const vientoConocido = vientoKt !== null;
    const oleajeConocido = oleajeM !== null;
    const oleajeAplica = Boolean(infoCosta.esCosta);
    const vReal = vientoConocido ? vientoKt : null;
    const oReal = oleajeConocido ? oleajeM : null;
    const rReal = rachasKt !== null ? rachasKt : vReal;

    // Si falta el viento medio, la racha medida usa los mismos cortes (10/15/20 kt).
    const vientoReferencia = vientoConocido ? vReal : (rachasKt !== null ? rachasKt : null);
    const referenciaConocida = vientoReferencia !== null;

    let score = 95;
    if (referenciaConocida) {
        if (vientoReferencia >= 20) score -= 60;
        else if (vientoReferencia >= 15) score -= 40;
        else if (vientoReferencia >= 11) score -= 20;
        else if (vientoConocido && vReal <= 6 && (!oleajeAplica || (oleajeConocido && oReal <= 0.3))) score = 98;
    }

    if (vientoConocido && rReal !== null) {
        if (rReal - vReal >= 8) score -= 15;
        else if (rReal - vReal >= 5) score -= 8;
    }

    if (oleajeConocido) {
        if (oReal >= 1.5) score -= 35;
        else if (oReal >= 0.8) score -= 20;
        else if (oReal >= 0.5) score -= 10;
    }

    // Evaluación hidrodinámica de periodo de ola solo con oleaje medido
    const periodo = oleajeConocido && periodoOlaS !== null ? Number(periodoOlaS) : 0;
    let tipoMar = null;
    if (oleajeConocido && oReal >= 0.4 && periodo > 0 && periodo <= 5) {
        score -= 10;
        tipoMar = 'Chop corto';
    } else if (oleajeConocido && oReal >= 0.3 && periodo >= 9) {
        tipoMar = 'Mar de fondo';
    }

    if (vientoConocido && compViento.componente === 'offshore') score -= 15;

    // Física de la tabla: mayor deriva por francobordo e inestabilidad lateral en race
    if (vientoConocido && driftMod > 1.0 && vReal >= 10 && ['offshore', 'side-shore', 'cruzado'].includes(String(compViento.componente || '').toLowerCase())) {
        const extraPenalizacionDeriva = Math.round((driftMod - 1.0) * 20);
        score -= extraPenalizacionDeriva;
    }
    if (boardType === 'rigid_race' && (tipoMar === 'Chop corto' || (oleajeConocido && oReal >= 0.4))) {
        score -= 5;
    }

    // Alertas oficiales AEMET (solo penalizan si aplican a la jornada consultada, no si son preventivas a futuro ni expiradas)
    const alertaActivaJornada = Boolean(
        (alertaOficial?.activa || alertasArray.length > 0)
        && !avisoPreventivo 
        && (alertaOficial?.esVigente === true || alertasArray.some(a => a?.esVigente === true))
        && (alertaOficial?.estadoTemporal === 'ACTIVA_AHORA' || alertasArray.some(a => a?.estadoTemporal === 'ACTIVA_AHORA'))
    );

    if (alertaActivaJornada) {
        const topA = alertasArray.find(a => a?.esVigente === true && a?.estadoTemporal === 'ACTIVA_AHORA') || alertaOficial;
        const nAlert = String(topA?.nivel || '').toUpperCase();
        if (nAlert === 'AMARILLA') {
            score -= 15;
            score = Math.min(score, 70);
        } else if (nAlert === 'NARANJA') {
            score -= 30;
            score = Math.min(score, 45);
        } else if (nAlert === 'ROJA') {
            score = Math.min(score, 20);
        }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    // 8. Confianza del Análisis (0 a 100)
    let confianza = 20;
    if (vientoConocido) confianza += 35;
    if (oleajeConocido || !oleajeAplica) confianza += 25;
    if (rachasKt !== null) confianza += 10;
    if (dirVientoDeg !== null) confianza += 5;
    if (periodoOlaS !== null || infoCosta.tipoEntorno === 'embalse_interior') confianza += 5;
    confianza = Math.min(100, confianza);

    // 9. Factores Críticos y Observaciones
    const factoresCriticos = [];
    if (vientoConocido && vReal >= 12) factoresCriticos.push(`Viento sostenido de ${vReal} kt.`);
    if (vientoConocido && rReal !== null && rReal - vReal >= 5) factoresCriticos.push(`Rachas de ${rReal} kt frente a ${vReal} kt de viento medio.`);
    if (oleajeConocido && oReal >= 0.8 && infoCosta.esCosta) factoresCriticos.push(`Oleaje significativo de ${oReal.toFixed(1)} m.`);
    if (oleajeConocido && oReal >= 0.4 && periodo > 0 && periodo <= 5) {
        factoresCriticos.push(`Ola corta de ${Math.round(periodo)}s: alta inestabilidad lateral.`);
    } else if (oleajeConocido && oReal >= 0.3 && periodo >= 9) {
        factoresCriticos.push(`Mar de fondo ordenado (${Math.round(periodo)}s: precaución en rompiente de orilla).`);
    } else if (oleajeConocido && periodoOlaS >= 10 && oReal >= 0.5) {
        factoresCriticos.push(`Periodo de ola largo (${Math.round(periodoOlaS)}s): mayor fuerza de las series.`);
    }

    if (vientoConocido && compViento.componente === 'offshore') {
        factoresCriticos.push('Componente offshore (terral): el viento aleja de la costa y dificulta el retorno.');
    } else if (vientoConocido && compViento.componente === 'side-shore') {
        factoresCriticos.push('Componente side-shore: desplazamiento lateral a lo largo de la costa.');
    } else if (vientoConocido && compViento.componente === 'onshore') {
        factoresCriticos.push('Componente onshore: favorece el retorno a tierra pero crea oleaje frontal.');
    }

    if (vientoConocido && driftMod > 1.05 && vReal >= 10 && ['offshore', 'side-shore', 'cruzado'].includes(String(compViento.componente || '').toLowerCase())) {
        factoresCriticos.push(`Tabla hinchable (+ francobordo): deriva acrecentada por efecto vela con ${vReal} kt (${compViento.componente}).`);
    }
    if (boardType === 'rigid_race' && (tipoMar === 'Chop corto' || (oleajeConocido && oReal >= 0.4))) {
        factoresCriticos.push("Tabla Rígida Race (14'): penalización por inestabilidad lateral en chop corto.");
    }

    if (alertaActivaJornada) {
        factoresCriticos.push(`Aviso oficial ${alertaOficial.origen || 'AEMET'} activo (${alertaOficial.nivel || ''}): ${alertaOficial.tipo || alertaOficial.descripcion || 'atención al parte'}.`);
    }

    // Análisis de evolución térmica y roladas próximas (+3h)
    const seawardOrient = infoCosta?.seawardDeg ?? infoCosta?.seaward_deg ?? infoCosta?.gradosMar ?? 90;
    const evolucionProxima = analizarEvolucionProxima(params, vReal, rReal, dirVientoDeg, seawardOrient);
    if (evolucionProxima && evolucionProxima.mensaje) {
        factoresCriticos.unshift(evolucionProxima.mensaje);
    }

    // 10. Determinación del Estado Categórico Final
    let estadoKey = 'FAVORABLE';
    let respuestaDirecta = '🟢 Salida Recomendada';

    if (score < 30 || (referenciaConocida && vientoReferencia >= 20) || (oleajeConocido && oReal >= 1.8) || (alertaActivaJornada && ['NARANJA', 'ROJA'].includes(String(alertaOficial?.nivel || '').toUpperCase()))) {
        estadoKey = 'NO_RECOMENDADO';
        respuestaDirecta = '🔴 No recomendado';
    } else if (score < 55 || (referenciaConocida && vientoReferencia >= 15) || (oleajeConocido && oReal >= 1.0) || (userLevel === 'Principiante' && ((referenciaConocida && vientoReferencia >= 10) || (oleajeConocido && oReal >= 0.5)))) {
        estadoKey = 'EXIGENTE';
        respuestaDirecta = '🟠 Condiciones exigentes';
    } else if (score < 75 || (referenciaConocida && vientoReferencia >= 10) || (oleajeConocido && oReal >= 0.5) || (vientoConocido && compViento.componente === 'offshore') || alertaActivaJornada) {
        estadoKey = 'PRECAUCION';
        respuestaDirecta = '🟡 Precaución';
    }

    const faltaViento = !vientoConocido;
    const faltaOleajeCostero = oleajeAplica && !oleajeConocido;
    const textoViento = vientoConocido ? `${vReal} kt` : 'viento no medido';
    const textoOla = oleajeConocido ? `${oReal.toFixed(1)} m` : null;

    // 11. Justificación Náutica Profesional
    const avisoDatoAusente = [
        faltaViento ? 'El viento no está medido y no cuenta como 0 kt.' : '',
        faltaOleajeCostero ? 'El oleaje costero no está medido y no se da el mar por calmo.' : ''
    ].filter(Boolean).join(' ');

    const rachaSolo = !vientoConocido && rachasKt !== null ? `Rachas medidas de ${rachasKt} kt. ` : '';
    let justificacion = '';
    if ((faltaViento || faltaOleajeCostero) && estadoKey === 'FAVORABLE') {
        estadoKey = 'SIN_DATOS';
        respuestaDirecta = '❓ SIN DATOS METEOROLÓGICOS';
        score = 0;
        confianza = 0;
        justificacion = `Datos insuficientes: ${avisoDatoAusente} Sin esos datos no hay salida recomendada.`;
        factoresCriticos.unshift(justificacion);
    } else if (estadoKey === 'FAVORABLE') {
        justificacion = !infoCosta.esCosta
            ? `Viento suave (${vReal} kt) en aguas interiores. Condiciones óptimas para remar con fluidez y mínimo esfuerzo.`
            : `Viento suave (${vReal} kt) y mar calmo (${oReal.toFixed(1)} m). Condiciones óptimas para remar con fluidez y mínimo esfuerzo.`;
    } else if (estadoKey === 'PRECAUCION') {
        const matiz = (faltaViento || faltaOleajeCostero) ? '' : ' Sesión viable gestionando el ritmo.';
        justificacion = vientoConocido && compViento.componente === 'offshore'
            ? `Viento de ${textoViento} con componente hacia mar abierto (offshore). Conviene remar en paralelo a la orilla y vigilar referencias fijas en tierra.`
            : !infoCosta.esCosta
                ? `${rachaSolo}Viento de ${textoViento} en aguas interiores.${matiz}`
                : `${rachaSolo}Viento de ${textoViento}${textoOla ? ` y ligera ondulación (${textoOla})` : ''}.${matiz}`;
    } else if (estadoKey === 'EXIGENTE') {
        justificacion = !infoCosta.esCosta
            ? `${rachaSolo}Viento activo de ${textoViento} en aguas interiores. Requiere experiencia previa, equilibrio reactivo y buena condición física.`
            : `${rachaSolo}Viento activo de ${textoViento}${textoOla ? ` y oleaje de ${textoOla}` : ''}. Requiere experiencia previa, equilibrio reactivo y buena condición física.`;
    } else {
        justificacion = !infoCosta.esCosta
            ? `${rachaSolo}Condiciones adversas (viento de ${textoViento} en aguas interiores). Alto riesgo de caída y agotamiento muscular.`
            : `${rachaSolo}Condiciones adversas (viento de ${textoViento}${textoOla ? ` y olas de ${textoOla}` : ''}). Alto riesgo de caída, deriva mar adentro y agotamiento muscular.`;
    }

    if ((faltaViento || faltaOleajeCostero) && estadoKey !== 'SIN_DATOS') {
        justificacion = `${justificacion} ${avisoDatoAusente}`.trim();
        factoresCriticos.unshift(avisoDatoAusente);
    }

    const confEstado = ESTADOS_VEREDICTO[estadoKey] || ESTADOS_VEREDICTO.SIN_DATOS;
    const datosInsuficientes = estadoKey === 'SIN_DATOS';

    if (avisoPreventivo && datosPreventivo) {
        const diaTxt = datosPreventivo.diaInicio ? `el día ${datosPreventivo.diaInicio}` : 'la entrada del temporal';
        const perTxt = datosPreventivo.periodoTexto || 'el próximo fin de semana';
        factoresCriticos.unshift(`⚠️ AVISO ESPECIAL PREVENTIVO (112): Episodio meteorológico adverso programado para ${perTxt}. Salida permitida hoy con seguimiento; PROHIBIDA a partir de ${diaTxt}.`);
    }

    const resultado = {
        estado: confEstado.titulo,
        icono: confEstado.icono,
        claseUI: confEstado,
        cls: CLASES_RIESGO[confEstado.titulo] || 'text-slate-200 bg-slate-800 border-slate-700',
        scoreSeguridad: score,
        score: score,
        seguridad: { nivel: confEstado.titulo, score },
        respuestaDirecta,
        recomendacion: respuestaDirecta.replace(/^[🟢🟡🟠🔴⛔]\s*/, '').toUpperCase(),
        justificacion,
        mensaje: justificacion,
        explicacionNautica: justificacion,
        deporte: datosInsuficientes
            ? { deporte: deporteKey, recomendable: false, estado: 'Sin datos', motivo: justificacion }
            : evalDeporte,
        beginnerIndex: datosInsuficientes
            ? { nivel: 'Sin Datos', score: 0, motivo: justificacion }
            : beginner,
        deriva,
        riesgoDeriva: deriva,
        derivaCostera: deriva,
        consenso,
        ventanas: datosInsuficientes ? null : ventanas,
        ventanaRecomendada: datosInsuficientes ? null : (ventanas?.mejorVentana || null),
        componenteCostera: compViento,
        entorno: infoCosta.tipoEntorno,
        oleajeAplica,
        vientoConocido,
        oleajeConocido,
        vientoNudos: vientoConocido ? vReal : null,
        tormentaElectrica: false,
        tormentaElectricaOficial: false,
        alertaOficialActiva: alertaActivaJornada,
        alertaEmergenciaActiva: false,
        avisoPreventivo: avisoPreventivo ? datosPreventivo : null,
        avisoPreventivoActivo: Boolean(avisoPreventivo),
        aemet: alertaOficial || { activa: false, disponible: false },
        analysisConfidence: confianza,
        confianzaAnalisis: confianza,
        factoresCriticos,
        fuenteAlternativa: false,
        tipoMar: tipoMar || null,
        periodoOlaS: periodo > 0 ? periodo : null,
        evolucionProxima: evolucionProxima || null,
        detallesTecnicos: {
            vientoKt: vientoConocido ? vReal : null,
            rachasKt: rachasKt,
            direccionDeg: dirVientoDeg,
            oleajeM: oleajeConocido ? oReal : null,
            periodoOlaS: periodo > 0 ? periodo : null,
            tipoMar: tipoMar || null,
            evolucionProxima: evolucionProxima || null,
            swellM: numOrNull(swellM),
            tempAireC: numOrNull(tempAireC),
            tempAguaC: numOrNull(tempAguaC),
            presionHpa: numOrNull(presionHpa),
            humedadPct: numOrNull(humedadPct),
            visibilidadKm: numOrNull(visibilidadKm),
            probLluviaPct: numOrNull(probLluviaPct)
        }
    };

    resultado.nextGen = resultado;
    return resultado;
}
