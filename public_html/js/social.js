// ====================================================
// js/social.js - AMISTADES, FEED Y NOTIFICACIONES
// ====================================================

import { supabaseClient, appState } from './config.js';
import { esc, safeUrl, IMG_FALLBACK, generarMiniSvgTrazadoRuta } from './utils.js';
import { descargarGPX, parseGPX, generarGPX } from './gpxParser.js';
import { ClubState } from './club/state.js';

// ====================================================
// REGISTRO Y CACHÉ EN MEMORIA DE RUTAS SOCIALES
// ====================================================
export const socialRoutesCache = {};
if (typeof window !== 'undefined') {
    window.socialRoutesCache = socialRoutesCache;
}

/**
 * Extrae telemetría meteorológica y bioenergética de una travesía social o de club
 */
export function extraerTelemetriaRutaSocial(ruta) {
    if (!ruta) return { weather: null, kcal: 0, velMedia: 0, duracionMin: 0, distKm: 0, splits: null };

    const rutaId = String(ruta.id || ruta.ruta_id || '');
    let weather = null;
    let splits = null;

    // 1. Columnas directas en el objeto ruta
    if (ruta.weather_snapshot) {
        weather = typeof ruta.weather_snapshot === 'string' ? JSON.parse(ruta.weather_snapshot) : ruta.weather_snapshot;
    }

    // 2. LocalStorage de telemetría de navegación
    if (!weather && rutaId) {
        try {
            const raw = localStorage.getItem('ps_telemetry_' + rutaId);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.weatherSnapshot) weather = parsed.weatherSnapshot;
                else if (parsed.vientoKt !== undefined) weather = parsed;
                if (parsed.splits) splits = parsed.splits;
            }
        } catch (_) {}
    }

    // 3. Inspeccionar splits_data
    if (ruta.splits_data) {
        try {
            const parsedSplits = typeof ruta.splits_data === 'string' ? JSON.parse(ruta.splits_data) : ruta.splits_data;
            if (Array.isArray(parsedSplits)) splits = parsedSplits;
            else if (parsedSplits && typeof parsedSplits === 'object') {
                if (!weather && parsedSplits.weather) weather = parsedSplits.weather;
                if (!splits && parsedSplits.splits) splits = parsedSplits.splits;
            }
        } catch (_) {}
    }

    // 4. Inspeccionar ai_feedback
    if (!weather && ruta.ai_feedback) {
        try {
            const fb = typeof ruta.ai_feedback === 'string' ? JSON.parse(ruta.ai_feedback) : ruta.ai_feedback;
            if (fb?.meteo || fb?.weatherSnapshot) weather = fb.meteo || fb.weatherSnapshot;
        } catch (_) {}
    }

    // 5. Inspeccionar ruta_json
    if (ruta.ruta_json) {
        try {
            const rj = typeof ruta.ruta_json === 'string' ? JSON.parse(ruta.ruta_json) : ruta.ruta_json;
            if (!weather && rj?.weather) weather = rj.weather;
            if (!splits && rj?.splits) splits = rj.splits;
        } catch (_) {}
    }

    // 6. Columnas independientes si existen en la tabla
    if (!weather && (ruta.wind_speed_kt != null || ruta.wave_height_m != null)) {
        weather = {
            vientoKt: Number(ruta.wind_speed_kt) || 0,
            rachaKt: Number(ruta.wind_gust_kt) || Number(ruta.wind_speed_kt) || 0,
            dirViento: Number(ruta.wind_direction_deg) || null,
            olasM: Number(ruta.wave_height_m) || 0,
            periodoS: Number(ruta.wave_period_s) || 0,
            score: Number(ruta.conditions_score) || null
        };
    }

    // Normalizar snapshot meteorológico
    let weatherSnapshot = null;
    if (weather) {
        const vKt = Number(weather.vientoKt ?? weather.wind_speed_kt ?? weather.viento ?? 0);
        const rKt = Number(weather.rachaKt ?? weather.rachasKt ?? weather.wind_gust_kt ?? vKt);
        const dir = weather.dirViento ?? weather.dirVientoDeg ?? weather.wind_direction_deg ?? null;
        const oM = Number(weather.olasM ?? weather.oleajeM ?? weather.wave_height_m ?? 0);
        const pS = Number(weather.periodoS ?? weather.periodoOlaS ?? weather.wave_period_s ?? 0);
        const sc = weather.score ?? weather.scoreSeguridad ?? weather.conditions_score ?? null;

        weatherSnapshot = {
            vientoKt: vKt,
            rachaKt: rKt,
            dirViento: dir !== null ? Number(dir) : null,
            olasM: oM,
            periodoS: pS,
            score: sc !== null ? Number(sc) : null
        };
    }

    const duracionMin = Number(ruta.tiempo_minutos || ruta.duration_minutes || (ruta.duration_seconds ? Math.round(ruta.duration_seconds / 60) : 0));
    const distKm = Number(ruta.distancia_km || ruta.distance_km || 0);
    const velMedia = duracionMin > 0
        ? Number((distKm / (duracionMin / 60)).toFixed(1))
        : Number(ruta.velocidad_media || ruta.avg_speed_kmh || ruta.avg_speed || 0);

    // Cálculo calórico biometría SUP
    let kcal = 0;
    if (typeof window.calcularBiometriaSup === 'function') {
        const bio = window.calcularBiometriaSup({
            duracionMin,
            distKm,
            velKmh: velMedia,
            vientoKt: weatherSnapshot?.vientoKt || 0,
            olasM: weatherSnapshot?.olasM || 0,
            periodoS: weatherSnapshot?.periodoS || 0,
            tempC: 22,
            tipoTabla: 'all-round'
        });
        kcal = bio?.kcal || 0;
    }
    if (!kcal && duracionMin > 0) {
        kcal = Math.round((6.0 + (velMedia > 5 ? 1.5 : 0)) * 75 * (duracionMin / 60));
    }

    return {
        weather: weatherSnapshot,
        kcal,
        velMedia,
        duracionMin,
        distKm,
        splits
    };
}

/**
 * Renderiza una tarjeta de travesía enriquecida para el Feed y el Muro de Club
 */
export function renderTarjetaRutaSocial(ruta, clubNombre = null) {
    if (!ruta) return '';
    const rutaId = String(ruta.id || ruta.ruta_id || '');
    if (rutaId) {
        socialRoutesCache[rutaId] = ruta;
        if (ruta.id) socialRoutesCache[String(ruta.id)] = ruta;
        if (ruta.ruta_id) socialRoutesCache[String(ruta.ruta_id)] = ruta;
    }

    const { weather, kcal, velMedia, duracionMin, distKm } = extraerTelemetriaRutaSocial(ruta);
    const autorNombre = ruta.perfiles?.nombre || 'Paddler';
    const autorAvatar = safeUrl(ruta.perfiles?.avatar_url, IMG_FALLBACK);
    const ubicacion = ruta.ubicacion || ruta.title || 'Travesía SUP';
    const fechaStr = ruta.fecha || ruta.created_at ? new Date(ruta.fecha || ruta.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    const xpVal = Number(ruta.xp_ganados || ruta.xp || ruta.points_earned) || Math.max(10, Math.round(distKm * 20 + duracionMin * 2));

    // Comprobar si la ruta tiene coordenadas disponibles
    let coords = ruta.route_coordinates || ruta.coordinates || ruta.ruta_json;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (_) { coords = null; }
    }
    const tieneCoords = Array.isArray(coords) && coords.length > 0;
    const esPropietario = appState.sesionActual?.user?.id && ruta.user_id === appState.sesionActual.user.id;

    // 1. Badge de condición costera si hay snapshot meteo
    let weatherBadgeHtml = '';
    if (weather) {
        const scoreVal = weather.score != null ? Math.round(weather.score) : null;
        const scoreIcon = scoreVal != null ? (scoreVal >= 75 ? '🟢' : scoreVal >= 50 ? '🟡' : '🔴') : '';
        weatherBadgeHtml = `
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-950/60 border border-sky-800 text-[11px] font-bold text-sky-300 mt-1 mb-2">
                <span>💨 ${weather.vientoKt} kt</span>
                <span>·</span>
                <span>🌊 ${weather.olasM.toFixed(1)}m</span>
                ${scoreVal != null ? `<span>·</span><span>${scoreIcon} Score ${scoreVal}</span>` : ''}
            </div>
        `;
    }

    // 2. Previsualización de Trazado Mini SVG (Strava-style)
    let miniSvgHtml = '';
    if (tieneCoords) {
        const svgCode = (typeof window !== 'undefined' && typeof window.generarMiniSvgTrazadoRuta === 'function')
            ? window.generarMiniSvgTrazadoRuta(coords, '#38bdf8')
            : (typeof generarMiniSvgTrazadoRuta === 'function' ? generarMiniSvgTrazadoRuta(coords, '#38bdf8') : '');

        miniSvgHtml = `
            <div class="relative w-full h-32 my-2.5 rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-950/70 p-2 flex items-center justify-center shadow-inner group cursor-pointer" onclick="abrirRutaSocialEnMapa('${rutaId}')" title="Clic para cargar en Cabina">
                ${svgCode}
                <div class="absolute bottom-2 left-2 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-sky-500/30 text-[9px] font-mono font-bold text-sky-400 shadow">
                    <span>📍</span><span>GPS TRACK</span>
                </div>
                <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-sky-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs">
                    Cargar en Cabina 🗺️
                </div>
            </div>
        `;
    }

    // 3. Previsualización Póster Finisher si hay imagen_url
    let posterHtml = '';
    if (ruta.imagen_url) {
        const resumenStats = `📏 ${distKm.toFixed(2)} km · ⏱️ ${duracionMin} min · 🚀 ${velMedia.toFixed(1)} km/h`;
        posterHtml = `
            <div class="relative mt-2 mb-3 rounded-2xl overflow-hidden border border-slate-700 group cursor-pointer shadow-md bg-slate-900" onclick="verPosterFinisherFullscreen('${esc(ruta.imagen_url)}', '${esc(ubicacion)}', '${esc(resumenStats)}')">
                <img src="${esc(safeUrl(ruta.imagen_url))}" class="w-full max-h-64 object-cover object-center group-hover:scale-[1.02] transition-transform duration-300" loading="lazy" alt="Póster Finisher" onerror="this.onerror=null; this.parentElement.style.display='none';" />
                <span class="absolute top-2.5 left-2.5 bg-slate-900/85 backdrop-blur-md text-amber-300 border border-amber-400/40 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">🏄 PÓSTER FINISHER</span>
            </div>
        `;
    }

    // 4. Cuadrícula de 4 Métricas de Telemetría (Design System 5.0 + .ps-tabular)
    const statsGridHtml = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5">
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-xs">
                <span class="text-xs">📏</span>
                <div>
                    <p class="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Distancia</p>
                    <p class="text-xs font-black text-white ps-tabular">${distKm.toFixed(2)} km</p>
                </div>
            </div>
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-xs">
                <span class="text-xs">⏱️</span>
                <div>
                    <p class="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Tiempo</p>
                    <p class="text-xs font-bold text-white ps-tabular">${duracionMin} min</p>
                </div>
            </div>
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-xs">
                <span class="text-xs">⚡</span>
                <div>
                    <p class="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Vel. Media</p>
                    <p class="text-xs font-bold text-cyan-400 ps-tabular">${velMedia.toFixed(1)} km/h</p>
                </div>
            </div>
            <div class="bg-slate-800/80 border border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-xs">
                <span class="text-xs">✨</span>
                <div>
                    <p class="text-[9px] text-slate-400 uppercase tracking-wider font-bold">XP</p>
                    <p class="text-xs font-black text-amber-400 ps-tabular">+${xpVal} XP</p>
                </div>
            </div>
        </div>
    `;

    // 5. Barra de acciones operativas, Cargar en Cabina y Likes
    let actionButtonsHtml = '';
    if (tieneCoords || rutaId) {
        actionButtonsHtml = `
            <div class="flex items-center justify-between flex-wrap gap-2 pt-2.5 mt-2 border-t border-slate-700/60">
                <div class="flex items-center gap-1.5 flex-wrap">
                    ${tieneCoords ? `
                        <button type="button" onclick="abrirRutaSocialEnMapa('${rutaId}')" class="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-white font-black text-[11px] rounded-xl shadow-md shadow-sky-900/30 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer">
                            <span>🗺️</span><span>Cargar en Cabina</span>
                        </button>
                        <button type="button" onclick="abrirRutaSocialConReplay('${rutaId}')" class="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-[11px] rounded-xl shadow-md shadow-emerald-950/40 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer" title="Ver animación Flyover 60 FPS">
                            <span>▶️</span><span>Replay</span>
                        </button>
                        <button type="button" onclick="descargarGpxRutaSocial('${rutaId}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-[11px] rounded-xl shadow-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>📲</span><span>GPX</span>
                        </button>
                    ` : ''}
                    <button type="button" onclick="mostrarModalSplitsKm('${rutaId}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-[11px] rounded-xl shadow-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                        <span>📊</span><span>Splits</span>
                    </button>
                    ${esPropietario ? `
                        <button type="button" onclick="compartirRutaEnMiClub('${rutaId}')" class="px-2.5 py-1.5 bg-indigo-900/70 hover:bg-indigo-800 text-indigo-300 border border-indigo-700/50 font-bold text-[11px] rounded-xl shadow-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Compartir en el muro de mi club">
                            <span>📣</span><span>Club</span>
                        </button>
                        <button type="button" onclick="eliminarRutaSocial('${rutaId}')" class="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/50 font-bold text-[11px] rounded-xl shadow-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Eliminar ruta">
                            <span>🗑️</span><span>Eliminar</span>
                        </button>
                    ` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="toggleLikeRutaSocial('${rutaId}')" id="btnLikeSocial-${rutaId}" class="px-2 py-1 text-slate-400 hover:text-red-400 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer" title="Me gusta">
                        <span>❤️</span><span id="likeCountSocial-${rutaId}">0</span>
                    </button>
                    <button type="button" onclick="toggleComentariosRutaSocial('${rutaId}')" id="btnCommentSocial-${rutaId}" class="px-2 py-1 text-slate-400 hover:text-sky-400 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer" title="Comentarios">
                        <span>💬</span><span id="commentCountSocial-${rutaId}">0</span>
                    </button>
                </div>
            </div>
            <div id="comentarios-seccion-${rutaId}" class="hidden pt-3 mt-2 border-t border-slate-700/60">
                <div id="comentarios-lista-${rutaId}" class="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1"></div>
                <div class="flex items-center gap-2">
                    <input type="text" id="comentario-input-${rutaId}" placeholder="Escribe un comentario..." class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500" onkeydown="if(event.key==='Enter') agregarComentarioRuta('${rutaId}')">
                    <button type="button" onclick="agregarComentarioRuta('${rutaId}')" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow active:scale-95 transition-all cursor-pointer">Enviar</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="flex flex-col gap-1 w-full text-left">
            <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="relative shrink-0">
                        <img src="${autorAvatar}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-11 h-11 rounded-full object-cover border-2 border-slate-700 shadow-sm" alt="Avatar">
                        <span data-user-presence-id="${esc(ruta.user_id || '')}" class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 bg-slate-500 transition-colors"></span>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-black text-white leading-tight truncate">${esc(autorNombre)}</p>
                        <p class="text-[11px] text-slate-400 truncate font-semibold">${esc(ubicacion)} ${clubNombre ? `· <span class="text-sky-400 font-bold">${esc(clubNombre)}</span>` : ''}</p>
                    </div>
                </div>
                ${fechaStr ? `<span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider shrink-0 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">${fechaStr}</span>` : ''}
            </div>
            ${weatherBadgeHtml}
            ${miniSvgHtml}
            ${posterHtml}
            ${statsGridHtml}
            ${actionButtonsHtml}
        </div>
    `;
}

export function verPosterFinisherFullscreen(imgUrl, titulo = 'Póster Finisher', resumenStats = '') {
    if (!imgUrl) return;
    let lb = document.getElementById('posterFinisherLightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'posterFinisherLightbox';
        lb.className = 'fixed inset-0 z-[130] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 transition-opacity opacity-0';
        document.body.appendChild(lb);
    }

    lb.innerHTML = `
        <div class="relative max-w-xl w-full flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
            <div class="w-full flex items-center justify-between text-white px-2">
                <div class="min-w-0">
                    <h3 class="font-black text-sm uppercase tracking-wider text-water truncate">${esc(titulo)}</h3>
                    ${resumenStats ? `<p class="text-xs text-slate-400 mt-0.5">${esc(resumenStats)}</p>` : ''}
                </div>
                <button type="button" onclick="cerrarPosterFinisherFullscreen()" class="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer">✕</button>
            </div>
            <div class="relative w-full rounded-2xl overflow-hidden border border-slate-700 shadow-2xl bg-black max-h-[70vh] flex items-center justify-center">
                <img src="${esc(safeUrl(imgUrl))}" alt="Póster Finisher" class="max-w-full max-h-[70vh] object-contain rounded-xl" />
            </div>
            <div class="w-full flex items-center justify-center gap-3 pt-1">
                <a href="${esc(safeUrl(imgUrl))}" download="paddlesafe_finisher.png" target="_blank" class="px-4 py-2.5 bg-marine hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer">📥 Descargar Imagen</a>
                <button type="button" onclick="compartirPosterFinisher('${esc(safeUrl(imgUrl))}', '${esc(titulo)}')" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer">📲 Compartir</button>
            </div>
        </div>
    `;

    lb.classList.remove('hidden');
    requestAnimationFrame(() => {
        lb.classList.remove('opacity-0');
    });

    if (window.history && window.history.pushState) {
        window.history.pushState({ modalOpen: true, modalId: 'posterFinisherLightbox' }, '');
    }
}

export function cerrarPosterFinisherFullscreen() {
    const lb = document.getElementById('posterFinisherLightbox');
    if (!lb) return;
    lb.classList.add('opacity-0');
    setTimeout(() => {
        lb.classList.add('hidden');
    }, 200);
}

export async function compartirPosterFinisher(imgUrl, titulo) {
    if (navigator.share) {
        try {
            await navigator.share({
                title: titulo || 'Mi travesía PaddleSafe',
                text: '¡Mira mi póster finisher de travesía en PaddleSafe!',
                url: imgUrl
            });
            return;
        } catch (_) {}
    }
    if (navigator.clipboard) {
        await navigator.clipboard.writeText(imgUrl);
        alert('Enlace del póster copiado al portapapeles.');
    } else {
        window.open(imgUrl, '_blank');
    }
}

/**
 * Carga una travesía del feed social directamente en el mapa
 */
export function abrirRutaSocialEnMapa(rutaId) {
    const ruta = socialRoutesCache[String(rutaId)] || window.__rutasUsuarioCache?.get(String(rutaId));
    if (!ruta) {
        alert("No se encontraron los datos de la ruta seleccionada.");
        return;
    }
    if (typeof window.cerrarModalActivo === 'function') {
        const modal = typeof window.obtenerModalActivo === 'function' ? window.obtenerModalActivo() : null;
        if (modal) window.cerrarModalActivo(modal);
    }
    if (typeof window.cerrarModalFeed === 'function') window.cerrarModalFeed();
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();

    if (typeof window.cargarRutaDeportivaEnMapa === 'function') {
        window.cargarRutaDeportivaEnMapa(ruta);
    }
}

/**
 * Carga una travesía del feed social e inicia inmediatamente el Replay 60 FPS
 */
export function abrirRutaSocialConReplay(rutaId) {
    abrirRutaSocialEnMapa(rutaId);
    setTimeout(() => {
        if (typeof window.togglePlayPauseReplayRuta === 'function') {
            window.togglePlayPauseReplayRuta(true);
        }
    }, 400);
}

/**
 * Descarga una travesía social en formato GPX
 */
export function descargarGpxRutaSocial(rutaId) {
    const ruta = socialRoutesCache[String(rutaId)] || window.__rutasUsuarioCache?.get(String(rutaId));
    if (!ruta) {
        alert("Ruta no encontrada para exportar.");
        return;
    }
    let rawCoords = ruta.route_coordinates || ruta.coordinates || ruta.ruta_json;
    if (typeof rawCoords === 'string') {
        try { rawCoords = JSON.parse(rawCoords); } catch (e) { rawCoords = []; }
    }
    if (!Array.isArray(rawCoords) || rawCoords.length === 0) {
        alert("Esta ruta no tiene coordenadas disponibles para exportar en GPX.");
        return;
    }
    const normalized = rawCoords.map(pt => {
        if (Array.isArray(pt)) return { lat: Number(pt[0]), lon: Number(pt[1]) };
        return { lat: Number(pt.lat), lon: Number(pt.lon ?? pt.lng) };
    }).filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lon));

    if (normalized.length < 2) {
        alert("La ruta necesita al menos 2 puntos válidos para generar un archivo GPX.");
        return;
    }

    const cleanTitle = (ruta.ubicacion || ruta.title || 'ruta_paddlesafe').replace(/[^a-zA-Z0-9_\-]/g, '_');
    descargarGPX(normalized, `${cleanTitle}.gpx`);
}

/**
 * Comparte una travesía propia en el muro del club del usuario
 */
export async function compartirRutaEnMiClub(rutaId) {
    if (!appState.sesionActual || appState.esInvitado) {
        if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
        else alert("Inicia sesión para compartir travesías en tu club.");
        return;
    }

    const user = appState.sesionActual.user;
    const ruta = socialRoutesCache[String(rutaId)] || window.__rutasUsuarioCache?.get(String(rutaId));
    if (!ruta) {
        alert("Ruta no encontrada.");
        return;
    }

    let clubId = ClubState?.activeId || null;
    let clubNombre = 'Mi Club';

    if (!clubId) {
        const { misClubsIds } = await socialFeed.obtenerFiltrosUsuario();
        if (misClubsIds && misClubsIds.length > 0) {
            clubId = misClubsIds[0];
        }
    }

    if (!clubId) {
        alert("Debes pertenecer a un club para poder compartir travesías en su muro.");
        return;
    }

    try {
        const { data: clubData } = await supabaseClient.from('clubs').select('nombre').eq('id', clubId).maybeSingle();
        if (clubData?.nombre) clubNombre = clubData.nombre;
    } catch (_) {}

    const { distKm, velMedia, kcal } = extraerTelemetriaRutaSocial(ruta);
    const nombreUbicacion = ruta.ubicacion || ruta.title || 'Travesía SUP';

    // 1. Insertar en public.club_rutas ignorando duplicados
    try {
        const { error: insErr } = await supabaseClient.from('club_rutas').insert([{
            club_id: clubId,
            ruta_id: rutaId,
            compartida_por: user.id
        }]);
        if (insErr && insErr.code !== '23505') {
            await supabaseClient.from('club_rutas').insert([{
                club_id: clubId,
                ruta_id: rutaId
            }]);
        }
    } catch (err) {
        console.warn("Aviso guardando club_ruta:", err);
    }

    // 2. Mensaje en el chat del club
    const mensajeChat = `🏄‍♂️ He compartido una travesía en el club: ${nombreUbicacion} — 📏 ${distKm.toFixed(2)} km | 🚀 ${velMedia.toFixed(1)} km/h | 🔥 ${kcal} kcal`;

    try {
        await supabaseClient.from('club_chat').insert([{
            club_id: clubId,
            user_id: user.id,
            mensaje: mensajeChat,
            visibility: 'club_only',
            is_public: false
        }]);
    } catch (_) {
        try {
            await supabaseClient.from('club_chat').insert([{
                club_id: clubId,
                user_id: user.id,
                mensaje: mensajeChat
            }]);
        } catch (_) {}
    }

    // 3. Notificación de confirmación toast
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300';
    toast.innerHTML = `<span>📣</span><span>¡Travesía compartida con éxito en <b>${esc(clubNombre)}</b>!</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

/**
 * Elimina una travesía propia con confirmación y purga de caché
 */
export async function eliminarRutaSocial(rutaId) {
    if (!rutaId) return;
    if (!appState.sesionActual || appState.esInvitado) {
        if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
        else alert("Inicia sesión para eliminar travesías.");
        return;
    }

    if (!confirm("¿Estás seguro de que deseas eliminar esta travesía? Esta acción es irreversible.")) {
        return;
    }

    const userId = appState.sesionActual.user.id;

    try {
        // Eliminar de public.rutas
        const { error: err1 } = await supabaseClient
            .from('rutas')
            .delete()
            .eq('id', rutaId)
            .eq('user_id', userId);
        if (err1) throw err1;

        // Intentar eliminar también de user_routes por si es legacy
        try {
            await supabaseClient
                .from('user_routes')
                .delete()
                .eq('id', rutaId)
                .eq('user_id', userId);
        } catch (_) {}

        // Limpiar memoria caché
        if (socialRoutesCache) {
            delete socialRoutesCache[String(rutaId)];
        }
        if (window.__rutasUsuarioCache) {
            window.__rutasUsuarioCache.delete(String(rutaId));
        }

        // Eliminar elemento del DOM si existe
        const domEl = document.getElementById(`tarjeta-ruta-${rutaId}`) || document.querySelector(`[data-ruta-id="${rutaId}"]`);
        if (domEl) {
            domEl.remove();
        } else if (window.socialFeed && typeof window.socialFeed.cargarActividad === 'function') {
            window.socialFeed.cargarActividad();
        }

        alert("✅ Travesía eliminada correctamente.");
    } catch (err) {
        console.error("Error al eliminar ruta social:", err);
        alert("❌ Error al eliminar la ruta: " + (err.message || err));
    }
}


/**
 * Toggle like local y en Supabase (public.rutas_likes)
 */
export async function toggleLikeRutaSocial(rutaId) {
    if (!rutaId) return;
    const key = 'ps_like_' + rutaId;
    const isLiked = localStorage.getItem(key) === 'true';
    const countEl = document.getElementById(`likeCountSocial-${rutaId}`);
    const btnEl = document.getElementById(`btnLikeSocial-${rutaId}`);
    let currentCount = parseInt(countEl?.textContent || '0', 10);

    // Actualización optimista de UI
    if (isLiked) {
        localStorage.removeItem(key);
        currentCount = Math.max(0, currentCount - 1);
        if (btnEl) btnEl.classList.remove('text-red-500', 'dark:text-red-400');
    } else {
        localStorage.setItem(key, 'true');
        currentCount += 1;
        if (btnEl) btnEl.classList.add('text-red-500', 'dark:text-red-400');
    }
    if (countEl) countEl.textContent = currentCount;

    // Persistencia asíncrona en Supabase si hay sesión activa
    const userId = appState.sesionActual?.user?.id;
    if (userId) {
        try {
            if (isLiked) {
                await supabaseClient.from('rutas_likes').delete().eq('ruta_id', rutaId).eq('user_id', userId);
            } else {
                await supabaseClient.from('rutas_likes').insert([{ ruta_id: rutaId, user_id: userId }]);
            }
        } catch (err) {
            console.warn('[toggleLikeRutaSocial] Aviso persistencia Supabase:', err);
        }
    }
}

/**
 * Muestra/oculta y carga comentarios de una travesía
 */
export async function toggleComentariosRutaSocial(rutaId) {
    if (!rutaId) return;
    const sec = document.getElementById(`comentarios-seccion-${rutaId}`);
    if (!sec) return;
    const isHidden = sec.classList.contains('hidden');
    sec.classList.toggle('hidden');
    if (isHidden) {
        await cargarComentariosRuta(rutaId);
    }
}

/**
 * Consulta y renderiza comentarios de public.rutas_comentarios
 */
export async function cargarComentariosRuta(rutaId) {
    const listEl = document.getElementById(`comentarios-lista-${rutaId}`);
    const countEl = document.getElementById(`commentCountSocial-${rutaId}`);
    if (!listEl) return;

    listEl.innerHTML = '<p class="text-[10px] text-slate-400 animate-pulse text-center py-2">Cargando comentarios...</p>';

    try {
        const { data: coms, error } = await supabaseClient
            .from('rutas_comentarios')
            .select('*')
            .eq('ruta_id', rutaId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const count = coms ? coms.length : 0;
        if (countEl) countEl.textContent = count;

        if (!coms || coms.length === 0) {
            listEl.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Sé el primero en comentar esta travesía.</p>';
            return;
        }

        const myId = appState.sesionActual?.user?.id;
        listEl.innerHTML = coms.map(c => {
            const autor = c.autor_nombre || 'Paddler';
            const avatar = safeUrl(c.autor_avatar, IMG_FALLBACK);
            const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            const esMio = myId && c.user_id === myId;
            const comTexto = c.comentario || c.texto || c.contenido || '';

            return `
                <div class="flex items-start gap-2 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-left">
                    <img src="${esc(avatar)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-1">
                            <span class="text-[11px] font-bold text-marine dark:text-white truncate">${esc(autor)}</span>
                            <span class="text-[9px] text-slate-400 shrink-0">${esc(fecha)}</span>
                        </div>
                        <p class="text-[11px] text-slate-700 dark:text-slate-300 break-words mt-0.5">${esc(comTexto)}</p>
                    </div>
                    ${esMio ? `
                        <button type="button" onclick="eliminarComentarioRuta('${esc(c.id)}', '${esc(rutaId)}')" class="text-slate-400 hover:text-red-500 text-[10px] p-0.5 shrink-0 transition-colors cursor-pointer" title="Borrar comentario">🗑️</button>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.warn('[cargarComentariosRuta] Error:', err);
        listEl.innerHTML = '<p class="text-[10px] text-red-500 text-center py-2">Error al cargar comentarios.</p>';
    }
}

/**
 * Agrega un nuevo comentario a public.rutas_comentarios
 */
export async function agregarComentarioRuta(rutaId) {
    if (!rutaId) return;
    if (!appState.sesionActual || appState.esInvitado) {
        if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
        else alert("Debes iniciar sesión para comentar.");
        return;
    }

    const input = document.getElementById(`comentario-input-${rutaId}`);
    const texto = input ? input.value.trim() : '';
    if (!texto) return;

    const user = appState.sesionActual.user;
    const autorNombre = appState.perfilUsuario?.nombre || 'Paddler';
    const autorAvatar = appState.perfilUsuario?.avatar_url || null;

    try {
        const { error } = await supabaseClient.from('rutas_comentarios').insert([{
            ruta_id: rutaId,
            user_id: user.id,
            comentario: texto,
            texto: texto,
            contenido: texto,
            autor_nombre: autorNombre,
            autor_avatar: autorAvatar
        }]);

        if (error) throw error;
        if (input) input.value = '';
        await cargarComentariosRuta(rutaId);
    } catch (err) {
        console.error('[agregarComentarioRuta] Error:', err);
        alert("Error al enviar comentario: " + (err.message || err));
    }
}

/**
 * Elimina un comentario propio de public.rutas_comentarios
 */
export async function eliminarComentarioRuta(comentarioId, rutaId) {
    if (!comentarioId) return;
    if (!confirm("¿Deseas eliminar este comentario?")) return;

    try {
        const { error } = await supabaseClient
            .from('rutas_comentarios')
            .delete()
            .eq('id', comentarioId)
            .eq('user_id', appState.sesionActual?.user?.id);

        if (error) throw error;
        if (rutaId) await cargarComentariosRuta(rutaId);
    } catch (err) {
        console.error('[eliminarComentarioRuta] Error:', err);
        alert("Error al eliminar comentario: " + (err.message || err));
    }
}

// ====================================================
// NOTIFICACIONES INTERNAS (socialNotifications)
// ====================================================
export const socialNotifications = {
    async crear(datos) {
        try {
            const list = Array.isArray(datos) ? datos : [datos];
            for (const item of list) {
                const targetUserId = item.user_id || item.userId;
                if (!targetUserId) continue;
                const tipo = item.tipo || 'general';
                const titulo = item.titulo || (tipo === 'solicitud_amistad' ? 'Solicitud de Amistad' : tipo === 'resolucion_amistad' ? 'Respuesta de Amistad' : tipo);
                const mensaje = item.contenido || item.mensaje || '';
                const extraData = item.data || {};

                try {
                    const { error: rpcErr } = await supabaseClient.rpc('enviar_notificacionSegura', {
                        p_user_id: targetUserId,
                        p_tipo: tipo,
                        p_titulo: titulo,
                        p_mensaje: mensaje,
                        p_data: extraData
                    });
                    if (rpcErr) throw rpcErr;
                } catch (rpcErr) {
                    console.warn("enviar_notificacionSegura RPC fallback:", rpcErr);
                    // Fallback directo a insert en tabla notificaciones
                    await supabaseClient.from('notificaciones').insert([{
                        user_id: targetUserId,
                        tipo: tipo,
                        contenido: mensaje,
                        titulo: titulo,
                        data: extraData
                    }]);
                }
            }
        } catch (err) {
            console.warn("Aviso no crítico (Crear Notificación):", err);
        }
    },
    async cargarNotificaciones() {
        if (!appState.sesionActual || appState.esInvitado) return;
        try {
            const { data } = await supabaseClient
                .from('notificaciones')
                .select('*')
                .eq('user_id', appState.sesionActual.user.id)
                .order('created_at', { ascending: false })
                .limit(30);
                
            const badge = document.getElementById('notifBadge');
            const noLeidas = data?.filter(n => !n.leida).length || 0;
            if (badge) {
                if (noLeidas > 0) {
                    badge.textContent = noLeidas > 9 ? '9+' : noLeidas;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            
            const c = document.getElementById('notifContainerList');
            if (!c) return;
            if (!data || data.length === 0) {
                c.innerHTML = `<div class="text-center py-10 opacity-60"><p class="text-[10px] font-bold uppercase dark:text-slate-400">Sin novedades</p></div>`;
                return;
            }
            
            c.innerHTML = data.map(n => {
                const icon = n.tipo === 'invitacion_club' ? '✉️' : (n.tipo === 'solicitud_club' || n.tipo === 'resolucion_club' ? '⚓' : n.tipo === 'mensaje_chat' ? '💬' : '🔔');
                const estilo = n.leida ? 'bg-white dark:bg-slate-800 opacity-75 border-slate-200 dark:border-slate-700' : 'bg-sky-50 dark:bg-sky-900/20 shadow-sm border-sky-100 dark:border-sky-800/50';
                const btnLeida = !n.leida ? `<button onclick="socialNotifications.marcarLeida('${n.id}')" class="text-[9px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 btn-marcar dark:text-white transition-colors">Leída</button>` : '';
                
                let accionesHTML = btnLeida;
                if (n.tipo === 'invitacion_club' && !n.leida && n.data?.invitacion_id) {
                    accionesHTML = `
                        <div class="flex gap-2 items-center">
                            <button onclick="if(window.Club?.procesarInvitacion) window.Club.procesarInvitacion('${esc(n.data.invitacion_id)}', 'aceptar'); socialNotifications.marcarLeida('${n.id}');" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold active:scale-95 cursor-pointer">Aceptar</button>
                            <button onclick="if(window.Club?.procesarInvitacion) window.Club.procesarInvitacion('${esc(n.data.invitacion_id)}', 'rechazar'); socialNotifications.marcarLeida('${n.id}');" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold active:scale-95 cursor-pointer">Rechazar</button>
                            ${btnLeida}
                        </div>
                    `;
                }

                return `
                    <div id="notif-${n.id}" class="flex gap-3 p-3 border rounded-xl mb-2 transition-colors ${estilo}">
                        <div class="text-2xl">${icon}</div>
                        <div class="flex-1">
                            <p class="text-xs font-bold text-marine dark:text-white leading-tight mb-1">${esc(n.contenido)}</p>
                            <div class="flex justify-end">${accionesHTML}</div>
                        </div>
                    </div>`;
            }).join('');
        } catch (err) {
            console.warn("Aviso no crítico (Cargar notificaciones):", err);
        }
    },
    async marcarLeida(id) {
        try {
            await supabaseClient.from('notificaciones').update({ leida: true }).eq('id', id);
            const t = document.getElementById(`notif-${id}`);
            if (t) {
                t.classList.remove('bg-sky-50', 'dark:bg-sky-900/20', 'border-sky-100', 'dark:border-sky-800/50', 'shadow-sm');
                t.classList.add('bg-white', 'dark:bg-slate-800', 'opacity-75', 'border-slate-200', 'dark:border-slate-700');
                const b = t.querySelector('.btn-marcar');
                if (b) b.remove();
            }
            this.cargarNotificaciones();
        } catch (err) {
            console.warn("Aviso no crítico (Marcar leída):", err);
        }
    },
    async marcarTodasLeidas() {
        try {
            await supabaseClient.from('notificaciones').update({ leida: true }).eq('user_id', appState.sesionActual.user.id).eq('leida', false);
            this.cargarNotificaciones();
        } catch (err) {
            console.warn("Aviso no crítico (Marcar todas leídas):", err);
        }
    }
};

export function mostrarPanelAvisos() {
    let m = document.getElementById('notificationsModal');
    if (!m) {
        const modalHTML = `
        <div id="notificationsModal" class="fixed inset-0 z-[9999] hidden flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity opacity-0">
            <div class="bg-slate-50 dark:bg-slate-900 w-[90%] max-w-md rounded-[32px] shadow-2xl p-6 transform scale-95 transition-transform relative max-h-[80vh] flex flex-col">
                <div class="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-3">
                    <h3 class="text-lg font-black text-marine dark:text-white uppercase tracking-widest">Avisos</h3>
                    <div class="flex gap-3">
                        <button onclick="socialNotifications.marcarTodasLeidas()" class="text-[10px] text-water dark:text-sky-400 font-bold uppercase tracking-widest bg-sky-50 dark:bg-sky-900/30 px-3 py-1.5 rounded-lg active:scale-95 transition-transform">✓ Leídas</button>
                        <button onclick="cerrarPanelAvisos()" class="text-slate-400 hover:text-red-500 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>
                <div id="notifContainerList" class="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        m = document.getElementById('notificationsModal');
    }
    m.classList.remove('hidden');
    m.classList.add('flex');
    requestAnimationFrame(() => { m.classList.remove('opacity-0'); m.querySelector('div').classList.remove('scale-95'); });
    socialNotifications.cargarNotificaciones();
}

export function cerrarPanelAvisos() {
    const m = document.getElementById('notificationsModal');
    if (!m) return;
    m.classList.add('opacity-0');
    m.querySelector('div').classList.add('scale-95');
    setTimeout(() => { m.classList.add('hidden'); m.classList.remove('flex'); }, 300);
}

// ====================================================
// SISTEMA DE AMISTADES
// ====================================================
export async function enviarSolicitudAmistad(amigoId) {
    if (!appState.sesionActual || appState.esInvitado) {
        if (typeof window.abrirModalAuth === 'function') window.abrirModalAuth();
        else alert("Inicia sesión para añadir amigos.");
        return;
    }
    const myId = appState.sesionActual.user.id;
    if (myId === amigoId) return alert("No puedes añadirte a ti mismo.");
    
    const btn = document.getElementById('btnAnadirAmigoSPA') || document.getElementById('btnAñadirAmigoSPA');
    if(btn) { btn.disabled = true; btn.textContent = "Procesando..."; }
    
    try {
        // Verificar si ya existe un registro previo entre ambos usuarios
        let existing = null;
        try {
            const { data: d1 } = await supabaseClient.from('amistades').select('*').eq('usuario_id', myId).eq('amigo_id', amigoId).maybeSingle();
            const { data: d2 } = await supabaseClient.from('amistades').select('*').eq('usuario_id', amigoId).eq('amigo_id', myId).maybeSingle();
            existing = d1 || d2 || null;
        } catch (_) {}

        if (existing) {
            if (existing.estado === 'aceptada') {
                alert("Ya sois amigos en PaddleSafe.");
                if(window.verificarEstadoAmistad) window.verificarEstadoAmistad(amigoId);
                return;
            } else if (existing.estado === 'pendiente') {
                alert("Ya existe una solicitud pendiente con este usuario.");
                if(window.verificarEstadoAmistad) window.verificarEstadoAmistad(amigoId);
                return;
            } else {
                // Si estaba rechazada, la reactivamos como pendiente
                const { error: updErr } = await supabaseClient.from('amistades').update({ usuario_id: myId, amigo_id: amigoId, estado: 'pendiente' }).eq('id', existing.id);
                if (updErr) {
                    if (updErr.code === '23505' || updErr.message?.includes('duplicate key') || updErr.message?.includes('unique')) {
                        alert("Ya existe una solicitud pendiente con este usuario.");
                        if(window.verificarEstadoAmistad) window.verificarEstadoAmistad(amigoId);
                        return;
                    }
                    throw updErr;
                }
            }
        } else {
            const { error: insErr } = await supabaseClient.from('amistades').insert([{ usuario_id: myId, amigo_id: amigoId, estado: 'pendiente' }]);
            if (insErr) {
                if (insErr.code === '23505' || insErr.message?.includes('duplicate key') || insErr.message?.includes('unique')) {
                    alert("Ya existe una solicitud pendiente con este usuario.");
                    if(window.verificarEstadoAmistad) window.verificarEstadoAmistad(amigoId);
                    return;
                }
                throw insErr;
            }
        }

        alert("¡Solicitud de amistad enviada con éxito!");
        if(window.verificarEstadoAmistad) window.verificarEstadoAmistad(amigoId);
        
        if (appState.sesionActual && appState.perfilUsuario) {
            socialNotifications.crear({
                user_id: amigoId,
                tipo: 'solicitud_amistad',
                titulo: 'Solicitud de Amistad',
                contenido: `👋 ¡${appState.perfilUsuario.nombre || 'Un palista'} te envió solicitud de amistad!`
            });
        }
    } catch (e) { 
        if (e && (e.code === '23505' || e.message?.includes('duplicate key') || e.message?.includes('unique') || e.code === '409')) {
            alert("Ya existe una solicitud pendiente con este usuario.");
            if(window.verificarEstadoAmistad) window.verificarEstadoAmistad(amigoId);
            return;
        }
        console.warn('Aviso no crítico enviando solicitud:', e); 
        alert("Error al enviar solicitud."); 
        if(btn) { btn.disabled = false; btn.textContent = "Añadir Amigo"; } 
    }
}

export async function responderSolicitudAmistad(amistadId, accion) {
    // Actualización inmediata en UI local para evitar retardo
    const rowEl = document.querySelector(`button[onclick*="${amistadId}"]`)?.closest('.bg-white, .dark\\:bg-slate-800');
    if (rowEl) {
        rowEl.style.opacity = '0.5';
        rowEl.style.pointerEvents = 'none';
        const buttons = rowEl.querySelectorAll('button');
        buttons.forEach(b => { b.disabled = true; });
    }

    try {
        const est = accion === 'aceptar' ? 'aceptada' : 'rechazada';
        const { data: updated, error } = await supabaseClient
            .from('amistades')
            .update({ estado: est })
            .eq('id', amistadId)
            .select('usuario_id, amigo_id')
            .maybeSingle();

        if (error) throw error;
        
        if (rowEl) {
            rowEl.remove();
        }

        if (document.getElementById('friendSystemModal') && !document.getElementById('friendSystemModal').classList.contains('hidden')) {
            cambiarTabAmistades('solicitudes');
        }
        
        if (typeof comprobarNuevasSolicitudesSilencioso === 'function') {
            comprobarNuevasSolicitudesSilencioso();
        }
        
        const senderId = updated?.usuario_id;
        if (senderId && appState.sesionActual) {
            socialNotifications.crear({
                user_id: senderId,
                tipo: 'resolucion_amistad',
                titulo: 'Respuesta de Amistad',
                contenido: `${appState.perfilUsuario?.nombre || 'Un palista'} ha ${accion === 'aceptar' ? 'aceptado' : 'rechazado'} tu solicitud de amistad.`
            });
        }
    } catch (e) { 
        console.warn('Aviso no crítico:', e); 
        if (rowEl) {
            rowEl.style.opacity = '1';
            rowEl.style.pointerEvents = 'auto';
            const buttons = rowEl.querySelectorAll('button');
            buttons.forEach(b => { b.disabled = false; });
        }
        alert("Error al responder."); 
    }
}

export async function verificarEstadoAmistad(targetUserId) {
    if (!appState.sesionActual || appState.esInvitado) return;
    const btn = document.getElementById('btnAnadirAmigoSPA') || document.getElementById('btnAñadirAmigoSPA');
    if (!btn) return;
    
    document.getElementById('btnRechazarAmistad')?.remove();
    const myId = appState.sesionActual.user.id;
    
    let rel = null;
    try {
        const { data, error } = await supabaseClient
            .from('amistades')
            .select('*')
            .or(`and(usuario_id.eq.${myId},amigo_id.eq.${targetUserId}),and(usuario_id.eq.${targetUserId},amigo_id.eq.${myId})`)
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (!error && data && data.length > 0) {
            rel = data[0];
        } else {
            // Fallback a dos consultas seguras
            const { data: d1 } = await supabaseClient.from('amistades').select('*').eq('usuario_id', myId).eq('amigo_id', targetUserId).maybeSingle();
            const { data: d2 } = await supabaseClient.from('amistades').select('*').eq('usuario_id', targetUserId).eq('amigo_id', myId).maybeSingle();
            rel = d1 || d2 || null;
        }
    } catch (e) {
        console.warn("Excepción comprobando amistad:", e);
    }
    
    if (rel) {
        if (rel.estado === 'aceptada') {
            btn.textContent = "🤝 Amigos"; 
            btn.disabled = true; 
            btn.className = "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-5 py-2 rounded-full uppercase cursor-default";
        } else if (rel.estado === 'pendiente') {
            if (rel.usuario_id === myId) {
                btn.textContent = "⏳ Pendiente"; 
                btn.disabled = true; 
                btn.className = "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[10px] font-bold px-5 py-2 rounded-full uppercase cursor-default";
            } else {
                btn.textContent = "Aceptar";
                btn.disabled = false;
                btn.className = "bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold px-4 py-2 rounded-full uppercase transition-colors shadow-sm cursor-pointer active:scale-95";
                btn.onclick = () => {
                    responderSolicitudAmistad(rel.id, 'aceptar');
                    setTimeout(() => verificarEstadoAmistad(targetUserId), 500);
                };

                const rejectBtn = document.createElement('button');
                rejectBtn.id = 'btnRechazarAmistad';
                rejectBtn.type = 'button';
                rejectBtn.textContent = "Rechazar";
                rejectBtn.className = "bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-4 py-2 rounded-full uppercase transition-colors shadow-sm cursor-pointer active:scale-95";
                rejectBtn.onclick = () => {
                    responderSolicitudAmistad(rel.id, 'rechazar');
                    setTimeout(() => verificarEstadoAmistad(targetUserId), 500);
                };
                btn.insertAdjacentElement('afterend', rejectBtn);
            }
        } else if (rel.estado === 'rechazada') {
            btn.textContent = "Añadir Amigo"; 
            btn.disabled = false;
            btn.className = "bg-water hover:bg-sky-600 text-white text-[10px] font-bold px-5 py-2 rounded-full uppercase transition-colors shadow-sm active:scale-95 cursor-pointer";
            btn.onclick = () => { if(window.enviarSolicitudAmistad) window.enviarSolicitudAmistad(targetUserId); };
        }
    } else {
        btn.textContent = "Añadir Amigo";
        btn.disabled = false;
        btn.className = "bg-water hover:bg-sky-600 text-white text-[10px] font-bold px-5 py-2 rounded-full uppercase transition-colors shadow-sm active:scale-95 cursor-pointer";
        btn.onclick = () => { if(window.enviarSolicitudAmistad) window.enviarSolicitudAmistad(targetUserId); };
    }
}

export async function cargarTabAmigosSPA() {
    if (!appState.spaCurrentUser) return;
    const content = document.getElementById('userProfileContent');
    content.innerHTML = 'Cargando amigos...';
    
    ['spaTabInsignias','spaTabRutas', 'spaTabAmigos'].forEach(id => {
        const b = document.getElementById(id);
        if(b) b.className="h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
    });
    
    const activeBtn = document.getElementById('spaTabAmigos');
    if(activeBtn) activeBtn.className="h-10 px-2 bg-marine dark:bg-water text-white shadow text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
    
    const { data } = await supabaseClient.from('amistades').select('usuario_id, amigo_id, perfiles!usuario_id(id,nombre,avatar_url), perfiles_amigo:perfiles!amigo_id(id,nombre,avatar_url)').eq('estado', 'aceptada').or(`usuario_id.eq.${appState.spaCurrentUser.id},amigo_id.eq.${appState.spaCurrentUser.id}`);
    if (!data || !data.length) return content.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Aún no tiene amigos.</p></div>';
    
    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pb-4">';
    html += data.map(rel => {
        const amigo = rel.usuario_id === appState.spaCurrentUser.id ? rel.perfiles_amigo : rel.perfiles;
        if (!amigo) return '';
        return `
            <div role="button" tabindex="0" onclick="if(window.navigateSPA) window.navigateSPA('/user/${amigo.id}')" class="bg-white dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700 rounded-[20px] shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-water dark:hover:border-sky-500 cursor-pointer transition-all duration-300 flex items-center gap-4 group">
                <div class="relative shrink-0">
                    <img src="${esc(safeUrl(amigo.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-14 h-14 rounded-full object-cover border-4 border-slate-50 dark:border-slate-700 shadow-md group-hover:border-water dark:group-hover:border-sky-500 transition-colors duration-300">
                    <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-300" data-user-presence-id="${esc(amigo.id)}"></div>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-black text-marine dark:text-white truncate group-hover:text-water dark:group-hover:text-sky-400 transition-colors">${esc(amigo.nombre)}</p>
                    <div class="flex items-center gap-1.5 mt-0.5"><span class="w-1.5 h-1.5 rounded-full bg-water dark:bg-sky-400"></span><p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest truncate">Paddler</p></div>
                </div>
                <div class="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-water dark:group-hover:bg-sky-500 group-hover:text-white transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></div>
            </div>`;
    }).join('');
    content.innerHTML = html + '</div>';
    window.actualizarUIPresencia?.();
}

export function abrirPanelMisAmigos() {
    if (window.cerrarModalAuth) window.cerrarModalAuth();
    const modal = document.getElementById('friendSystemModal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); }, 10);
        cambiarTabAmistades('lista');
    }
}

export function cerrarPanelMisAmigos() {
    const modal = document.getElementById('friendSystemModal');
    if (modal) {
        modal.classList.add('opacity-0'); modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); if(window.abrirModalAuth) window.abrirModalAuth(); }, 300);
    }
}

export async function cambiarTabAmistades(tab) {
    const btnLista = document.getElementById('tabMisAmigos');
    const btnSol = document.getElementById('tabSolicitudesAmistad');
    const c = document.getElementById('friendSystemContent');
    
    if(tab === 'lista') {
        btnLista.className = "h-10 px-2 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 cursor-pointer transition-colors";
        btnSol.className = "h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors relative";
        c.innerHTML = '<p class="text-center text-slate-400 dark:text-slate-500 mt-5 animate-pulse">Cargando...</p>';
        
        const { data } = await supabaseClient.from('amistades').select('usuario_id, amigo_id, perfiles!usuario_id(id,nombre,avatar_url), perfiles_amigo:perfiles!amigo_id(id,nombre,avatar_url)').eq('estado', 'aceptada').or(`usuario_id.eq.${appState.sesionActual.user.id},amigo_id.eq.${appState.sesionActual.user.id}`);
        if (!data || !data.length) { c.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">No tienes amigos añadidos.</p></div>'; return; }
        
        let html = '<div class="space-y-4 mt-4 pb-4">';
        html += data.map(rel => {
            const amigo = rel.usuario_id === appState.sesionActual.user.id ? rel.perfiles_amigo : rel.perfiles;
            if(!amigo) return '';
            return `
                <div role="button" tabindex="0" onclick="cerrarPanelMisAmigos(); setTimeout(()=>{ if(window.navigateSPA) window.navigateSPA('/user/${amigo.id}') }, 350);" class="bg-white dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700 rounded-[20px] shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-water dark:hover:border-sky-500 cursor-pointer transition-all duration-300 flex items-center gap-4 group">
                    <div class="relative shrink-0">
                        <img src="${esc(safeUrl(amigo.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-14 h-14 rounded-full object-cover border-4 border-slate-50 dark:border-slate-700 shadow-md group-hover:border-water dark:group-hover:border-sky-500 transition-colors duration-300">
                        <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-300" data-user-presence-id="${esc(amigo.id)}"></div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-black text-marine dark:text-white truncate group-hover:text-water dark:group-hover:text-sky-400 transition-colors">${esc(amigo.nombre)}</p>
                        <div class="flex items-center gap-1.5 mt-0.5"><span class="w-1.5 h-1.5 rounded-full bg-water dark:bg-sky-400"></span><p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest truncate">Paddler</p></div>
                    </div>
                    <div class="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-water dark:group-hover:bg-sky-500 group-hover:text-white transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></div>
                </div>`;
        }).join('');
        c.innerHTML = html + '</div>';
        window.actualizarUIPresencia?.();
    } else {
        btnSol.className = "h-10 px-2 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 cursor-pointer transition-colors relative";
        btnLista.className = "h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
        c.innerHTML = '<p class="text-center text-slate-400 dark:text-slate-500 mt-5 animate-pulse">Cargando...</p>';
        
        const { data } = await supabaseClient.from('amistades').select('id, usuario_id, created_at, perfiles!usuario_id(nombre,avatar_url)').eq('amigo_id', appState.sesionActual.user.id).eq('estado', 'pendiente');
        comprobarNuevasSolicitudesSilencioso();
        
        if (!data || !data.length) { c.innerHTML = '<div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-inner mt-4"><p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">No hay solicitudes pendientes.</p></div>'; return; }
        
        let html = '<div class="space-y-4 mt-4 pb-4">';
        html += data.map(sol => {
            const p = sol.perfiles;
            return `
                <div class="bg-white dark:bg-slate-800 p-5 border border-slate-200 dark:border-slate-700 rounded-[20px] shadow-sm flex flex-col gap-4">
                    <div class="flex items-center gap-4">
                        <img src="${esc(safeUrl(p.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-14 h-14 rounded-full object-cover border-4 border-slate-50 dark:border-slate-700 shadow-md">
                        <div class="flex flex-col min-w-0">
                            <span class="text-sm font-black text-marine dark:text-white truncate">${esc(p.nombre)}</span>
                            <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Te ha enviado una solicitud</span>
                        </div>
                    </div>
                    <div class="flex gap-3 mt-1">
                        <button onclick="responderSolicitudAmistad('${sol.id}', 'aceptar')" class="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors shadow-md shadow-emerald-500/20 dark:shadow-none">Aceptar</button>
                        <button onclick="responderSolicitudAmistad('${sol.id}', 'rechazar')" class="flex-1 h-11 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors">Rechazar</button>
                    </div>
                </div>`;
        }).join('');
        c.innerHTML = html + '</div>';
    }
}

export async function comprobarNuevasSolicitudesSilencioso() {
    if(!appState.sesionActual || appState.esInvitado) return;
    const badge = document.getElementById('badgeSolicitudesAmistad');
    if(!badge) return;
    const { count } = await supabaseClient.from('amistades').select('*', { count: 'exact', head: true }).eq('amigo_id', appState.sesionActual.user.id).eq('estado', 'pendiente');
    if(count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
}

// ====================================================
// FEED SOCIAL (socialFeed)
// ====================================================
function parseFechaSegura(val) {
    if (!val) return new Date();
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
}

export const socialFeed = {
    filtroActual: 'global',
    pagina: 0,
    limite: 15,
    cargando: false,
    hayMas: true,
    itemsIds: new Set(),
    items: [],
    debugTelemetry: {
        requestCount: 0,
        returnedCount: 0,
        failedCount: 0,
        lastCursor: null,
        errors: []
    },
    async obtenerFiltrosUsuario() {
        if (!appState.sesionActual || appState.esInvitado) return { misClubsIds: [], misAmigosIds: [] };
        const miId = appState.sesionActual.user.id;
        let misClubsIds = [];
        let misAmigosIds = [];
        try {
            const { data: clubs } = await supabaseClient.from('clubs_usuarios').select('club_id').eq('user_id', miId);
            if (clubs && clubs.length) misClubsIds = clubs.map(c => c.club_id);
            
            const { data: amistades } = await supabaseClient.from('amistades').select('usuario_id, amigo_id').eq('estado', 'aceptada').or(`usuario_id.eq.${miId},amigo_id.eq.${miId}`);
            if (amistades && amistades.length) misAmigosIds = amistades.map(a => a.usuario_id === miId ? a.amigo_id : a.usuario_id);
        } catch (e) { console.warn('Aviso no crítico (Filtros feed):', e); }
        return { misClubsIds, misAmigosIds };
    },
    async cargarMas() {
        if (this.cargando || !this.hayMas) return;
        this.pagina++;
        await this.cargarActividad(this.filtroActual, { append: true });
    },
    async cargarActividad(filtro = 'global', options = {}) {
        const append = Boolean(options && options.append);
        this.filtroActual = filtro;
        this.cargando = true;

        const c = document.getElementById('feedContainerList');
        if (!c) {
            this.cargando = false;
            return;
        }

        if (!append) {
            this.pagina = 0;
            this.hayMas = true;
            this.itemsIds.clear();
            this.items = [];
            c.innerHTML = `<p class="text-center text-slate-400 dark:text-slate-500 text-[10px] animate-pulse py-10 uppercase font-bold tracking-widest">Buscando actividad...</p>`;
        } else {
            const btnMas = document.getElementById('btnCargarMasFeed');
            if (btnMas) {
                btnMas.disabled = true;
                btnMas.textContent = 'Cargando más...';
            }
        }

        const offset = this.pagina * this.limite;
        const toRange = offset + this.limite - 1;

        this.debugTelemetry.requestCount++;
        this.debugTelemetry.lastCursor = offset;

        try {
            const { misClubsIds, misAmigosIds } = await this.obtenerFiltrosUsuario();

            // 1. Consultar altas de miembros en clubes
            let qMiembros;
            if (filtro === 'mis_clubs') {
                if (misClubsIds.length > 0) {
                    qMiembros = supabaseClient
                        .from('clubs_usuarios')
                        .select('joined_at, club_id, user_id, perfiles(nombre, avatar_url), clubs(nombre)')
                        .in('club_id', misClubsIds)
                        .order('joined_at', { ascending: false })
                        .range(offset, toRange);
                } else {
                    qMiembros = Promise.resolve({ data: [] });
                }
            } else if (filtro === 'mis_amigos') {
                if (misAmigosIds.length > 0) {
                    qMiembros = supabaseClient
                        .from('clubs_usuarios')
                        .select('joined_at, club_id, user_id, perfiles(nombre, avatar_url), clubs(nombre)')
                        .in('user_id', misAmigosIds)
                        .order('joined_at', { ascending: false })
                        .range(offset, toRange);
                } else {
                    qMiembros = Promise.resolve({ data: [] });
                }
            } else {
                qMiembros = supabaseClient
                    .from('clubs_usuarios')
                    .select('joined_at, club_id, user_id, perfiles(nombre, avatar_url), clubs(nombre)')
                    .order('joined_at', { ascending: false })
                    .range(offset, toRange);
            }

            // 2. Consultar rutas de clubes (desacoplado sin FK restrictivo para soporte polimórfico)
            let qClubRutas;
            if (filtro === 'mis_clubs') {
                if (misClubsIds.length > 0) {
                    qClubRutas = supabaseClient
                        .from('club_rutas')
                        .select('created_at, club_id, ruta_id, clubs(id, nombre)')
                        .in('club_id', misClubsIds)
                        .order('created_at', { ascending: false })
                        .range(offset, toRange);
                } else {
                    qClubRutas = Promise.resolve({ data: [] });
                }
            } else if (filtro === 'mis_amigos') {
                qClubRutas = Promise.resolve({ data: [] });
            } else {
                qClubRutas = supabaseClient
                    .from('club_rutas')
                    .select('created_at, club_id, ruta_id, clubs(id, nombre)')
                    .order('created_at', { ascending: false })
                    .range(offset, toRange);
            }

            // 3. Consultar rutas directas de usuarios (rutas y user_routes con columnas exactas)
            const rutasSelect = 'id, user_id, ubicacion, distancia_km, tiempo_minutos, avg_speed_kmh, fecha, created_at, imagen_url, ruta_json, splits_data, weather_snapshot, wind_speed_kt, wind_gust_kt, wave_height_m, wave_period_s, conditions_score';
            const urSelect = 'id, user_id, title, distance_km, duration_seconds, avg_speed, max_speed, xp_earned, created_at, route_coordinates, splits_data, weather_snapshot, wind_speed_kt, wind_gust_kt, wave_height_m, wave_period_s, conditions_score';

            let qRutasDirectas = Promise.resolve({ data: [] });
            let qUserRoutesDirectas = Promise.resolve({ data: [] });

            if (filtro === 'mis_clubs') {
                qRutasDirectas = Promise.resolve({ data: [] });
                qUserRoutesDirectas = Promise.resolve({ data: [] });
            } else if (filtro === 'mis_amigos') {
                if (misAmigosIds.length > 0) {
                    qRutasDirectas = supabaseClient
                        .from('rutas')
                        .select(rutasSelect)
                        .in('user_id', misAmigosIds)
                        .order('created_at', { ascending: false })
                        .range(offset, toRange);

                    qUserRoutesDirectas = supabaseClient
                        .from('user_routes')
                        .select(urSelect)
                        .in('user_id', misAmigosIds)
                        .order('created_at', { ascending: false })
                        .range(offset, toRange);
                }
            } else {
                qRutasDirectas = supabaseClient
                    .from('rutas')
                    .select(rutasSelect)
                    .order('created_at', { ascending: false })
                    .range(offset, toRange);

                qUserRoutesDirectas = supabaseClient
                    .from('user_routes')
                    .select(urSelect)
                    .order('created_at', { ascending: false })
                    .range(offset, toRange);
            }

            // 4. Consultar chat de clubes
            let qChat = Promise.resolve({ data: [] });
            if (Array.isArray(misClubsIds) && misClubsIds.length > 0 &&
                (filtro !== 'mis_amigos' || misAmigosIds.length > 0)) {
                let chatQuery = supabaseClient
                    .from('club_chat')
                    .select('created_at, club_id, user_id, mensaje, visibility, is_public, perfiles(nombre, avatar_url), clubs(nombre)')
                    .in('club_id', misClubsIds);
                if (filtro === 'mis_amigos') chatQuery = chatQuery.in('user_id', misAmigosIds);
                qChat = chatQuery.order('created_at', { ascending: false }).range(offset, toRange);
            }

            const [resM, resCR, resRD, resURD, resC] = await Promise.allSettled([
                qMiembros,
                qClubRutas,
                qRutasDirectas,
                qUserRoutesDirectas,
                qChat
            ]);

            const queryResults = [
                { name: 'clubs_usuarios', res: resM },
                { name: 'club_rutas', res: resCR },
                { name: 'rutas_directas', res: resRD },
                { name: 'user_routes_directas', res: resURD },
                { name: 'club_chat', res: resC }
            ];

            const queryErrors = [];
            queryResults.forEach(({ name, res }) => {
                if (res.status === 'rejected') {
                    console.warn(`[socialFeed] Query rechazada (${name}):`, res.reason);
                    queryErrors.push(res.reason);
                    this.debugTelemetry.failedCount++;
                } else if (res.value?.error) {
                    console.warn(`[socialFeed] Error consultando actividad (${name}):`, res.value.error);
                    queryErrors.push(res.value.error);
                    this.debugTelemetry.failedCount++;
                }
            });

            const dataM = (resM.status === 'fulfilled' && Array.isArray(resM.value?.data)) ? resM.value.data : [];
            const dataCR = (resCR.status === 'fulfilled' && Array.isArray(resCR.value?.data)) ? resCR.value.data : [];
            const dataRD = (resRD.status === 'fulfilled' && Array.isArray(resRD.value?.data)) ? resRD.value.data : [];
            const dataURD = (resURD.status === 'fulfilled' && Array.isArray(resURD.value?.data)) ? resURD.value.data : [];
            const dataC = (resC.status === 'fulfilled' && Array.isArray(resC.value?.data)) ? resC.value.data : [];

            // Resolución polimórfica de rutas de clubes (rutas o user_routes)
            const clubRutaIds = Array.from(new Set(dataCR.map(item => item.ruta_id).filter(Boolean)));
            const clubRoutesMap = new Map();
            if (clubRutaIds.length > 0) {
                try {
                    const [resLegClub, resUrClub] = await Promise.allSettled([
                        supabaseClient
                            .from('rutas')
                            .select(rutasSelect)
                            .in('id', clubRutaIds),
                        supabaseClient
                            .from('user_routes')
                            .select(urSelect)
                            .in('id', clubRutaIds)
                    ]);
                    if (resLegClub.status === 'fulfilled' && Array.isArray(resLegClub.value?.data)) {
                        resLegClub.value.data.forEach(r => clubRoutesMap.set(String(r.id), r));
                    }
                    if (resUrClub.status === 'fulfilled' && Array.isArray(resUrClub.value?.data)) {
                        resUrClub.value.data.forEach(r => {
                            if (!clubRoutesMap.has(String(r.id))) {
                                clubRoutesMap.set(String(r.id), r);
                            }
                        });
                    }
                } catch (eCR) {
                    console.warn('[socialFeed] Error resolviendo rutas de club_rutas:', eCR);
                }
            }

            // Unificar rutas directas (sin duplicar entre rutas y user_routes)
            const directRoutes = [...dataRD];
            dataURD.forEach(ur => {
                if (!directRoutes.some(r => String(r.id) === String(ur.id))) {
                    directRoutes.push(ur);
                }
            });

            // Cargar perfiles de autores para todas las rutas (clubes y directas)
            const todasLasRutas = [
                ...Array.from(clubRoutesMap.values()),
                ...directRoutes
            ];
            const uids = Array.from(new Set(todasLasRutas.map(r => r.user_id).filter(Boolean)));
            if (uids.length > 0) {
                try {
                    const { data: perfilesData, error: pErr } = await supabaseClient
                        .from('perfiles')
                        .select('id, nombre, avatar_url')
                        .in('id', uids);
                    if (!pErr && perfilesData && perfilesData.length > 0) {
                        const pMap = new Map(perfilesData.map(p => [p.id, p]));
                        todasLasRutas.forEach(r => {
                            if (r.user_id && pMap.has(r.user_id)) {
                                r.perfiles = pMap.get(r.user_id);
                            }
                        });
                    }
                } catch (eP) {
                    console.warn('[socialFeed] Aviso cargando perfiles de rutas:', eP);
                }
            }

            const newActs = [];

            // A) Altas en clubes
            dataM.forEach(i => {
                const uniqueKey = `m_${i.club_id}_${i.user_id}_${i.joined_at}`;
                if (this.itemsIds.has(uniqueKey)) return;
                try {
                    newActs.push({
                        idKey: uniqueKey,
                        tipo: 'miembro',
                        date: parseFechaSegura(i.joined_at),
                        clubId: i.club_id,
                        userId: i.user_id,
                        is_public: true,
                        html: `<div class="flex items-center gap-4"><img src="${esc(safeUrl(i.perfiles?.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full border-2 border-emerald-100 dark:border-emerald-800 object-cover shadow-sm shrink-0"><p class="text-sm text-slate-600 dark:text-slate-300 leading-snug"><strong class="text-marine dark:text-white font-black">${esc(i.perfiles?.nombre || 'Paddler')}</strong> se unió a <strong class="text-emerald-600 dark:text-emerald-400 font-bold">${esc(i.clubs?.nombre || 'un club')}</strong>.</p></div>`
                    });
                    this.itemsIds.add(uniqueKey);
                } catch (errCard) {
                    console.warn('[socialFeed] Fallo seguro en tarjeta de miembro:', errCard);
                }
            });

            // B) Rutas de clubes
            dataCR.forEach(cr => {
                const r = clubRoutesMap.get(String(cr.ruta_id));
                if (!r) return;
                const uniqueKey = `cr_${cr.club_id}_${r.id}`;
                if (this.itemsIds.has(uniqueKey)) return;
                try {
                    newActs.push({
                        idKey: uniqueKey,
                        tipo: 'ruta',
                        date: parseFechaSegura(cr.created_at || r.fecha || r.created_at),
                        clubId: cr.club_id,
                        userId: r.user_id || null,
                        is_public: true,
                        html: renderTarjetaRutaSocial(r, cr.clubs?.nombre || 'Club')
                    });
                    this.itemsIds.add(uniqueKey);
                } catch (errCard) {
                    console.warn('[socialFeed] Fallo seguro en tarjeta de ruta de club:', errCard);
                }
            });

            // B2) Rutas directas de la flota (amigos o global)
            directRoutes.forEach(r => {
                const uniqueKey = `r_${r.id}`;
                if (this.itemsIds.has(uniqueKey)) return;
                if (dataCR.some(cr => String(cr.ruta_id) === String(r.id))) return;
                try {
                    newActs.push({
                        idKey: uniqueKey,
                        tipo: 'ruta',
                        date: parseFechaSegura(r.fecha || r.created_at),
                        clubId: null,
                        userId: r.user_id || null,
                        is_public: true,
                        html: renderTarjetaRutaSocial(r, null)
                    });
                    this.itemsIds.add(uniqueKey);
                } catch (errCard) {
                    console.warn('[socialFeed] Fallo seguro en tarjeta de ruta directa:', errCard);
                }
            });

            // C) Mensajes de chat de clubes (Privados de la tripulación)
            dataC.forEach(i => {
                if (!misClubsIds.includes(i.club_id)) return;
                const uniqueKey = `c_${i.club_id}_${i.created_at}_${i.user_id}`;
                if (this.itemsIds.has(uniqueKey)) return;
                try {
                    newActs.push({
                        idKey: uniqueKey,
                        tipo: 'chat',
                        date: parseFechaSegura(i.created_at),
                        clubId: i.club_id,
                        userId: i.user_id,
                        visibility: i.visibility || 'club_only',
                        is_public: i.is_public === true,
                        html: `<div class="flex items-start gap-4"><img src="${esc(safeUrl(i.perfiles?.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700 shadow-sm mt-1 shrink-0"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap mb-1"><strong class="text-marine dark:text-white font-black">${esc(i.perfiles?.nombre || 'Paddler')}</strong><span class="text-[9px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-sky-200 dark:border-sky-800/50"><span>🔒</span> Chat del Club</span></div><p class="text-xs text-slate-500 dark:text-slate-400">En <strong class="text-marine dark:text-white font-bold">${esc(i.clubs?.nombre || 'Club')}</strong></p><div class="mt-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 p-3 rounded-2xl rounded-tl-sm text-sm text-slate-700 dark:text-slate-300 italic shadow-sm">"${esc(i.mensaje)}"</div></div></div>`
                    });
                    this.itemsIds.add(uniqueKey);
                } catch (errCard) {
                    console.warn('[socialFeed] Fallo seguro en tarjeta de chat:', errCard);
                }
            });

            // Filtrado estricto según pestaña del feed
            let filteredNewActs = newActs;
            if (filtro === 'global') {
                filteredNewActs = newActs.filter(i => {
                    if (i.tipo === 'chat') {
                        return misClubsIds.includes(i.clubId);
                    }
                    if (i.clubId) {
                        if (misClubsIds.includes(i.clubId)) return true;
                        return i.is_public === true;
                    }
                    return i.is_public === true;
                });
            } else if (filtro === 'mis_clubs') {
                filteredNewActs = misClubsIds.length ? newActs.filter(i => misClubsIds.includes(i.clubId)) : [];
            } else if (filtro === 'mis_amigos') {
                filteredNewActs = misAmigosIds.length ? newActs.filter(i => i.userId && misAmigosIds.includes(i.userId)) : [];
            }

            this.debugTelemetry.returnedCount += filteredNewActs.length;

            if (filteredNewActs.length < this.limite) {
                this.hayMas = false;
            }

            if (append) {
                this.items = [...this.items, ...filteredNewActs];
            } else {
                this.items = filteredNewActs;
            }

            this.items.sort((a, b) => b.date - a.date);

            // Registro de telemetría de depuración en desarrollo
            if (typeof window !== 'undefined' && (window.psDebugMode || (window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')))) {
                console.debug('[socialFeed:debug]', {
                    filtro,
                    pagina: this.pagina,
                    offset,
                    returnedInBatch: filteredNewActs.length,
                    totalItems: this.items.length,
                    queryErrorsCount: queryErrors.length,
                    hayMas: this.hayMas
                });
            }

            if (!this.items || this.items.length === 0) {
                if (queryErrors.length > 0) {
                    c.innerHTML = `<p class="text-center text-rose-500 text-xs py-10">No se pudo cargar la actividad. Inténtalo de nuevo más tarde.</p>`;
                    return;
                }
                let mensajeVacio = "Cuando tú, tus amigos o tu club registréis nuevas travesías, aparecerán aquí.";
                if (filtro === 'mis_clubs' && misClubsIds.length === 0) {
                    mensajeVacio = "Aún no perteneces a ningún club. ¡Únete a un club para ver la actividad interna y el chat del club!";
                } else if (filtro === 'mis_amigos' && misAmigosIds.length === 0) {
                    mensajeVacio = "Aún no tienes amigos añadidos. Puedes buscar otros paddlers y enviarles solicitudes de amistad.";
                }
                c.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center bg-slate-800/40 rounded-2xl border border-slate-700/50 my-4">
                        <span class="text-3xl mb-2">🌊</span>
                        <p class="text-sm font-bold text-slate-300">No hay actividad disponible</p>
                        <p class="text-xs text-slate-500 mt-1">${mensajeVacio}</p>
                    </div>`;
                return;
            }

            let h = '<div class="space-y-4">';
            if (queryErrors.length > 0) {
                h += `<p class="text-center text-amber-600 dark:text-amber-400 text-xs py-2">No se pudo cargar toda la actividad.</p>`;
            }
            h += this.items.map(i => `<div class="ps-bento-card bg-slate-900/90 border border-slate-700/80 p-5 rounded-[24px] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">${i.html}<div class="mt-4 pt-3 border-t border-slate-50 dark:border-slate-700/50 flex justify-end"><span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md">${i.date.toLocaleDateString(undefined, {month:'short', day:'numeric'})} • ${i.date.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'})}</span></div></div>`).join('');

            if (this.hayMas) {
                h += `
                    <div id="feedCargarMasContainer" class="py-3 text-center">
                        <button type="button" id="btnCargarMasFeed" onclick="socialFeed.cargarMas()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer active:scale-95">
                            Cargar más actividad
                        </button>
                    </div>
                `;
            }
            h += '</div>';

            c.innerHTML = h;

            // Enlazar scroll infinito si el contenedor está en el DOM
            if (!c._infiniteScrollBound) {
                c._infiniteScrollBound = true;
                let scrollTimeout;
                c.addEventListener('scroll', () => {
                    clearTimeout(scrollTimeout);
                    scrollTimeout = setTimeout(() => {
                        if (c.scrollTop + c.clientHeight >= c.scrollHeight - 60) {
                            if (!socialFeed.cargando && socialFeed.hayMas) {
                                socialFeed.cargarMas();
                            }
                        }
                    }, 120);
                }, { passive: true });
            }
        } catch (e) {
            console.warn('[socialFeed] Aviso no crítico en cargarActividad:', e);
            c.innerHTML = `
                <div class="flex flex-col items-center justify-center p-8 text-center bg-slate-800/40 rounded-2xl border border-slate-700/50 my-4">
                    <span class="text-3xl mb-2">🌊</span>
                    <p class="text-sm font-bold text-slate-300">No se ha publicado nada</p>
                    <p class="text-xs text-slate-500 mt-1">Cuando tú, tus amigos o tu club registréis nuevas travesías, aparecerán aquí.</p>
                </div>`;
        } finally {
            this.cargando = false;
        }
    },
    abrirModal() {
        const m = document.getElementById('socialFeedModal');
        if (!m) return;
        m.classList.remove('hidden');
        requestAnimationFrame(() => {
            m.classList.remove('opacity-0');
            const box = m.querySelector('div');
            if (box) box.classList.remove('scale-95');
        });
        this.cambiarFiltro('global');
    },
    cerrarModal() {
        const m = document.getElementById('socialFeedModal');
        if (!m) return;
        m.classList.add('opacity-0');
        const box = m.querySelector('div');
        if (box) box.classList.add('scale-95');
        setTimeout(() => m.classList.add('hidden'), 300);
    },
    cambiarFiltro(filtro) {
        ['tabFeedGlobal', 'tabFeedClubs', 'tabFeedAmigos'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.className = "h-10 px-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg flex-1 cursor-pointer transition-colors";
        });
        const activeId = filtro === 'mis_clubs' ? 'tabFeedClubs' : filtro === 'mis_amigos' ? 'tabFeedAmigos' : 'tabFeedGlobal';
        const btnA = document.getElementById(activeId);
        if (btnA) btnA.className = "h-10 px-2 bg-marine dark:bg-water text-white text-[11px] font-bold rounded-lg shadow flex-1 cursor-pointer transition-colors";
        this.cargarActividad(filtro);
    }
};

// ====================================================
// FUNCIÓN PARA INYECTAR BOTONES SIN MUTATION OBSERVER
// ====================================================
export function inicializarBotonesSociales() {
    const headerBtnContainer = document.querySelector('.w-full.flex.justify-between.items-start.relative.z-20 .flex.items-center.gap-2') ||
                               document.querySelector('.w-full.flex.justify-between.items-start.relative.z-20 .flex.items-center');
    const yaExisteBotonAvisos = document.getElementById('btnAvisos') || document.getElementById('btnNotificacionesTop');
    if (headerBtnContainer && appState.sesionActual && !appState.esInvitado && !yaExisteBotonAvisos) {
        const btnCampanaHTML = `<button type="button" id="btnNotificacionesTop" onclick="mostrarPanelAvisos()" class="relative text-white/70 hover:text-white transition-all hover:scale-105 flex flex-col items-center cursor-pointer mr-3"><svg class="h-7 w-7 sm:h-8 sm:w-8 drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg><span class="text-[11px] sm:text-xs font-black mt-1 uppercase tracking-widest">Avisos</span><span id="notifBadge" class="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full hidden border-2 border-marine font-black shadow-lg">0</span></button>`;
        headerBtnContainer.insertAdjacentHTML('afterbegin', btnCampanaHTML);
    }
    
    if (appState.sesionActual && !appState.esInvitado) {
        // Ejecución inmediata inicial para actualizar el badge de la campana
        socialNotifications.cargarNotificaciones();
        
        // NUEVO SISTEMA RECURSIVO (Evita apilamiento de promesas en redes lentas)
        if (!window._notifTimerActivo) {
            window._notifTimerActivo = true;
            
            const cicloNotificaciones = async () => {
                if (appState.sesionActual && !appState.esInvitado && !document.hidden) {
                    try {
                        await socialNotifications.cargarNotificaciones();
                    } catch (e) {
                        console.warn("Fallo silencioso en notificaciones en segundo plano");
                    }
                }
                // Programar la siguiente llamada solo cuando esta termina
                setTimeout(cicloNotificaciones, 60000); 
            };
            
            setTimeout(cicloNotificaciones, 60000);
        }
    }
    
    const topBarGroups = document.querySelector('.w-full.flex.justify-between.items-start.relative.z-20 .flex.gap-4');
    if (topBarGroups && !document.getElementById('btnModalFeed')) {
        const btnFeedHTML = `<button type="button" id="btnModalFeed" onclick="socialFeed.abrirModal()" class="text-white/70 hover:text-white transition-transform hover:scale-105 flex flex-col items-center cursor-pointer"><span class="text-2xl sm:text-3xl drop-shadow-md">📰</span><span class="text-[11px] sm:text-xs font-black mt-1 uppercase tracking-widest">Feed</span></button>`;
        topBarGroups.insertAdjacentHTML('beforeend', btnFeedHTML);
    }
}

export function abrirModalFeed() {
    socialFeed.abrirModal();
}

export function cerrarModalFeed() {
    socialFeed.cerrarModal();
}

window.socialNotifications = socialNotifications;
window.mostrarPanelAvisos = mostrarPanelAvisos;
window.cerrarPanelAvisos = cerrarPanelAvisos;
window.enviarSolicitudAmistad = enviarSolicitudAmistad;
window.responderSolicitudAmistad = responderSolicitudAmistad;
window.verificarEstadoAmistad = verificarEstadoAmistad;
window.cargarTabAmigosSPA = cargarTabAmigosSPA;
window.abrirPanelMisAmigos = abrirPanelMisAmigos;
window.cerrarPanelMisAmigos = cerrarPanelMisAmigos;
window.cambiarTabAmistades = cambiarTabAmistades;
window.comprobarNuevasSolicitudesSilencioso = comprobarNuevasSolicitudesSilencioso;
window.socialFeed = socialFeed;
window.cambiarFiltro = (filtro) => socialFeed.cambiarFiltro(filtro);
window.abrirModalFeed = abrirModalFeed;
window.cerrarModalFeed = cerrarModalFeed;
window.inicializarBotonesSociales = inicializarBotonesSociales;
window.socialRoutesCache = socialRoutesCache;
window.extraerTelemetriaRutaSocial = extraerTelemetriaRutaSocial;
window.renderTarjetaRutaSocial = renderTarjetaRutaSocial;
window.verPosterFinisherFullscreen = verPosterFinisherFullscreen;
window.cerrarPosterFinisherFullscreen = cerrarPosterFinisherFullscreen;
window.compartirPosterFinisher = compartirPosterFinisher;
window.abrirRutaSocialEnMapa = abrirRutaSocialEnMapa;
window.abrirRutaSocialConReplay = abrirRutaSocialConReplay;
window.descargarGpxRutaSocial = descargarGpxRutaSocial;
window.compartirRutaEnMiClub = compartirRutaEnMiClub;
window.eliminarRutaSocial = eliminarRutaSocial;
window.toggleLikeRutaSocial = toggleLikeRutaSocial;
window.toggleComentariosRutaSocial = toggleComentariosRutaSocial;
window.cargarComentariosRuta = cargarComentariosRuta;
window.agregarComentarioRuta = agregarComentarioRuta;
window.eliminarComentarioRuta = eliminarComentarioRuta;