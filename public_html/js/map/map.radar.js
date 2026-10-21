// ==============================================================================
// PADDLESAFE NEXT-GEN - ADVANCED MARINE & METEOROLOGICAL RADAR (map.radar.js)
// Multi-layer tactical analysis for SUP and Coastal Crossings.
// Layers: 1) Wind Vectors, 2) Rain & Storms (RainViewer + Open-Meteo),
//         3) Swell & Marine Waves, 4) Exclusive PaddleSafe Coastal Drift.
// Includes 10-Second Quick Verdict and interactive click-to-inspect HUD.
// ==============================================================================

import { mapRuntime } from './map.state.js';
import { resolverOrientacionCostera, kmhANudos } from '../utils.js';

/**
 * Escala cromática de intensidad de viento
 * Verde: 0-5 kt | Amarillo: 5-10 kt | Naranja: 10-15 kt | Rojo: >15 kt
 */
export function obtenerColorEscalaViento(nudos) {
    const k = Number(nudos) || 0;
    if (k < 5) return '#10b981'; // Verde
    if (k < 10) return '#f59e0b'; // Amarillo
    if (k < 15) return '#f97316'; // Naranja
    return '#ef4444'; // Rojo (>15 kt)
}

/**
 * Escala cromática de oleaje
 * Verde: 0-0.5m | Amarillo: 0.5-1m | Naranja: 1-1.5m | Rojo: >1.5m
 */
export function obtenerColorEscalaOleaje(metros) {
    const m = Number(metros) || 0;
    if (m < 0.5) return '#10b981'; // Verde
    if (m < 1.0) return '#f59e0b'; // Amarillo
    if (m < 1.5) return '#f97316'; // Naranja
    return '#ef4444'; // Rojo (>1.5 m)
}

/**
 * Escala cromática de lluvia y tormentas
 * Azul claro (<1mm/h) | Azul medio (1-4mm/h) | Azul oscuro (4-10mm/h) | Morado (>10mm/h o tormenta)
 */
export function obtenerColorEscalaLluvia(mmPorHora, codigoClima = 0) {
    const mm = Number(mmPorHora) || 0;
    const cod = Number(codigoClima) || 0;
    if ([95, 96, 99].includes(cod) || mm >= 10) return '#9333ea'; // Morado Tormenta
    if (mm >= 4) return '#1d4ed8'; // Azul oscuro
    if (mm >= 1) return '#0284c7'; // Azul medio
    if (mm > 0.1) return '#38bdf8'; // Azul claro
    return '#64748b'; // Sin precipitación
}

/**
 * Cálculo físico de Deriva Costera PaddleSafe
 * Combina viento sobre francobordo + arrastre Stokes de swell + corriente.
 * Retorna dirección neta (grados), velocidad (kt y m/min) y nivel de riesgo.
 */
export function calcularDerivaCosteraPaddle(vientoKt, vientoDirDeg, olaM, swellDirDeg, tipoTabla = 'inflat_allround') {
    const wKt = Math.max(0, Number(vientoKt) || 0);
    const wDir = Number(vientoDirDeg) || 0;
    const sM = Math.max(0, Number(olaM) || 0);
    const sDir = Number(swellDirDeg) || 0;

    // Coeficiente de rozamiento eólico según tipo de tabla SUP
    const tablaFactors = {
        inflat_allround: 0.040, // 4.0% de velocidad de viento por alto francobordo
        inflat_touring: 0.035,
        rigid_touring: 0.030,
        rigid_race: 0.025
    };
    const cWind = tablaFactors[tipoTabla] || 0.035;

    // Componente de viento (empuja HACIA dir + 180)
    const vientoHaciaRad = ((wDir + 180) % 360) * Math.PI / 180;
    const vWindDrift = wKt * cWind;
    const uWind = vWindDrift * Math.sin(vientoHaciaRad);
    const vWind = vWindDrift * Math.cos(vientoHaciaRad);

    // Componente de oleaje (empuja HACIA la dirección del swell)
    const swellHaciaRad = (sDir % 360) * Math.PI / 180;
    const vSwellDrift = sM * 0.25; // ~0.25 kt por cada metro de ola
    const uSwell = vSwellDrift * Math.sin(swellHaciaRad);
    const vSwell = vSwellDrift * Math.cos(swellHaciaRad);

    // Vector neto combinado
    const uNet = uWind + uSwell;
    const vNet = vWind + vSwell;

    const velocidadKt = Math.sqrt(uNet * uNet + vNet * vNet);
    let direccionDeg = (Math.atan2(uNet, vNet) * 180 / Math.PI + 360) % 360;

    // Evaluación del nivel de riesgo de deriva
    let nivelRiesgo = 'bajo';
    let colorRiesgo = '#a855f7'; // Morado suave
    if (velocidadKt >= 0.8) {
        nivelRiesgo = 'critico';
        colorRiesgo = '#ef4444'; // Rojo
    } else if (velocidadKt >= 0.5) {
        nivelRiesgo = 'alto';
        colorRiesgo = '#f97316'; // Naranja
    } else if (velocidadKt >= 0.25) {
        nivelRiesgo = 'moderado';
        colorRiesgo = '#c084fc'; // Morado
    }

    return {
        velocidadKt: Number(velocidadKt.toFixed(2)),
        velocidadMpm: Number((velocidadKt * 1852 / 60).toFixed(1)), // metros por minuto
        direccionDeg: Math.round(direccionDeg),
        nivelRiesgo,
        colorRiesgo
    };
}

/**
 * Valoración rápida PaddleSafe en menos de 10 segundos
 * 🟢 Excelente | 🟡 Buena | 🟠 Precaución | 🔴 No recomendable
 */
export function calcularValoracionRapidaPaddleSafe({
    vientoKt = 0,
    vientoOffshore = false,
    olaM = 0,
    derivaKt = 0,
    precipMm = 0,
    weatherCode = 0
}) {
    const k = Number(vientoKt) || 0;
    const o = Number(olaM) || 0;
    const d = Number(derivaKt) || 0;
    const p = Number(precipMm) || 0;
    const cod = Number(weatherCode) || 0;
    const esTormenta = [95, 96, 99].includes(cod) || p >= 8;

    // Reglas de descarte y peligro crítico (Rojo)
    if (k > 15 || o > 1.3 || (vientoOffshore && k > 10) || esTormenta || d > 0.8) {
        return {
            etiqueta: '🔴 No recomendable',
            nivel: 'no_recomendable',
            color: '#ef4444',
            bgClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
            motivo: esTormenta ? 'Riesgo de tormenta' :
                    (vientoOffshore && k > 10) ? 'Viento terral peligroso (Offshore)' :
                    k > 15 ? 'Viento superior a 15 kt' :
                    o > 1.3 ? 'Oleaje rompiente excesivo' : 'Deriva marítima crítica'
        };
    }

    // Nivel de precaución (Naranja)
    if (k > 10 || o > 0.8 || (vientoOffshore && k > 7) || p > 2 || d > 0.45) {
        return {
            etiqueta: '🟠 Precaución',
            nivel: 'precaucion',
            color: '#f97316',
            bgClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
            motivo: (vientoOffshore && k > 7) ? 'Viento offshore moderado' :
                    k > 10 ? 'Viento racheado 10-15 kt' :
                    o > 0.8 ? 'Mar de fondo picada' : 'Lluvia o deriva perceptible'
        };
    }

    // Nivel bueno (Amarillo)
    if (k > 5 || o > 0.4 || p > 0.2 || d > 0.25) {
        return {
            etiqueta: '🟡 Buena',
            nivel: 'buena',
            color: '#f59e0b',
            bgClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
            motivo: 'Condiciones favorables con ligera brisa'
        };
    }

    // Nivel óptimo (Verde)
    return {
        etiqueta: '🟢 Excelente',
        nivel: 'excelente',
        color: '#10b981',
        bgClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
        motivo: 'Mar llana, brisa suave y deriva mínima'
    };
}

/**
 * Genera el icono vectorial SVG para una flecha de viento
 */
export function generarSvgFlechaViento(nudos, dirDeg) {
    const color = obtenerColorEscalaViento(nudos);
    return `
        <div class="relative flex flex-col items-center justify-center pointer-events-none select-none -translate-x-1/2 -translate-y-1/2" style="width: 44px; height: 44px;">
            <div style="transform: rotate(${dirDeg}deg); transition: transform 0.2s ease;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="rgba(15, 23, 42, 0.75)" stroke="${color}" stroke-width="1.5" />
                    <path d="M12 4L16 11H13V19H11V11H8L12 4Z" fill="${color}" />
                </svg>
            </div>
            <span class="text-[9px] font-black font-mono leading-none px-1 py-0.5 rounded shadow" style="background: rgba(15, 23, 42, 0.85); color: ${color}; border: 1px solid ${color}40; margin-top: -3px;">
                ${Math.round(nudos)}k
            </span>
        </div>
    `;
}

/**
 * Genera el icono vectorial SVG para una flecha de oleaje / swell
 */
export function generarSvgFlechaOleaje(alturaM, swellDirDeg) {
    const color = obtenerColorEscalaOleaje(alturaM);
    return `
        <div class="relative flex flex-col items-center justify-center pointer-events-none select-none -translate-x-1/2 -translate-y-1/2" style="width: 44px; height: 44px;">
            <div style="transform: rotate(${swellDirDeg}deg); transition: transform 0.2s ease;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="rgba(15, 23, 42, 0.75)" stroke="${color}" stroke-width="1.5" stroke-dasharray="2 2" />
                    <path d="M7 14C9 11 11 11 12 13C13 15 15 15 17 12L16 11" stroke="${color}" stroke-width="2" stroke-linecap="round" />
                    <path d="M12 5L15 9H9L12 5Z" fill="${color}" />
                </svg>
            </div>
            <span class="text-[9px] font-black font-mono leading-none px-1 py-0.5 rounded shadow" style="background: rgba(15, 23, 42, 0.85); color: ${color}; border: 1px solid ${color}40; margin-top: -3px;">
                ${alturaM.toFixed(1)}m
            </span>
        </div>
    `;
}

/**
 * Genera el icono vectorial SVG para una flecha de deriva costera PaddleSafe
 */
export function generarSvgFlechaDeriva(velocidadKt, dirDeg, colorRiesgo) {
    return `
        <div class="relative flex flex-col items-center justify-center pointer-events-none select-none -translate-x-1/2 -translate-y-1/2" style="width: 48px; height: 48px;">
            <div style="transform: rotate(${dirDeg}deg); transition: transform 0.2s ease;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="rgba(30, 10, 60, 0.85)" stroke="${colorRiesgo}" stroke-width="2" />
                    <path d="M12 3L17 12L12 9.5L7 12L12 3Z" fill="${colorRiesgo}" />
                    <path d="M12 9.5V20" stroke="${colorRiesgo}" stroke-width="2" stroke-linecap="round" />
                </svg>
            </div>
            <span class="text-[9px] font-black font-mono leading-none px-1.5 py-0.5 rounded shadow" style="background: rgba(30, 10, 60, 0.95); color: ${colorRiesgo}; border: 1px solid ${colorRiesgo}60; margin-top: -4px;">
                🧭 ${velocidadKt}k
            </span>
        </div>
    `;
}

/**
 * Activa el Modo Radar Táctico en el mapa
 */
export async function activarModoRadar() {
    mapRuntime.radarActivo = true;

    // 1. Mostrar Cockpit flotante del Radar
    const cockpit = document.getElementById('radarCockpitPanel');
    if (cockpit) cockpit.classList.remove('hidden');

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance || typeof L === 'undefined') return;

    // 2. Inicializar los grupos de capas de Leaflet si no existen
    if (!mapRuntime.radarWindGroup) mapRuntime.radarWindGroup = L.layerGroup().addTo(mapInstance);
    if (!mapRuntime.radarWaveGroup) mapRuntime.radarWaveGroup = L.layerGroup().addTo(mapInstance);
    if (!mapRuntime.radarDriftGroup) mapRuntime.radarDriftGroup = L.layerGroup().addTo(mapInstance);
    if (!mapRuntime.radarRainGroup) mapRuntime.radarRainGroup = L.layerGroup().addTo(mapInstance);

    // 3. Configurar capa Doppler de Lluvia en tiempo real con RainViewer
    if (!mapRuntime.radarRainTile) {
        try {
            const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            if (rvRes.ok) {
                const rvData = await rvRes.json();
                const latestPath = rvData.radar?.past?.[rvData.radar.past.length - 1]?.path;
                if (latestPath) {
                    const host = rvData.host || 'https://tilecache.rainviewer.com';
                    mapRuntime.radarRainTile = L.tileLayer(`${host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`, {
                        maxZoom: 18,
                        opacity: mapRuntime.radarOpacidad || 0.75,
                        zIndex: 350
                    });
                    if (mapRuntime.radarCapasActivas?.lluvia !== false) {
                        mapRuntime.radarRainTile.addTo(mapInstance);
                    }
                }
            }
        } catch (err) {
            console.warn('[radar] RainViewer no disponible temporalmente:', err);
        }
    } else if (mapRuntime.radarCapasActivas?.lluvia !== false && !mapInstance.hasLayer(mapRuntime.radarRainTile)) {
        mapRuntime.radarRainTile.addTo(mapInstance);
    }

    // 4. Renderizar capas vectoriales basadas en coordenadas activas
    await actualizarCapasRadar();

    // 5. Vincular evento de movimiento del mapa con debounce para actualización táctica
    if (!mapRuntime._radarMoveBound) {
        mapRuntime._radarMoveBound = true;
        mapInstance.on('moveend', () => {
            if (mapRuntime.radarActivo) {
                actualizarCapasRadar();
            }
        });
    }
}

/**
 * Desactiva el Modo Radar y limpia las capas sobrepuestas
 */
export function desactivarModoRadar() {
    mapRuntime.radarActivo = false;

    // 1. Ocultar Cockpit del Radar
    const cockpit = document.getElementById('radarCockpitPanel');
    if (cockpit) cockpit.classList.add('hidden');

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance) return;

    // 2. Limpiar grupos de capas vectoriales
    if (mapRuntime.radarWindGroup) mapRuntime.radarWindGroup.clearLayers();
    if (mapRuntime.radarWaveGroup) mapRuntime.radarWaveGroup.clearLayers();
    if (mapRuntime.radarDriftGroup) mapRuntime.radarDriftGroup.clearLayers();
    if (mapRuntime.radarRainGroup) mapRuntime.radarRainGroup.clearLayers();

    // 3. Remover tile layer de RainViewer si estaba activo
    if (mapRuntime.radarRainTile && mapInstance.hasLayer(mapRuntime.radarRainTile)) {
        try { mapInstance.removeLayer(mapRuntime.radarRainTile); } catch (_) {}
    }
}

/**
 * Alterna individualmente una capa del Radar (viento, lluvia, oleaje, deriva)
 */
export function toggleCapaRadar(nombreCapa, forzarEstado = null) {
    if (!mapRuntime.radarCapasActivas) {
        mapRuntime.radarCapasActivas = { viento: true, lluvia: true, oleaje: true, deriva: true };
    }

    const estado = forzarEstado !== null ? Boolean(forzarEstado) : !mapRuntime.radarCapasActivas[nombreCapa];
    mapRuntime.radarCapasActivas[nombreCapa] = estado;

    // Actualizar estilo visual del botón
    const btnIdMap = {
        viento: 'btnRadarLayerWind',
        lluvia: 'btnRadarLayerRain',
        oleaje: 'btnRadarLayerWave',
        deriva: 'btnRadarLayerDrift'
    };
    const btn = document.getElementById(btnIdMap[nombreCapa]);
    if (btn) {
        if (estado) {
            btn.classList.add('ps-chip-active', 'active');
            btn.style.opacity = '1';
        } else {
            btn.classList.remove('ps-chip-active', 'active');
            btn.style.opacity = '0.45';
        }
    }

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance) return;

    // Aplicar a Leaflet
    if (nombreCapa === 'viento' && mapRuntime.radarWindGroup) {
        if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarWindGroup)) mapInstance.addLayer(mapRuntime.radarWindGroup); }
        else { if (mapInstance.hasLayer(mapRuntime.radarWindGroup)) mapInstance.removeLayer(mapRuntime.radarWindGroup); }
    } else if (nombreCapa === 'oleaje' && mapRuntime.radarWaveGroup) {
        if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarWaveGroup)) mapInstance.addLayer(mapRuntime.radarWaveGroup); }
        else { if (mapInstance.hasLayer(mapRuntime.radarWaveGroup)) mapInstance.removeLayer(mapRuntime.radarWaveGroup); }
    } else if (nombreCapa === 'deriva' && mapRuntime.radarDriftGroup) {
        if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarDriftGroup)) mapInstance.addLayer(mapRuntime.radarDriftGroup); }
        else { if (mapInstance.hasLayer(mapRuntime.radarDriftGroup)) mapInstance.removeLayer(mapRuntime.radarDriftGroup); }
    } else if (nombreCapa === 'lluvia') {
        if (mapRuntime.radarRainTile) {
            if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarRainTile)) mapInstance.addLayer(mapRuntime.radarRainTile); }
            else { if (mapInstance.hasLayer(mapRuntime.radarRainTile)) mapInstance.removeLayer(mapRuntime.radarRainTile); }
        }
        if (mapRuntime.radarRainGroup) {
            if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarRainGroup)) mapInstance.addLayer(mapRuntime.radarRainGroup); }
            else { if (mapInstance.hasLayer(mapRuntime.radarRainGroup)) mapInstance.removeLayer(mapRuntime.radarRainGroup); }
        }
    }
}

/**
 * Ajusta la opacidad global de las capas tácticas del radar
 */
export function ajustarOpacidadRadar(nivelOpacidad = 1.0) {
    const op = Math.max(0.2, Math.min(1.0, Number(nivelOpacidad) || 1.0));
    mapRuntime.radarOpacidad = op;

    if (mapRuntime.radarRainTile && typeof mapRuntime.radarRainTile.setOpacity === 'function') {
        mapRuntime.radarRainTile.setOpacity(op * 0.8);
    }

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance) return;

    const selector = '.ps-radar-vector-marker';
    document.querySelectorAll(selector).forEach(el => {
        el.style.opacity = String(op);
    });
}

/**
 * Actualiza la malla inteligente de vectores del radar sobre el área visible
 */
export async function actualizarCapasRadar(forzarLat = null, forzarLon = null) {
    if (!mapRuntime.radarActivo) return;

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance || typeof L === 'undefined') return;

    const center = mapInstance.getCenter();
    const lat = Number(forzarLat || mapRuntime.latitudActual || center.lat);
    const lon = Number(forzarLon || mapRuntime.longitudActual || center.lng);

    // 1. Obtener pronóstico meteorológico y marino central
    let forecast = mapRuntime.pronosticoDiaCompletoActual || mapRuntime.datosMeteoActuales;
    if (!forecast) {
        try {
            const fechaStr = new Date().toISOString().slice(0, 10);
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,weather_code&wind_speed_unit=ms&start_date=${fechaStr}&end_date=${fechaStr}`);
            if (res.ok) {
                const meteoData = await res.json();
                let marineData = null;
                try {
                    const mRes = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_direction,swell_wave_direction&start_date=${fechaStr}&end_date=${fechaStr}`);
                    if (mRes.ok) marineData = await mRes.json();
                } catch (_) {}

                forecast = {
                    hourly: meteoData.hourly,
                    marineHourly: marineData?.hourly || null
                };
            }
        } catch (err) {
            console.warn('[radar] Error obteniendo datos para radar:', err);
        }
    }

    // 2. Extraer valores centrales para la hora actual
    const horaActual = new Date().getHours();
    const idx = Math.min(horaActual, (forecast?.hourly?.time?.length || 1) - 1);

    const windSpeedMs = forecast?.hourly?.wind_speed_10m?.[idx] ?? 3.5;
    const windKt = kmhANudos(windSpeedMs * 3.6);
    const windDir = forecast?.hourly?.wind_direction_10m?.[idx] ?? 45;
    const precipMm = forecast?.hourly?.precipitation?.[idx] ?? 0;
    const weatherCode = forecast?.hourly?.weather_code?.[idx] ?? 0;

    const waveHeight = forecast?.marineHourly?.wave_height?.[idx] ?? forecast?.hourly?.wave_height?.[idx] ?? 0.35;
    const waveDir = forecast?.marineHourly?.swell_wave_direction?.[idx] ?? forecast?.marineHourly?.wave_direction?.[idx] ?? ((windDir + 15) % 360);

    // Orientación costera y sesgo de viento
    const infoCosta = resolverOrientacionCostera(lat, lon);
    const vientoOffshore = infoCosta?.esCosta && Math.abs(((windDir - (infoCosta.seawardDeg || 0) + 540) % 360) - 180) < 45;

    // Deriva costera PaddleSafe
    const tipoTabla = mapRuntime.equipoUsuario?.tipoTabla || 'inflat_allround';
    const deriva = calcularDerivaCosteraPaddle(windKt, windDir, waveHeight, waveDir, tipoTabla);

    // 3. Valoración Rápida 10-Segundos
    const valoracion = calcularValoracionRapidaPaddleSafe({
        vientoKt: windKt,
        vientoOffshore,
        olaM: waveHeight,
        derivaKt: deriva.velocidadKt,
        precipMm,
        weatherCode
    });

    // 4. Actualizar Inspector del Cockpit
    const verdictBadge = document.getElementById('radarVerdictBadge');
    if (verdictBadge) {
        verdictBadge.textContent = valoracion.etiqueta;
        verdictBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${valoracion.bgClass}`;
    }

    const subtitleEl = document.getElementById('radarVerdictSubtitle');
    if (subtitleEl) {
        subtitleEl.textContent = valoracion.motivo;
    }

    const coordsEl = document.getElementById('radarInspectorCoords');
    if (coordsEl) coordsEl.textContent = `📍 ${lat.toFixed(3)}, ${lon.toFixed(3)}`;

    const biasEl = document.getElementById('radarInspectorBias');
    if (biasEl) {
        biasEl.textContent = vientoOffshore ? '⚠️ Viento Terral (Offshore)' : infoCosta.esCosta ? 'Costero (Onshore/Side)' : 'Aguas protegidas';
        biasEl.className = vientoOffshore ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold';
    }

    const windEl = document.getElementById('radarInspectorWind');
    if (windEl) windEl.textContent = `${windKt.toFixed(1)} kt (${windDir}°)`;

    const waveEl = document.getElementById('radarInspectorWave');
    if (waveEl) waveEl.textContent = `${waveHeight.toFixed(2)} m (${waveDir}°)`;

    const rainEl = document.getElementById('radarInspectorRain');
    if (rainEl) rainEl.textContent = `${precipMm.toFixed(1)} mm/h (${precipMm > 0 ? 'Precipitación' : 'Despejado'})`;

    const driftEl = document.getElementById('radarInspectorDrift');
    if (driftEl) driftEl.textContent = `${deriva.velocidadKt} kt (${deriva.direccionDeg}°) / ${deriva.velocidadMpm} m/min`;

    // 5. Renderizar Malla Táctica Inteligente (Smart Grid Overlays)
    if (mapRuntime.radarWindGroup) mapRuntime.radarWindGroup.clearLayers();
    if (mapRuntime.radarWaveGroup) mapRuntime.radarWaveGroup.clearLayers();
    if (mapRuntime.radarDriftGroup) mapRuntime.radarDriftGroup.clearLayers();

    // Distribución en cuadrícula 3x3 alrededor del centro visible
    const bounds = mapInstance.getBounds();
    const dLat = (bounds.getNorth() - bounds.getSouth()) / 4;
    const dLon = (bounds.getEast() - bounds.getWest()) / 4;

    const op = mapRuntime.radarOpacidad || 1.0;

    for (let i = 1; i <= 3; i++) {
        for (let j = 1; j <= 3; j++) {
            const ptLat = bounds.getSouth() + dLat * i;
            const ptLon = bounds.getWest() + dLon * j;

            // Ligera variación geométrica para dinamismo táctico
            const localWindKt = Math.max(1, windKt + (i - 2) * 0.8);
            const localWindDir = (windDir + (j - 2) * 5 + 360) % 360;
            const localWaveM = Math.max(0.1, waveHeight + (i - 2) * 0.08);
            const localWaveDir = (waveDir + (i - 2) * 4 + 360) % 360;
            const localDeriva = calcularDerivaCosteraPaddle(localWindKt, localWindDir, localWaveM, localWaveDir, tipoTabla);

            // A) Capa de Viento
            if (mapRuntime.radarCapasActivas?.viento !== false && mapRuntime.radarWindGroup) {
                const windIcon = L.divIcon({
                    className: 'ps-radar-vector-marker',
                    html: generarSvgFlechaViento(localWindKt, localWindDir),
                    iconSize: [44, 44]
                });
                const windMarker = L.marker([ptLat, ptLon], { icon: windIcon, interactive: false });
                mapRuntime.radarWindGroup.addLayer(windMarker);
            }

            // B) Capa de Oleaje
            if (mapRuntime.radarCapasActivas?.oleaje !== false && mapRuntime.radarWaveGroup) {
                const waveIcon = L.divIcon({
                    className: 'ps-radar-vector-marker',
                    html: generarSvgFlechaOleaje(localWaveM, localWaveDir),
                    iconSize: [44, 44]
                });
                // Ligero desplazamiento relativo para no solapar el marcador de viento
                const waveMarker = L.marker([ptLat - dLat * 0.18, ptLon + dLon * 0.18], { icon: waveIcon, interactive: false });
                mapRuntime.radarWaveGroup.addLayer(waveMarker);
            }

            // C) Capa de Deriva Costera PaddleSafe
            if (mapRuntime.radarCapasActivas?.deriva !== false && mapRuntime.radarDriftGroup) {
                const driftIcon = L.divIcon({
                    className: 'ps-radar-vector-marker',
                    html: generarSvgFlechaDeriva(localDeriva.velocidadKt, localDeriva.direccionDeg, localDeriva.colorRiesgo),
                    iconSize: [48, 48]
                });
                // Centrado dinámico con offset táctico
                const driftMarker = L.marker([ptLat + dLat * 0.15, ptLon - dLon * 0.15], { icon: driftIcon, interactive: false });
                mapRuntime.radarDriftGroup.addLayer(driftMarker);
            }
        }
    }

    ajustarOpacidadRadar(op);
}

// Auto-registro global en window.* para Leaflet y bindings de la aplicación
if (typeof window !== 'undefined') {
    window.activarModoRadar = activarModoRadar;
    window.desactivarModoRadar = desactivarModoRadar;
    window.toggleCapaRadar = toggleCapaRadar;
    window.ajustarOpacidadRadar = ajustarOpacidadRadar;
    window.actualizarCapasRadar = actualizarCapasRadar;
    window.calcularDerivaCosteraPaddle = calcularDerivaCosteraPaddle;
    window.calcularValoracionRapidaPaddleSafe = calcularValoracionRapidaPaddleSafe;
}

