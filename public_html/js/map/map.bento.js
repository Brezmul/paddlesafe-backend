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
    calcularSolYCrepusculo
} from '../utils.js';
import { mapRuntime } from './map.state.js';
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
    registrarDiagnosticoClima
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
    evaluarVientoRelativoInfo
} from './map.routes.js';
import {
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
        } else {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1 ${motor.cls || ''}`;
            nivel.textContent = `${icono} ${motor.seguridad.nivel} · ${motor.seguridad.score}/100 · ${motor.recomendacion}`;
        }
    }

    if (prefijo === 'basic') {
        const scoreNum = document.getElementById('basicScoreNumber');
        if (scoreNum && motor?.seguridad?.score !== undefined) {
            scoreNum.textContent = motor.seguridad.score;
        }
        const scoreBadge = document.getElementById('basicVerdictScoreBadge');
        if (scoreBadge && motor?.seguridad?.score !== undefined) {
            const sc = motor.seguridad.score;
            if (sc >= 75) {
                scoreBadge.className = "w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/30 border border-emerald-500/50 flex flex-col items-center justify-center shrink-0 shadow-inner";
                if (scoreNum) scoreNum.className = "text-base font-black text-emerald-300 ps-tabular";
            } else if (sc >= 45) {
                scoreBadge.className = "w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/30 border border-amber-500/50 flex flex-col items-center justify-center shrink-0 shadow-inner";
                if (scoreNum) scoreNum.className = "text-base font-black text-amber-300 ps-tabular";
            } else {
                scoreBadge.className = "w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-500/30 border border-rose-500/50 flex flex-col items-center justify-center shrink-0 shadow-inner";
                if (scoreNum) scoreNum.className = "text-base font-black text-rose-300 ps-tabular";
            }
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
            // 0. Píldora de Aviso Preventivo 112 en seguimiento (si existe aviso futuro)
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

    contenedor.classList.remove('hidden');
}

export async function consultarBasico() {
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const loc = document.getElementById('location').value.trim();
    const d = document.getElementById('date').value;
    const r = document.getElementById('timeRange').value;
    const u = document.getElementById('userLevel').value;
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
            const solarTimesEl = document.getElementById('basicSolarTimes');
            if (solarTimesEl) {
                try {
                    const latVal = Number(latitudActual) || 39.5;
                    const lonVal = Number(longitudActual) || 0.0;
                    const solar = calcularSolYCrepusculo(latVal, lonVal, d || new Date().toISOString().slice(0, 10));
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
                lat: Number(latitudActual),
                lon: Number(longitudActual)
            });
            setPronosticoDiaCompletoActual(dx);
            actualizarEstadoBotonGuardarSpot();

            // Renderizar rosa de vectores tácticos y HUD
            renderizarRosaVectoresMapa(Number(latitudActual), Number(longitudActual), dx);

            // Cargar reportes en vivo de la comunidad (Waze for SUP)
            void cargarReportesSpot(Number(latitudActual), Number(longitudActual));

            if (dx.horasDiurnas && dx.horasDiurnas.length > 0) {
                renderizarTimelineJornadaCompleta(spotActivoActual, dx, u);
            }
            renderizarInteligenciaYDiarioSpot(spotActivoActual, dx);
        }
    } catch(e) { 
        res.innerHTML = `<strong>No se pudo cargar el pronóstico.</strong> ${esc(e?.message || 'Revisa tu conexión e inténtalo de nuevo.')}`;
        console.warn('Error al consultar el pronóstico básico:', e);
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
        btn.disabled = false; sp.classList.add('hidden'); bt.textContent = 'Análisis Básico Rápido';
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
        lat = mapRuntime.marcadoresRuta[0].getLatLng().lat.toFixed(5); lon = mapRuntime.marcadoresRuta[0].getLatLng().lng.toFixed(5);
    } else {
        const partes = locVal.split(','); lat = parseFloat(partes[0]); lon = parseFloat(partes[1]);
    }
    
    let duracionEstimada = 120;
    if (mapRuntime.marcadoresRuta.length >= 2) {
        let dt = 0;
        const coords = mapRuntime.marcadoresRuta.map(m => m.getLatLng());
        let rutArray = [...coords];
        if (mapRuntime.modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
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
    mapRuntime.mapRuntime.datosMeteoActuales = dx;
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
        lineasMultiPunto.forEach(l => currentMap.removeLayer(l)); lineasMultiPunto.length = 0;
        etiquetasDistancia.forEach(l => currentMap.removeLayer(l)); etiquetasDistancia.length = 0;
        
        const dirVientoGeneral = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
        const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let rutArray = [...coords];
        if (mapRuntime.modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
        
        const timeParts = horaSalida.split(':');
        const hhInicio = parseInt(timeParts[0], 10) || 0;
        const mmInicio = parseInt(timeParts[1], 10) || 0;
        let minutosTranscurridos = 0;

        for(let i = 0; i < rutArray.length - 1; i++) {
            const dSeg = rutArray[i].distanceTo(rutArray[i+1]); dt += dSeg;
            const nombreTramo = (mapRuntime.modoTravesiaActivo && rutArray.length === 3) ? (i === 0 ? "IDA 🟢" : "VUELTA 🔴") : `TRAMO ${letras[i]||i} ➔ ${letras[i+1]||(i+1)}`;
            
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
            const pline = L.polyline([rutArray[i], rutArray[i+1]], { color: iV.hexLineColor, weight: 5, className: 'ruta-animada' }).addTo(currentMap);
            lineasMultiPunto.push(pline);
            
            const midLat = (rutArray[i].lat + rutArray[i+1].lat) / 2; const midLng = (rutArray[i].lng + rutArray[i+1].lng) / 2;
            const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${(dSeg/1000).toFixed(2)} km`, iconSize: [null, null] }) }).addTo(currentMap);
            etiquetasDistancia.push(etiq);
            
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
                <div class="bg-slate-800 rounded-xl p-3 border-l-4 shadow-sm w-full relative overflow-hidden" style="border-color:${iV.hexLineColor}">
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
        document.getElementById('proTituloTramos').textContent = "Análisis por Tramos";
        document.getElementById('proDistanciaTotal').textContent = `${(dt/1000).toFixed(2)} km`;
        document.getElementById('proTiempoTotal').textContent = formatearTiempo(tt);
        
        let fechaLlegada = new Date(); fechaLlegada.setHours(hhInicio, mmInicio, 0); fechaLlegada.setMinutes(fechaLlegada.getMinutes() + Math.round(tt));
        const etaHH = fechaLlegada.getHours().toString().padStart(2, '0'); const etaMM = fechaLlegada.getMinutes().toString().padStart(2, '0');
        
        document.getElementById('proSalidaHora').textContent = horaSalida;
        document.getElementById('proLlegadaHora').textContent = `${etaHH}:${etaMM}`;
        document.getElementById('proContainerNavegacion').classList.remove('hidden'); document.getElementById('proContainerNavegacion').classList.add('flex');

        // Komoot/Windy-style Interactive SVG Route Profile Chart
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
    dx.horaSalida = horaSalida;
    const motor = obtenerMotorExperto(dx, userLvl);
    renderizarAvisoSuperior(motor);

    // Guardia astronómica de ocaso para la ruta
    const solar = calcularSolYCrepusculo(lat, lon, fechaD);
    const salidaParts = (horaSalida || '10:00').split(':');
    const hhInicioSalida = parseInt(salidaParts[0], 10) || 0;
    const mmInicioSalida = parseInt(salidaParts[1], 10) || 0;
    const inicioMin = hhInicioSalida * 60 + mmInicioSalida;
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

    // Biometría táctica SUP, hidratación mínima y checklist de embarque
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
                    <span>🎒</span> <span>Checklist Embarque</span> <span>▾</span>
                </button>
            </div>
            <div id="proChecklistDetalle" class="hidden mt-2 p-3.5 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs">
                <div class="font-bold text-slate-300 mb-2 flex items-center justify-between">
                    <span class="uppercase tracking-wider text-[10px] text-slate-400">Equipo imprescindible antes de zarpar</span>
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
    document.getElementById('proPlanificador').classList.replace('flex','hidden');
    document.getElementById('proDashboardResumen').classList.remove('hidden'); document.getElementById('proDashboardResumen').classList.add('flex');
    const isoLlamada = `${fechaD}T${horaSalida}:00`;
    cargarPrevisionHorariaExacta(lat, lon, isoLlamada, tt > 0 ? tt : 120);
    solicitarCoachIAPro(dx, userLvl, dt, tt, lat, lon, fechaD, horaSalida, tramosParaCoach, motor);
}

export async function cargarPrevisionHorariaExacta(lat, lon, startISO, durationMinutes) {
    const cont = document.getElementById('proDashHorasContainer');
    cont.innerHTML = 'Consultando radar...';
    try {
        const start = new Date(startISO);
        const end = new Date(start.getTime() + Math.max(durationMinutes, 60) * 60000);
        const horaUTC = d => d.toISOString().slice(0, 13) + ':00';
        const diaUTC = d => d.toISOString().slice(0, 10);
        const pos = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&timezone=GMT`;
        const json = r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
        const [wx, marine] = await Promise.all([
            fetchConTimeout(`https://api.open-meteo.com/v1/forecast?${pos}&hourly=windspeed_10m,windgusts_10m,precipitation_probability,uv_index&start_hour=${horaUTC(start)}&end_hour=${horaUTC(end)}`, { cache: 'no-store' }).then(json),
            fetchConTimeout(`https://marine-api.open-meteo.com/v1/marine?${pos}&hourly=wave_height&start_date=${diaUTC(start)}&end_date=${diaUTC(end)}`, { cache: 'no-store' }).then(json).catch(() => null)
        ]);
        if (!wx.hourly || !wx.hourly.time || wx.hourly.time.length === 0) throw new Error('Rango sin cobertura');
        const olas = new Map();
        if (marine && marine.hourly && marine.hourly.time) marine.hourly.time.forEach((t, i) => olas.set(t, marine.hourly.wave_height[i]));
        const num = (v, dec = 0) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(dec) : null);
        
        cont.innerHTML = wx.hourly.time.map((t, i) => {
            const horaLabel = new Date(t + 'Z').toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const wind = Number(wx.hourly.windspeed_10m[i]);
            const gust = Number(wx.hourly.windgusts_10m[i]);
            const windKt = kmhANudos(wind);
            const gustKt = kmhANudos(gust);
            const wave = num(olas.get(t), 1);
            const rain = num(wx.hourly.precipitation_probability[i]);
            const uv = num(wx.hourly.uv_index[i], 1);
            const colorViento = windKt > 20 ? 'text-red-400' : (windKt >= 12 ? 'text-yellow-400' : 'text-emerald-400');
            const colorRachas = gustKt > 20 ? 'text-red-500' : 'text-slate-300';
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
    document.getElementById('proDashboardResumen').classList.replace('flex','hidden');
    document.getElementById('proPlanificador').classList.remove('hidden');
    document.getElementById('proPlanificador').classList.add('flex');
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

    if (mapRuntime.marcadorRosaVectores && map) {
        currentMap.removeLayer(mapRuntime.marcadorRosaVectores);
        mapRuntime.marcadorRosaVectores = null;
    }

    mapRuntime.marcadorRosaVectores = L.marker([latNum, lonNum], {
        icon: iconRosa,
        interactive: false,
        zIndexOffset: 250
    }).addTo(currentMap);

    actualizarHudVectoresMapa(latNum, lonNum, datosMeteo);
}

export function actualizarHudVectoresMapa(lat, lon, datosMeteo) {
    const hud = document.getElementById('mapWindWaveHud');
    if (!hud) return;

    if (!datosMeteo) {
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

    const spotNombre = spotActivoActual?.nombre || document.getElementById('location')?.value?.trim() || 'Spot';
    const infoCosta = resolverOrientacionCostera(spotNombre, lat, lon);

    const elName = document.getElementById('hudPointName');
    if (elName) elName.textContent = spotNombre.split(',')[0];

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
        elArrow.style.transform = `rotate(${dirViento}deg)`;
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
}

if (typeof window !== 'undefined') {
    window.aplicarGlowVerdictBento = aplicarGlowVerdictBento;
    window.renderizarResumenExperto = renderizarResumenExperto;
    window.activarSkeletonCargaSpot = activarSkeletonCargaSpot;
    window.desactivarSkeletonCargaSpot = desactivarSkeletonCargaSpot;
    window.consultarBasico = consultarBasico;
    window.consultarPuntoProInstantaneo = consultarPuntoProInstantaneo;
    window.consultarRutaPro = consultarRutaPro;
    window.renderizarDashboardPro = renderizarDashboardPro;
    window.cargarPrevisionHorariaExacta = cargarPrevisionHorariaExacta;
    window.volverPlanificadorPro = volverPlanificadorPro;
    window.renderizarRosaVectoresMapa = renderizarRosaVectoresMapa;
    window.actualizarHudVectoresMapa = actualizarHudVectoresMapa;
}
