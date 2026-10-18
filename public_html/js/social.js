// ====================================================
// js/social.js - AMISTADES, FEED Y NOTIFICACIONES
// ====================================================

import { supabaseClient, appState } from './config.js';
import { esc, safeUrl, IMG_FALLBACK } from './utils.js';
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
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-[11px] font-bold text-sky-800 dark:text-sky-300 mt-1 mb-2">
                <span>💨 ${weather.vientoKt} kt</span>
                <span>·</span>
                <span>🌊 ${weather.olasM.toFixed(1)}m</span>
                ${scoreVal != null ? `<span>·</span><span>${scoreIcon} Score ${scoreVal}</span>` : ''}
            </div>
        `;
    }

    // 2. Previsualización Póster Finisher si hay imagen_url
    let posterHtml = '';
    if (ruta.imagen_url) {
        const resumenStats = `📏 ${distKm.toFixed(2)} km · ⏱️ ${duracionMin} min · 🚀 ${velMedia.toFixed(1)} km/h`;
        posterHtml = `
            <div class="relative mt-2 mb-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 group cursor-pointer shadow-md bg-slate-900" onclick="verPosterFinisherFullscreen('${esc(ruta.imagen_url)}', '${esc(ubicacion)}', '${esc(resumenStats)}')">
                <img src="${esc(safeUrl(ruta.imagen_url))}" class="w-full max-h-64 object-cover object-center group-hover:scale-[1.02] transition-transform duration-300" loading="lazy" alt="Póster Finisher" onerror="this.onerror=null; this.parentElement.style.display='none';" />
                <span class="absolute top-2.5 left-2.5 bg-slate-900/85 backdrop-blur-md text-amber-300 border border-amber-400/40 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">🏄 PÓSTER FINISHER</span>
            </div>
        `;
    }

    // 3. Cuadrícula táctica de 4 pastillas (Stats)
    const statsGridHtml = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5">
            <div class="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                <span class="text-xs">📏</span>
                <span class="text-xs font-black text-slate-800 dark:text-slate-100">${distKm.toFixed(2)} km</span>
            </div>
            <div class="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                <span class="text-xs">⏱️</span>
                <span class="text-xs font-bold text-slate-800 dark:text-slate-100">${duracionMin} min</span>
            </div>
            <div class="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                <span class="text-xs">🚀</span>
                <span class="text-xs font-bold text-slate-800 dark:text-slate-100">${velMedia.toFixed(1)} km/h</span>
            </div>
            <div class="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                <span class="text-xs">🔥</span>
                <span class="text-xs font-black text-amber-600 dark:text-amber-400">~${kcal} kcal</span>
            </div>
        </div>
    `;

    // 4. Barra de acciones operativas y Likes
    let actionButtonsHtml = '';
    if (tieneCoords || rutaId) {
        actionButtonsHtml = `
            <div class="flex items-center justify-between flex-wrap gap-2 pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-700/60">
                <div class="flex items-center gap-1.5 flex-wrap">
                    ${tieneCoords ? `
                        <button type="button" onclick="abrirRutaSocialEnMapa('${rutaId}')" class="px-2.5 py-1 bg-marine hover:bg-sky-700 text-white font-bold text-[11px] rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>🗺️</span><span>Ver en Mapa</span>
                        </button>
                        <button type="button" onclick="descargarGpxRutaSocial('${rutaId}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                            <span>📲</span><span>GPX</span>
                        </button>
                    ` : ''}
                    <button type="button" onclick="mostrarModalSplitsKm('${rutaId}')" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                        <span>📊</span><span>Splits</span>
                    </button>
                    ${esPropietario ? `
                        <button type="button" onclick="compartirRutaEnMiClub('${rutaId}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-lg shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Compartir en el muro de mi club">
                            <span>📣</span><span>Club</span>
                        </button>
                    ` : ''}
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="toggleLikeRutaSocial('${rutaId}')" id="btnLikeSocial-${rutaId}" class="px-2 py-1 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer">
                        <span>❤️</span><span id="likeCountSocial-${rutaId}">0</span>
                    </button>
                </div>
            </div>
        `;
    }

    return `
        <div class="flex flex-col gap-1 w-full text-left">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${autorAvatar}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-11 h-11 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700 shadow-sm shrink-0" alt="Avatar">
                    <div class="min-w-0">
                        <p class="text-sm font-black text-marine dark:text-white leading-tight truncate">${esc(autorNombre)}</p>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate font-semibold">${esc(ubicacion)} ${clubNombre ? `· <span class="text-water dark:text-sky-400 font-bold">${esc(clubNombre)}</span>` : ''}</p>
                    </div>
                </div>
                ${fechaStr ? `<span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider shrink-0">${fechaStr}</span>` : ''}
            </div>
            ${weatherBadgeHtml}
            ${posterHtml}
            ${statsGridHtml}
            ${actionButtonsHtml}
        </div>
    `;
}

/**
 * Visualiza el Póster Finisher a pantalla completa
 */
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
 * Toggle like local/interactivo en una tarjeta de travesía social
 */
export function toggleLikeRutaSocial(rutaId) {
    const key = 'ps_like_' + rutaId;
    const isLiked = localStorage.getItem(key) === 'true';
    const countEl = document.getElementById(`likeCountSocial-${rutaId}`);
    const btnEl = document.getElementById(`btnLikeSocial-${rutaId}`);
    let currentCount = parseInt(countEl?.textContent || '0', 10);

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
                const icon = n.tipo === 'solicitud_club' || n.tipo === 'resolucion_club' ? '⚓' : n.tipo === 'mensaje_chat' ? '💬' : '🔔';
                const estilo = n.leida ? 'bg-white dark:bg-slate-800 opacity-75 border-slate-200 dark:border-slate-700' : 'bg-sky-50 dark:bg-sky-900/20 shadow-sm border-sky-100 dark:border-sky-800/50';
                const btnLeida = !n.leida ? `<button onclick="socialNotifications.marcarLeida('${n.id}')" class="text-[9px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 btn-marcar dark:text-white transition-colors">Leída</button>` : '';
                return `
                    <div id="notif-${n.id}" class="flex gap-3 p-3 border rounded-xl mb-2 transition-colors ${estilo}">
                        <div class="text-2xl">${icon}</div>
                        <div class="flex-1">
                            <p class="text-xs font-bold text-marine dark:text-white leading-tight mb-1">${esc(n.contenido)}</p>
                            <div class="flex justify-end">${btnLeida}</div>
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
export const socialFeed = {
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
    async cargarActividad(filtro = 'global') {
        const c = document.getElementById('feedContainerList');
        if (!c) return;
        c.innerHTML = `<p class="text-center text-slate-400 dark:text-slate-500 text-[10px] animate-pulse py-10 uppercase font-bold tracking-widest">Buscando actividad...</p>`;
        try {
            const { misClubsIds, misAmigosIds } = await this.obtenerFiltrosUsuario();
            
            // 1. Consultar altas de miembros en clubes
            let qMiembros;
            if ((filtro === 'mis_clubs' && misClubsIds.length === 0) ||
                (filtro === 'mis_amigos' && misAmigosIds.length === 0)) {
                qMiembros = Promise.resolve({ data: [] });
            } else {
                qMiembros = supabaseClient
                    .from('clubs_usuarios')
                    .select('joined_at, club_id, user_id, perfiles(nombre, avatar_url), clubs(nombre)');
                if (filtro === 'mis_clubs') qMiembros = qMiembros.in('club_id', misClubsIds);
                if (filtro === 'mis_amigos') qMiembros = qMiembros.in('user_id', misAmigosIds);
                qMiembros = qMiembros.order('joined_at', { ascending: false }).limit(15);
            }

            // 2. Consultar rutas registradas por clubes
            let qRutas;
            if ((filtro === 'mis_clubs' && misClubsIds.length === 0) ||
                (filtro === 'mis_amigos' && misAmigosIds.length === 0)) {
                qRutas = Promise.resolve({ data: [] });
            } else {
                qRutas = supabaseClient
                    .from('club_rutas')
                    .select('created_at, club_id, ruta_id, rutas(id, user_id, ubicacion, distancia_km, tiempo_minutos, velocidad_media, fecha, created_at, imagen_url, ruta_json, route_coordinates, splits_data, weather_snapshot, wind_speed_kt, wind_gust_kt, wave_height_m, wave_period_s, conditions_score), clubs(id, nombre)');
                if (filtro === 'mis_clubs') qRutas = qRutas.in('club_id', misClubsIds);
                if (filtro === 'mis_amigos') qRutas = qRutas.in('rutas.user_id', misAmigosIds);
                qRutas = qRutas.order('created_at', { ascending: false }).limit(15);
            }

            // 2b. Consultar rutas directas de usuarios para feed global o amigos
            let qRutasDirectas;
            if (filtro === 'mis_clubs') {
                qRutasDirectas = Promise.resolve({ data: [] });
            } else if (filtro === 'mis_amigos') {
                if (misAmigosIds.length > 0) {
                    qRutasDirectas = supabaseClient
                        .from('rutas')
                        .select('id, user_id, ubicacion, distancia_km, tiempo_minutos, velocidad_media, fecha, created_at, imagen_url, ruta_json, route_coordinates, splits_data, weather_snapshot, wind_speed_kt, wind_gust_kt, wave_height_m, wave_period_s, conditions_score')
                        .in('user_id', misAmigosIds)
                        .order('created_at', { ascending: false })
                        .limit(15);
                } else {
                    qRutasDirectas = Promise.resolve({ data: [] });
                }
            } else {
                qRutasDirectas = supabaseClient
                    .from('rutas')
                    .select('id, user_id, ubicacion, distancia_km, tiempo_minutos, velocidad_media, fecha, created_at, imagen_url, ruta_json, route_coordinates, splits_data, weather_snapshot, wind_speed_kt, wind_gust_kt, wave_height_m, wave_period_s, conditions_score')
                    .order('created_at', { ascending: false })
                    .limit(15);
            }

            // 3. Consultar chat de clubes:
            // FILTRO ESTRICTO DE PRIVACIDAD:
            // Los chats de los clubes son privados de la tripulación (visibility = 'club_only').
            // Si el usuario no pertenece a ningún club, qChat no consulta la tabla club_chat.
            // Si pertenece a clubes, se restringe estrictamente por .in('club_id', misClubsIds).
            let qChat = Promise.resolve({ data: [] });
            if (Array.isArray(misClubsIds) && misClubsIds.length > 0 &&
                (filtro !== 'mis_amigos' || misAmigosIds.length > 0)) {
                qChat = supabaseClient
                    .from('club_chat')
                    .select('created_at, club_id, user_id, mensaje, visibility, is_public, perfiles(nombre, avatar_url), clubs(nombre)');
                qChat = qChat.in('club_id', misClubsIds);
                if (filtro === 'mis_amigos') qChat = qChat.in('user_id', misAmigosIds);
                qChat = qChat.order('created_at', { ascending: false }).limit(15);
            }
            
            const [resM, resR, resC, resRD] = await Promise.allSettled([qMiembros, qRutas, qChat, qRutasDirectas]);
            let acts = [];

            const queryResults = [resM, resR, resC, resRD];
            const queryErrors = queryResults.flatMap(result => {
                if (result.status === 'rejected') return [result.reason];
                return result.value?.error ? [result.value.error] : [];
            });
            queryErrors.forEach(error => console.warn('[socialFeed] Error consultando actividad:', error));

            const dataM = resM.status === 'fulfilled' && resM.value?.data ? resM.value.data : [];
            const dataR = resR.status === 'fulfilled' && resR.value?.data ? resR.value.data : [];
            const dataC = resC.status === 'fulfilled' && resC.value?.data ? resC.value.data : [];
            const dataRD = resRD?.status === 'fulfilled' && resRD.value?.data ? resRD.value.data : [];

            // Cargar perfiles de las rutas para garantizar nombres y avatares
            const rutasParaPerfil = [
                ...dataR.map(i => i.rutas).filter(Boolean),
                ...dataRD
            ];
            const uids = Array.from(new Set(rutasParaPerfil.map(r => r.user_id).filter(Boolean)));
            if (uids.length > 0) {
                try {
                    const { data: perfilesData } = await supabaseClient.from('perfiles').select('id, nombre, avatar_url').in('id', uids);
                    if (perfilesData && perfilesData.length > 0) {
                        const pMap = new Map(perfilesData.map(p => [p.id, p]));
                        rutasParaPerfil.forEach(r => {
                            if (r.user_id && pMap.has(r.user_id)) {
                                r.perfiles = pMap.get(r.user_id);
                            }
                        });
                    }
                } catch (eP) {
                    console.warn('[socialFeed] Aviso cargando perfiles de rutas:', eP);
                }
            }

            // A) Altas en clubes
            dataM.forEach(i => {
                const esPublico = true;
                acts.push({
                    tipo: 'miembro',
                    date: new Date(i.joined_at),
                    clubId: i.club_id,
                    userId: i.user_id,
                    is_public: esPublico,
                    html: `<div class="flex items-center gap-4"><img src="${esc(safeUrl(i.perfiles?.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full border-2 border-emerald-100 dark:border-emerald-800 object-cover shadow-sm shrink-0"><p class="text-sm text-slate-600 dark:text-slate-300 leading-snug"><strong class="text-marine dark:text-white font-black">${esc(i.perfiles?.nombre || 'Paddler')}</strong> se unió a <strong class="text-emerald-600 dark:text-emerald-400 font-bold">${esc(i.clubs?.nombre || 'un club')}</strong>.</p></div>`
                });
            });

            // B) Rutas de clubes
            dataR.forEach(i => {
                const r = i.rutas;
                if (!r) return;
                acts.push({
                    tipo: 'ruta',
                    date: new Date(i.created_at || r.fecha || r.created_at || Date.now()),
                    clubId: i.club_id,
                    userId: r.user_id || null,
                    is_public: true,
                    html: renderTarjetaRutaSocial(r, i.clubs?.nombre || 'Club')
                });
            });

            // B2) Rutas directas de la flota (amigos o global)
            dataRD.forEach(r => {
                if (dataR.some(cr => String(cr.ruta_id || cr.rutas?.id) === String(r.id))) return;
                acts.push({
                    tipo: 'ruta',
                    date: new Date(r.fecha || r.created_at || Date.now()),
                    clubId: null,
                    userId: r.user_id || null,
                    is_public: true,
                    html: renderTarjetaRutaSocial(r, null)
                });
            });

            // C) Mensajes de chat de clubes (Privados de la tripulación)
            dataC.forEach(i => {
                // FILTRO DE PRIVACIDAD OBLIGATORIO:
                // Solo si el usuario es miembro confirmado del club se permite procesar
                if (!misClubsIds.includes(i.club_id)) return;

                acts.push({
                    tipo: 'chat',
                    date: new Date(i.created_at),
                    clubId: i.club_id,
                    userId: i.user_id,
                    visibility: i.visibility || 'club_only',
                    is_public: i.is_public === true,
                    html: `<div class="flex items-start gap-4"><img src="${esc(safeUrl(i.perfiles?.avatar_url, IMG_FALLBACK))}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-12 h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700 shadow-sm mt-1 shrink-0"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap mb-1"><strong class="text-marine dark:text-white font-black">${esc(i.perfiles?.nombre || 'Paddler')}</strong><span class="text-[9px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-sky-200 dark:border-sky-800/50"><span>🔒</span> Chat Tripulación</span></div><p class="text-xs text-slate-500 dark:text-slate-400">En <strong class="text-marine dark:text-white font-bold">${esc(i.clubs?.nombre || 'Club')}</strong></p><div class="mt-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 p-3 rounded-2xl rounded-tl-sm text-sm text-slate-700 dark:text-slate-300 italic shadow-sm">"${esc(i.mensaje)}"</div></div></div>`
                });
            });
            
            // ====================================================
            // FILTRADO ESTRICTO SEGÚN PESTAÑA DEL FEED
            // ====================================================
            if (filtro === 'global') {
                // FILTRO OBLIGATORIO FEED GLOBAL:
                // 1. Mostrar publicaciones públicas (is_public = true).
                // 2. Mostrar contenido de clubes ÚNICAMENTE si el usuario pertenece a ese club
                //    (club_id IN (SELECT club_id FROM memberships WHERE user_id = $user_id)).
                // 3. Los mensajes tipo 'chat' tienen visibility = 'club_only' y NUNCA aparecen para usuarios externos.
                acts = acts.filter(i => {
                    // Si es mensaje de chat: nunca mostrar a usuarios externos que no pertenecen al club
                    if (i.tipo === 'chat') {
                        return misClubsIds.includes(i.clubId);
                    }
                    // Si es contenido de un club (rutas, miembros):
                    if (i.clubId) {
                        // Si el usuario pertenece al club, se muestra
                        if (misClubsIds.includes(i.clubId)) return true;
                        // Si es usuario externo, solo si la publicación es pública
                        return i.is_public === true;
                    }
                    // Publicaciones generales: solo públicas
                    return i.is_public === true;
                });
            } else if (filtro === 'mis_clubs') {
                acts = misClubsIds.length ? acts.filter(i => misClubsIds.includes(i.clubId)) : [];
            } else if (filtro === 'mis_amigos') {
                acts = misAmigosIds.length ? acts.filter(i => i.userId && misAmigosIds.includes(i.userId)) : [];
            }
            
            acts.sort((a, b) => b.date - a.date);
            
            if (!acts || acts.length === 0) {
                if (queryErrors.length > 0) {
                    c.innerHTML = `<p class="text-center text-rose-500 text-xs py-10">No se pudo cargar la actividad. Inténtalo de nuevo más tarde.</p>`;
                    return;
                }
                let mensajeVacio = "Cuando tú, tus amigos o tu club registréis nuevas travesías, aparecerán aquí.";
                if (filtro === 'mis_clubs' && misClubsIds.length === 0) {
                    mensajeVacio = "Aún no perteneces a ningún club. ¡Únete a un club para ver la actividad interna y el chat de la tripulación!";
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
            h += acts.map(i => `<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 rounded-[24px] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">${i.html}<div class="mt-4 pt-3 border-t border-slate-50 dark:border-slate-700/50 flex justify-end"><span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md">${i.date.toLocaleDateString(undefined, {month:'short', day:'numeric'})} • ${i.date.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'})}</span></div></div>`).join('');
            c.innerHTML = h + '</div>';
        } catch (e) { 
            console.warn('Aviso no crítico:', e);
            c.innerHTML = `
                <div class="flex flex-col items-center justify-center p-8 text-center bg-slate-800/40 rounded-2xl border border-slate-700/50 my-4">
                    <span class="text-3xl mb-2">🌊</span>
                    <p class="text-sm font-bold text-slate-300">No se ha publicado nada</p>
                    <p class="text-xs text-slate-500 mt-1">Cuando tú, tus amigos o tu club registréis nuevas travesías, aparecerán aquí.</p>
                </div>`;
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
window.descargarGpxRutaSocial = descargarGpxRutaSocial;
window.compartirRutaEnMiClub = compartirRutaEnMiClub;
window.toggleLikeRutaSocial = toggleLikeRutaSocial;