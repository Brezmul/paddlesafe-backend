// ==============================================================================
// PADDLESAFE NEXT-GEN - ORQUESTADOR DE VEREDICTO EXPERTO (verdict.js)
// Genera la respuesta definitiva de seguridad en 5 estados categóricos y
// una justificación náutica profesional unificada e inspirada en PredictWind y Windy.
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
    ALERTA_EMERGENCIA: {
        titulo: 'Prohibido salir por emergencia',
        icono: '⛔',
        badgeCls: 'bg-red-950 text-red-200 border-red-600 animate-pulse shadow-lg',
        cardBorder: 'border-red-600 bg-red-950/60'
    }
};

export const CLASES_RIESGO = {
    'Favorable': 'text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-lg',
    'Precaución': 'text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg',
    'Condiciones exigentes': 'text-orange-600 bg-orange-50 border border-orange-200 rounded-lg',
    'No recomendado': 'text-red-700 bg-red-100 border border-red-400 rounded-lg',
    'Tormenta eléctrica': 'text-red-600 animate-pulse bg-red-50 border border-red-200 rounded-lg',
    'Prohibido salir por emergencia': 'text-red-500 font-black animate-pulse bg-red-950/80 border border-red-600 rounded-lg',
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
 * Orquesta la evaluación experta canónica y definitiva de PaddleSafe Next-Gen
 */
export function generarVeredictoNextGen(params = {}) {
    const spotNombre = params.spotNombre || params.nombreSpot || params.location || '';
    const lat = params.lat ?? params.coordenadas?.latitude ?? params.coordenadas?.lat ?? null;
    const lon = params.lon ?? params.coordenadas?.longitude ?? params.coordenadas?.lng ?? null;
    const userLevel = params.userLevel || params.nivelUsuario || params.nivel_usuario || 'Intermedio';
    const deporteKey = params.deporteKey || params.deporte || 'paddle_surf';

    // Conversión segura km/h a nudos si no vienen directamente en nudos
    let vientoKt = params.vientoKt ?? params.viento_kt ?? null;
    if (vientoKt === null && params.vientoKmh !== null && params.vientoKmh !== undefined) {
        vientoKt = Number((params.vientoKmh / 1.852).toFixed(1));
    } else if (vientoKt === null && params.viento_kmh !== null && params.viento_kmh !== undefined) {
        vientoKt = Number((params.viento_kmh / 1.852).toFixed(1));
    }
    let rachasKt = params.rachasKt ?? params.rachas_kt ?? null;
    if (rachasKt === null && params.rachasKmh !== null && params.rachasKmh !== undefined) {
        rachasKt = Number((params.rachasKmh / 1.852).toFixed(1));
    } else if (rachasKt === null && params.rachas_kmh !== null && params.rachas_kmh !== undefined) {
        rachasKt = Number((params.rachas_kmh / 1.852).toFixed(1));
    }

    const dirVientoDeg = params.dirVientoDeg ?? params.dir_viento_deg ?? params.direccionViento ?? null;
    const oleajeM = params.oleajeM ?? params.olaM ?? params.altura_ola_m ?? null;
    const periodoOlaS = params.periodoOlaS ?? params.periodoOla ?? params.periodo_ola_s ?? null;
    const swellM = params.swellM ?? params.swell_height ?? null;
    const swellPeriodoS = params.swellPeriodoS ?? params.periodoSwell ?? params.swell_period ?? null;
    const swellDirDeg = params.swellDirDeg ?? params.direccionSwell ?? params.swell_direction ?? null;
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
            activa: top.activa !== undefined ? top.activa : (top.esVigente !== false && top.estadoTemporal !== 'EXPIRADA' && top.estadoTemporal !== 'FUTURA_PREVENTIVA'),
            origen: top.origen || 'AEMET',
            nivel: String(top.nivel || 'AMARILLA').toUpperCase(),
            tipo: top.tipo || top.fenomeno || 'Aviso costero',
            descripcion: top.descripcion || top.tipo || ''
        };
    } else if (alertaOficial && alertaOficial.activa === undefined) {
        alertaOficial = {
            ...alertaOficial,
            activa: alertaOficial.esVigente !== false && alertaOficial.estadoTemporal !== 'EXPIRADA' && alertaOficial.estadoTemporal !== 'FUTURA_PREVENTIVA',
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

    // 1. REGLA ABSOLUTA: Tormenta eléctrica (Veto Infranqueable)
    const code = Number(weatherCode ?? 0);
    const textoAlerta = `${alertasArray.map(a => `${a?.tipo || ''} ${a?.descripcion || ''}`).join(' ')} ${alertaOficial?.tipo || ''} ${alertaOficial?.descripcion || ''}`.toLowerCase();
    const esTormentaElectrica = Boolean(tormentaElectricaDetectada)
        || [95, 96, 99].includes(code)
        || /tormenta\s*electrica|actividad\s*electrica|descarga\s*electrica|rayos?|lightning|relampagos?/.test(textoAlerta);

    if (esTormentaElectrica) {
        const confEstado = ESTADOS_VEREDICTO.TORMENTA_ELECTRICA;
        const factoresCriticos = [
            'Riesgo crítico de tormenta eléctrica: actividad desaconsejada por peligro vital.',
            'Peligro de descargas eléctricas en superficie plana y ráfagas súbitas de viento.'
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
            justificacion: 'Riesgo confirmado de tormenta eléctrica en la zona. La práctica de cualquier deporte acuático queda estrictamente desaconsejada por peligro vital de descargas eléctricas y cambios súbitos de viento.',
            mensaje: 'Riesgo confirmado de tormenta eléctrica en la zona. La práctica de cualquier deporte acuático queda estrictamente desaconsejada por peligro vital de descargas eléctricas y cambios súbitos de viento.',
            explicacionNautica: 'Riesgo confirmado de tormenta eléctrica en la zona. Suspende o pospón la actividad y mantente bajo techo en tierra firme.',
            factoresCriticos,
            analysisConfidence: 95,
            confianzaAnalisis: 95,
            tormentaElectrica: true,
            alertaEmergenciaActiva: false,
            aemet: alertaOficial || { activa: false, disponible: false },
            vientoNudos: vientoKt ?? 0,
            detallesTecnicos: {
                vientoKt,
                rachasKt,
                oleajeM,
                alerta: 'Tormenta eléctrica activa'
            },
            beginnerIndex: { nivel: 'No Recomendado', motivo: 'Peligro por tormenta eléctrica' },
            deporte: { deporte: deporteKey, estado: 'No Recomendado', motivo: 'Tormenta eléctrica activa' },
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
            || (alertaOficial?.activa && alertaOficial?.esVigente !== false && alertaOficial?.estadoTemporal !== 'FUTURA_PREVENTIVA' && alertaOficial?.estadoTemporal !== 'EXPIRADA' && (
                alertaOficial.esEspecial ||
                /^1-?1-?2/i.test(alertaOficial.origen || '') ||
                /protecci[oó]n\s*civil/i.test(alertaOficial.origen || alertaOficial.tipo || '') ||
                ['NARANJA', 'ROJA'].includes(String(alertaOficial.nivel || '').toUpperCase()) ||
                Boolean(alertaOficial.urlDoc) ||
                /emergencia|inundaci|avenida|temporal\s*costero|galerna|ciclon|borrasca/i.test(`${alertaOficial.tipo || ''} ${alertaOficial.descripcion || ''}`)
            ))
            || alertasArray.some(a => 
                a?.esVigente !== false && a?.estadoTemporal !== 'FUTURA_PREVENTIVA' && a?.estadoTemporal !== 'EXPIRADA' && (
                    a?.esEspecial || 
                    /^1-?1-?2/i.test(a?.origen || '') || 
                    /protecci[oó]n\s*civil/i.test(a?.origen || a?.tipo || '') ||
                    ['NARANJA', 'ROJA'].includes(String(a?.nivel || '').toUpperCase()) ||
                    Boolean(a?.urlDoc) ||
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
            explicacionNautica: `Alerta oficial de emergencias decretada por ${nombreAutoridad}. Queda prohibida la actividad náutica. Respeta las indicaciones de las autoridades y no te acerques a espigones ni desembocaduras.`,
            factoresCriticos,
            analysisConfidence: 99,
            confianzaAnalisis: 99,
            tormentaElectrica: false,
            alertaEmergenciaActiva: true,
            aemet: alertaOficial || { activa: true, disponible: true },
            vientoNudos: vientoKt ?? 0,
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
                motivo: `Alerta oficial de emergencias activa (${nombreAutoridad}). Navegación desaconsejada y prohibida por riesgo extremo.`,
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

    // 2. Resolver orientación costera y vector de viento
    const infoCosta = orientacionCostaDeg !== null
        ? { seawardDeg: orientacionCostaDeg, esCosta: true, esEmbalse: false, tipoEntorno: 'mar_abierto' }
        : resolverOrientacionCostera(spotNombre, lat, lon);
    const compViento = orientacionCostaDeg !== null
        ? calcularComponenteVientoAuto(dirVientoDeg, orientacionCostaDeg)
        : calcularComponenteVientoAuto(lat, lon, dirVientoDeg, spotNombre);
    const deriva = calcularIndiceDerivaPaddleSafe({
        vientoKt: vientoKt || 0,
        rachasKt: rachasKt || vientoKt || 0,
        oleajeM: oleajeM || 0,
        componente: compViento.componente,
        esCosta: infoCosta.esCosta
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

    // 7. Cálculo del Safety Score Canónico (0 a 100)
    let score = 95;
    const vReal = vientoKt ?? 0;
    const oReal = oleajeM ?? 0;
    const rReal = rachasKt ?? vReal;

    if (vReal >= 20) score -= 60;
    else if (vReal >= 15) score -= 40;
    else if (vReal >= 11) score -= 20;
    else if (vReal <= 6 && (oleajeM === null || oReal <= 0.3)) score = 98;

    if (rReal - vReal >= 8) score -= 15;
    else if (rReal - vReal >= 5) score -= 8;

    if (oReal >= 1.5) score -= 35;
    else if (oReal >= 0.8) score -= 20;
    else if (oReal >= 0.5) score -= 10;

    if (compViento.componente === 'offshore') score -= 15;

    // Alertas oficiales AEMET (solo penalizan si aplican a la jornada consultada, no si son preventivas a futuro ni expiradas)
    const alertaActivaJornada = Boolean(
        alertaOficial?.activa 
        && !avisoPreventivo 
        && alertaOficial?.esVigente !== false
        && alertaOficial?.estadoTemporal !== 'FUTURA_PREVENTIVA' 
        && alertaOficial?.estadoTemporal !== 'EXPIRADA'
        && alertaOficial?.esEmergencia !== false
    );

    if (alertaActivaJornada) {
        const nAlert = String(alertaOficial.nivel || '').toUpperCase();
        if (nAlert === 'AMARILLA') score = Math.min(score, 70);
        else if (nAlert === 'NARANJA') score = Math.min(score, 45);
        else if (nAlert === 'ROJA') score = Math.min(score, 20);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    // 8. Confianza del Análisis (0 a 100)
    let confianza = 20;
    if (vientoKt !== null) confianza += 35;
    if (oleajeM !== null || infoCosta.tipoEntorno === 'embalse_interior') confianza += 25;
    if (rachasKt !== null) confianza += 10;
    if (dirVientoDeg !== null) confianza += 5;
    if (periodoOlaS !== null || infoCosta.tipoEntorno === 'embalse_interior') confianza += 5;
    confianza = Math.min(100, confianza);

    // 9. Factores Críticos y Observaciones
    const factoresCriticos = [];
    if (vReal >= 12) factoresCriticos.push(`Viento sostenido de ${vReal} kt.`);
    if (rReal - vReal >= 5) factoresCriticos.push(`Rachas de ${rReal} kt frente a ${vReal} kt de viento medio.`);
    if (oReal >= 0.8 && infoCosta.esCosta) factoresCriticos.push(`Oleaje significativo de ${oReal.toFixed(1)} m.`);
    if (periodoOlaS >= 10 && oReal >= 0.5) factoresCriticos.push(`Periodo de ola largo (${Math.round(periodoOlaS)}s): mayor fuerza de las series.`);

    if (compViento.componente === 'offshore') {
        factoresCriticos.push('Componente offshore (terral): el viento aleja de la costa y dificulta el retorno.');
    } else if (compViento.componente === 'side-shore') {
        factoresCriticos.push('Componente side-shore: desplazamiento lateral a lo largo de la costa.');
    } else if (compViento.componente === 'onshore') {
        factoresCriticos.push('Componente onshore: favorece el retorno a tierra pero crea oleaje frontal.');
    }

    if (alertaActivaJornada) {
        factoresCriticos.push(`Aviso oficial ${alertaOficial.origen || 'AEMET'} activo (${alertaOficial.nivel || ''}): ${alertaOficial.tipo || alertaOficial.descripcion || 'atención al parte'}.`);
    }

    // 10. Determinación del Estado Categórico Final
    let estadoKey = 'FAVORABLE';
    let respuestaDirecta = '🟢 Salida Recomendada';

    if (score < 30 || vReal >= 20 || oReal >= 1.8 || (alertaActivaJornada && ['NARANJA', 'ROJA'].includes(alertaOficial.nivel))) {
        estadoKey = 'NO_RECOMENDADO';
        respuestaDirecta = '🔴 No recomendado';
    } else if (score < 55 || vReal >= 15 || oReal >= 1.0 || (userLevel === 'Principiante' && (vReal >= 10 || oReal >= 0.5))) {
        estadoKey = 'EXIGENTE';
        respuestaDirecta = '🟠 Condiciones exigentes';
    } else if (score < 75 || vReal >= 10 || oReal >= 0.5 || compViento.componente === 'offshore' || alertaActivaJornada) {
        estadoKey = 'PRECAUCION';
        respuestaDirecta = '🟡 Precaución';
    }

    const confEstado = ESTADOS_VEREDICTO[estadoKey];

    // 11. Justificación Náutica Profesional
    let justificacion = '';
    if (estadoKey === 'FAVORABLE') {
        justificacion = `Viento suave (${vReal} kt) y mar calmo (${oReal.toFixed(1)} m). Condiciones óptimas para navegar con fluidez y mínimo esfuerzo.`;
    } else if (estadoKey === 'PRECAUCION') {
        justificacion = compViento.componente === 'offshore'
            ? `Viento de ${vReal} kt con componente hacia mar abierto (offshore). Conviene remar en paralelo a la orilla y vigilar referencias fijas en tierra.`
            : `Viento de ${vReal} kt y ligera ondulación (${oReal.toFixed(1)} m). Navegación viable gestionando el ritmo.`;
    } else if (estadoKey === 'EXIGENTE') {
        justificacion = `Viento activo de ${vReal} kt y oleaje de ${oReal.toFixed(1)} m. Requiere experiencia previa, equilibrio reactivo y buena condición física.`;
    } else {
        justificacion = `Condiciones adversas (viento de ${vReal} kt y olas de ${oReal.toFixed(1)} m). Alto riesgo de caída, deriva mar adentro y agotamiento muscular.`;
    }

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
        deporte: evalDeporte,
        beginnerIndex: beginner,
        deriva,
        riesgoDeriva: deriva,
        derivaCostera: deriva,
        consenso,
        ventanas,
        ventanaRecomendada: ventanas?.mejorVentana || null,
        componenteCostera: compViento,
        entorno: infoCosta.tipoEntorno,
        vientoNudos: vReal,
        tormentaElectrica: false,
        alertaEmergenciaActiva: false,
        avisoPreventivo: avisoPreventivo ? datosPreventivo : null,
        avisoPreventivoActivo: Boolean(avisoPreventivo),
        aemet: alertaOficial || { activa: false, disponible: false },
        analysisConfidence: confianza,
        confianzaAnalisis: confianza,
        factoresCriticos,
        fuenteAlternativa: false,
        detallesTecnicos: {
            vientoKt: vReal,
            rachasKt: rReal,
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

    resultado.nextGen = resultado;
    return resultado;
}
