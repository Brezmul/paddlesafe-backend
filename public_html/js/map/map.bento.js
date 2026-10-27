// ==============================================================================
// PADDLESAFE NEXT-GEN - BENTO COCKPIT & EXPERT VERDICTS UI (map.bento.js)
// Modularized under Strangler Fig pattern from map.js
// Handles: Bento Cockpit UI, Expert Verdicts, Pro Planner Dashboard,
// Tactical SVG Compass Vectors, Atmospheric Alerts, and Spot Loading Skeletons.
// ==============================================================================

import { supabaseClient, appState } from '../config.js';
import {
    fetchConTimeout,
    esc,
    kmhANudos,
    formatearTiempo,
    deduplicateInsights,
    sonMensajesEquivalentes,
    filtrarConsejosRedundantes,
    generarVeredictoNextGen,
    resolverOrientacionCostera,
    calcularComponenteVientoAuto,
    calcularConsensoModelos,
    detectarVentanasOptimas,
    calcularBeginnerIndex,
    evaluarCondicionesDeporte,
    generarConsejoCoach,
    calcularSolYCrepusculo,
    generarGuiaHumanaEquipamiento,
    calcularEquipamientoTermicoDetallado
} from '../utils.js';
import { mapRuntime } from './map.state.js';
import {
    validarCoordenadas,
    clasificarErrorMeteo,
    logForecastService,
    resolverSpotConocido,
    ForecastError,
    WeatherError
} from '../engine/errors.js';
import { actualizarMapa } from './map.core.js';
import {
    ICONOS_SEGURIDAD,
    ICONOS_DERIVA,
    renderizarCoachProCard,
    renderizarCoachProFallbackLocal,
    solicitarCoachIAPro,
    solicitarCoachIABasico,
    coachContradiceMotor,
    normalizarUnidadesCoach
} from './map.coach.js';
import {
    solicitarPronostico,
    solicitarPronosticoOpenMeteo,
    valorNumericoMeteo,
    crearFranjaForecast,
    evaluarAlertasGlobales,
    nivelAlertaMeteorologica,
    obtenerMotorExperto,
    renderizarAvisoSuperior,
    registrarDiagnosticoClima,
    escanearMejoresVentanas72h
} from './map.weather.js';
import {
    spotActivoActual,
    cargarReportesSpot,
    cargarSpotsGuardadosUsuario,
    cargarJornadaCompletaSpot,
    analizarHistorialYSmartMatchSpot
} from './map.spots.js';
import {
    generarGraficoSvgPerfilRuta,
    evaluarVientoRelativoInfo,
    calcularMeteoProgresivaPorTramo
} from './map.routes.js';
import {
    buscarYCentrarMapa,
    obtenerVelocidadCruceroUsuario
} from './map.core.js';
import { generarPerfilTacticoSpot } from '../engine/coastal.js';

// Motor experto y aviso superior son exportados canónicamente por map.weather.js

/**
 * Activa el estado visual de carga (skeleton / pulse) en las tarjetas Bento.
 */
export function activarSkeletonCargaSpot(prefijo = 'basic') {
    const el = document.getElementById(`${prefijo}ExpertSummary`) || document.getElementById('panelBasico');
    if (el) el.classList.add('animate-pulse', 'opacity-75');
}

/**
 * Desactiva el estado visual de carga en las tarjetas Bento.
 */
export function desactivarSkeletonCargaSpot(prefijo = 'basic') {
    const el = document.getElementById(`${prefijo}ExpertSummary`) || document.getElementById('panelBasico');
    if (el) el.classList.remove('animate-pulse', 'opacity-75');
}

export function aplicarGlowVerdictBento(el, score) {
    if (!el) return;
    el.classList.remove('ps-glass-glow-emerald', 'ps-glass-glow-amber', 'ps-glass-glow-rose');
    if (score === null || score === undefined || isNaN(Number(score))) return;
    const num = Number(score);
    if (num >= 80) {
        el.classList.add('ps-glass-glow-emerald');
    } else if (num >= 50) {
        el.classList.add('ps-glass-glow-amber');
    } else {
        el.classList.add('ps-glass-glow-rose');
    }
}

export function renderizarResumenExperto(motor, prefijo = 'basic') {
    const contenedor = document.getElementById(`${prefijo}ExpertSummary`);
    if (!contenedor) return;
    const nivel = document.getElementById(`${prefijo}Level`);
    const confianza = document.getElementById(`${prefijo}Confidence`);
    const mensaje = document.getElementById(`${prefijo}ExpertMessage`);
    const deriva = document.getElementById(`${prefijo}ExpertDrift`);
    const insights = document.getElementById(`${prefijo}ExpertInsights`);
    const ng = motor?.nextGen;
    const icono = ICONOS_SEGURIDAD[motor.seguridad.nivel] || '⚠️';

    // Alerta destacada de Evolución Próxima (+3h)
    let evoCont = document.getElementById(`${prefijo}EvolucionProxima`);
    const evo = motor?.evolucionProxima || motor?.detallesTecnicos?.evolucionProxima || ng?.evolucionProxima;
    if (evo && evo.mensaje) {
        if (!evoCont && contenedor) {
            evoCont = document.createElement('div');
            evoCont.id = `${prefijo}EvolucionProxima`;
            contenedor.insertBefore(evoCont, contenedor.firstChild);
        }
        if (evoCont) {
            const isDark = prefijo === 'pro';
            const eCls = isDark
                ? 'bg-amber-950/90 border-2 border-amber-500 text-amber-200'
                : 'bg-amber-50 border-2 border-amber-400 text-amber-900';
            evoCont.className = `w-full p-2.5 rounded-xl border ${eCls} font-bold text-xs flex items-center gap-2 mb-2 shadow-sm animate-pulse`;
            evoCont.innerHTML = `<span class="text-base">⚡</span> <span>${esc(evo.mensaje)}</span>`;
            evoCont.classList.remove('hidden');
        }
    } else if (evoCont) {
        evoCont.classList.add('hidden');
    }

    if (nivel) {
        if (motor.alertaEmergenciaActiva) {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1.5 bg-red-600 text-white rounded-lg shadow-md animate-pulse`;
            nivel.textContent = `🚨 PROHIBIDO SALIR A REMAR · 0/100 · ALERTA 112 ACTIVA`;
        } else if (motor.tormentaElectricaOficial || (motor.tormentaElectrica && motor.aemet?.activa)) {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1.5 bg-red-600 text-white rounded-lg shadow-md animate-pulse`;
            nivel.textContent = `🚨 NO RECOMENDADO · 0/100 · AVISO AEMET TORMENTAS`;
        } else if (motor.riesgoMeteorologicoEstimado) {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1 bg-amber-950/80 text-amber-300 border border-amber-600/60 rounded-lg shadow-sm`;
            nivel.textContent = `⚠️ RIESGO METEOROLÓGICO ESTIMADO · ${motor.seguridad?.score ?? 40}/100 · ${motor.recomendacion || 'PRECAUCIÓN'}`;
        } else {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1 ${motor.cls || ''}`;
            nivel.textContent = `${icono} ${motor.seguridad.nivel} · ${motor.seguridad.score}/100 · ${motor.recomendacion}`;
        }
    }

    if (prefijo === 'basic') {
        const scoreBadge = document.getElementById('basicVerdictScoreBadge');
        if (scoreBadge && motor?.seguridad?.score !== undefined) {
            const sc = motor.seguridad.score;
            let colorHex = '#10b981';
            if (sc < 45) colorHex = '#f43f5e';
            else if (sc < 75) colorHex = '#f59e0b';

            scoreBadge.className = "flex items-center justify-center shrink-0 relative";
            scoreBadge.innerHTML = generarSvgAnilloScore(sc, colorHex) + `<span id="basicScoreNumber" class="hidden">${sc}</span>`;
        }
        const orientPill = document.getElementById('basicOrientationPill');
        const dInfoBasic = motor.derivaCostera || motor.riesgoDeriva;
        if (orientPill) {
            const orient = dInfoBasic?.orientacion || dInfoBasic?.tipoCostero || motor?.detallesTecnicos?.orientacionCostera;
            if (orient) {
                orientPill.textContent = orient;
                orientPill.classList.remove('hidden');
            } else {
                orientPill.classList.add('hidden');
            }
        }
        const driftScoreEl = document.getElementById('basicDriftScore');
        const driftTextEl = document.getElementById('basicDriftText');
        const driftBarEl = document.getElementById('basicDriftBar');
        if (driftScoreEl) {
            const dScore = dInfoBasic?.score ?? 10;
            driftScoreEl.textContent = dScore;
            if (driftTextEl) driftTextEl.textContent = dInfoBasic?.nivel ? `Deriva ${dInfoBasic.nivel}` : 'Índice Deriva';
            if (driftBarEl) {
                driftBarEl.style.width = `${Math.min(100, Math.max(5, dScore))}%`;
                driftBarEl.className = dScore <= 35 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500' : (dScore <= 65 ? 'bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-500' : 'bg-gradient-to-r from-rose-500 to-red-600 h-full transition-all duration-500');
            }
        }

        // 10-Second Human Decision & Thermal Wetsuit Advisor (UI 6.0)
        let briefingBar = document.getElementById('humanQuickBriefingBar');
        const scoreVal = motor?.seguridad?.score ?? 80;
        const vKmh = motor?.factores?.vientoKmh ?? motor?.detallesTecnicos?.vientoKmh ?? motor?.vientoKmh ?? 10;
        const vientoKt = vKmh / 1.852;
        const olaM = motor?.factores?.olaM ?? motor?.detallesTecnicos?.olaM ?? motor?.olaM ?? 0.2;
        const tempAireC = motor?.temperatura ?? motor?.detallesTecnicos?.temperatura ?? 21;
        
        const fnGuia = typeof generarGuiaHumanaEquipamiento === 'function'
            ? generarGuiaHumanaEquipamiento
            : (typeof window !== 'undefined' ? window.generarGuiaHumanaEquipamiento : null);

        if (typeof fnGuia === 'function') {
            const guia = fnGuia(tempAireC, vientoKt, olaM, scoreVal);
            if (briefingBar) {
                briefingBar.outerHTML = guia.html;
            } else if (contenedor) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = guia.html;
                if (tempDiv.firstElementChild) {
                    contenedor.insertBefore(tempDiv.firstElementChild, mensaje || contenedor.firstChild);
                }
            }
        }
    }

    if (confianza) {
        confianza.textContent = `Confianza del análisis: ${motor.analysisConfidence}%`;
    }

    if (mensaje) {
        mensaje.textContent = motor.explicacionNautica || motor.mensaje;
    }

    if (deriva) {
        const dInfo = motor.derivaCostera || motor.riesgoDeriva;
        const dNivel = dInfo.nivel || 'BAJO';
        const dScore = dInfo.score ?? 10;
        const dDesc = dInfo.descripcion || '';
        deriva.textContent = `${ICONOS_DERIVA[dNivel] || '🟢'} Deriva ${dNivel} (${dScore}/100): ${dDesc}`;
    }

    // Píldoras Next-Gen dinámicas (Mejor ventana, Iniciación, Consenso multi-modelo, Evolución térmica)
    let badgesCont = document.getElementById(`${prefijo}NextGenBadges`);
    if (!badgesCont && contenedor) {
        badgesCont = document.createElement('div');
        badgesCont.id = `${prefijo}NextGenBadges`;
        badgesCont.className = 'flex flex-wrap gap-2 pt-1 pb-1';
        if (deriva && deriva.parentNode) {
            deriva.parentNode.insertBefore(badgesCont, deriva);
        } else {
            contenedor.appendChild(badgesCont);
        }
    }

    if (badgesCont) {
        const badges = [];
        const isDark = prefijo === 'pro';

        if (motor.alertaEmergenciaActiva) {
            badges.push(`<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-600 text-white shadow-sm animate-pulse">
                ⛔ SALIDA PROHIBIDA POR EMERGENCIA OFICIAL
            </span>`);
        } else {
            // 0a. Píldora de Riesgo Meteorológico Estimado por Modelo Numérico (Regla 1 & Regla 6)
            if (motor.riesgoMeteorologicoEstimado) {
                const rCls = isDark
                    ? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                    : 'bg-amber-50 text-amber-800 border-amber-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${rCls}">
                    ⚠️ Riesgo Meteorológico Estimado
                </span>`);
            }

            // 0b. Píldora de Aviso Preventivo 112 en seguimiento (si existe aviso futuro)
            if (motor.avisoPreventivoActivo || motor.avisoPreventivo) {
                const prev = motor.avisoPreventivo;
                const pCls = isDark
                    ? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                    : 'bg-amber-50 text-amber-800 border-amber-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${pCls}">
                    ⚠️ Aviso 112 Preventivo (${esc(prev?.periodoTexto || 'Fin de semana')})
                </span>`);
            }

            // 1. Píldora de Mejor Ventana Horaria
            const ventana = motor.ventanaRecomendada || motor.ventanas?.mejorVentana;
            if (ventana && ventana.inicio && ventana.fin) {
                const vCls = isDark
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${vCls}">
                    ⏰ Mejor ventana: ${esc(ventana.inicio)} - ${esc(ventana.fin)}
                </span>`);
            }

            // 2. Píldora del Índice de Iniciación
            if (motor.beginnerIndex?.nivel) {
                const bCls = isDark
                    ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
                    : 'bg-sky-50 text-sky-800 border-sky-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${bCls}">
                    🔰 Iniciación: ${esc(motor.beginnerIndex.nivel)}
                </span>`);
            }

            // 3. Píldora del Consenso Multi-modelo
            if (motor.consenso?.nivelConsenso && motor.consenso.nivelConsenso !== 'UNICO') {
                const cCls = isDark
                    ? 'bg-slate-800 text-slate-300 border-slate-700'
                    : 'bg-slate-100 text-slate-700 border-slate-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cCls}">
                    🎯 Consenso: ${esc(motor.consenso.nivelConsenso)} (${motor.consenso.modelosDisponibles?.join(', ') || 'Multi-modelo'})
                </span>`);
            }

            // 4. Píldora de Evolución Térmica / Rolada Próxima (+3h)
            if (evo && evo.mensaje) {
                const eCls = isDark
                    ? 'bg-amber-950/80 text-amber-300 border-amber-600/70'
                    : 'bg-amber-100 text-amber-900 border-amber-300';
                badges.unshift(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${eCls}">
                    📈 En +${evo.deltaHoras}h: Viento ${evo.vientoFuturoKt} kt (Racha ${evo.rachaFuturaKt} kt)
                </span>`);
            }
        }

        badgesCont.innerHTML = badges.join('');
        badgesCont.style.display = badges.length ? 'flex' : 'none';
    }

    if (insights) {
        const puntos = deduplicateInsights([
            ...(ng?.factoresRiesgo || []),
            ...(motor.factoresCriticos || [])
        ]);
        insights.innerHTML = puntos.map(insight => `<li>${esc(insight)}</li>`).join('');
    }

    const scoreVal = motor?.seguridad?.score;
    if (prefijo === 'pro') {
        aplicarGlowVerdictBento(document.getElementById('proDashboardResumen'), scoreVal);
    } else {
        aplicarGlowVerdictBento(document.getElementById('spotIntelligenceBento'), scoreVal);
        aplicarGlowVerdictBento(document.getElementById('fullDaySpotTimeline'), scoreVal);
    }

    contenedor.dataset.haSidoCargado = 'true';
    contenedor.classList.remove('hidden');
    const fnSubVista = (typeof cambiarSubVistaSpot === 'function' ? cambiarSubVistaSpot : null) 
        || (typeof window !== 'undefined' ? window.cambiarSubVistaSpot : null);
    if (typeof fnSubVista === 'function' && (mapRuntime.subVistaSpotActual || (typeof window !== 'undefined' && window.subVistaSpotActual))) {
        fnSubVista(mapRuntime.subVistaSpotActual || (typeof window !== 'undefined' ? window.subVistaSpotActual : null));
    }
}

export async function consultarBasico() {
    if (typeof document === 'undefined') return;
    const locInput = document.getElementById('location');
    if (!locInput) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const loc = locInput.value.trim();
    const d = document.getElementById('date')?.value || new Date().toISOString().slice(0, 10);
    const r = document.getElementById('timeRange')?.value || 'Mañana (09:00 - 12:00)';
    const u = document.getElementById('userLevel')?.value || 'Intermedio';
    const btn = document.getElementById('btn-consultar');
    const sp = document.getElementById('spinner');
    const bt = document.getElementById('btn-text');
    const res = document.getElementById('resultado');
    
    if(!loc || !d || !r || !u) {
        res.innerHTML = `<strong>⚠️ Faltan datos</strong>`;
        res.className = "text-sm font-bold text-red-500 bg-red-50 p-5 rounded-2xl border border-red-200 text-center";
        return;
    }
    
    res.className = "text-sm font-mono text-slate-300 bg-slate-900/60 p-5 rounded-2xl border border-sky-500/30 whitespace-pre-wrap leading-relaxed min-h-[80px] opacity-60 animate-pulse flex items-center justify-center gap-2";
    res.innerHTML = '<span class="animate-spin text-base">⏳</span> <span class="font-bold text-sky-300">Actualizando parte y modelos costeros...</span>';
    const tlEl = document.getElementById('fullDaySpotTimeline');
    if (tlEl && !tlEl.classList.contains('hidden')) {
        tlEl.classList.add('opacity-60', 'animate-pulse');
    }
    buscarYCentrarMapa(loc);
    btn.disabled = true; sp.classList.remove('hidden'); bt.textContent = "Analizando...";
    ['basicWindSpeed', 'basicWindDir', 'basicWave', 'basicPrecip', 'basicPrecipProb'].forEach(id => {
        document.getElementById(id).textContent = '--';
    });
    const nivelBasico = document.getElementById('basicLevel');
    nivelBasico.className = 'text-sm font-black text-slate-400 text-center px-2';
    nivelBasico.textContent = 'Esperando...';
    document.getElementById('basicExpertSummary')?.classList.add('hidden');
    const coachBasico = document.getElementById('basicCoachContainer');
    if (coachBasico) {
        coachBasico.classList.add('hidden');
        coachBasico.innerHTML = '';
    }

    const alC = document.getElementById('global-alert-container'); if(alC) alC.innerHTML = '';
    
    const payload = {
        location: loc,
        date: d,
        timeRange: r,
        userLevel: u || "Intermedio"
    };

    const startTime = Date.now();
    try {
        const p = await solicitarPronostico(payload);
        
        if (p._desdeSnapshot) {
            const min = Math.max(1, Math.round((Date.now() - p._snapshotTs) / 60000));
            const avisoSnapshot = `📴 Modo Sin Cobertura — Mostrando el último parte descargado hace ${min} min para ${esc(p._snapshotLocation || loc)}`;
            const alCont = document.getElementById('global-alert-container');
            if (alCont) {
                alCont.innerHTML = `
                    <div class="bg-amber-500/20 border-2 border-amber-500 text-amber-900 dark:text-amber-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg my-3 font-semibold text-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">📴</span>
                            <span>Modo Sin Cobertura — Mostrando el último parte descargado hace <strong>${min} min</strong> para <strong>${esc(p._snapshotLocation || loc)}</strong></span>
                        </div>
                    </div>
                `;
                alCont.classList.remove('hidden');
            }
            const mapMsg = document.getElementById('mapMsg');
            if (mapMsg) {
                mapMsg.innerHTML = avisoSnapshot;
                mapMsg.classList.remove('hidden');
            }
        }

        if(p.datos) {
            const dx = p.datos;
            dx.date = p.received?.date || d;
            dx.fecha = p.received?.date || d;
            dx.timeRange = r;
            const vientoMs = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
            const vientoKmh = vientoMs === null ? null : vientoMs * 3.6;
            const vientoNudos = kmhANudos(vientoKmh);

            const rachasMs = valorNumericoMeteo(dx.windGusts, dx.wind_gusts, dx.rachas, dx.rachas_kmh ? dx.rachas_kmh / 3.6 : null);
            const rachasKmh = rachasMs === null ? null : rachasMs * 3.6;
            const rachasKt = rachasKmh !== null ? kmhANudos(rachasKmh) : null;

            const wv = valorNumericoMeteo(dx.waveHeight, dx.wave_height);
            const periodoOla = valorNumericoMeteo(dx.wavePeriod, dx.wave_period, dx.periodoOla, dx.periodoOlaS, dx.periodo_ola_s);

            const pm = valorNumericoMeteo(dx.precipitation, dx.precipitation_mm);
            const pl = valorNumericoMeteo(dx.precipProbability, dx.precipitation_probability);
            
            document.getElementById("basicWindSpeed").textContent = vientoNudos === null ? 'N/D' : `${vientoNudos.toFixed(1)} kt`;
            
            // Racha (cuando supere en >= 3 kt al viento medio)
            const gustEl = document.getElementById("basicWindGust");
            const hayRachaRelevante = vientoNudos !== null && rachasKt !== null && (rachasKt - vientoNudos) >= 3;
            if (gustEl) {
                if (hayRachaRelevante) {
                    gustEl.textContent = `Racha ${rachasKt.toFixed(1)} kt`;
                    gustEl.classList.remove('hidden');
                } else {
                    gustEl.classList.add('hidden');
                    gustEl.textContent = '';
                }
            }

            document.getElementById("basicWave").textContent = wv !== null ? `${wv.toFixed(1)} m` : 'N/D';
            
            // Símbolo vectorial de dirección de oleaje
            const waveDir = valorNumericoMeteo(dx.waveDirection, dx.wave_direction, dx.swellWaveDirection, dx.swell_wave_direction);
            const waveLabelEl = document.getElementById("basicWaveHeightLabel");
            if (waveLabelEl) {
                if (waveDir !== null) {
                    waveLabelEl.innerHTML = `<span class="flex items-center gap-1 justify-center"><span class="swell-arrow text-sky-400 inline-block w-3 h-3" style="transform: rotate(${waveDir}deg);"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg></span><span>Altura (${Math.round(waveDir)}°)</span></span>`;
                } else {
                    waveLabelEl.textContent = 'Altura M.';
                }
            }

            // Periodo de ola y badge
            const wavePeriodEl = document.getElementById("basicWavePeriod");
            let badgePeriodoHtml = '';
            let badgeTexto = '';
            if (periodoOla !== null && periodoOla > 0) {
                if (wv !== null && wv >= 0.4 && periodoOla <= 5) {
                    badgePeriodoHtml = '<span class="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 ml-1">Chop corto</span>';
                    badgeTexto = ' (Chop corto)';
                } else if (wv !== null && wv >= 0.3 && periodoOla >= 9) {
                    badgePeriodoHtml = '<span class="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300 ml-1">Mar de fondo</span>';
                    badgeTexto = ' (Mar de fondo)';
                }
                if (wavePeriodEl) {
                    wavePeriodEl.innerHTML = `${Math.round(periodoOla)}s ${badgePeriodoHtml}`;
                }
            } else if (wavePeriodEl) {
                wavePeriodEl.innerHTML = '';
            }

            document.getElementById("basicPrecip").textContent = pm === null ? 'N/D' : `${pm} mm`;
            document.getElementById("basicPrecipProb").textContent = `Prob: ${pl === null ? 'N/D' : `${pl}%`}`;
            
            const cardD = ["N","NE","E","SE","S","SO","O","NO"];
            const direccion = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
            const hayDireccion = direccion !== null;
            const idir = hayDireccion ? Math.round((((direccion % 360) + 360) % 360) / 45) % 8 : null;
            document.getElementById("basicWindDir").innerHTML = `<div class="wind-arrow text-emerald-500 drop-shadow-sm w-4 h-4" style="transform: rotate(${hayDireccion ? direccion : 0}deg);"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg></div> ${hayDireccion ? `${cardD[idir]} (${Math.round(direccion)}°)` : 'Dirección N/D'}`;

            // Actualización de barras de intensidad Bento y horas solares (DS 3.0)
            const windBar = document.getElementById('basicWindBar');
            if (windBar) {
                const wPct = vientoNudos !== null ? Math.min(100, Math.round((vientoNudos / 25) * 100)) : 0;
                windBar.style.width = `${wPct}%`;
            }
            const waveBar = document.getElementById('basicWaveBar');
            if (waveBar) {
                const wavePct = wv !== null ? Math.min(100, Math.round((wv / 2.0) * 100)) : 0;
                waveBar.style.width = `${wavePct}%`;
            }
            // Resolución segura y canónica de coordenadas activas
            const latEfectiva = Number(
                p.datos?.coordinates?.latitude ??
                p.lat ??
                p.received?.lat ??
                spotActivoActual?.lat ??
                mapRuntime.latitudActual ??
                38.80
            );
            const lonEfectiva = Number(
                p.datos?.coordinates?.longitude ??
                p.lon ??
                p.received?.lon ??
                spotActivoActual?.lon ??
                mapRuntime.longitudActual ??
                0.18
            );

            // Sincronizar coordenadas en el motor de mapa y estado
            mapRuntime.latitudActual = latEfectiva;
            mapRuntime.longitudActual = lonEfectiva;
            if (typeof actualizarMapa === 'function') {
                actualizarMapa(latEfectiva, lonEfectiva);
            }

            const solarTimesEl = document.getElementById('basicSolarTimes');
            if (solarTimesEl) {
                try {
                    const solar = calcularSolYCrepusculo(latEfectiva, lonEfectiva, d || new Date().toISOString().slice(0, 10));
                    if (solar && solar.sunriseStr && solar.sunsetStr) {
                        solarTimesEl.innerHTML = `🌅 ${solar.sunriseStr} · 🌇 ${solar.sunsetStr}`;
                    }
                } catch (_) {}
            }
            
            const motor = obtenerMotorExperto(dx, u);
            renderizarAvisoSuperior(motor);
            renderizarResumenExperto(motor);

            let extraReporte = '';
            if (hayRachaRelevante) extraReporte += ` | 💨 Racha: <b>${rachasKt.toFixed(1)} kt</b>`;
            if (periodoOla !== null && periodoOla > 0) extraReporte += ` | 🌊 Periodo: <b>${Math.round(periodoOla)}s</b>${badgeTexto}`;

            res.className = "text-sm font-mono text-slate-600 bg-slate-50 p-5 rounded-2xl border border-slate-200 whitespace-pre-wrap leading-relaxed min-h-[80px]";
            res.innerHTML = `<strong>📍 ${esc((p.received?.location || loc).split(',')[0])}</strong><br>📅 ${esc(p.received?.date || d)} | 🕒 ${esc(p.received?.timeRange || r)}${extraReporte}`;
            solicitarCoachIABasico(dx, u, loc, motor);

            // Actualizar estado del spot activo y renderizar timeline diurno completo
            setSpotActivoActual({
                nombre: (p.received?.location || loc).split(',')[0],
                lat: latEfectiva,
                lon: lonEfectiva
            });
            setPronosticoDiaCompletoActual(dx);
            actualizarEstadoBotonGuardarSpot();

            // Renderizar rosa de vectores tácticos y HUD
            renderizarRosaVectoresMapa(latEfectiva, lonEfectiva, dx);

            // Cargar reportes en vivo de la comunidad (Waze for SUP)
            void cargarReportesSpot(latEfectiva, lonEfectiva);

            if (dx.horasDiurnas && dx.horasDiurnas.length > 0) {
                renderizarTimelineJornadaCompleta(spotActivoActual, dx, u);
            }
            renderizarInteligenciaYDiarioSpot(spotActivoActual, dx);
        }
    } catch(e) { 
        const durationMs = Date.now() - startTime;
        const forecastErr = clasificarErrorMeteo(e, null, null, loc, mapRuntime.latitudActual, mapRuntime.longitudActual, durationMs);

        logForecastService({
            spot: loc,
            lat: forecastErr.lat,
            lng: forecastErr.lng,
            url: forecastErr.technicalDetails?.url,
            status: forecastErr.status,
            durationMs,
            error: forecastErr
        });

        const userMsg = forecastErr.userMessage || 'Revisa tu conexión o comprueba el nombre del spot e inténtalo de nuevo.';
        res.className = "text-sm font-semibold text-amber-400 bg-amber-950/40 p-4 rounded-2xl border border-amber-500/40 leading-relaxed text-center";
        res.innerHTML = `<strong>⚠️ ${esc(userMsg)}</strong>`;
        console.warn('Error al consultar el pronóstico básico:', forecastErr);

        document.getElementById('fullDaySpotTimeline')?.classList.add('hidden');
        document.getElementById('spotIntelligenceBento')?.classList.add('hidden');
        renderizarAvisoSuperior({
            aemet: { alertas: [], disponible: false },
            tormentaElectrica: false,
            fuenteAlternativa: false,
            recomendacion: 'NO RECOMENDADO',
            seguridad: { score: 0 },
            analysisConfidence: 0
        });
        renderizarResumenExperto(calcularVeredicto({ datos: {} }));
        mostrarCoachPronosticoNoDisponible(document.getElementById('basicCoachContainer'));
    } finally {
        btn.disabled = false; sp.classList.add('hidden'); bt.textContent = 'Evaluar Spot';
    }
}

export async function consultarPuntoProInstantaneo(lat, lon, d, t) {
    const u = document.getElementById('proLevelOption').value || "Intermedio";
    const btn = document.getElementById('btnCalcPro');
    if(btn) { btn.disabled = true; btn.innerHTML = "Analizando punto..."; }

    try {
        const payload = {
            location: `${lat},${lon}`,
            date: d,
            timeRange: crearFranjaForecast(t || "12:00"),
            userLevel: u
        };
        const p = await solicitarPronostico(payload);
        renderizarDashboardPro(p.datos, t, u, false, lat, lon, d);
        if (p.datos) {
            renderizarRosaVectoresMapa(lat, lon, p.datos);
            void cargarReportesSpot(lat, lon);
        }
    } catch(e) {
        console.warn('Aviso no crítico:', e);
        alert(`❌ No se pudo obtener el pronóstico. ${e?.message || 'Revisa tu conexión e inténtalo de nuevo.'}`);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro"; }
    }
}

// ====================================================
// FÍSICA PERSONALIZADA DE TABLA, RITMO Y VELOCIDAD DE CRUCERO
// ====================================================

export async function consultarRutaPro() {
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const alertCont = document.getElementById('proAlertContainer');
    alertCont.classList.add('hidden'); alertCont.innerHTML = "";
    
    const locVal = document.getElementById('proLocation').value;
    const d = document.getElementById('proDate').value;
    const t = document.getElementById('proTime').value;
    const u = document.getElementById('proLevelOption').value;
    
    if(!locVal || !d || !t) {
        alertCont.innerHTML = "⚠️ Toca el mapa e indica Fecha/Hora.";
        alertCont.className = "text-sm font-bold text-red-400 bg-red-900/30 p-4 rounded-xl text-center w-full block mt-2";
        alertCont.classList.remove('hidden');
        return;
    }
    
    const btn = document.getElementById('btnCalcPro');
    btn.disabled = true; btn.innerHTML = "Calculando...";
    
    let lat, lon;
    if (mapRuntime.marcadoresRuta.length >= 2) {
        lat = parseFloat(mapRuntime.marcadoresRuta[0].getLatLng().lat.toFixed(5));
        lon = parseFloat(mapRuntime.marcadoresRuta[0].getLatLng().lng.toFixed(5));
    } else {
        const partes = locVal.split(',');
        lat = parseFloat(partes[0]);
        lon = parseFloat(partes[1]);
    }

    const valProCoords = validarCoordenadas(lat, lon);
    if (!valProCoords.valido) {
        alertCont.innerHTML = `⚠️ ${esc(valProCoords.userMessage || 'Toca un punto en el mapa para fijar las coordenadas de salida.')}`;
        alertCont.className = "text-sm font-bold text-amber-400 bg-amber-950/40 p-4 rounded-xl border border-amber-500/40 text-center w-full block mt-2";
        alertCont.classList.remove('hidden');
        btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro";
        return;
    }
    
    let duracionEstimada = 120;
    if (mapRuntime.marcadoresRuta.length >= 2) {
        let dt = 0;
        const coords = mapRuntime.marcadoresRuta.map(m => m.getLatLng());
        let rutArray = [...coords];
        if ((mapRuntime.modoTravesiaActivo || coords.length === 2) && coords.length === 2) rutArray.push(coords[0]);
        for(let i = 0; i < rutArray.length - 1; i++) {
            dt += rutArray[i].distanceTo(rutArray[i+1]);
        }
        if (dt > 0) duracionEstimada = Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60);
    }

    try {
        const payload = {
            location: `${lat},${lon}`,
            date: d,
            timeRange: crearFranjaForecast(t, duracionEstimada),
            userLevel: u
        };
        const p = await solicitarPronostico(payload);
        renderizarDashboardPro(p.datos, t, u, mapRuntime.marcadoresRuta.length >= 2, lat, lon, d);
    } catch(e) {
        alertCont.innerHTML = `❌ <strong>No se pudo cargar el pronóstico meteorológico.</strong> ${esc(e?.message || 'Comprueba tu conexión a internet e inténtalo de nuevo.')}`;
        alertCont.className = "text-sm font-bold text-red-400 bg-red-900/30 p-4 rounded-xl text-center w-full block mt-2";
        alertCont.classList.remove('hidden');
        console.warn('Aviso crítico (Fetch Pro):', e);
    } finally {
        btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro";
    }
}

export function renderizarDashboardPro(dx, horaSalida, userLvl, esRutaTrazada, lat, lon, fechaD) {
    mapRuntime.datosMeteoActuales = dx;
    const timeParts = (horaSalida || '10:00').split(':');
    const hhInicio = parseInt(timeParts[0], 10) || 0;
    const mmInicio = parseInt(timeParts[1], 10) || 0;
    const wkVal = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
    const windKmh = wkVal === null ? null : wkVal * 3.6;
    const windKnots = kmhANudos(windKmh);
    const wvRaw = dx.waveHeight ?? dx.wave_height;
    const wv = wvRaw !== null && wvRaw !== undefined && wvRaw !== '' && Number.isFinite(Number(wvRaw))
        ? Number(wvRaw).toFixed(1) : null;
    const wPeriod = dx.wavePeriod !== undefined ? dx.wavePeriod : (dx.wave_period !== undefined ? dx.wave_period : "--");
    const pm = valorNumericoMeteo(dx.precipitation, dx.precipitation_mm);
    const pl = valorNumericoMeteo(dx.precipProbability, dx.precipitation_probability);
    const gustsVal = valorNumericoMeteo(dx.windGusts, dx.wind_gusts);
    const gustsKmh = gustsVal === null ? null : gustsVal * 3.6;
    const gustsKnots = kmhANudos(gustsKmh);
    const uv = (dx.uvIndex !== undefined && dx.uvIndex !== null) ? dx.uvIndex : (dx.uv_index !== undefined ? dx.uv_index : "--");
    
    let uvText = uv >= 8 ? "MUY ALTO" : (uv >= 5 ? "ALTO" : (uv > 0 ? "MODERADO" : "--"));
    document.getElementById('proDashWind').innerHTML = `${windKnots === null ? 'N/D' : windKnots.toFixed(1)} <span class="text-[10px] text-slate-500">kt</span>`;
    document.getElementById('proDashGusts').innerHTML = `Rachas: ${gustsKnots === null ? 'N/D' : `${gustsKnots.toFixed(1)} kt`}`;
    const direccionViento = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
    document.getElementById('proDashDirIcon').style.transform = `rotate(${direccionViento ?? 0}deg)`;
    document.getElementById('proDashDirText').textContent = direccionViento === null ? 'N/D' : `${Math.round(direccionViento)}°`;
    document.getElementById('proDashWave').innerHTML = `${wv !== null ? wv : 'N/D'} <span class="text-[10px] text-sky-900">m</span>`;
    document.getElementById('proDashWavePeriod').textContent = `Periodo: ${wPeriod === '--' ? 'N/D' : `${wPeriod} s`}`;
    document.getElementById('proDashPrecip').textContent = pl === null ? 'N/D' : `${pl}%`;
    document.getElementById('proDashPrecipMM').textContent = pm === null ? 'N/D' : `${pm} mm`;
    document.getElementById('proDashUV').innerHTML = `${uv}`;
    document.getElementById('proDashUVText').innerHTML = uvText;
    
    let tempAireValue = dx.tempAire || dx.temperature || dx.temp || "N/D";
    let tempAguaValue = dx.tempAgua || dx.waterTemperature || dx.water_temp || "N/D";
    document.getElementById('proTempAmbiente').textContent = tempAireValue !== "N/D" ? `${tempAireValue}°` : "--°";
    document.getElementById('proTempAgua').textContent = tempAguaValue !== "N/D" ? `${tempAguaValue}°` : "--°";
    
    let icono = "☀️", textoClima = "SOL";
    const estadoClima = String(dx.clima || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const codigoClima = valorNumericoMeteo(dx.weatherCode, dx.weather_code);
    if ([95, 96, 99].includes(codigoClima) || /tormenta|thunderstorm|lightning/.test(estadoClima)) { icono = "⛈️"; textoClima = "TORMENTA"; }
    else if (estadoClima.includes("nublado")) { icono = "☁️"; textoClima = "NUBES"; }
    else if (estadoClima.includes("lluvia") || (pl !== null && pl > 0)) { icono = "🌧️"; textoClima = "LLUVIA"; }
    document.getElementById('proIconoClima').textContent = icono;
    document.getElementById('proTextoClima').textContent = textoClima;
    
    let dt = 0, tt = 0, arrayHtmlTramos = [];
    const tramosParaCoach = [];
    if (esRutaTrazada) {
        const coords = mapRuntime.marcadoresRuta.map(m => m.getLatLng());
        const currentMap = mapRuntime.map || mapRuntime.mapa || (typeof window !== 'undefined' ? window.map : null);
        if (Array.isArray(mapRuntime.lineasMultiPunto)) {
            mapRuntime.lineasMultiPunto.forEach(l => { if (currentMap && l) currentMap.removeLayer(l); });
            mapRuntime.lineasMultiPunto.length = 0;
        }
        if (Array.isArray(mapRuntime.etiquetasDistancia)) {
            mapRuntime.etiquetasDistancia.forEach(l => { if (currentMap && l) currentMap.removeLayer(l); });
            mapRuntime.etiquetasDistancia.length = 0;
        }
        
        const dirVientoGeneral = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
        const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let rutArray = [...coords];
        if ((mapRuntime.modoTravesiaActivo || coords.length === 2) && coords.length === 2) rutArray.push(coords[0]);
        
        
        let minutosTranscurridos = 0;

        for(let i = 0; i < rutArray.length - 1; i++) {
            const dSeg = rutArray[i].distanceTo(rutArray[i+1]); dt += dSeg;
            const nombreTramo = (rutArray.length === 3) ? (i === 0 ? "IDA 🟢" : "VUELTA 🔴") : `TRAMO ${letras[i]||i} ➔ ${letras[i+1]||(i+1)}`;
            
            const lat1 = rutArray[i].lat * Math.PI / 180, lon1 = rutArray[i].lng * Math.PI / 180;
            const lat2 = rutArray[i+1].lat * Math.PI / 180, lon2 = rutArray[i+1].lng * Math.PI / 180;
            const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
            let rumbo = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
            
            // Cálculo horario dinámico para el tramo
            const minTotalesPaso = mmInicio + Math.round(minutosTranscurridos);
            const horaPasoH = (hhInicio + Math.floor(minTotalesPaso / 60)) % 24;
            const horaPasoM = minTotalesPaso % 60;
            const horaPasoStr = `${horaPasoH.toString().padStart(2, '0')}:${horaPasoM.toString().padStart(2, '0')}`;
            const offsetH = Math.floor(minutosTranscurridos / 60);
            const offsetM = Math.round(minutosTranscurridos % 60);
            const offsetTexto = offsetH > 0 ? `+${offsetH}h ${offsetM}m` : `+${offsetM}m`;

            let dirVientoTramo = dirVientoGeneral;
            let spdVientoTramo = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
            let gustVientoTramo = valorNumericoMeteo(dx.windGusts, dx.wind_gusts);

            const hourlySource = dx.hourly || mapRuntime.datosMeteoActuales?.hourly;
            if (hourlySource && Array.isArray(hourlySource.time)) {
                let hourlyIdx = hourlySource.time.findIndex(tStr => {
                    const hNum = parseInt(tStr.slice(11, 13), 10);
                    return hNum === horaPasoH;
                });
                if (hourlyIdx < 0 && horaPasoH < hourlySource.time.length) {
                    hourlyIdx = horaPasoH;
                }
                if (hourlyIdx >= 0) {
                    const dirH = hourlySource.wind_direction_10m?.[hourlyIdx] ?? hourlySource.windDirection?.[hourlyIdx];
                    if (dirH !== undefined && dirH !== null) dirVientoTramo = Number(dirH);
                    const spdH = hourlySource.wind_speed_10m?.[hourlyIdx] ?? hourlySource.windSpeed?.[hourlyIdx];
                    if (spdH !== undefined && spdH !== null) spdVientoTramo = Number(spdH);
                    const gustH = hourlySource.wind_gusts_10m?.[hourlyIdx] ?? hourlySource.windGusts?.[hourlyIdx];
                    if (gustH !== undefined && gustH !== null) gustVientoTramo = Number(gustH);
                }
            }

            const spdKtTramo = spdVientoTramo !== null ? kmhANudos(spdVientoTramo * 3.6) : null;
            const gustKtTramo = gustVientoTramo !== null ? kmhANudos(gustVientoTramo * 3.6) : null;

            let iV = evaluarVientoRelativoInfo(rumbo, dirVientoTramo);
            const pline = L.polyline([rutArray[i], rutArray[i+1]], { color: iV.hexLineColor, weight: 5, className: 'ruta-animada' });
            if (currentMap) pline.addTo(currentMap);
            if (Array.isArray(mapRuntime.lineasMultiPunto)) mapRuntime.lineasMultiPunto.push(pline);
            
            const midLat = (rutArray[i].lat + rutArray[i+1].lat) / 2; const midLng = (rutArray[i].lng + rutArray[i+1].lng) / 2;
            const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${(dSeg/1000).toFixed(2)} km`, iconSize: [null, null] }) });
            if (currentMap) etiq.addTo(currentMap);
            if (Array.isArray(mapRuntime.etiquetasDistancia)) mapRuntime.etiquetasDistancia.push(etiq);
            
            const tSeg = ((dSeg / 1000) / Math.max(1.5, obtenerVelocidadCruceroUsuario() + iV.modVelocidad)) * 60;
            tt += tSeg;
            minutosTranscurridos += tSeg;

            tramosParaCoach.push({
                nombre: nombreTramo,
                distancia_km: Number((dSeg / 1000).toFixed(2)),
                rumbo: rumbo,
                viento_relativo: iV.texto,
                modVelocidad: iV.modVelocidad,
                minutos: Math.round(tSeg),
                eta_hora: horaPasoStr,
                viento_kt: spdKtTramo,
                viento_dir: dirVientoTramo,
                velEfectiva: Number((Math.max(1.5, obtenerVelocidadCruceroUsuario() + iV.modVelocidad)).toFixed(1)),
                p1: rutArray[i],
                p2: rutArray[i+1],
                color: iV.hexLineColor
            });
            
            arrayHtmlTramos.push(`
                <div id="proTramoDetalle-${i}" class="bg-slate-800 rounded-xl p-3 border-l-4 shadow-sm w-full relative overflow-hidden" style="border-color:${iV.hexLineColor}">
                    <div class="flex justify-between items-center text-white text-[11px] mb-2 border-b border-slate-700/50 pb-2 flex-wrap gap-1">
                        <span class="font-black ${iV.colorRumbo} tracking-wider">${nombreTramo}</span>
                        <div class="flex items-center gap-1.5">
                            <span class="text-[9px] bg-slate-900/90 text-sky-400 border border-sky-500/30 px-1.5 py-0.5 rounded font-mono font-bold">🕒 ETA ${horaPasoStr} (${offsetTexto})</span>
                            <span class="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded font-mono text-slate-400">Rumbo: ${rumbo}°</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full text-center">
                        <div class="bg-slate-900 rounded p-1.5 flex flex-col justify-center border border-slate-700/50">
                            <span class="text-[8px] text-slate-500 font-bold mb-1">DIST</span>
                            <span class="text-[11px] font-mono text-white">${(dSeg/1000).toFixed(2)} km</span>
                        </div>
                        <div class="bg-slate-900 rounded p-1.5 flex flex-col justify-center border border-slate-700/50">
                            <span class="text-[8px] text-slate-500 font-bold mb-1">TIEMPO</span>
                            <span class="text-[11px] font-mono text-white">${formatearTiempo(tSeg)}</span>
                        </div>
                        <div class="col-span-2 ${iV.claseColor} rounded p-1.5 flex flex-col items-center justify-center border border-slate-700/50">
                            <span class="text-[10px] font-black text-white flex items-center gap-1">${iV.icon} ${iV.texto}</span>
                            <span class="text-[8px] font-mono text-slate-300 mt-0.5">Viento: ${spdKtTramo !== null ? `${spdKtTramo.toFixed(1)} kt` : '--'} ${Math.round(dirVientoTramo)}°${gustKtTramo !== null ? ` (R: ${gustKtTramo.toFixed(1)} kt)` : ''}</span>
                        </div>
                    </div>
                </div>`);
        }
        
        document.getElementById('proDashTramosContainer').innerHTML = arrayHtmlTramos.join('');
        const esIdaVuelta = (rutArray.length === 3) || (rutArray.length >= 3 && rutArray[0].distanceTo(rutArray[rutArray.length - 1]) < 25);
        document.getElementById('proTituloTramos').textContent = esIdaVuelta ? "Análisis de Tramos (Ida y Vuelta)" : "Análisis por Tramos";
        document.getElementById('proDistanciaTotal').textContent = `${(dt/1000).toFixed(2)} km`;
        document.getElementById('proTiempoTotal').textContent = formatearTiempo(tt);
        
        let fechaLlegada = new Date(); fechaLlegada.setHours(hhInicio, mmInicio, 0); fechaLlegada.setMinutes(fechaLlegada.getMinutes() + Math.round(tt));
        const etaHH = fechaLlegada.getHours().toString().padStart(2, '0'); const etaMM = fechaLlegada.getMinutes().toString().padStart(2, '0');
        
        document.getElementById('proSalidaHora').textContent = horaSalida;
        document.getElementById('proLlegadaHora').textContent = `${etaHH}:${etaMM}`;
        document.getElementById('proContainerNavegacion').classList.remove('hidden'); document.getElementById('proContainerNavegacion').classList.add('flex');

        // Interactive SVG Route Profile Chart
        window._tramosRutaActuales = tramosParaCoach;
        const chartContainer = document.getElementById('proRouteWindChartContainer');
        const chartTarget = document.getElementById('proRouteWindChart');
        if (chartTarget && tramosParaCoach.length >= 1) {
            chartTarget.innerHTML = generarGraficoSvgPerfilRuta(tramosParaCoach, dt);
            if (chartContainer) {
                chartContainer.classList.remove('hidden');
                chartContainer.classList.add('flex');
            }
        }
    } else {
        window._tramosRutaActuales = [];
        const chartContainer = document.getElementById('proRouteWindChartContainer');
        const chartTarget = document.getElementById('proRouteWindChart');
        if (chartContainer) {
            chartContainer.classList.add('hidden');
            chartContainer.classList.remove('flex');
        }
        if (chartTarget) {
            chartTarget.innerHTML = '';
        }
        document.getElementById('proContainerNavegacion').classList.add('hidden'); document.getElementById('proContainerNavegacion').classList.remove('flex');
        document.getElementById('proTituloTramos').textContent = "Punto de Exploración";
        document.getElementById('proDashTramosContainer').innerHTML = `
            <div class="bg-slate-800 rounded-xl p-4 text-center border border-slate-700/50">
                <span class="text-3xl block mb-2 drop-shadow-md">🧭</span>
                <p class="text-[10px] text-slate-500">Traza una ruta (A ➔ B) para ver tramos y ETA.</p>
            </div>`;
    }
    
    dx.date = fechaD;
    dx.fecha = fechaD;
    dx.selected_date = fechaD;
    dx.fechaConsulta = fechaD;
    dx.horaSalida = horaSalida;
    const motor = obtenerMotorExperto(dx, userLvl);
    renderizarAvisoSuperior(motor);

    // Guardia astronómica de ocaso para la ruta
    const solar = calcularSolYCrepusculo(lat, lon, fechaD);
    const inicioMin = hhInicio * 60 + mmInicio;
    const duracionMin = esRutaTrazada ? Math.round(tt) : 60;
    const retornoMin = inicioMin + duracionMin;
    const hayRiesgoOcaso = esRutaTrazada && (retornoMin >= (solar.sunsetMin - 30));

    const proAlertTop = document.getElementById('proAlertTopContainer');
    const oldSunsetAlert = document.getElementById('proSunsetAlertBanner');
    if (oldSunsetAlert) oldSunsetAlert.remove();
    if (proAlertTop && hayRiesgoOcaso) {
        const retornoHH = String(Math.floor((retornoMin % 1440) / 60)).padStart(2, '0');
        const retornoMM = String((retornoMin % 1440) % 60).padStart(2, '0');
        const elOcaso = document.createElement('div');
        elOcaso.id = 'proSunsetAlertBanner';
        elOcaso.className = 'w-full p-3.5 rounded-xl border border-amber-500/50 bg-amber-950/80 text-amber-200 flex items-start gap-3 text-xs shadow-lg animate-pulse';
        elOcaso.innerHTML = `
            <span class="text-2xl shrink-0">⚠️</span>
            <div>
                <div class="font-black text-amber-300 text-xs sm:text-sm">ALERTA DE SEGURIDAD: LLEGADA CERCANA O POSTERIOR AL OCASO</div>
                <p class="mt-0.5 text-slate-200 leading-snug">
                    La ruta estimada finaliza a las <strong>${retornoHH}:${retornoMM}</strong> (Ocaso oficial: <strong>${solar.sunsetStr}</strong> · Fin luz útil: <strong>${solar.civilDuskStr}</strong>).
                    Sin luz solar el rescate es crítico y la visibilidad marítima se reduce drásticamente. Adelanta la hora de salida o acorta la distancia.
                </p>
            </div>
        `;
        proAlertTop.prepend(elOcaso);
    }

    // Biometría táctica SUP, hidratación mínima y checklist de seguridad
    const equipoUsuario = recuperarEquipoUsuario();
    const distRutaKm = dt > 0 ? (dt / 1000) : 0;
    const velPromedioKmh = (duracionMin > 0 && distRutaKm > 0) ? (distRutaKm / (duracionMin / 60)) : obtenerVelocidadCruceroUsuario();
    const tempNum = Number.isFinite(Number(tempAireValue)) ? Number(tempAireValue) : 20;
    const biometria = calcularBiometriaSup({
        duracionMin: duracionMin,
        distKm: distRutaKm,
        velKmh: velPromedioKmh,
        vientoKt: windKnots !== null ? windKnots : 0,
        olasM: wv !== null ? Number(wv) : 0,
        periodoS: wPeriod !== '--' ? Number(wPeriod) : 0,
        tempC: tempNum,
        tipoTabla: equipoUsuario?.tipoTabla || 'all-round'
    });

    const bioBar = document.getElementById('proBiometricsBar');
    if (bioBar) {
        bioBar.innerHTML = `
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-200">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-sm">
                        <span>🔥</span> <span>Gasto Est.:</span> <b>${biometria.kcal}</b> <span class="text-[10px] text-amber-400 font-normal">kcal</span>
                    </span>
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 shadow-sm">
                        <span>💧</span> <span>Hidratación mín:</span> <b>${biometria.litros}</b> <span class="text-[10px] text-sky-400 font-normal">L</span>
                    </span>
                </div>
                <button type="button" onclick="document.getElementById('proChecklistDetalle')?.classList.toggle('hidden')" class="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/80 text-[11px] font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-sm">
                    <span>🎒</span> <span>Checklist Seguridad</span> <span>▾</span>
                </button>
            </div>
            <div id="proChecklistDetalle" class="hidden mt-2 p-3.5 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs">
                <div class="font-bold text-slate-300 mb-2 flex items-center justify-between">
                    <span class="uppercase tracking-wider text-[10px] text-slate-400">Equipo imprescindible antes de remar</span>
                    <span class="text-[10px] text-emerald-400 font-bold">Seguridad activa</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-200">
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>🦺 Chaleco 50N / Impact</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>🔗 Leash específico tabla/condición</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>🔊 Silbato estanco</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>📱 Bolsa estanca móvil (100% bat)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>💧 Agua / Sales (${biometria.litros} L)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>☀️ Protección solar UV</span>
                    </label>
                </div>
            </div>
        `;
        bioBar.classList.remove('hidden');
        bioBar.classList.add('flex');
    }

    renderizarResumenExperto(motor, 'pro');

    // Simulación de evolución horaria progresiva por tramos (Batch #19)
    const evoBadge = document.getElementById('proRouteWeatherEvolutionBadge');
    if (evoBadge) {
        if (esRutaTrazada && tramosParaCoach.length > 0) {
            const hourlySource = dx.hourly || mapRuntime.datosMeteoActuales?.hourly;
            const resEvolucion = calcularMeteoProgresivaPorTramo(tramosParaCoach, hhInicio, hourlySource);
            if (resEvolucion.hayAumentoCritico && resEvolucion.alertaPrincipal) {
                evoBadge.innerHTML = `
                    <span class="text-xl shrink-0">⚠️</span>
                    <div class="flex-1">
                        <div class="font-black text-amber-300 uppercase tracking-wide text-[10px]">Alerta Táctica de Viento en Ruta</div>
                        <div class="text-[11px] text-amber-100 font-semibold">${esc(resEvolucion.alertaPrincipal.mensaje)}</div>
                    </div>
                `;
                evoBadge.className = 'mx-4 mt-3 p-3 rounded-xl border border-amber-500/60 bg-amber-950/80 text-amber-200 text-xs font-bold flex items-center gap-2 shadow-lg animate-fadeIn';
                evoBadge.classList.remove('hidden');
            } else {
                evoBadge.classList.add('hidden');
                evoBadge.innerHTML = '';
            }
        } else {
            evoBadge.classList.add('hidden');
            evoBadge.innerHTML = '';
        }
    }

    if (typeof renderizarMejoresVentanas72h === 'function') {
        renderizarMejoresVentanas72h(spotActivoActual, dx);
    }

    document.getElementById('proPlanificador').classList.replace('flex','hidden');
    document.getElementById('proDashboardResumen').classList.remove('hidden'); document.getElementById('proDashboardResumen').classList.add('flex');
    const dashResumen = document.getElementById('proDashboardResumen');
    if (dashResumen) {
        dashResumen.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    const isoLlamada = `${fechaD}T${horaSalida}:00`;
    cargarPrevisionHorariaExacta(lat, lon, isoLlamada, tt > 0 ? tt : 120);
    solicitarCoachIAPro(dx, userLvl, dt, tt, lat, lon, fechaD, horaSalida, tramosParaCoach, motor);
}

export async function cargarPrevisionHorariaExacta(lat, lon, startISO, durationMinutes) {
    const cont = document.getElementById('proDashHorasContainer');
    if (!cont) return;
    cont.innerHTML = 'Consultando radar...';
    try {
        const start = new Date(startISO);
        const end = new Date(start.getTime() + Math.max(durationMinutes, 60) * 60000);
        const horaUTC = d => d.toISOString().slice(0, 13) + ':00';
        const diaUTC = d => d.toISOString().slice(0, 10);
        const pos = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&timezone=GMT`;
        const json = r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
        const [wx, marine] = await Promise.all([
            fetchConTimeout(`https://api.open-meteo.com/v1/forecast?${pos}&hourly=wind_speed_10m,wind_gusts_10m,windspeed_10m,windgusts_10m,precipitation_probability,uv_index&start_hour=${horaUTC(start)}&end_hour=${horaUTC(end)}`, { cache: 'no-store' }).then(json),
            fetchConTimeout(`https://marine-api.open-meteo.com/v1/marine?${pos}&hourly=wave_height&start_date=${diaUTC(start)}&end_date=${diaUTC(end)}`, { cache: 'no-store' }).then(json).catch(() => null)
        ]);
        if (!wx.hourly || !wx.hourly.time || wx.hourly.time.length === 0) throw new Error('Rango sin cobertura');
        const olas = new Map();
        if (marine && marine.hourly && marine.hourly.time) {
            marine.hourly.time.forEach((t, i) => {
                const val = marine.hourly.wave_height?.[i];
                if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
                    olas.set(t, Number(val));
                }
            });
        }
        const num = (v, dec = 0) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v).toFixed(dec) : null);
        
        cont.innerHTML = wx.hourly.time.map((t, i) => {
            const horaLabel = new Date(t + 'Z').toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const windRaw = wx.hourly.wind_speed_10m?.[i] ?? wx.hourly.windspeed_10m?.[i];
            const gustRaw = wx.hourly.wind_gusts_10m?.[i] ?? wx.hourly.windgusts_10m?.[i];
            const wind = Number.isFinite(Number(windRaw)) ? Number(windRaw) : null;
            const gust = Number.isFinite(Number(gustRaw)) ? Number(gustRaw) : wind;
            const windKt = wind !== null ? kmhANudos(wind) : null;
            const gustKt = gust !== null ? kmhANudos(gust) : null;
            const wave = num(olas.get(t), 1);
            const rain = num(wx.hourly.precipitation_probability?.[i]);
            const uv = num(wx.hourly.uv_index?.[i], 1);
            const colorViento = windKt !== null ? (windKt > 20 ? 'text-red-400' : (windKt >= 12 ? 'text-yellow-400' : 'text-emerald-400')) : 'text-slate-400';
            const colorRachas = gustKt !== null && gustKt > 20 ? 'text-red-500' : 'text-slate-300';
            const fila = (label, valor, color, unidad = '') => `
                    <div class="flex justify-between items-center text-[10px] mb-1">
                        <span class="text-slate-400 font-bold uppercase tracking-wider">${label}</span>
                        <span class="${color} font-bold">${valor ?? 'N/D'}${valor != null && unidad ? ` <span class="text-[8px]">${unidad}</span>` : ''}</span>
                    </div>`;
            return `
                <div class="bg-slate-800 rounded-xl p-3 border border-slate-700 min-w-[120px] flex-shrink-0 shadow-sm">
                    <span class="block ${colorViento} font-black text-center border-b border-slate-700 pb-1 mb-2 text-sm">${esc(horaLabel)}</span>
                    ${fila('Viento', num(windKt, 1), 'text-white', 'kt')}
                    ${fila('Rachas', num(gustKt, 1), colorRachas, 'kt')}
                    ${fila('Oleaje', wave, 'text-sky-400', 'm')}
                    ${fila('Lluvia', rain, 'text-indigo-300', '%')}
                    ${fila('UV', uv, 'text-amber-400')}
                </div>`;
        }).join('');
    } catch (error) {
        console.warn('Aviso no crítico [prevision horaria]:', error);
        cont.innerHTML = '<p class="text-xs text-red-400 font-bold p-2 bg-red-900/20 rounded border border-red-500/50 w-full text-center">Datos horarios no disponibles ahora mismo. No salgas sin consultar otra fuente.</p>';
    }
}

export function volverPlanificadorPro() {
    const evoBadge = document.getElementById('proRouteWeatherEvolutionBadge');
    if (evoBadge) {
        evoBadge.classList.add('hidden');
        evoBadge.innerHTML = '';
    }
    const dash = document.getElementById('proDashboardResumen');
    if (dash) dash.classList.replace('flex','hidden');
    const plan = document.getElementById('proPlanificador');
    if (plan) {
        plan.classList.remove('hidden');
        plan.classList.add('flex');
        plan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Planificador de quedadas de club y visor deportivo modularizados a ./map/map.routes.js
// Live Tracking aids (modo sol, SOS, retorno live) modularizados a ./map/map.tracker.js

// ==========================================

export function renderizarRosaVectoresMapa(lat, lon, datosMeteo) {
    const currentMap = mapRuntime.map || (typeof window !== "undefined" ? window.map : null);
    if (!currentMap || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || !datosMeteo) return;

    const latNum = Number(lat);
    const lonNum = Number(lon);

    const vMs = valorNumericoMeteo(datosMeteo.windSpeed, datosMeteo.wind_speed);
    const vKt = vMs !== null ? vMs * 1.94384 : 0;
    const rMs = valorNumericoMeteo(datosMeteo.windGusts, datosMeteo.wind_gusts);
    const rKt = rMs !== null ? rMs * 1.94384 : vKt;
    const dirViento = valorNumericoMeteo(datosMeteo.windDirection, datosMeteo.wind_direction);
    const dirVientoNum = dirViento !== null ? Number(dirViento) : 0;

    const waveM = valorNumericoMeteo(datosMeteo.waveHeight, datosMeteo.wave_height);
    const dirOla = valorNumericoMeteo(datosMeteo.waveDirection, datosMeteo.wave_direction);

    // Rumbo hacia el que SOPLA el viento (origen + 180°)
    const rotViento = (dirVientoNum + 180) % 360;

    // Color según intensidad del viento
    const colorViento = vKt < 10 ? '#10b981' : (vKt <= 15 ? '#eab308' : '#ef4444');

    // Vector de ola (rumbo hacia el que avanza la ola)
    const tieneOla = waveM !== null && waveM > 0.05;
    const rotOla = dirOla !== null ? (Number(dirOla) + 180) % 360 : rotViento;

    // SVG táctico de 120x120px centrado
    const svgHtml = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" class="pointer-events-none drop-shadow-xl select-none">
            <defs>
                <filter id="vectorGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/>
                </filter>
            </defs>
            <!-- 1. Rosa de rumbos sutil -->
            <circle cx="60" cy="60" r="48" fill="rgba(15, 23, 42, 0.45)" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" stroke-dasharray="3 3"/>
            <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
            <!-- Ticks cardinales -->
            <line x1="60" y1="12" x2="60" y2="18" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
            <line x1="108" y1="60" x2="102" y2="60" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
            <line x1="60" y1="108" x2="60" y2="102" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
            <line x1="12" y1="60" x2="18" y2="60" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
            <text x="60" y="24" fill="#38bdf8" font-size="9" font-weight="900" text-anchor="middle" font-family="sans-serif">N</text>

            <!-- 2. Vector de Ola (Línea discontinua Cyan hacia donde va la ola) -->
            ${tieneOla ? `
            <g transform="rotate(${rotOla}, 60, 60)" filter="url(#vectorGlow)">
                <line x1="60" y1="60" x2="60" y2="19" stroke="#06b6d4" stroke-width="2.5" stroke-dasharray="4 2" stroke-linecap="round"/>
                <polygon points="60,13 54,23 66,23" fill="#06b6d4"/>
            </g>
            ` : ''}

            <!-- 3. Vector de Viento Animado (Hacia donde sopla) -->
            <g transform="rotate(${rotViento}, 60, 60)" filter="url(#vectorGlow)">
                <line x1="60" y1="60" x2="60" y2="16" stroke="${colorViento}" stroke-width="3.5" stroke-linecap="round"/>
                <polygon points="60,10 52,22 68,22" fill="${colorViento}"/>
                <circle cx="60" cy="60" r="4.5" fill="${colorViento}" stroke="#0f172a" stroke-width="1.5"/>
            </g>

            <!-- 4. Etiqueta central de intensidad -->
            <g filter="url(#vectorGlow)">
                <rect x="36" y="53" width="48" height="15" rx="4" fill="rgba(15, 23, 42, 0.88)" stroke="${colorViento}" stroke-width="1"/>
                <text x="60" y="64" fill="${colorViento}" font-size="9" font-weight="900" text-anchor="middle" font-family="sans-serif">💨 ${vKt.toFixed(1)}k</text>
            </g>
            ${tieneOla ? `
            <g filter="url(#vectorGlow)">
                <rect x="38" y="70" width="44" height="13" rx="3.5" fill="rgba(15, 23, 42, 0.85)" stroke="#06b6d4" stroke-width="0.8"/>
                <text x="60" y="80" fill="#06b6d4" font-size="8" font-weight="900" text-anchor="middle" font-family="sans-serif">🌊 ${waveM.toFixed(1)}m</text>
            </g>
            ` : ''}
        </svg>
    `;

    const iconRosa = L.divIcon({
        className: 'rosa-vectores-container',
        html: svgHtml,
        iconSize: [120, 120],
        iconAnchor: [60, 60]
    });

    if (mapRuntime.marcadorRosaVectores && currentMap) {
        try { currentMap.removeLayer(mapRuntime.marcadorRosaVectores); } catch (_) {}
        mapRuntime.marcadorRosaVectores = null;
    }

    mapRuntime.marcadorRosaVectores = L.marker([latNum, lonNum], {
        icon: iconRosa,
        interactive: false,
        zIndexOffset: 250
    }).addTo(currentMap);

    mapRuntime.activeSpotData = {
        lat: latNum,
        lon: lonNum,
        windSpeedMs: vMs || 0,
        windKt: vKt,
        windGustKt: rKt,
        windDir: dirVientoNum,
        windBlowsToDeg: rotViento,
        waveHeightM: waveM || 0,
        wavePeriodS: valorNumericoMeteo(datosMeteo.wavePeriod, datosMeteo.wave_period) || 0,
        waveDir: dirOla !== null ? Number(dirOla) : dirVientoNum,
        waveBlowsToDeg: rotOla
    };
    actualizarHudVectoresMapa(latNum, lonNum, datosMeteo);
}

export function actualizarHudVectoresMapa(lat, lon, datosMeteo) {
    const hud = document.getElementById('mapWindWaveHud');
    if (!hud) return;

    if (!datosMeteo || mapRuntime.radarActivo) {
        hud.classList.add('hidden');
        return;
    }

    const vMs = valorNumericoMeteo(datosMeteo.windSpeed, datosMeteo.wind_speed);
    const vKt = vMs !== null ? vMs * 1.94384 : 0;
    const rMs = valorNumericoMeteo(datosMeteo.windGusts, datosMeteo.wind_gusts);
    const rKt = rMs !== null ? rMs * 1.94384 : vKt;
    const dirViento = valorNumericoMeteo(datosMeteo.windDirection, datosMeteo.wind_direction) || 0;
    const waveM = valorNumericoMeteo(datosMeteo.waveHeight, datosMeteo.wave_height);
    const perS = valorNumericoMeteo(datosMeteo.wavePeriod, datosMeteo.wave_period);

    const spotNombre = spotActivoActual?.nombre || (lat && lon ? `${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}` : (document.getElementById('location')?.value?.trim() || 'Spot'));
    const infoCosta = resolverOrientacionCostera(spotNombre, lat, lon);

    const elName = document.getElementById('hudPointName');
    if (elName) {
        elName.textContent = spotActivoActual?.nombre ? spotNombre.split(',')[0] : `${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}`;
        elName.title = `Coordenadas: ${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;
    }

    const elBadge = document.getElementById('hudCostalBadge');
    if (elBadge) {
        if (infoCosta && infoCosta.componente) {
            const comp = infoCosta.componente.toLowerCase();
            if (comp.includes('offshore') || comp.includes('terral')) {
                elBadge.textContent = 'Offshore';
                elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-950/90 text-emerald-300 border border-emerald-500/50';
            } else if (comp.includes('onshore') || comp.includes('mar-tierra')) {
                elBadge.textContent = 'Onshore';
                elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-950/90 text-blue-300 border border-blue-500/50';
            } else {
                elBadge.textContent = 'Side';
                elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-950/90 text-cyan-300 border border-cyan-500/50';
            }
        } else {
            elBadge.textContent = 'Costero';
            elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300';
        }
    }

    const elArrow = document.getElementById('hudWindArrow');
    if (elArrow) {
        const rotViento = (Number(dirViento) + 180) % 360;
        elArrow.style.transform = `rotate(${rotViento}deg)`;
    }

    const elSpeed = document.getElementById('hudWindSpeed');
    if (elSpeed) {
        elSpeed.textContent = `${vKt.toFixed(1)} kt`;
    }

    const elGust = document.getElementById('hudWindGust');
    if (elGust) {
        if (rKt - vKt >= 3) {
            elGust.textContent = `(${rKt.toFixed(1)})`;
        } else {
            elGust.textContent = '';
        }
    }

    const elWave = document.getElementById('hudWaveHeight');
    if (elWave) {
        elWave.textContent = waveM !== null ? `🌊 ${waveM.toFixed(1)}m` : '🌊 --';
    }

    const elPeriod = document.getElementById('hudWavePeriod');
    if (elPeriod) {
        elPeriod.textContent = perS ? `${Math.round(perS)}s` : '';
    }

    hud.classList.remove('hidden');
    if (typeof window !== 'undefined' && typeof window.deshabilitarPropagacionMapa === 'function') {
        window.deshabilitarPropagacionMapa(hud);
    }
}

/**
 * Limpia la roseta táctica de vectores y oculta el HUD flotante de telemetría.
 */
export function limpiarRosaVectoresMapa() {
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (mapRuntime.marcadorRosaVectores && currentMap) {
        try { currentMap.removeLayer(mapRuntime.marcadorRosaVectores); } catch (_) {}
        mapRuntime.marcadorRosaVectores = null;
    }
    mapRuntime.activeSpotData = null;
    if (typeof document !== 'undefined') {
        const hud = document.getElementById('mapWindWaveHud');
        if (hud) hud.classList.add('hidden');
    }
}

// ==============================================================================
// 72H BEST WINDOWS UI & INTERACTIVE ACTIVATION (BATCH #19)
// ==============================================================================

/**
 * Renderiza el banner de las 3 mejores ventanas diurnas 72h con mini-cards Bento interactivas.
 * @param {Object} spot Spot activo actual
 * @param {Object} pronostico Dataset de pronóstico meteo
 */
export function renderizarMejoresVentanas72h(spot, pronostico) {
    const banner = document.getElementById('bestWindows72hBanner');
    if (!banner) return;
    if (!pronostico) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }
    const lat = Number(spot?.lat || mapRuntime.latitudActual);
    const lon = Number(spot?.lon || mapRuntime.longitudActual);
    const seawardDeg = spot?.seaward_deg ?? null;
    const ventanas = escanearMejoresVentanas72h(lat, lon, pronostico, seawardDeg);
    if (!Array.isArray(ventanas) || ventanas.length === 0) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }

    const pillsHtml = ventanas.map(w => {
        const glowClass = w.scoreMedio >= 80 ? 'ps-glass-glow-emerald border-emerald-500/50 bg-emerald-950/60 text-emerald-200' :
            (w.scoreMedio >= 60 ? 'ps-glass-glow-amber border-amber-500/50 bg-amber-950/60 text-amber-200' : 'ps-glass-glow-rose border-rose-500/50 bg-rose-950/60 text-rose-200');
        const icono = w.scoreMedio >= 80 ? '🟢' : (w.scoreMedio >= 60 ? '🟡' : '🟠');
        return `
            <button type="button" onclick="window.aplicarVentanaOptimaSpot('${esc(w.fechaStr)}', '${esc(w.horaInicio)}')" class="ps-bento-card text-left p-3 rounded-2xl border ${glowClass} hover:scale-[1.02] active:scale-95 transition-all cursor-pointer flex flex-col gap-1.5 flex-1 min-w-[200px]" title="Toca para activar esta ventana óptima en el mapa y spot">
                <div class="flex items-center justify-between gap-1 text-[11px] font-black">
                    <span class="tracking-wide">${icono} ${esc(w.etiquetaDia)} ${esc(w.horaInicio)}–${esc(w.horaFin)}</span>
                    <span class="ps-tabular font-mono px-2 py-0.5 rounded-full bg-black/40 text-[10px] border border-white/10 font-bold">Score ${w.scoreMedio}</span>
                </div>
                <div class="flex items-center gap-2.5 text-[10px] text-slate-300 font-semibold">
                    <span class="flex items-center gap-1">💨 <b class="text-white">${w.vientoMedioKt}</b> kt</span>
                    <span class="flex items-center gap-1">🌊 <b class="text-white">${w.olasMediasM}</b> m</span>
                </div>
                <p class="text-[9px] text-slate-400 line-clamp-1 italic">${esc(w.resumen)}</p>
            </button>
        `;
    }).join('');

    banner.innerHTML = `
        <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2">
            <div class="flex items-center gap-2">
                <span class="text-base">✨</span>
                <span class="text-xs font-black text-amber-300 uppercase tracking-wider">Top 3 Mejores Ventanas 72h</span>
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">Smart Scan</span>
            </div>
            <span class="text-[10px] text-slate-400 font-medium">Toca una ventana para activar</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            ${pillsHtml}
        </div>
    `;
    banner.classList.remove('hidden');
}

/**
 * Aplica la ventana óptima seleccionada a los selectores de fecha/hora del cockpit y refresca los datos.
 * @param {string} fechaStr Fecha 'YYYY-MM-DD'
 * @param {string} horaInicio Hora 'HH:00'
 */
export async function aplicarVentanaOptimaSpot(fechaStr, horaInicio) {
    if (fechaStr) {
        const dInput = document.getElementById('date');
        const pDate = document.getElementById('proDate');
        const qDate = document.getElementById('quedadaFechaInput');
        if (dInput) dInput.value = fechaStr;
        if (pDate) pDate.value = fechaStr;
        if (qDate) qDate.value = fechaStr;
    }
    if (horaInicio) {
        const pTime = document.getElementById('proTime');
        if (pTime) pTime.value = horaInicio;
    }
    if (typeof window.seleccionarHoraTimeline === 'function') {
        window.seleccionarHoraTimeline(horaInicio, true);
    }
    if (spotActivoActual && typeof window.cargarJornadaCompletaSpot === 'function') {
        await window.cargarJornadaCompletaSpot(spotActivoActual, fechaStr);
    } else if (typeof window.consultarBasico === 'function') {
        await window.consultarBasico();
    }
    const timelineEl = document.getElementById('fullDaySpotTimeline');
    if (timelineEl) {
        timelineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * UI 5.0 - Animated SVG Radial Score Gauge
 * Genera un dial circular nítido con pista de fondo, arco reactivo al score (0-100),
 * drop-shadow luminoso, valor numérico en el centro y etiqueta de seguridad.
 * @param {number|string} score 0 - 100
 * @param {string} [colorHex] Color opcional
 * @returns {string} Código HTML SVG válido
 */
export function generarSvgAnilloScore(score, colorHex = null) {
    const sc = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    const radius = 45;
    const circ = 2 * Math.PI * radius; // ~282.74
    const dashoffset = circ - (circ * sc / 100);

    let strokeColor = colorHex;
    if (!strokeColor || strokeColor === 'auto') {
        if (sc >= 75) strokeColor = '#10b981';
        else if (sc >= 45) strokeColor = '#f59e0b';
        else strokeColor = '#f43f5e';
    }

    let safetyLabel = 'ÓPTIMO';
    if (sc < 45) safetyLabel = 'PELIGRO';
    else if (sc < 75) safetyLabel = 'PRECAUCIÓN';

    return `<svg class="ps-gauge-ring w-20 h-20 sm:w-24 sm:h-24 select-none drop-shadow-md" viewBox="0 0 120 120" role="img" aria-label="Score de seguridad: ${sc}/100">
        <defs>
            <filter id="ps-gauge-glow-${sc}" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
        </defs>
        <!-- Background track ring -->
        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="rgba(148, 163, 184, 0.16)" stroke-width="8" stroke-linecap="round" />
        <!-- Dynamic score arc with glow -->
        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="8.5" stroke-linecap="round"
            stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${dashoffset.toFixed(2)}"
            transform="rotate(-90 60 60)" style="filter: drop-shadow(0 0 5px ${strokeColor}70);" />
        <!-- Score number in center -->
        <text x="60" y="56" text-anchor="middle" dominant-baseline="central" fill="#ffffff" style="font-size: 26px; font-weight: 900; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;" class="ps-tabular">
            ${sc}
        </text>
        <!-- Safety label underneath -->
        <text x="60" y="78" text-anchor="middle" dominant-baseline="central" fill="${strokeColor}" style="font-size: 8.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;">
            ${safetyLabel}
        </text>
    </svg>`;
}

/**
 * UI 5.0 - Selector segmentado de sub-vistas del spot
 * Opciones: 'todas' | 'meteo' | 'inteligencia' | 'coach'
 * @param {string} vista
 */
export function cambiarSubVistaSpot(vista = 'todas') {
    const v = ['todas', 'meteo', 'inteligencia', 'coach'].includes(vista) ? vista : 'todas';
    mapRuntime.subVistaSpotActual = v;
    if (typeof window !== 'undefined') window.subVistaSpotActual = v;

    if (typeof document !== 'undefined') {
        const tabs = document.querySelectorAll('[data-subview]');
        tabs.forEach(tab => {
            const tabVal = tab.getAttribute('data-subview');
            if (tabVal === v) {
                tab.classList.add('ps-subview-tab-active');
            } else {
                tab.classList.remove('ps-subview-tab-active');
            }
        });

        const resumenExperto = document.getElementById('basicExpertSummary');
        const timeline = document.getElementById('fullDaySpotTimeline');
        const inteligencia = document.getElementById('spotIntelligenceBento');
        const coach = document.getElementById('basicCoachContainer');

        if (v === 'todas') {
            if (resumenExperto && resumenExperto.dataset.haSidoCargado === 'true') resumenExperto.classList.remove('hidden');
            if (timeline && timeline.dataset.haSidoCargado === 'true') timeline.classList.remove('hidden');
            if (inteligencia && inteligencia.dataset.haSidoCargado === 'true') inteligencia.classList.remove('hidden');
            if (coach && coach.dataset.haSidoCargado === 'true') coach.classList.remove('hidden');
        } else if (v === 'meteo') {
            if (resumenExperto) resumenExperto.classList.remove('hidden');
            if (timeline) timeline.classList.remove('hidden');
            if (inteligencia) inteligencia.classList.add('hidden');
            if (coach) coach.classList.add('hidden');
        } else if (v === 'inteligencia') {
            if (inteligencia) inteligencia.classList.remove('hidden');
            if (timeline) timeline.classList.add('hidden');
            if (coach) coach.classList.add('hidden');
        } else if (v === 'coach') {
            if (coach) coach.classList.remove('hidden');
            if (resumenExperto) resumenExperto.classList.remove('hidden');
            if (timeline) timeline.classList.add('hidden');
            if (inteligencia) inteligencia.classList.add('hidden');
        }
    }

    return v;
}

// ==============================================================================
// 1-TAP DAY & TIME FILTERING, QUICK SPOT LAUNCH & CALENDAR PILLS (UI 6.0)
// ==============================================================================

/**
 * Inicializa las etiquetas dinámicas de días en el Omnibar (+2 y +3 días)
 */
export function inicializarPildorasCalendario() {
    if (typeof document === 'undefined') return;
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const hoy = new Date();

    const d2 = new Date(hoy);
    d2.setDate(hoy.getDate() + 2);
    const pill2 = document.getElementById('quickDayPill2');
    if (pill2) {
        const label = `${diasSemana[d2.getDay()]} ${d2.getDate()}`;
        pill2.innerHTML = `<span>📅</span> <span>${label}</span>`;
        pill2.setAttribute('data-date', d2.toISOString().slice(0, 10));
    }

    const d3 = new Date(hoy);
    d3.setDate(hoy.getDate() + 3);
    const pill3 = document.getElementById('quickDayPill3');
    if (pill3) {
        const label = `${diasSemana[d3.getDay()]} ${d3.getDate()}`;
        pill3.innerHTML = `<span>📅</span> <span>${label}</span>`;
        pill3.setAttribute('data-date', d3.toISOString().slice(0, 10));
    }
}

/**
 * Actualiza visualmente el estado activo de las píldoras de día y franja horaria
 * @param {number|null} diaOffset 
 * @param {string|null} horaStr 
 */
export function actualizarPildorasTiempoUI(diaOffset = null, horaStr = null) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('quickTimePillsBar');
    if (!container) return;

    if (diaOffset !== null) {
        const dayPills = container.querySelectorAll('[data-day]');
        dayPills.forEach(btn => {
            const bOffset = btn.getAttribute('data-day');
            const isAhora = horaStr === 'ahora';
            const isActive = isAhora ? btn.getAttribute('data-time') === 'ahora' : (bOffset === String(diaOffset) && btn.getAttribute('data-time') !== 'ahora');
            if (isActive) {
                btn.className = 'ps-chip ps-quick-pill bg-sky-500/30 text-sky-200 border-sky-400 font-bold active:scale-95 cursor-pointer shadow-sm';
            } else {
                btn.className = 'ps-chip ps-quick-pill bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 active:scale-95 cursor-pointer';
            }
        });
    }

    if (horaStr && horaStr !== 'ahora') {
        const slotPills = container.querySelectorAll('[data-slot]');
        slotPills.forEach(btn => {
            const slot = btn.getAttribute('data-slot');
            if (slot === horaStr) {
                btn.className = 'ps-chip ps-quick-pill bg-emerald-500/30 text-emerald-200 border-emerald-400 font-bold active:scale-95 cursor-pointer shadow-sm';
            } else {
                btn.className = 'ps-chip ps-quick-pill bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 active:scale-95 cursor-pointer';
            }
        });
    }
}

/**
 * Aplica en 1-tap el filtro rápido de día y hora, actualizando inputs y disparando evaluación
 * @param {number|null} diaOffset Desplazamiento en días (0: hoy, 1: mañana, etc.)
 * @param {string|null} horaStr 'ahora', '09:00', '13:00', '17:00'
 */
export function aplicarFiltroRapidoTiempo(diaOffset = null, horaStr = null) {
    if (typeof document === 'undefined') return;

    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('timeRange');

    let targetDate = null;
    if (diaOffset !== null) {
        const d = new Date();
        d.setDate(d.getDate() + Number(diaOffset));
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        targetDate = `${year}-${month}-${day}`;
        if (dateInput) {
            dateInput.value = targetDate;
        }
    }

    if (horaStr) {
        if (horaStr === 'ahora') {
            const now = new Date();
            const hour = now.getHours();
            if (timeSelect) {
                if (hour < 12) {
                    timeSelect.value = "Mañana (06:00 - 12:00)";
                } else if (hour < 18) {
                    timeSelect.value = "Tarde (12:00 - 18:00)";
                } else {
                    timeSelect.value = "Ocaso (18:00 - 21:00)";
                }
            }
            if (dateInput && !dateInput.value) {
                const now = new Date();
                dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            }
        } else if (timeSelect) {
            if (horaStr === '09:00') {
                timeSelect.value = "Mañana (06:00 - 12:00)";
            } else if (horaStr === '13:00') {
                timeSelect.value = "Tarde (12:00 - 18:00)";
            } else if (horaStr === '17:00') {
                timeSelect.value = "Tarde (12:00 - 18:00)";
            }
        }
    }

    actualizarPildorasTiempoUI(diaOffset, horaStr);

    const locInput = document.getElementById('location');
    const hasLocation = locInput && locInput.value.trim().length > 0;
    if (hasLocation && typeof window.consultarBasico === 'function') {
        window.consultarBasico();
    }
}

/**
 * Carga un spot sugerido en 1-tap, centra el mapa y ejecuta la evaluación automática
 * @param {string} nombreSpot 
 */
export function cargarSpotRapido(nombreSpot) {
    if (typeof document === 'undefined') return;
    const locInput = document.getElementById('location');
    if (locInput) {
        locInput.value = nombreSpot;
    }
    if (typeof buscarYCentrarMapa === 'function') {
        buscarYCentrarMapa(nombreSpot);
    } else if (typeof window.buscarYCentrarMapa === 'function') {
        window.buscarYCentrarMapa(nombreSpot);
    }
    const dateInput = document.getElementById('date');
    if (dateInput && !dateInput.value) {
        const now = new Date();
        dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    const timeSelect = document.getElementById('timeRange');
    if (timeSelect && !timeSelect.value) {
        timeSelect.value = "Mañana (06:00 - 12:00)";
    }
    if (typeof window.consultarBasico === 'function') {
        window.consultarBasico();
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarPildorasCalendario);
    } else {
        inicializarPildorasCalendario();
    }
}

// ==============================================================================
// INTERACTIVE THERMAL WETSUIT & GEAR CALCULATOR CONTROLLER (UI 6.0)
// Real-time (< 1ms) sensory & metabolic slider reactivity
// ==============================================================================

/**
 * Abre el modal de Calculadora Térmica Interactiva precargando datos del spot si están disponibles
 * @param {Object} [spotData] Datos opcionales del spot (tempAire, viento, tempAgua)
 */
export function abrirCalculadoraTermica(spotData = null) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('thermalCalculatorModal');
    if (!modal) return;

    let tAire = 21;
    let vKt = 8;
    let tAgua = 19;

    if (spotData) {
        if (spotData.tempAire !== undefined) tAire = spotData.tempAire;
        if (spotData.viento !== undefined) vKt = spotData.viento;
        if (spotData.tempAgua !== undefined) tAgua = spotData.tempAgua;
    } else {
        const currentSpeedText = document.getElementById('basicWindSpeed')?.textContent;
        if (currentSpeedText && !isNaN(parseFloat(currentSpeedText))) {
            vKt = parseFloat(currentSpeedText);
        }
        const mesActual = new Date().getMonth();
        const tempsAguaMed = [14, 13.5, 14.5, 16, 18.5, 22, 25, 26.5, 24.5, 22, 18, 15.5];
        tAgua = tempsAguaMed[mesActual] || 19;
    }

    const sliderAgua = document.getElementById('sliderTempAgua');
    const sliderAire = document.getElementById('sliderTempAire');
    const sliderViento = document.getElementById('sliderViento');

    if (sliderAgua) sliderAgua.value = tAgua;
    if (sliderAire) sliderAire.value = tAire;
    if (sliderViento) sliderViento.value = vKt;

    modal.classList.remove('hidden');
    actualizarVistaCalculadoraTermica();
}

/**
 * Cierra el modal de Calculadora Térmica
 */
export function cerrarCalculadoraTermica() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('thermalCalculatorModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Recalcula en tiempo real (< 1ms) las recomendaciones de equipamiento y actualiza la UI
 */
export function actualizarVistaCalculadoraTermica() {
    if (typeof document === 'undefined') return;

    const sliderAgua = document.getElementById('sliderTempAgua');
    const sliderAire = document.getElementById('sliderTempAire');
    const sliderViento = document.getElementById('sliderViento');
    const checkNublado = document.getElementById('checkNublado');

    const tempAguaC = sliderAgua ? parseFloat(sliderAgua.value) : 18;
    const tempAireC = sliderAire ? parseFloat(sliderAire.value) : 21;
    const vientoKt = sliderViento ? parseFloat(sliderViento.value) : 8;
    const nublado = checkNublado ? checkNublado.checked : false;

    // Actualizar etiquetas numéricas de los sliders
    const valAgua = document.getElementById('valTempAgua');
    const valAire = document.getElementById('valTempAire');
    const valViento = document.getElementById('valViento');
    if (valAgua) valAgua.textContent = `${tempAguaC.toFixed(1)}°C`;
    if (valAire) valAire.textContent = `${tempAireC.toFixed(1)}°C`;
    if (valViento) valViento.textContent = `${Math.round(vientoKt)} kt`;

    // Obtener intensidad y tolerancia activas
    const intensidadBtn = document.querySelector('[data-calc-intensidad].ps-chip-active') || document.querySelector('[data-calc-intensidad]');
    const intensidad = intensidadBtn ? intensidadBtn.getAttribute('data-calc-intensidad') : 'paseo';

    const toleranciaBtn = document.querySelector('[data-calc-tolerancia].ps-chip-active') || document.querySelector('[data-calc-tolerancia]');
    const toleranciaFrio = toleranciaBtn ? toleranciaBtn.getAttribute('data-calc-tolerancia') : 'normal';

    const fnCalc = typeof calcularEquipamientoTermicoDetallado === 'function'
        ? calcularEquipamientoTermicoDetallado
        : (typeof window !== 'undefined' ? window.calcularEquipamientoTermicoDetallado : null);

    if (!fnCalc) return;

    const res = fnCalc({
        tempAguaC,
        tempAireC,
        vientoKt,
        intensidad,
        toleranciaFrio,
        nublado
    });

    // Actualizar Card 1: Traje Principal
    const trajeIcon = document.getElementById('calcTrajeIcono');
    const trajeTitulo = document.getElementById('calcTrajeTitulo');
    const trajeGrosor = document.getElementById('calcTrajeGrosor');
    const trajeDesc = document.getElementById('calcTrajeDesc');
    if (trajeIcon) trajeIcon.textContent = res.trajePrincipal.icono;
    if (trajeTitulo) trajeTitulo.textContent = res.trajePrincipal.titulo;
    if (trajeGrosor) trajeGrosor.textContent = res.trajePrincipal.grosorMm;
    if (trajeDesc) trajeDesc.textContent = res.trajePrincipal.explicacion;

    // Actualizar Card 2: Calzado
    const calzadoIcon = document.getElementById('calcCalzadoIcono');
    const calzadoTitulo = document.getElementById('calcCalzadoTitulo');
    const calzadoDesc = document.getElementById('calcCalzadoDesc');
    if (calzadoIcon) calzadoIcon.textContent = res.calzado.icono;
    if (calzadoTitulo) calzadoTitulo.textContent = res.calzado.tipo;
    if (calzadoDesc) calzadoDesc.textContent = res.calzado.explicacion;

    // Actualizar Card 3: Accesorios
    const accesoriosList = document.getElementById('calcAccesoriosLista');
    if (accesoriosList) {
        accesoriosList.innerHTML = res.accesorios.map(a => `<li class="flex items-start gap-1.5 leading-snug"><span>•</span><span>${a}</span></li>`).join('');
    }

    // Actualizar Card 4: Seguridad & Regla 30
    const indiceEl = document.getElementById('calcIndiceTermico');
    const confortBadge = document.getElementById('calcConfortBadge');
    const regla30Box = document.getElementById('calcRegla30Alerta');
    if (indiceEl) indiceEl.textContent = `${res.indiceTermico} / 30`;
    if (confortBadge) {
        confortBadge.textContent = res.nivelConfort;
        confortBadge.className = `text-[10px] font-black px-2 py-0.5 rounded-full border bg-${res.nivelBadgeColor}-500/20 text-${res.nivelBadgeColor}-300 border-${res.nivelBadgeColor}-500/40`;
    }
    if (regla30Box) {
        if (res.regla30Activa && res.alertaRegla30) {
            regla30Box.classList.remove('hidden');
            regla30Box.textContent = res.alertaRegla30;
        } else {
            regla30Box.classList.add('hidden');
        }
    }
}

/**
 * Cambia la selección de intensidad o tolerancia en la calculadora térmica
 * @param {'intensidad'|'tolerancia'} tipo 
 * @param {string} valor 
 */
export function setCalculadoraTermicaSegment(tipo, valor) {
    if (typeof document === 'undefined') return;
    const attr = tipo === 'intensidad' ? 'data-calc-intensidad' : 'data-calc-tolerancia';
    const buttons = document.querySelectorAll(`[${attr}]`);
    buttons.forEach(btn => {
        if (btn.getAttribute(attr) === valor) {
            btn.classList.add('ps-chip-active', 'bg-sky-500/30', 'text-sky-200', 'border-sky-400', 'font-bold');
            btn.classList.remove('bg-slate-800', 'text-slate-300', 'border-slate-700');
        } else {
            btn.classList.remove('ps-chip-active', 'bg-sky-500/30', 'text-sky-200', 'border-sky-400', 'font-bold');
            btn.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
        }
    });
    actualizarVistaCalculadoraTermica();
}

if (typeof window !== 'undefined') {
    window.aplicarGlowVerdictBento = aplicarGlowVerdictBento;
    window.renderizarResumenExperto = renderizarResumenExperto;
    window.generarSvgAnilloScore = generarSvgAnilloScore;
    window.cambiarSubVistaSpot = cambiarSubVistaSpot;
    window.activarSkeletonCargaSpot = activarSkeletonCargaSpot;
    window.desactivarSkeletonCargaSpot = desactivarSkeletonCargaSpot;
    window.consultarBasico = consultarBasico;
    window.consultarPuntoProInstantaneo = consultarPuntoProInstantaneo;
    window.consultarRutaPro = consultarRutaPro;
    window.formatearTiempo = formatearTiempo;
    window.renderizarDashboardPro = renderizarDashboardPro;
    window.cargarPrevisionHorariaExacta = cargarPrevisionHorariaExacta;
    window.volverPlanificadorPro = volverPlanificadorPro;
    window.renderizarRosaVectoresMapa = renderizarRosaVectoresMapa;
    window.actualizarHudVectoresMapa = actualizarHudVectoresMapa;
    window.limpiarRosaVectoresMapa = limpiarRosaVectoresMapa;
    window.renderizarMejoresVentanas72h = renderizarMejoresVentanas72h;
    window.aplicarVentanaOptimaSpot = aplicarVentanaOptimaSpot;
    window.inicializarPildorasCalendario = inicializarPildorasCalendario;
    window.actualizarPildorasTiempoUI = actualizarPildorasTiempoUI;
    window.aplicarFiltroRapidoTiempo = aplicarFiltroRapidoTiempo;
    window.cargarSpotRapido = cargarSpotRapido;
    window.abrirCalculadoraTermica = abrirCalculadoraTermica;
    window.cerrarCalculadoraTermica = cerrarCalculadoraTermica;
    window.actualizarVistaCalculadoraTermica = actualizarVistaCalculadoraTermica;
    window.setCalculadoraTermicaSegment = setCalculadoraTermicaSegment;
}
