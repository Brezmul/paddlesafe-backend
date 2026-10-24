
/**
 * Calcula la zona de ritmo y eficiencia biomecánica en tiempo real (Batch #21)
 * @param {number} velActualKmh - Velocidad instantánea en km/h
 * @param {number} velCruceroEquipoKmh - Velocidad de crucero teórica según tabla/embarcación
 * @returns {Object} Zona, etiqueta, color, porcentaje y clases Tailwind
 */
export function calcularZonaRitmoLive(velActualKmh = 0, velCruceroEquipoKmh = 4.5) {
    const vel = Number(velActualKmh) || 0;
    const crucero = Number(velCruceroEquipoKmh) > 0 ? Number(velCruceroEquipoKmh) : 4.5;
    const ratio = crucero > 0 ? (vel / crucero) : 0;
    const porcentaje = Math.min(150, Math.round(ratio * 100));

    if (vel < 0.8) {
        return {
            zona: 'parado',
            etiqueta: '⏸️ Parado',
            color: '#94a3b8',
            bgClass: 'bg-slate-700/70 border-slate-600',
            textClass: 'text-slate-300',
            porcentaje: 0,
            vel,
            crucero
        };
    }
    if (vel < crucero * 0.85) {
        return {
            zona: 'suave',
            etiqueta: '🌊 Deriva / Ritmo Suave',
            color: '#38bdf8',
            bgClass: 'bg-sky-500/20 border-sky-500/50',
            textClass: 'text-sky-300',
            porcentaje,
            vel,
            crucero
        };
    }
    if (vel <= crucero * 1.25) {
        return {
            zona: 'optimo',
            etiqueta: '🟢 Crucero Óptimo',
            color: '#10b981',
            bgClass: 'bg-emerald-500/20 border-emerald-500/50',
            textClass: 'text-emerald-400',
            porcentaje,
            vel,
            crucero
        };
    }
    return {
        zona: 'sprint',
        etiqueta: '🔥 Sprint / Competición',
        color: '#f59e0b',
        bgClass: 'bg-amber-500/20 border-amber-500/50',
        textClass: 'text-amber-400',
        porcentaje,
        vel,
        crucero
    };
}

/**
 * Renderiza gráfico SVG Sparkline de splits por kilómetro (Batch #21)
 * @param {Array} splits - Lista de splits grabados
 * @returns {string} Markup SVG inline
 */
export function renderLiveSplitsSparkline(splits = []) {
    if (!splits || splits.length === 0) {
        return `<div class="text-center py-1.5 text-[10px] text-slate-400 font-mono">Completando 1er kilómetro...</div>`;
    }
    const maxVel = Math.max(6, ...splits.map(s => Number(s.velMediaKmh) || 0));
    const barWidth = Math.max(16, Math.floor(180 / Math.max(splits.length, 1)));
    const totalW = Math.max(220, splits.length * (barWidth + 6) + 20);
    
    let barsSvg = '';
    splits.forEach((s, idx) => {
        const x = 10 + idx * (barWidth + 6);
        const vel = Number(s.velMediaKmh) || 0;
        const barH = Math.min(20, Math.max(4, Math.round((vel / maxVel) * 20)));
        const y = 22 - barH;
        const color = vel >= 5.0 ? '#10b981' : (vel >= 3.5 ? '#38bdf8' : '#94a3b8');
        barsSvg += `
            <g class="cursor-pointer" title="Km ${s.km}: ${s.velMediaKmh} km/h (${s.ritmoMinKm} min/km)">
                <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="2" fill="${color}" opacity="0.9" />
                <text x="${x + barWidth / 2}" y="30" text-anchor="middle" font-size="7" fill="#94a3b8" font-family="monospace">${s.km}k</text>
            </g>
        `;
    });

    return `<svg viewBox="0 0 ${totalW} 32" class="w-full h-8 overflow-visible" preserveAspectRatio="none">
        <line x1="0" y1="22" x2="${totalW}" y2="22" stroke="#334155" stroke-width="1" />
        ${barsSvg}
    </svg>`;
}

// ==============================================================================
// PADDLESAFE NEXT-GEN - MAP GPS TRACKER & TELEMETRY MODULE (map.tracker.js)
// Strangler Fig Pattern: Extracted from map.js to modularize real-time GPS tracking,
// deadman safety check-in timer, splits telemetry, biometrics calculation,
// offline route sync, and emergency position sharing.
// ==============================================================================

import { supabaseClient, appState } from '../config.js';
import { ClubState } from '../club/state.js';
import {
    esc,
    formatearTiempo,
    calcularSolYCrepusculo
} from '../utils.js';
import { calcularXpRuta } from '../gamification.js';
import { parseGPX, generarGPX } from '../gpxParser.js';
import { mapRuntime, GPS_MIN_DISTANCIA_METROS, resetTrackingRuntime } from './map.state.js';
import { estamparPosterFinisherCanvas } from './map.poster.js';
import { valorNumericoMeteo } from './map.weather.js';

// ==============================================================================
// RUNTIME STATE & LIVE BINDING SYNCHRONIZATION
// ==============================================================================

export let isTracking = false;
export let trackDistanceKm = 0;
export let trackCoords = [];
export let wakeLockSentinel = null;
export let checkinDuracionMinutos = 90;
export let checkinTimestampLimite = null;
export let checkinAlertaActiva = false;
export let splitsKm = [];
export let modoSolTrackerActivo = false;
export let isSavingRoute = false;
export let isSyncingPendingRoute = false;

export function syncTrackerState() {
    isTracking = mapRuntime.isTracking;
    trackDistanceKm = mapRuntime.trackDistanceKm;
    trackCoords = mapRuntime.trackCoords;
    wakeLockSentinel = mapRuntime.wakeLockSentinel;
    checkinDuracionMinutos = mapRuntime.checkinDuracionMinutos;
    checkinTimestampLimite = mapRuntime.checkinTimestampLimite;
    checkinAlertaActiva = mapRuntime.checkinAlertaActiva;
    splitsKm = mapRuntime.splitsKm;
    modoSolTrackerActivo = mapRuntime.modoSolTrackerActivo;
    isSavingRoute = mapRuntime.isSavingRoute;
    isSyncingPendingRoute = mapRuntime.isSyncingPendingRoute;

    if (typeof window !== 'undefined') {
        window.isTracking = isTracking;
        window.trackDistanceKm = trackDistanceKm;
        window.trackCoords = trackCoords;
        window.splitsKm = splitsKm;
    }
}

// ==============================================================================
// 1. WAKELOCK (PREVENCIÓN DE BLOQUEO DE PANTALLA EN TRAVESÍA)
// ==============================================================================

export async function activarWakeLock() {
    try {
        if ('wakeLock' in navigator && !mapRuntime.wakeLockSentinel) {
            mapRuntime.wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel = mapRuntime.wakeLockSentinel;
            mapRuntime.wakeLockSentinel.addEventListener('release', () => {
                mapRuntime.wakeLockSentinel = null;
                wakeLockSentinel = null;
            });
        }
    } catch (err) {
        console.warn('Aviso no crítico al solicitar Screen WakeLock:', err);
    }
}

export async function liberarWakeLock() {
    try {
        if (mapRuntime.wakeLockSentinel) {
            await mapRuntime.wakeLockSentinel.release();
            mapRuntime.wakeLockSentinel = null;
            wakeLockSentinel = null;
        }
    } catch (err) {
        console.warn('Aviso no crítico al liberar Screen WakeLock:', err);
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', async () => {
        if (mapRuntime.isTracking && document.visibilityState === 'visible') {
            await activarWakeLock();
        }
    });
}

// ==============================================================================
// 2. NORMALIZACIÓN Y OPTIMIZACIÓN DE COORDENADAS GPS
// ==============================================================================

export function normalizarYLimitarRutaGPS(coords, maxPuntos = 2000, maxBytes = 900 * 1024) {
    if (!Array.isArray(coords) || coords.length === 0) return [];

    let puntos = coords
        .filter(pt => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])))
        .map(pt => [
            Number(Number(pt[0]).toFixed(6)),
            Number(Number(pt[1]).toFixed(6))
        ]);

    if (puntos.length <= 2) return puntos;

    if (puntos.length > maxPuntos) {
        const resultado = [puntos[0]];
        const paso = (puntos.length - 1) / (maxPuntos - 1);
        for (let i = 1; i < maxPuntos - 1; i++) {
            resultado.push(puntos[Math.round(i * paso)]);
        }
        resultado.push(puntos[puntos.length - 1]);
        puntos = resultado;
    }

    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    let serialized = JSON.stringify(puntos);
    let byteLength = encoder ? encoder.encode(serialized).byteLength : serialized.length;

    while (byteLength >= maxBytes && puntos.length > 2) {
        const nuevoLimite = Math.max(2, Math.floor(puntos.length * 0.8));
        const resultado = [puntos[0]];
        const paso = (puntos.length - 1) / (nuevoLimite - 1);
        for (let i = 1; i < nuevoLimite - 1; i++) {
            resultado.push(puntos[Math.round(i * paso)]);
        }
        resultado.push(puntos[puntos.length - 1]);
        puntos = resultado;
        serialized = JSON.stringify(puntos);
        byteLength = encoder ? encoder.encode(serialized).byteLength : serialized.length;
    }

    return puntos;
}

// ==============================================================================
// 3. BIOMETRÍA SUP, HIDRATACIÓN Y GASTO CALÓRICO (METs)
// ==============================================================================

export function calcularBiometriaSup({ duracionMin = 0, distKm = 0, velKmh = 0, vientoKt = 0, olasM = 0, periodoS = 0, tempC = 20, tipoTabla = 'all-round' } = {}) {
    let met = 6.0;
    if (vientoKt >= 11) met += 1.5;
    if (olasM >= 0.4 || (periodoS > 0 && periodoS <= 5)) met += 1.2;
    const t = String(tipoTabla || '').toLowerCase();
    if ((t.includes('all-round') || t.includes('allround') || t.includes('hinchable') || t.includes('inflatable') || t.includes('inflat')) && velKmh > 4.0) {
        met += 0.8;
    }
    met = Math.min(11.0, met);
    const horas = (Number(duracionMin) || 0) / 60;
    const kcal = Math.max(0, Math.round(met * 75 * horas));

    let mlHora = 500;
    if (tempC >= 25) mlHora += 250;
    if (vientoKt >= 12) mlHora += 200;
    const mlTotal = Math.max(250, Math.round(horas * mlHora));
    const litros = (mlTotal / 1000).toFixed(1);

    return {
        met: Number(met.toFixed(1)),
        kcal,
        mlTotal,
        hidratacionMl: mlTotal,
        litros,
        mlHora
    };
}
if (typeof window !== 'undefined') {
    window.calcularBiometriaSup = calcularBiometriaSup;
}

// ==============================================================================
// 4. SHARED DEDUPLICATION HELPER: CONSTRUIR PAYLOAD RUTA SUPABASE
// ==============================================================================

export function construirPayloadRutaSupabase({
    userId,
    distanciaKm,
    tiempoMinutos,
    coords,
    imagenUrl = null,
    ubicacion = null,
    pointsEarned = 0,
    splitsData = [],
    vientoKt = null,
    rachasKt = null,
    dirViento = null,
    olasM = null,
    periodoS = null,
    conditionsScore = null,
    weatherSnapshot = null
}) {
    const normCoords = normalizarYLimitarRutaGPS(coords);
    let ubi = ubicacion;
    if (!ubi) {
        ubi = "Travesía GPS";
        if (vientoKt !== null && vientoKt !== undefined) {
            ubi += ` · 💨 ${vientoKt} kt`;
            if (olasM !== null && olasM !== undefined) {
                ubi += ` · 🌊 ${olasM}m`;
            }
        }
    }

    const meteoSnap = weatherSnapshot || {
        vientoKt: vientoKt ?? null,
        rachasKt: rachasKt ?? null,
        dirViento: dirViento ?? null,
        olasM: olasM ?? null,
        periodoS: periodoS ?? null,
        score: conditionsScore ?? null
    };

    return {
        user_id: userId,
        distancia_km: Number(Number(distanciaKm || 0).toFixed(2)),
        tiempo_minutos: Number(tiempoMinutos || 0),
        ruta_json: normCoords,
        imagen_url: imagenUrl,
        ubicacion: ubi,
        points_earned: Number(pointsEarned || 0),
        splits_data: Array.isArray(splitsData) ? splitsData : [],
        wind_speed_kt: vientoKt !== null && vientoKt !== undefined ? Number(vientoKt) : null,
        wind_gust_kt: rachasKt !== null && rachasKt !== undefined ? Number(rachasKt) : null,
        wind_direction_deg: dirViento !== null && dirViento !== undefined ? Number(dirViento) : null,
        wave_height_m: olasM !== null && olasM !== undefined ? Number(olasM) : null,
        wave_period_s: periodoS !== null && periodoS !== undefined ? Number(periodoS) : null,
        conditions_score: conditionsScore ?? meteoSnap.score ?? null,
        weather_snapshot: meteoSnap
    };
}

// ==============================================================================
// 5. MODO TRAVESÍA A-B (MAPA)
// ==============================================================================

export function toggleModoTravesia() {
    if (mapRuntime.radarActivo && typeof window.desactivarModoRadar === 'function') {
        window.desactivarModoRadar();
    }
    if (mapRuntime.modoRutaLibreActivo && typeof window.toggleRutaLibre === 'function') {
        window.toggleRutaLibre();
    }
    // Desactivar y limpiar explícitamente Quedada Club si estaba activa
    if (mapRuntime.modoQuedadaClubActivo) {
        mapRuntime.modoQuedadaClubActivo = false;
        mapRuntime.clubParaEvento = null;
        const btnQuedada = document.getElementById('btnQuedadaClub');
        if (btnQuedada) btnQuedada.innerHTML = "⛵ Quedada Club";
    }
    const panelQuedada = document.getElementById('panelQuedadaMap');
    const formQuedada = document.getElementById('quedadaFormPanel');
    const toolbar = document.getElementById('multipuntoToolbar');
    if (panelQuedada) panelQuedada.classList.add('hidden');
    if (formQuedada) formQuedada.classList.add('hidden');
    if (toolbar) toolbar.classList.replace('flex', 'hidden');

    mapRuntime.modoTravesiaActivo = !mapRuntime.modoTravesiaActivo;
    const b = document.getElementById('btnTravesia');
    const msg = document.getElementById('mapMsg');
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);

    if (mapRuntime.modoTravesiaActivo) {
        if (b) {
            b.classList.replace('bg-teal-500', 'bg-red-500');
            b.classList.replace('hover:bg-teal-400', 'hover:bg-red-400');
            b.innerHTML = "❌ Cancelar (A-B)";
        }
        if (msg) msg.textContent = "📍 Toca el PUNTO A (Salida)";
        if (mapRuntime.marcador && currentMap) currentMap.removeLayer(mapRuntime.marcador);
        if (typeof window.limpiarRuta === 'function') window.limpiarRuta();
    } else {
        if (b) {
            b.classList.replace('bg-red-500', 'bg-teal-500');
            b.classList.replace('hover:bg-red-400', 'hover:bg-teal-400');
            b.innerHTML = "🗺️ Trazar (A ➔ B)";
        }
        if (msg) msg.textContent = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
        if (typeof window.limpiarRuta === 'function') window.limpiarRuta();
        if (currentMap && typeof L !== 'undefined') {
            mapRuntime.marcador = L.marker([mapRuntime.latitudActual, mapRuntime.longitudActual]).addTo(currentMap);
            if (typeof window !== 'undefined') window.marcador = mapRuntime.marcador;
        }
    }
}

// ==============================================================================
// 6. AYUDAS EN VIVO: MODO SOL, RETORNO A SALIDA & COMPARTIR POSICIÓN
// ==============================================================================

export function toggleModoSolTracker() {
    mapRuntime.modoSolTrackerActivo = !mapRuntime.modoSolTrackerActivo;
    modoSolTrackerActivo = mapRuntime.modoSolTrackerActivo;
    const panel = document.getElementById('liveTrackingPanel');
    if (!panel) return;

    if (!document.getElementById('paddlesafe-modo-sol-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'paddlesafe-modo-sol-style';
        styleEl.textContent = `
            #liveTrackingPanel.modo-sol-activo,
            .modo-sol-activo {
                background-color: #000000 !important;
                color: #ffffff !important;
                border: 2px solid #38bdf8 !important;
                box-shadow: 0 0 0 3px #000000, 0 10px 30px rgba(0, 0, 0, 0.95) !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-hud-card,
            #liveTrackingPanel.modo-sol-activo .live-hud-return,
            #liveTrackingPanel.modo-sol-activo .live-hud-splits,
            #liveTrackingPanel.modo-sol-activo #livePaceZoneBar {
                background-color: #000000 !important;
                border: 2px solid #ffffff !important;
                color: #ffffff !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-hud-label,
            #liveTrackingPanel.modo-sol-activo .live-hud-status {
                color: #38bdf8 !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveTime,
            #liveTrackingPanel.modo-sol-activo #trackerTime {
                color: #38bdf8 !important;
                font-weight: 900 !important;
                text-shadow: 0 0 8px rgba(56, 189, 248, 0.6) !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveSpeed,
            #liveTrackingPanel.modo-sol-activo #trackerSpeed {
                color: #00ffff !important;
                font-weight: 900 !important;
                text-shadow: 0 0 10px rgba(0, 255, 255, 0.7) !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveDist,
            #liveTrackingPanel.modo-sol-activo #trackerDist {
                color: #ffffff !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveReturnDist,
            #liveTrackingPanel.modo-sol-activo #liveReturnBearing,
            #liveTrackingPanel.modo-sol-activo #liveRtlHud {
                color: #00ffff !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveReturnEta {
                color: #34d399 !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-btn-tool {
                background-color: #000000 !important;
                color: #ffffff !important;
                border: 2px solid #ffffff !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-btn-finish {
                background-color: #dc2626 !important;
                color: #ffffff !important;
                border: 2px solid #ffffff !important;
                font-weight: 900 !important;
            }
        `;
        document.head.appendChild(styleEl);
    }

    if (mapRuntime.modoSolTrackerActivo) {
        panel.classList.add('modo-sol-activo');
    } else {
        panel.classList.remove('modo-sol-activo');
    }
}

export async function compartirPosicionActualLive() {
    if (!mapRuntime.trackCoords || mapRuntime.trackCoords.length === 0) {
        alert("Aún no se ha registrado ninguna coordenada GPS válida.");
        return;
    }
    const ultimaCoord = mapRuntime.trackCoords[mapRuntime.trackCoords.length - 1];
    const lat = Number(ultimaCoord[0]).toFixed(5);
    const lon = Number(ultimaCoord[1]).toFixed(5);

    const timeEl = document.getElementById('liveTime');
    const tiempoStr = timeEl ? timeEl.textContent : "00:00";
    const distStr = `${mapRuntime.trackDistanceKm.toFixed(2)} km`;

    const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
    const textoMensaje = `🏄‍♂️ Travesía SUP en curso (PaddleSafe). Mi posición actual: ${mapsUrl} | Distancia: ${distStr} | Tiempo: ${tiempoStr}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
        try {
            await navigator.share({
                title: 'Mi Posición SUP en Vivo - PaddleSafe',
                text: textoMensaje,
                url: mapsUrl
            });
            return;
        } catch (errShare) {
            if (errShare.name === 'AbortError') return;
            console.warn('Fallback tras navigator.share:', errShare);
        }
    }

    const urlWa = `https://wa.me/?text=${encodeURIComponent(textoMensaje)}`;
    if (typeof window !== 'undefined') window.open(urlWa, '_blank', 'noopener,noreferrer');
}
export const compartirPosicionSOS = compartirPosicionActualLive;

export function actualizarRetornoSalidaLive(latActual, lonActual) {
    if (!mapRuntime.trackCoords || mapRuntime.trackCoords.length === 0 || typeof L === 'undefined') return;
    const pSalida = mapRuntime.trackCoords[0];
    const lat0 = pSalida[0];
    const lon0 = pSalida[1];

    const distMetros = L.latLng(latActual, lonActual).distanceTo(L.latLng(lat0, lon0));
    const distKm = distMetros / 1000;

    const lat1Rad = latActual * Math.PI / 180;
    const lon1Rad = lonActual * Math.PI / 180;
    const lat2Rad = lat0 * Math.PI / 180;
    const lon2Rad = lon0 * Math.PI / 180;
    const y = Math.sin(lon2Rad - lon1Rad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lon2Rad - lon1Rad);
    const rumboVuelta = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);

    const dirsCard = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    const cardinalVuelta = dirsCard[Math.round(((rumboVuelta % 360) + 360) % 360 / 45) % 8];

    const dirVientoActual = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windDirection, mapRuntime.datosMeteoActuales?.wind_direction);
    const infoVientoVuelta = (typeof window !== 'undefined' && typeof window.evaluarVientoRelativoInfo === 'function')
        ? window.evaluarVientoRelativoInfo(rumboVuelta, dirVientoActual)
        : { modVelocidad: 0, icon: '💨', texto: '--', claseColor: 'bg-slate-900' };

    const velCrucero = (typeof window !== 'undefined' && typeof window.obtenerVelocidadCruceroUsuario === 'function')
        ? window.obtenerVelocidadCruceroUsuario()
        : 4.5;
    const velEstimada = Math.max(1.5, velCrucero + (infoVientoVuelta.modVelocidad || 0));
    const tiempoVueltaMin = Math.round((distKm / velEstimada) * 60);

    const elDist = document.getElementById('liveReturnDist');
    if (elDist) elDist.textContent = `${distKm.toFixed(2)} km`;
    const elBearing = document.getElementById('liveReturnBearing');
    if (elBearing) elBearing.textContent = `🧭 ${rumboVuelta}° (${cardinalVuelta})`;
    const elRtl = document.getElementById('liveRtlHud');
    if (elRtl) elRtl.textContent = `${rumboVuelta}° ${cardinalVuelta}`;
    const elEta = document.getElementById('liveReturnEta');
    if (elEta) elEta.textContent = `ETA: ${tiempoVueltaMin} min`;
    const elWind = document.getElementById('liveReturnWind');
    if (elWind) {
        elWind.textContent = `${infoVientoVuelta.icon} ${infoVientoVuelta.texto}`;
        elWind.className = `font-bold text-[9px] px-1.5 py-0.5 rounded ${infoVientoVuelta.claseColor}`;
    }

    const fechaHoy = new Date().toISOString().slice(0, 10);
    const solarLive = calcularSolYCrepusculo(latActual, lonActual, fechaHoy);
    const nowLive = new Date();
    const ahoraMin = nowLive.getHours() * 60 + nowLive.getMinutes();
    const minHastaOcaso = solarLive.sunsetMin - ahoraMin;
    const elSunset = document.getElementById('liveSunsetCountdown');
    if (elSunset) {
        if (minHastaOcaso <= 45 && minHastaOcaso > 0) {
            elSunset.textContent = `🌇 Luz restante: ${minHastaOcaso} min`;
            elSunset.classList.remove('hidden');
        } else if (minHastaOcaso <= 0) {
            elSunset.textContent = `🌙 Post-ocaso (+${Math.abs(minHastaOcaso)}m)`;
            elSunset.classList.remove('hidden');
        } else {
            elSunset.classList.add('hidden');
        }
    }
}

// ==============================================================================
// 7. PROTOCOLO DE SEGURIDAD DEADMAN & CHECK-IN
// ==============================================================================

export function actualizarDuracionCheckin(minutos) {
    mapRuntime.checkinDuracionMinutos = Number(minutos) || 90;
    checkinDuracionMinutos = mapRuntime.checkinDuracionMinutos;
    mapRuntime.checkinTimestampLimite = Date.now() + (checkinDuracionMinutos * 60 * 1000);
    checkinTimestampLimite = mapRuntime.checkinTimestampLimite;
    mapRuntime.checkinAlertaActiva = false;
    checkinAlertaActiva = false;
    verificarAlertaCheckin();
}

export function extenderCheckinTravesia(minutos = 30) {
    if (!mapRuntime.checkinTimestampLimite) mapRuntime.checkinTimestampLimite = Date.now();
    const base = Math.max(Date.now(), mapRuntime.checkinTimestampLimite);
    mapRuntime.checkinTimestampLimite = base + (Number(minutos) * 60 * 1000);
    checkinTimestampLimite = mapRuntime.checkinTimestampLimite;
    mapRuntime.checkinAlertaActiva = false;
    checkinAlertaActiva = false;
    verificarAlertaCheckin();
}

export function enviarAlertaCheckinWhatsApp() {
    const telInput = document.getElementById('inputCheckinEmergencyPhone');
    const tel = (telInput ? telInput.value.trim() : '') || (typeof localStorage !== 'undefined' ? localStorage.getItem('ps_emergency_phone') : '') || '';

    let lat = null, lon = null;
    if (mapRuntime.trackCoords && mapRuntime.trackCoords.length > 0) {
        const last = mapRuntime.trackCoords[mapRuntime.trackCoords.length - 1];
        lat = Number(last[0]).toFixed(5);
        lon = Number(last[1]).toFixed(5);
    } else if (mapRuntime.ultimoPuntoCrudoGPS) {
        lat = Number(mapRuntime.ultimoPuntoCrudoGPS[0]).toFixed(5);
        lon = Number(mapRuntime.ultimoPuntoCrudoGPS[1]).toFixed(5);
    }

    const timeEl = document.getElementById('liveTime');
    const tiempoStr = timeEl ? timeEl.textContent : "00:00";
    const distStr = `${mapRuntime.trackDistanceKm.toFixed(2)} km`;
    const locUrl = (lat && lon) ? `https://maps.google.com/?q=${lat},${lon}` : '(Sin GPS fijado)';

    const texto = `🚨 ALERTA PADDLESAFE (Check-in de Seguridad)\nNo he confirmado mi retorno a tiempo o necesito asistencia en el agua.\n📍 Ubicación GPS: ${locUrl}\n📏 Distancia recorrida: ${distStr}\n⏱️ Tiempo en el agua: ${tiempoStr}\nPor favor intenta contactarme o avisa a Salvamento Marítimo si no respondo.`;

    const cleanTel = tel.replace(/[^0-9]/g, '');
    const waUrl = cleanTel ? `https://wa.me/${cleanTel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    if (typeof window !== 'undefined') window.open(waUrl, '_blank', 'noopener,noreferrer');
}

export function verificarAlertaCheckin() {
    if (!mapRuntime.isTracking || !mapRuntime.checkinTimestampLimite) return;
    const ahora = Date.now();
    const diffMs = mapRuntime.checkinTimestampLimite - ahora;
    const barEl = document.getElementById('liveSafetyCheckinBar');
    const countdownEl = document.getElementById('liveEtaCountdown');

    if (diffMs <= 0) {
        const overdueSec = Math.abs(Math.floor(diffMs / 1000));
        const overdueMin = Math.floor(overdueSec / 60);
        const overdueRestSec = overdueSec % 60;
        const overdueStr = `+${overdueMin.toString().padStart(2, '0')}:${overdueRestSec.toString().padStart(2, '0')}`;

        if (countdownEl) {
            countdownEl.textContent = `🚨 VENCIDO (${overdueStr})`;
            countdownEl.className = 'font-mono text-red-400 font-black animate-pulse';
        }
        if (barEl) {
            barEl.className = 'bg-rose-950/90 rounded-xl p-2.5 mb-2.5 border-2 border-rose-500 shadow-lg shadow-rose-950/50 w-full text-xs transition-colors animate-pulse';
        }

        if (!mapRuntime.checkinAlertaActiva) {
            mapRuntime.checkinAlertaActiva = true;
            checkinAlertaActiva = true;
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([500, 200, 500, 200, 1000]);
            }
        }
    } else {
        const totalSec = Math.floor(diffMs / 1000);
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        const timeStr = hrs > 0 
            ? `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const advertenciaDiezMin = diffMs <= 10 * 60 * 1000;

        if (countdownEl) {
            countdownEl.textContent = advertenciaDiezMin ? `⚠️ ${timeStr}` : timeStr;
            countdownEl.className = advertenciaDiezMin 
                ? 'font-mono text-amber-300 font-black animate-pulse' 
                : 'font-mono text-emerald-400 font-black';
        }

        if (barEl) {
            if (advertenciaDiezMin) {
                barEl.className = 'bg-amber-950/80 rounded-xl p-2.5 mb-2.5 border-2 border-amber-500 shadow-md w-full text-xs transition-colors';
                if (!mapRuntime.checkinAlertaActiva) {
                    mapRuntime.checkinAlertaActiva = true;
                    checkinAlertaActiva = true;
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                        navigator.vibrate([400, 200, 400]);
                    }
                }
            } else {
                barEl.className = 'bg-slate-900/90 rounded-xl p-2.5 mb-2.5 border border-slate-700/80 w-full text-xs transition-colors';
                mapRuntime.checkinAlertaActiva = false;
                checkinAlertaActiva = false;
            }
        }
    }
}

// ==============================================================================
// 8. TELEMETRÍA SPLITS KM A KM
// ==============================================================================

export function mostrarModalSplitsKm(rutaId) {
    let telemetria = null;
    const ruta = (typeof window !== 'undefined' && window.socialRoutesCache && window.socialRoutesCache[String(rutaId)]) 
        || (typeof window !== 'undefined' && window.__rutasUsuarioCache && window.__rutasUsuarioCache.get(String(rutaId))) 
        || null;

    try {
        if (rutaId && rutaId !== 'last' && typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem('ps_telemetry_' + rutaId);
            if (raw) telemetria = JSON.parse(raw);
        }
        if (!telemetria && ruta?.splits_data) {
            const parsed = typeof ruta.splits_data === 'string' ? JSON.parse(ruta.splits_data) : ruta.splits_data;
            if (Array.isArray(parsed) && parsed.length > 0) {
                telemetria = { splits: parsed };
            } else if (parsed && Array.isArray(parsed.splits) && parsed.splits.length > 0) {
                telemetria = parsed;
            }
        }
        if (!telemetria && ruta) {
            let coords = ruta.route_coordinates || ruta.coordinates || ruta.ruta_json;
            if (typeof coords === 'string') {
                try { coords = JSON.parse(coords); } catch (_) { coords = null; }
            }
            if (Array.isArray(coords) && coords.length >= 2) {
                const normCoords = coords.map(pt => Array.isArray(pt) ? { lat: Number(pt[0]), lon: Number(pt[1]) } : { lat: Number(pt.lat), lon: Number(pt.lon ?? pt.lng) }).filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lon));
                if (normCoords.length >= 2) {
                    try {
                        const xml = generarGPX(normCoords);
                        const parsed = parseGPX(xml);
                        if (parsed && Array.isArray(parsed.splits) && parsed.splits.length > 0) {
                            telemetria = {
                                splits: parsed.splits.map(s => ({
                                    km: s.km,
                                    tiempoSeg: s.duration_seconds || 0,
                                    ritmoMinKm: s.duration_seconds && s.distance_km ? ((s.duration_seconds / 60) / s.distance_km).toFixed(2) : '--',
                                    velMediaKmh: s.avg_speed_kmh || (s.duration_seconds ? (s.distance_km / (s.duration_seconds / 3600)).toFixed(1) : '--'),
                                    distanciaKm: s.distance_km
                                }))
                            };
                        }
                    } catch (_) {}
                }
            }
        }
        if (!telemetria && typeof localStorage !== 'undefined') {
            const rawLast = localStorage.getItem('ps_telemetry_last');
            if (rawLast) telemetria = JSON.parse(rawLast);
        }
    } catch (e) {
        console.warn('Error al cargar splits:', e);
    }

    if (!telemetria || !Array.isArray(telemetria.splits) || telemetria.splits.length === 0) {
        alert("No hay registros de splits km a km para esta travesía.");
        return;
    }

    const modalPrevio = document.getElementById('modalSplitsKm');
    if (modalPrevio) modalPrevio.remove();

    const boardNames = {
        inflat_allround: 'Hinchable Allround',
        inflat_touring: 'Hinchable Touring',
        rigid_touring: 'Rígida Touring',
        rigid_race: 'Rígida Race'
    };
    const boardLabel = boardNames[telemetria.boardType] || telemetria.boardType || 'Tabla SUP';

    const filasHtml = telemetria.splits.map(s => {
        const tSec = s.tiempoSeg || s.duration_seconds || 0;
        const mins = Math.floor(tSec / 60);
        const secs = tSec % 60;
        const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        const kmLabel = s.esFinal ? `${s.km} km (Tramo ${s.distanciaKm || s.distance_km}k)` : `Km ${s.km}`;
        const ritmoStr = s.ritmoMinKm || (s.distance_km && tSec ? ((tSec / 60) / s.distance_km).toFixed(2) : '--');
        const velStr = s.velMediaKmh || s.avg_speed_kmh || (s.distance_km && tSec ? (s.distance_km / (tSec / 3600)).toFixed(1) : '--');
        return `
            <tr class="border-b border-slate-700/60 hover:bg-slate-800/50">
                <td class="py-2 px-3 font-bold text-white">${kmLabel}</td>
                <td class="py-2 px-3 font-mono text-emerald-400 font-bold">${durStr}</td>
                <td class="py-2 px-3 font-mono text-slate-300">${ritmoStr} min/km</td>
                <td class="py-2 px-3 font-mono font-bold text-amber-400">${velStr} km/h</td>
            </tr>
        `;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'modalSplitsKm';
    modal.className = 'fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-slate-900 border border-sky-500/40 rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                <div class="flex items-center gap-2">
                    <span class="text-xl">⚡</span>
                    <h3 class="font-black text-white text-sm uppercase tracking-wider">Splits y Rendimiento por Km</h3>
                </div>
                <button type="button" onclick="document.getElementById('modalSplitsKm').remove()" class="text-slate-400 hover:text-white font-bold text-lg p-1 cursor-pointer">&times;</button>
            </div>
            <div class="text-[11px] text-slate-300 flex items-center justify-between bg-slate-800/70 p-2 rounded-xl">
                <span>🏄‍♂️ <b>Equipo:</b> ${esc(boardLabel)}</span>
                ${telemetria.meteo?.vientoKt ? `<span>💨 <b>Viento:</b> ${telemetria.meteo.vientoKt} kt</span>` : ''}
            </div>
            <div class="overflow-x-auto max-h-60 rounded-xl border border-slate-800">
                <table class="w-full text-left text-xs text-slate-300">
                    <thead class="bg-slate-800/90 text-[10px] text-slate-400 uppercase tracking-wider">
                        <tr>
                            <th class="py-2 px-3">Km</th>
                            <th class="py-2 px-3">Tiempo</th>
                            <th class="py-2 px-3">Ritmo</th>
                            <th class="py-2 px-3">Vel Med</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>
            </div>
            <button type="button" onclick="document.getElementById('modalSplitsKm').remove()" class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer">
                Cerrar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

export function cerrarModalSplitsKm() {
    const modal = document.getElementById('modalSplitsKm');
    if (modal) modal.remove();
}

// ==============================================================================
// 9. CORE GPS TRACKING: INICIAR, GRABAR Y FINALIZAR TRAVESÍA
// ==============================================================================

export async function iniciarTravesia() {
    if (!appState.sesionActual && !appState.esInvitado) return alert("Inicia sesión.");
    if (typeof navigator === 'undefined' || !navigator.geolocation) return alert("Sin GPS.");

    await activarWakeLock();

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (mapRuntime.livePolyline && currentMap) {
        currentMap.removeLayer(mapRuntime.livePolyline);
        mapRuntime.livePolyline = null;
    }
    if (mapRuntime.cronometroInterval) {
        clearInterval(mapRuntime.cronometroInterval);
        mapRuntime.cronometroInterval = null;
    }
    if (mapRuntime.watchId) {
        navigator.geolocation.clearWatch(mapRuntime.watchId);
        mapRuntime.watchId = null;
    }

    mapRuntime.isTracking = true;
    isTracking = true;
    if (typeof window !== 'undefined') {
        window.isTracking = true;
        window.actualizarMiEstadoPresencia?.('in_water');
    }

    mapRuntime.trackDistanceKm = 0;
    mapRuntime.trackCoords = [];
    mapRuntime.ultimoPuntoCrudoGPS = null;
    mapRuntime.lastPositionGPS = null;
    mapRuntime.lastTimestampGPS = null;
    mapRuntime.trackStartTime = new Date();
    mapRuntime.splitsKm = [];
    mapRuntime.lastSplitKmDist = 0;
    mapRuntime.lastSplitTimestamp = Date.now();
    mapRuntime.checkinAlertaActiva = false;
    mapRuntime.checkinTimestampLimite = Date.now() + (mapRuntime.checkinDuracionMinutos * 60 * 1000);
    syncTrackerState();

    const telGuardado = (typeof localStorage !== 'undefined' ? localStorage.getItem('ps_emergency_phone') : '') || '';
    const p = document.getElementById('liveTrackingPanel');
    if (p) {
        p.innerHTML = `
            <div class="flex justify-between items-center mb-2.5 w-full">
                <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-black text-rose-500 animate-pulse uppercase tracking-widest live-hud-status flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping"></span>
                        🔴 REC GPS
                    </span>
                    <button type="button" onclick="window.toggleModoSolTracker()" title="Modo Alto Contraste Solar" class="px-2.5 py-1 text-[10px] font-black rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 active:scale-95 cursor-pointer live-btn-tool">☀️ Sol</button>
                    <button type="button" onclick="window.compartirPosicionActualLive()" title="Compartir posición de emergencia" class="px-2.5 py-1 text-[10px] font-black rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-300 border border-rose-700/60 active:scale-95 cursor-pointer live-btn-tool">🆘 Posición</button>
                </div>
                <div class="text-right">
                    <p class="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Tiempo</p>
                    <span id="liveTime" class="font-mono text-2xl sm:text-3xl font-black text-emerald-400 ps-tabular tracking-tight live-hud-time">00:00:00</span>
                    <span id="trackerTime" class="hidden">00:00:00</span>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center mb-2 w-full">
                <div class="bg-slate-800/90 rounded-xl p-2.5 border border-slate-700/60 live-hud-card">
                    <p class="text-[9px] text-slate-400 uppercase tracking-widest font-bold live-hud-label">VELOCIDAD</p>
                    <p id="liveSpeed" class="font-black text-2xl sm:text-3xl text-cyan-400 font-mono ps-tabular live-hud-val">0.0 <span class="text-xs text-slate-400 font-sans font-normal">km/h</span></p>
                    <span id="trackerSpeed" class="hidden">0.0</span>
                </div>
                <div class="bg-slate-800/90 rounded-xl p-2.5 border border-slate-700/60 live-hud-card">
                    <p class="text-[9px] text-slate-400 uppercase tracking-widest font-bold live-hud-label">DISTANCIA</p>
                    <p id="liveDist" class="font-black text-2xl sm:text-3xl text-white font-mono ps-tabular live-hud-val">0.00 <span class="text-xs text-slate-400 font-sans font-normal">km</span></p>
                    <span id="trackerDist" class="hidden">0.00</span>
                </div>
            </div>
            <div id="livePaceZoneBar" class="w-full bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/60 mb-2 transition-all">
                <div class="flex items-center justify-between text-[11px] font-bold mb-1.5">
                    <span class="text-slate-400">Eficiencia / Ritmo:</span>
                    <span id="livePaceZoneBadge" class="px-2 py-0.5 rounded text-[10px] font-black bg-slate-700/70 text-slate-300">⏸️ Parado</span>
                </div>
                <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-700/70">
                    <div id="livePaceZoneProgress" class="h-full bg-slate-500 rounded-full transition-all duration-500" style="width: 0%"></div>
                </div>
            </div>
            <div id="liveReturnInfo" class="bg-slate-800/90 rounded-xl p-2.5 mb-2 border border-slate-700/60 w-full text-center text-xs live-hud-return">
                <div class="flex justify-between items-center text-[10px] text-slate-300 mb-1">
                    <span class="font-bold flex items-center gap-1">🧭 Retorno a Salida:</span>
                    <div class="flex items-center gap-1.5">
                        <span id="liveSunsetCountdown" class="hidden font-mono text-orange-400 font-bold animate-pulse text-[10px]">🌇 Luz: -- min</span>
                        <span id="liveReturnDist" class="font-mono font-black text-white ps-tabular">0.00 km</span>
                    </div>
                </div>
                <div class="flex justify-between items-center text-[10px] gap-1">
                    <span id="liveReturnBearing" class="font-mono text-amber-300">Rumbo: --° (--)</span>
                    <span id="liveRtlHud" class="font-mono font-black text-cyan-300 ps-tabular">--° --</span>
                    <span id="liveReturnEta" class="font-mono text-emerald-400 ps-tabular">ETA: -- min</span>
                    <span id="liveReturnWind" class="font-bold text-[9px] px-1.5 py-0.5 rounded bg-slate-900">💨 --</span>
                </div>
            </div>
            <div class="bg-slate-800/80 rounded-xl p-2 border border-slate-700/60 mb-2 live-hud-splits">
                <div class="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
                    <span>📊 Splits por Kilómetro</span>
                    <span id="liveSplitsCount" class="text-sky-400 font-mono">0 km</span>
                </div>
                <div id="liveSplitsSparkline" class="w-full overflow-x-auto">
                    ${renderLiveSplitsSparkline(mapRuntime.splitsKm)}
                </div>
            </div>
            <div id="liveSafetyCheckinBar" class="bg-slate-900/90 rounded-xl p-2.5 mb-2.5 border border-slate-700/80 w-full text-xs transition-colors">
                <div class="flex justify-between items-center mb-1.5">
                    <div class="flex items-center gap-1.5 font-bold text-[11px] text-slate-200">
                        <span class="text-amber-400">⏱️ Check-in:</span>
                        <span id="liveEtaCountdown" class="font-mono text-emerald-400 font-black ps-tabular">--:--</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <select id="selectCheckinDuracion" onchange="window.actualizarDuracionCheckin(this.value)" class="bg-slate-800 text-[10px] text-slate-200 border border-slate-700 rounded px-1 py-0.5 font-bold cursor-pointer">
                            <option value="60" ${mapRuntime.checkinDuracionMinutos === 60 ? 'selected' : ''}>60 min</option>
                            <option value="90" ${mapRuntime.checkinDuracionMinutos === 90 ? 'selected' : ''}>90 min</option>
                            <option value="120" ${mapRuntime.checkinDuracionMinutos === 120 ? 'selected' : ''}>120 min</option>
                            <option value="180" ${mapRuntime.checkinDuracionMinutos === 180 ? 'selected' : ''}>180 min</option>
                        </select>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 mb-1.5">
                    <span class="text-[10px] text-slate-400 font-bold shrink-0">📞 SOS:</span>
                    <input id="inputCheckinEmergencyPhone" type="tel" placeholder="+34 600..." value="${esc(telGuardado)}" oninput="localStorage.setItem('ps_emergency_phone', this.value.trim())" class="flex-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-white font-mono placeholder-slate-500" />
                </div>
                <div class="flex gap-1.5">
                    <button type="button" onclick="window.extenderCheckinTravesia(30)" class="flex-1 py-1 px-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer">
                        ✅ Estoy Bien (+30m)
                    </button>
                    <button type="button" onclick="window.enviarAlertaCheckinWhatsApp()" class="py-1 px-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer">
                        🆘 Avisar
                    </button>
                </div>
            </div>
            <button type="button" onclick="window.finalizarTravesia()" class="w-full h-11 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer shadow-lg live-btn-finish">⏹ Finalizar Travesía</button>`;
        p.classList.remove('hidden');
    }
    document.getElementById('btnIniciarLive')?.classList.add('hidden');
    if (document.getElementById('proDashboardResumen')) document.getElementById('proDashboardResumen').classList.replace('flex', 'hidden');
    if (document.getElementById('proPlanificador')) document.getElementById('proPlanificador').classList.replace('flex', 'hidden');

    if (mapRuntime.lineaRuta && currentMap) currentMap.removeLayer(mapRuntime.lineaRuta);
    if (currentMap && typeof L !== 'undefined') {
        mapRuntime.livePolyline = L.polyline([], { color: '#ef4444', weight: 5 }).addTo(currentMap);
    }

    mapRuntime.cronometroInterval = setInterval(() => {
        const s = Math.floor((new Date() - mapRuntime.trackStartTime) / 1000);
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;

        const timeStr = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const liveTimeEl = document.getElementById('liveTime');
        if (liveTimeEl) liveTimeEl.textContent = timeStr;
        const trackerTimeEl = document.getElementById('trackerTime');
        if (trackerTimeEl) trackerTimeEl.textContent = timeStr;

        verificarAlertaCheckin();
    }, 1000);

    mapRuntime.watchId = navigator.geolocation.watchPosition(ps => {
        if (!mapRuntime.isTracking) return;
        if (ps.coords.accuracy > 40) return;

        const lat6 = Number(ps.coords.latitude.toFixed(6));
        const lon6 = Number(ps.coords.longitude.toFixed(6));
        const puntoActual = [lat6, lon6];
        mapRuntime.ultimoPuntoCrudoGPS = puntoActual;

        const l = typeof L !== 'undefined' ? L.latLng(lat6, lon6) : null;
        const currentTimestamp = Date.now();

        if (mapRuntime.trackCoords.length === 0) {
            mapRuntime.trackCoords.push(puntoActual);
            if (mapRuntime.livePolyline && l) mapRuntime.livePolyline.addLatLng(l);
            if (currentMap && l) currentMap.panTo(l);
            mapRuntime.lastPositionGPS = l;
            mapRuntime.lastTimestampGPS = currentTimestamp;
            actualizarRetornoSalidaLive(lat6, lon6);
            syncTrackerState();
            return;
        }

        if (mapRuntime.lastPositionGPS && mapRuntime.lastTimestampGPS && l) {
            const timeDiff = (currentTimestamp - mapRuntime.lastTimestampGPS) / 1000;
            const mDist = mapRuntime.lastPositionGPS.distanceTo(l);

            const speedKmh = timeDiff > 0 ? (mDist / timeDiff) * 3.6 : 0;
            if (speedKmh > 25) return;

            if (mDist < GPS_MIN_DISTANCIA_METROS) return;

            mapRuntime.trackDistanceKm += (mDist / 1000);
            const liveDistEl = document.getElementById('liveDist');
            if (liveDistEl) liveDistEl.textContent = `${mapRuntime.trackDistanceKm.toFixed(2)} km`;
            const trackerDistEl = document.getElementById('trackerDist');
            if (trackerDistEl) trackerDistEl.textContent = `${mapRuntime.trackDistanceKm.toFixed(2)} km`;

            const uiSpeed = document.getElementById('liveSpeed');
            if (uiSpeed) uiSpeed.textContent = `${speedKmh.toFixed(1)} km/h`;
            const trackerSpeedEl = document.getElementById('trackerSpeed');
            if (trackerSpeedEl) trackerSpeedEl.textContent = `${speedKmh.toFixed(1)} km/h`;

            const velCruceroUsr = (typeof window !== 'undefined' && typeof window.obtenerVelocidadCruceroUsuario === 'function')
                ? window.obtenerVelocidadCruceroUsuario()
                : 4.5;
            const paceData = calcularZonaRitmoLive(speedKmh, velCruceroUsr);
            const paceBadge = document.getElementById('livePaceZoneBadge');
            if (paceBadge) {
                paceBadge.textContent = paceData.etiqueta;
                paceBadge.className = `px-2 py-0.5 rounded text-[10px] font-black border transition-all ${paceData.bgClass} ${paceData.textClass}`;
            }
            const paceProgress = document.getElementById('livePaceZoneProgress');
            if (paceProgress) {
                paceProgress.style.width = `${Math.min(100, paceData.porcentaje)}%`;
                paceProgress.style.backgroundColor = paceData.color;
            }

            const splitKmEsperado = mapRuntime.splitsKm.length + 1;
            if (mapRuntime.trackDistanceKm >= splitKmEsperado) {
                const prevSplitTs = mapRuntime.splitsKm.length > 0 ? mapRuntime.splitsKm[mapRuntime.splitsKm.length - 1].timestamp : mapRuntime.trackStartTime.getTime();
                const splitSegundos = Math.max(1, Math.round((currentTimestamp - prevSplitTs) / 1000));
                const ritmoMinKm = (splitSegundos / 60).toFixed(2);
                const velMediaKmh = ((1.0 / (splitSegundos / 3600))).toFixed(1);

                mapRuntime.splitsKm.push({
                    km: splitKmEsperado,
                    tiempoSeg: splitSegundos,
                    ritmoMinKm,
                    velMediaKmh,
                    timestamp: currentTimestamp
                });

                const sparkEl = document.getElementById('liveSplitsSparkline');
                if (sparkEl) sparkEl.innerHTML = renderLiveSplitsSparkline(mapRuntime.splitsKm);
                const splitsCnt = document.getElementById('liveSplitsCount');
                if (splitsCnt) splitsCnt.textContent = `${mapRuntime.splitsKm.length} km`;
            }
        }

        mapRuntime.trackCoords.push(puntoActual);
        if (mapRuntime.livePolyline && l) mapRuntime.livePolyline.addLatLng(l);
        if (currentMap && l) currentMap.panTo(l);

        mapRuntime.lastPositionGPS = l;
        mapRuntime.lastTimestampGPS = currentTimestamp;
        actualizarRetornoSalidaLive(lat6, lon6);
        syncTrackerState();

        if (mapRuntime.trackCoords.length % 10 === 0) {
            guardarCheckpointTravesia();
        }
    }, e => {
        if (e.code === 1) alert('Permiso de ubicación denegado. Actívalo para registrar la travesía.');
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

export function guardarCheckpointTravesia() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('paddlesafe_live_checkpoint', JSON.stringify({
                startTime: mapRuntime.trackStartTime ? mapRuntime.trackStartTime.toISOString() : new Date().toISOString(),
                distKm: Number(mapRuntime.trackDistanceKm.toFixed(3)),
                coords: mapRuntime.trackCoords,
                timestamp: Date.now()
            }));
        }
    } catch (errCk) {
        console.warn('No se pudo guardar snapshot de live checkpoint:', errCk);
    }
}

export async function finalizarTravesia() {
    if (!mapRuntime.isTracking || mapRuntime.isSavingRoute) return;
    mapRuntime.isSavingRoute = true;
    mapRuntime.isTracking = false;
    isTracking = false;
    if (typeof window !== 'undefined') {
        window.isTracking = false;
        window.actualizarMiEstadoPresencia?.('online');
    }
    await liberarWakeLock();
    if (mapRuntime.cronometroInterval) { clearInterval(mapRuntime.cronometroInterval); mapRuntime.cronometroInterval = null; }
    if (mapRuntime.watchId && typeof navigator !== 'undefined') { navigator.geolocation.clearWatch(mapRuntime.watchId); mapRuntime.watchId = null; }

    const m = Math.floor((new Date() - mapRuntime.trackStartTime) / 60000);
    if (mapRuntime.trackDistanceKm < 0.05 && m < 1) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('paddlesafe_live_checkpoint');
        alert("Ruta demasiado corta.");
        return restaurarTracker();
    }
    if (appState.esInvitado) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('paddlesafe_live_checkpoint');
        alert(`🏅 ${mapRuntime.trackDistanceKm.toFixed(2)} km en ${formatearTiempo(m)}.`);
        return restaurarTracker();
    }

    const eqFinisher = (typeof window !== 'undefined' && typeof window.recuperarEquipoUsuario === 'function')
        ? window.recuperarEquipoUsuario()
        : { tipoTabla: 'all-round' };
    const avgSpdFinalStr = m > 0 ? (mapRuntime.trackDistanceKm / (m / 60)).toFixed(1) : '0.0';
    const vKtLive = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windSpeed, mapRuntime.datosMeteoActuales?.wind_speed) !== null
        ? Number(valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windSpeed, mapRuntime.datosMeteoActuales?.wind_speed) * 1.94384)
        : 0;
    const oMLive = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.waveHeight, mapRuntime.datosMeteoActuales?.wave_height) !== null
        ? Number(valorNumericoMeteo(mapRuntime.datosMeteoActuales?.waveHeight, mapRuntime.datosMeteoActuales?.wave_height))
        : 0;
    const perSLive = mapRuntime.datosMeteoActuales?.wavePeriod ? Number(mapRuntime.datosMeteoActuales.wavePeriod) : 0;
    const tempCLive = Number.isFinite(Number(mapRuntime.datosMeteoActuales?.tempAire ?? mapRuntime.datosMeteoActuales?.temperature))
        ? Number(mapRuntime.datosMeteoActuales?.tempAire ?? mapRuntime.datosMeteoActuales?.temperature)
        : 20;

    const biometriaFinal = calcularBiometriaSup({
        duracionMin: m,
        distKm: mapRuntime.trackDistanceKm,
        velKmh: Number(avgSpdFinalStr),
        vientoKt: vKtLive,
        olasM: oMLive,
        periodoS: perSLive,
        tempC: tempCLive,
        tipoTabla: eqFinisher?.tipoTabla || 'all-round'
    });

    const pnl = document.getElementById('liveTrackingPanel');
    if (pnl) {
        pnl.innerHTML = `
            <div class="text-center py-6 w-full">
                <span class="text-4xl block mb-2 animate-bounce">⏳</span>
                <p class="font-black text-white text-sm uppercase tracking-widest">Guardando...</p>
            </div>`;
    }

    let img = null;
    let imgBase64Backup = null;
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    try {
        if (mapRuntime.livePolyline && mapRuntime.trackCoords.length && currentMap) {
            currentMap.fitBounds(mapRuntime.livePolyline.getBounds());
        }
        await new Promise(r => setTimeout(r, 1000));
        if (typeof html2canvas !== 'undefined' && document.getElementById('mapContainer')) {
            const cv = await html2canvas(document.getElementById('mapContainer'), {
                useCORS: true, backgroundColor: '#e2e8f0',
                ignoreElements: (el) => el.classList.contains('leaflet-control-container') || el.id === 'liveTrackingPanel'
            });

            let targetCanvas = cv;
            if (cv.width > 800) {
                const scale = 800 / cv.width;
                const resizedCanvas = document.createElement('canvas');
                resizedCanvas.width = 800;
                resizedCanvas.height = Math.max(1, Math.round(cv.height * scale));
                const ctx = resizedCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(cv, 0, 0, resizedCanvas.width, resizedCanvas.height);
                    targetCanvas = resizedCanvas;
                }
            }

            const vKtVal = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windSpeed, mapRuntime.datosMeteoActuales?.wind_speed);
            const vKtStr = vKtVal !== null ? (vKtVal * 1.94384).toFixed(1) + ' kt' : '--';
            const oMVal = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.waveHeight, mapRuntime.datosMeteoActuales?.wave_height);
            const oMStr = oMVal !== null ? Number(oMVal).toFixed(1) + 'm' : '--';
            const scoreVal = 100;

            estamparPosterFinisherCanvas(targetCanvas.getContext('2d'), targetCanvas.width, targetCanvas.height, {
                duracionMinutos: m,
                trackDistanceKm: mapRuntime.trackDistanceKm,
                avgSpdFinalStr,
                kcal: biometriaFinal.kcal,
                vientoKtStr: vKtStr,
                olasMStr: oMStr,
                scoreSeguridad: scoreVal
            });

            imgBase64Backup = targetCanvas.toDataURL('image/jpeg', 0.5);

            const b = await new Promise(r => targetCanvas.toBlob(r, 'image/jpeg', 0.7));
            const fn = `rutas/${appState.sesionActual.user.id}-${Date.now()}.jpg`;
            if (supabaseClient) {
                const { error: ue } = await supabaseClient.storage.from('paddlesafe').upload(fn, b, { upsert: true, contentType: 'image/jpeg' });
                if (!ue) {
                    const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(fn);
                    img = data.publicUrl;
                }
            }
        }
    } catch (e) {
        console.warn('Aviso no crítico al generar/subir canvas de ruta:', e);
    }

    if (mapRuntime.ultimoPuntoCrudoGPS && mapRuntime.trackCoords.length > 0) {
        const lastCoord = mapRuntime.trackCoords[mapRuntime.trackCoords.length - 1];
        if (lastCoord[0] !== mapRuntime.ultimoPuntoCrudoGPS[0] || lastCoord[1] !== mapRuntime.ultimoPuntoCrudoGPS[1]) {
            mapRuntime.trackCoords.push(mapRuntime.ultimoPuntoCrudoGPS);
        }
    }

    if (mapRuntime.trackDistanceKm > mapRuntime.splitsKm.length && (mapRuntime.trackDistanceKm - mapRuntime.splitsKm.length) >= 0.1) {
        const kmRestante = Number((mapRuntime.trackDistanceKm - mapRuntime.splitsKm.length).toFixed(2));
        const prevSplitTs = mapRuntime.splitsKm.length > 0 ? mapRuntime.splitsKm[mapRuntime.splitsKm.length - 1].timestamp : mapRuntime.trackStartTime.getTime();
        const splitSegundos = Math.max(1, Math.round((Date.now() - prevSplitTs) / 1000));
        const ritmoMinKm = ((splitSegundos / 60) / kmRestante).toFixed(2);
        const velMediaKmh = ((kmRestante / (splitSegundos / 3600))).toFixed(1);
        mapRuntime.splitsKm.push({
            km: Number(mapRuntime.trackDistanceKm.toFixed(2)),
            esFinal: true,
            distanciaKm: kmRestante,
            tiempoSeg: splitSegundos,
            ritmoMinKm,
            velMediaKmh,
            timestamp: Date.now()
        });
    }

    const vKtSnapshot = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windSpeed, mapRuntime.datosMeteoActuales?.wind_speed) !== null
        ? Number((valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windSpeed, mapRuntime.datosMeteoActuales?.wind_speed) * 1.94384).toFixed(1))
        : null;
    const rKtSnapshot = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windGusts, mapRuntime.datosMeteoActuales?.wind_gusts) !== null
        ? Number((valorNumericoMeteo(mapRuntime.datosMeteoActuales?.windGusts, mapRuntime.datosMeteoActuales?.wind_gusts) * 1.94384).toFixed(1))
        : null;
    const oMSnapshot = valorNumericoMeteo(mapRuntime.datosMeteoActuales?.waveHeight, mapRuntime.datosMeteoActuales?.wave_height) !== null
        ? Number(valorNumericoMeteo(mapRuntime.datosMeteoActuales?.waveHeight, mapRuntime.datosMeteoActuales?.wave_height))
        : null;
    const perSSnapshot = mapRuntime.datosMeteoActuales?.wavePeriod ? Number(mapRuntime.datosMeteoActuales.wavePeriod) : null;
    const dirSnapshot = mapRuntime.datosMeteoActuales?.windDirection ?? mapRuntime.datosMeteoActuales?.wind_direction ?? null;

    const meteoSnapshot = {
        vientoKt: vKtSnapshot,
        rachasKt: rKtSnapshot,
        dirViento: dirSnapshot,
        olasM: oMSnapshot,
        periodoS: perSSnapshot,
        tempC: mapRuntime.datosMeteoActuales?.tempAire ?? mapRuntime.datosMeteoActuales?.temperature ?? null,
        score: 100
    };

    const avgSpeed = m > 0 ? Number((mapRuntime.trackDistanceKm / (m / 60)).toFixed(1)) : 0;
    let pointsEarned = avgSpeed > 45 ? 0 : Math.round(mapRuntime.trackDistanceKm * 100);
    try {
        const xpResult = await calcularXpRuta({
            userId: appState.sesionActual.user.id,
            distanceKm: mapRuntime.trackDistanceKm,
            avgSpeed
        });
        pointsEarned = Number(xpResult?.xpGanado ?? pointsEarned);
    } catch (xpError) {
        console.warn('No se pudo calcular XP de la travesía; se aplica la regla base de PaddleSafe:', xpError);
    }

    const payloadRuta = construirPayloadRutaSupabase({
        userId: appState.sesionActual.user.id,
        distanciaKm: mapRuntime.trackDistanceKm,
        tiempoMinutos: m,
        coords: mapRuntime.trackCoords,
        imagenUrl: img,
        pointsEarned,
        splitsData: mapRuntime.splitsKm,
        vientoKt: vKtSnapshot,
        rachasKt: rKtSnapshot,
        dirViento: dirSnapshot,
        olasM: oMSnapshot,
        periodoS: perSSnapshot,
        conditionsScore: meteoSnapshot.score,
        weatherSnapshot: meteoSnapshot
    });

    let nuevaRuta = null;
    let errRuta = null;
    if (supabaseClient) {
        const res = await supabaseClient.from('rutas').insert([payloadRuta]).select().single();
        nuevaRuta = res.data;
        errRuta = res.error;
    }

    if (errRuta || !nuevaRuta) {
        guardarRutaOffline({
            user_id: appState.sesionActual.user.id,
            km: mapRuntime.trackDistanceKm,
            min: m,
            coords: payloadRuta.ruta_json,
            img,
            b64: imgBase64Backup,
            meteo: meteoSnapshot,
            splits: mapRuntime.splitsKm,
            points_earned: pointsEarned,
            ts: Date.now()
        });

        if (pnl) {
            pnl.innerHTML = `
                <div class="text-center py-4 w-full">
                    <span class="text-4xl block mb-2">⚠️</span>
                    <h3 class="font-black text-white text-lg">No se pudo guardar</h3>
                    <p class="text-amber-300 font-bold text-[10px] uppercase tracking-widest mb-3">Se conserva una copia en este dispositivo</p>
                    <button type="button" onclick="window.restaurarTracker()" class="bg-slate-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest w-full active:scale-95 transition-transform cursor-pointer">Cerrar Panel</button>
                </div>`;
        }
        mapRuntime.isSavingRoute = false;
        return;
    }

    if (typeof localStorage !== 'undefined') localStorage.removeItem('paddlesafe_live_checkpoint');

    try {
        const velCrucero = (typeof window !== 'undefined' && typeof window.obtenerVelocidadCruceroUsuario === 'function')
            ? window.obtenerVelocidadCruceroUsuario()
            : 4.5;
        const telemetryData = {
            rutaId: nuevaRuta.id,
            meteo: meteoSnapshot,
            splits: mapRuntime.splitsKm,
            boardType: eqFinisher?.tipoTabla || 'all-round',
            velCruceroKmh: velCrucero,
            timestamp: Date.now()
        };
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ps_telemetry_' + nuevaRuta.id, JSON.stringify(telemetryData));
            localStorage.setItem('ps_telemetry_last', JSON.stringify(telemetryData));
        }
    } catch (errTel) {
        console.warn('Aviso no crítico al guardar telemetría de ruta en localStorage:', errTel);
    }

    if (ClubState.activeId && supabaseClient) {
        try {
            await supabaseClient.from('club_rutas').insert([{ club_id: ClubState.activeId, ruta_id: nuevaRuta.id }]);
        } catch (_) {}
    }

    if (typeof window !== 'undefined' && window.cargarPerfilUsuarioActivo) {
        await window.cargarPerfilUsuarioActivo();
    }

    if (pnl) {
        pnl.innerHTML = `
            <div class="text-center py-4 w-full">
                <span class="text-4xl block mb-2">✅</span>
                <h3 class="font-black text-white text-lg">Guardada</h3>
                <div class="flex items-center justify-center gap-2 text-xs font-bold my-1">
                    <span class="text-emerald-400 uppercase tracking-widest">+${pointsEarned} pts</span>
                    <span class="text-slate-500">·</span>
                    <span class="text-amber-400 font-mono">🔥 ${biometriaFinal.kcal} kcal</span>
                </div>
                <p class="text-slate-400 text-[11px] mb-3">Distancia: ${mapRuntime.trackDistanceKm.toFixed(2)} km · Tiempo: ${formatearTiempo(m)}</p>
                <button type="button" onclick="window.restaurarTracker()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest w-full active:scale-95 transition-transform cursor-pointer">Cerrar Panel</button>
            </div>`;
    }
}

export function guardarRutaOffline(p) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('paddlesafe_ruta_pendiente', JSON.stringify(p));
            localStorage.removeItem('paddlesafe_live_checkpoint');
        }
    } catch (e) {
        console.warn('No se pudo guardar la ruta pendiente localmente:', e);
    }
}

export async function sincronizarRutasPendientes() {
    if (mapRuntime.isSyncingPendingRoute || !appState.sesionActual?.user?.id) return;
    mapRuntime.isSyncingPendingRoute = true;
    try {
        if (typeof localStorage === 'undefined') return;
        const pendienteStr = localStorage.getItem('paddlesafe_ruta_pendiente');
        if (!pendienteStr) return;

        const p = JSON.parse(pendienteStr);
        if (!p.user_id) {
            localStorage.removeItem('paddlesafe_ruta_pendiente');
            console.warn("Se eliminó una ruta pendiente heredada sin propietario para proteger la privacidad.");
            alert("Se descartó una ruta pendiente antigua porque no se puede verificar a qué cuenta pertenece.");
            return;
        }
        if (p.user_id !== appState.sesionActual.user.id) {
            console.warn("Ruta pendiente asociada a otra cuenta; se conserva sin sincronizar.");
            return;
        }

        let urlSincronizada = p.img || null;
        if (!urlSincronizada && p.b64 && supabaseClient) {
            try {
                const res = await fetch(p.b64);
                const blob = await res.blob();
                const fn = `rutas/${appState.sesionActual.user.id}-${Date.now()}_sync.jpg`;
                const { error: ue } = await supabaseClient.storage.from('paddlesafe').upload(fn, blob, { contentType: 'image/jpeg' });
                if (!ue) {
                    const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(fn);
                    urlSincronizada = data.publicUrl;
                }
            } catch (e) { console.warn("Fallo subiendo canvas offline:", e); }
        }

        const avgSpeedSync = p.min > 0 ? Number((p.km / (p.min / 60)).toFixed(1)) : 0;
        let pointsEarned = Number(p.points_earned);
        if (!Number.isFinite(pointsEarned)) {
            pointsEarned = avgSpeedSync > 45 ? 0 : Math.round(Number(p.km) * 100);
            try {
                const xpResult = await calcularXpRuta({
                    userId: appState.sesionActual.user.id,
                    distanceKm: p.km,
                    avgSpeed: avgSpeedSync
                });
                pointsEarned = Number(xpResult?.xpGanado ?? pointsEarned);
            } catch (xpError) {
                console.warn('No se pudo calcular XP para la ruta offline; se aplica la regla base de PaddleSafe:', xpError);
            }
        }

        const meteo = p.meteo || {};
        const payload = construirPayloadRutaSupabase({
            userId: appState.sesionActual.user.id,
            distanciaKm: p.km,
            tiempoMinutos: p.min,
            coords: p.coords,
            imagenUrl: urlSincronizada || p.img,
            ubicacion: "Travesía GPS (Sincronización Offline)",
            pointsEarned,
            splitsData: Array.isArray(p.splits) ? p.splits : [],
            vientoKt: meteo.vientoKt ?? null,
            rachasKt: meteo.rachasKt ?? null,
            dirViento: meteo.dirViento ?? null,
            olasM: meteo.olasM ?? null,
            periodoS: meteo.periodoS ?? null,
            conditionsScore: meteo.score ?? null,
            weatherSnapshot: meteo
        });

        if (supabaseClient) {
            const { error } = await supabaseClient.from('rutas').insert([payload]);
            if (!error) {
                localStorage.removeItem('paddlesafe_ruta_pendiente');
                alert(`¡Ruta guardada offline sincronizada con éxito! (+${pointsEarned} pts)`);
                if (typeof window !== 'undefined' && window.cargarPerfilUsuarioActivo) {
                    await window.cargarPerfilUsuarioActivo();
                }
            }
        }
    } catch (e) {
        console.warn("Error al intentar sincronizar ruta pendiente:", e);
    } finally {
        mapRuntime.isSyncingPendingRoute = false;
    }
}

// ==============================================================================
// 10. CHECKPOINT Y RESTAURACIÓN DE TRAVESÍA INTERRUMPIDA
// ==============================================================================

export function restaurarTracker() {
    mapRuntime.isSavingRoute = false;
    mapRuntime.isTracking = false;
    isTracking = false;
    if (typeof window !== 'undefined') {
        window.isTracking = false;
        window.actualizarMiEstadoPresencia?.('online');
    }
    mapRuntime.modoSolTrackerActivo = false;
    modoSolTrackerActivo = false;
    liberarWakeLock().catch(() => {});
    const pnl = document.getElementById('liveTrackingPanel');
    if (pnl) {
        pnl.classList.remove('modo-sol-activo');
        pnl.classList.add('hidden');
    }
    const btnLive = document.getElementById('btnIniciarLive');
    if (btnLive) btnLive.classList.remove('hidden');
    const proPlan = document.getElementById('proPlanificador');
    if (proPlan) {
        proPlan.classList.remove('hidden');
        proPlan.classList.add('flex');
    }
    syncTrackerState();
}

export function descartarCheckpoint() {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('paddlesafe_live_checkpoint');
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (mapRuntime.livePolyline && currentMap) {
        currentMap.removeLayer(mapRuntime.livePolyline);
        mapRuntime.livePolyline = null;
    }
    mapRuntime.trackCoords = [];
    mapRuntime.trackDistanceKm = 0;
    mapRuntime.isTracking = false;
    restaurarTracker();
}
export const descartarCheckpointTravesia = descartarCheckpoint;

export function restaurarTravesiaDesdeCheckpoint(ck) {
    if (!ck || !Array.isArray(ck.coords) || ck.coords.length === 0) return;

    mapRuntime.trackCoords = [...ck.coords];
    mapRuntime.trackDistanceKm = Number(ck.distKm || 0);
    const ts = ck.timestamp || (ck.startTime ? new Date(ck.startTime).getTime() : Date.now());
    mapRuntime.trackStartTime = ck.startTime ? new Date(ck.startTime) : new Date(ts);

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (mapRuntime.livePolyline && currentMap) {
        currentMap.removeLayer(mapRuntime.livePolyline);
    }
    if (currentMap && typeof L !== 'undefined') {
        mapRuntime.livePolyline = L.polyline(mapRuntime.trackCoords, { color: '#ef4444', weight: 5 }).addTo(currentMap);
        if (mapRuntime.trackCoords.length > 0) {
            currentMap.fitBounds(mapRuntime.livePolyline.getBounds());
        }
    }

    mapRuntime.isTracking = true;
    syncTrackerState();

    const p = document.getElementById('liveTrackingPanel');
    if (p) {
        const s = Math.max(0, Math.floor((Date.now() - mapRuntime.trackStartTime.getTime()) / 1000));
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        const timeStr = hrs > 0 
            ? `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        p.innerHTML = `
            <div class="flex justify-between items-center mb-3 w-full">
                <span class="text-[10px] font-bold text-amber-400 uppercase tracking-widest">⚠️ Travesía Recuperada</span>
                <span id="liveTime" class="font-mono text-2xl font-black text-emerald-400">${timeStr}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center mb-3 w-full">
                <div class="bg-slate-800 rounded-xl py-2">
                    <p class="text-[9px] text-slate-400 uppercase tracking-widest">DISTANCIA</p>
                    <p id="liveDist" class="font-black text-lg text-white">${mapRuntime.trackDistanceKm.toFixed(2)} km</p>
                </div>
                <div class="bg-slate-800 rounded-xl py-2">
                    <p class="text-[9px] text-slate-400 uppercase tracking-widest">PUNTOS</p>
                    <p id="liveSpeed" class="font-black text-lg text-white">${mapRuntime.trackCoords.length} pts</p>
                </div>
            </div>
            <div class="flex gap-2 w-full">
                <button type="button" onclick="window.finalizarTravesia()" class="flex-1 h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer">💾 Guardar Travesía</button>
                <button type="button" onclick="window.descartarCheckpoint()" class="h-11 px-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer">🗑️ Descartar</button>
            </div>
        `;
        p.classList.remove('hidden');
        const btnLive = document.getElementById('btnIniciarLive');
        if (btnLive) btnLive.classList.add('hidden');
    }
}

export function verificarCheckpointPendiente() {
    try {
        if (typeof localStorage === 'undefined') return;
        const rawCk = localStorage.getItem('paddlesafe_live_checkpoint');
        if (!rawCk) return;
        const ck = JSON.parse(rawCk);
        const ts = ck.timestamp || (ck.startTime ? new Date(ck.startTime).getTime() : 0);
        const doceHorasMs = 12 * 60 * 60 * 1000;
        const antiguedad = Date.now() - ts;

        if (Array.isArray(ck.coords) && ck.coords.length > 5 && antiguedad >= 0 && antiguedad < doceHorasMs) {
            const horaStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const aceptar = confirm(`PaddleSafe detectó una travesía GPS interrumpida (${ck.coords.length} puntos, ${Number(ck.distKm || 0).toFixed(2)} km de las ${horaStr}).\n\n¿Deseas restaurarla en el mapa para guardarla o continuar?`);
            if (aceptar) {
                restaurarTravesiaDesdeCheckpoint(ck);
            } else {
                localStorage.removeItem('paddlesafe_live_checkpoint');
            }
        } else if (antiguedad >= doceHorasMs) {
            localStorage.removeItem('paddlesafe_live_checkpoint');
        }
    } catch (e) {
        console.warn('Error al verificar checkpoint de travesía:', e);
    }
}


if (typeof window !== 'undefined') {
    window.iniciarTravesia = iniciarTravesia;
    window.finalizarTravesia = finalizarTravesia;
    window.guardarCheckpointTravesia = guardarCheckpointTravesia;
    window.guardarRutaOffline = guardarRutaOffline;
    window.sincronizarRutasPendientes = sincronizarRutasPendientes;
    window.restaurarTracker = restaurarTracker;
    window.descartarCheckpoint = descartarCheckpoint;
    window.restaurarTravesiaDesdeCheckpoint = restaurarTravesiaDesdeCheckpoint;
    window.verificarCheckpointPendiente = verificarCheckpointPendiente;
    window.activarWakeLock = activarWakeLock;
    window.liberarWakeLock = liberarWakeLock;
    window.normalizarYLimitarRutaGPS = normalizarYLimitarRutaGPS;
    window.calcularBiometriaSup = calcularBiometriaSup;
    window.construirPayloadRutaSupabase = construirPayloadRutaSupabase;
    window.toggleModoTravesia = toggleModoTravesia;
    window.toggleModoSolTracker = toggleModoSolTracker;
    window.compartirPosicionActualLive = compartirPosicionActualLive;
    window.compartirPosicionSOS = compartirPosicionSOS;
    window.actualizarRetornoSalidaLive = actualizarRetornoSalidaLive;
    window.actualizarDuracionCheckin = actualizarDuracionCheckin;
    window.extenderCheckinTravesia = extenderCheckinTravesia;
    window.enviarAlertaCheckinWhatsApp = enviarAlertaCheckinWhatsApp;
    window.verificarAlertaCheckin = verificarAlertaCheckin;
    window.mostrarModalSplitsKm = mostrarModalSplitsKm;
    window.cerrarModalSplitsKm = cerrarModalSplitsKm;
    window.syncTrackerState = syncTrackerState;
}
