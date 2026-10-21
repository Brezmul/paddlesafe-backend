// ==============================================================================
// js/gamification.js - MOTOR DE GAMIFICACIÓN, XP, NIVELES Y RANKING
// PaddleSafe v5.18
// ==============================================================================

import { supabaseClient } from './config.js';

/**
 * Calcula el nivel y métricas de progreso de XP a partir de la fórmula:
 * nivel = Math.floor(Math.sqrt(total_xp / 100)) + 1
 * 
 * @param {number} totalXp - Puntos de experiencia acumulados
 * @returns {Object} Objeto con nivel, porcentajes y XP para subir
 */
export function calcularNivelYProgreso(totalXp) {
    const xp = Math.max(0, Math.round(Number(totalXp) || 0));
    
    // Fórmula requerida: nivel = Math.floor(Math.sqrt(total_xp / 100)) + 1
    const nivel = Math.floor(Math.sqrt(xp / 100)) + 1;
    
    // Límites de XP para el nivel actual y el siguiente
    // Para nivel N:
    // Base de inicio = (N - 1)^2 * 100
    // Siguiente nivel = N^2 * 100
    const xpBaseNivel = Math.pow(nivel - 1, 2) * 100;
    const xpSiguienteNivel = Math.pow(nivel, 2) * 100;
    const xpRangoNivel = Math.max(1, xpSiguienteNivel - xpBaseNivel);
    const xpActualEnNivel = Math.max(0, xp - xpBaseNivel);
    const xpFaltante = Math.max(0, xpSiguienteNivel - xp);
    
    const progresoPorcentaje = Math.min(100, Math.max(0, Math.round((xpActualEnNivel / xpRangoNivel) * 100)));

    return {
        nivel,
        totalXp: xp,
        xpBaseNivel,
        xpSiguienteNivel,
        xpActualEnNivel,
        xpRangoNivel,
        xpFaltante,
        progresoPorcentaje
    };
}

/**
 * Calcula el XP ganado en una nueva ruta:
 * - 100 XP por cada km recorrido.
 * - +50 XP extra si la velocidad media supera la media habitual del usuario.
 * - Validación anti-trampas: ignora rutas con velocidades mayores a 45 km/h (0 XP).
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.distanceKm
 * @param {number} params.avgSpeed
 * @returns {Promise<Object>}
 */
export async function calcularXpRutaNueva({ userId, distanceKm, avgSpeed }) {
    const dist = Math.max(0, Number(distanceKm) || 0);
    const spd = Math.max(0, Number(avgSpeed) || 0);

    // 1. Anti-cheat: si la velocidad media supera los 45 km/h, se descarta (posible vehículo a motor)
    if (spd > 45) {
        return {
            xpGanado: 0,
            xpBase: 0,
            bonusVelocidad: 0,
            mediaHabitual: 0,
            esTrampa: true,
            motivo: 'Velocidad media superior a 45 km/h detectada como vehículo motorizado (0 XP otorgado).'
        };
    }

    // 2. Base XP: 100 XP por cada km recorrido
    const xpBase = Math.round(dist * 100);

    // 3. Bonus extra: +50 XP si la velocidad media supera la media habitual del usuario
    let bonusVelocidad = 0;
    let mediaHabitual = 0;

    if (userId && supabaseClient) {
        try {
            // Consultar rutas previas del usuario (filtrando posibles anomalías > 45 km/h)
            const { data: rutasPrevias, error } = await supabaseClient
                .from('user_routes')
                .select('avg_speed')
                .eq('user_id', userId)
                .lte('avg_speed', 45);

            if (!error && Array.isArray(rutasPrevias) && rutasPrevias.length > 0) {
                const sumaVelocidades = rutasPrevias.reduce((acc, r) => acc + (Number(r.avg_speed) || 0), 0);
                mediaHabitual = Number((sumaVelocidades / rutasPrevias.length).toFixed(2));
                
                if (spd > mediaHabitual) {
                    bonusVelocidad = 50;
                }
            }
        } catch (e) {
            console.warn('[gamification] Error al calcular velocidad media habitual:', e);
        }
    }

    const xpGanado = xpBase + bonusVelocidad;

    return {
        xpGanado,
        xpBase,
        bonusVelocidad,
        mediaHabitual,
        esTrampa: false,
        motivo: bonusVelocidad > 0 
            ? `¡Superaste tu media habitual (${mediaHabitual} km/h)! +50 XP extra otorgados.`
            : null
    };
}

/**
 * Consulta la posición de un usuario en el ranking global comparando su total_xp
 * con el resto de usuarios en la tabla 'perfiles'.
 * 
 * @param {number} totalXp - Puntos de experiencia del usuario
 * @returns {Promise<{posicion: number, totalUsuarios: number}>}
 */
export async function obtenerPosicionRanking(totalXp) {
    if (!supabaseClient) return { posicion: 1, totalUsuarios: 1 };
    
    try {
        const xp = Math.max(0, Math.round(Number(totalXp) || 0));

        // Contar cuántos usuarios tienen un total_xp mayor
        const { count: usuariosDelante, error: errCount } = await supabaseClient
            .from('perfiles')
            .select('id', { count: 'exact', head: true })
            .gt('total_xp', xp);

        // Contar el número total de usuarios registrados
        const { count: totalJugadores, error: errTotal } = await supabaseClient
            .from('perfiles')
            .select('id', { count: 'exact', head: true });

        const posicion = (usuariosDelante !== null && usuariosDelante !== undefined && !errCount)
            ? (usuariosDelante + 1)
            : 1;

        const totalUsuarios = (totalJugadores !== null && totalJugadores !== undefined && !errTotal)
            ? Math.max(1, totalJugadores)
            : 1;

        return {
            posicion,
            totalUsuarios
        };
    } catch (e) {
        console.warn('[gamification] Error consultando ranking:', e);
        return { posicion: 1, totalUsuarios: 1 };
    }
}

/**
 * Función central de guardado en 'user_routes' con integración de gamificación:
 * 1. Calcula XP ganado (100 XP/km + 50 extra si > media habitual, 0 XP si > 45 km/h).
 * 2. Guarda en 'user_routes' (con fallback a 'rutas').
 * 3. Suma XP y distancia al perfil y recalcula el nivel con Math.floor(Math.sqrt(total_xp / 100)) + 1.
 * 
 * @param {Object} datosRuta
 * @returns {Promise<Object>} Resultado con ruta guardada, XP ganado, perfil actualizado y rango
 */
export async function guardarRutaDeportivaConGamificacion({
    userId,
    title = 'Ruta en Paddle Surf',
    distanceKm = 0,
    durationSeconds = 0,
    avgSpeed = 0,
    maxSpeed = 0,
    routeCoordinates = [],
    splitsData = [],
    aiFeedback = null,
    createdAt = new Date().toISOString()
}) {
    if (!userId) {
        throw new Error('Se requiere un ID de usuario válido para registrar la ruta.');
    }

    const distLimpia = Number(Number(distanceKm || 0).toFixed(2));
    const velMediaLimpia = Number(Number(avgSpeed || 0).toFixed(2));
    const velMaxLimpia = Number(Number(maxSpeed || (velMediaLimpia * 1.35)).toFixed(2));
    const durSegundosLimpia = Math.max(0, Math.round(Number(durationSeconds) || 0));

    // 1. Calcular XP ganado con reglas deportivas y filtro anti-cheat
    const calculoXp = await calcularXpRutaNueva({
        userId,
        distanceKm: distLimpia,
        avgSpeed: velMediaLimpia
    });

    const xpEarned = calculoXp.xpGanado;

    const rutaPayload = {
        user_id: userId,
        title: (title || 'Ruta en Paddle Surf').trim().slice(0, 100),
        distance_km: distLimpia,
        duration_seconds: durSegundosLimpia,
        avg_speed: velMediaLimpia,
        max_speed: velMaxLimpia,
        route_coordinates: routeCoordinates,
        splits_data: splitsData || [],
        ai_feedback: aiFeedback,
        xp_earned: xpEarned,
        created_at: createdAt
    };

    // 2. Persistir en la tabla 'user_routes' (con fallback a 'rutas' legacy si es necesario)
    let rutaGuardada = null;
    let fallbackUsado = false;

    try {
        const { data: urData, error: urErr } = await supabaseClient
            .from('user_routes')
            .insert([rutaPayload])
            .select()
            .maybeSingle();

        if (urErr) throw urErr;
        rutaGuardada = urData || rutaPayload;
    } catch (errUR) {
        console.warn("[gamification] Inserción en 'user_routes' no disponible, usando fallback a 'rutas':", errUR.message);
        fallbackUsado = true;
        const legacyPayload = {
            user_id: userId,
            distancia_km: rutaPayload.distance_km,
            tiempo_minutos: Math.max(1, Math.round(rutaPayload.duration_seconds / 60)),
            fecha: rutaPayload.created_at,
            ruta_json: rutaPayload.route_coordinates,
            avg_speed_kmh: rutaPayload.avg_speed,
            points_earned: xpEarned
        };
        const { data: legData, error: legErr } = await supabaseClient
            .from('rutas')
            .insert([legacyPayload])
            .select()
            .maybeSingle();

        if (legErr) throw legErr;
        rutaGuardada = legData || legacyPayload;
    }

    // 3. Obtener el perfil actualizado tras la ejecución del trigger en Supabase
    let perfilActualizado = null;
    let subioDeNivel = false;

    try {
        const { data: perfilActual } = await supabaseClient
            .from('perfiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (perfilActual) {
            perfilActualizado = perfilActual;
            const nivelActual = Number(perfilActual.current_level ?? perfilActual.nivel ?? 1);
            subioDeNivel = Boolean(calculoXp?.nivelActual && nivelActual > (calculoXp.nivelActual - 1));
        } else {
            // Fallback en memoria si la consulta remota no devuelve fila
            const nuevoTotalXp = (Number(appState.perfilUsuario?.total_xp ?? appState.perfilUsuario?.puntos ?? 0)) + xpEarned;
            const nuevoNivel = Math.floor(Math.sqrt(nuevoTotalXp / 100)) + 1;
            perfilActualizado = {
                ...(appState.perfilUsuario || {}),
                total_xp: nuevoTotalXp,
                puntos: nuevoTotalXp,
                current_level: nuevoNivel,
                nivel: nuevoNivel
            };
        }
    } catch (errPerfil) {
        console.warn('[gamification] Aviso al refrescar perfil tras guardado:', errPerfil);
    }

    return {
        ok: true,
        ruta: rutaGuardada,
        calculoXp,
        perfil: perfilActualizado,
        subioDeNivel,
        fallbackUsado
    };
}

/**
 * Calcula el XP de una ruta según distancia y velocidad media (alias de calcularXpRutaNueva)
 */
export async function calcularXpRuta(params) {
    if (typeof params === 'number') {
        const distanceKm = params;
        const avgSpeed = arguments[1] || 0;
        const userId = arguments[2] || null;
        return calcularXpRutaNueva({ userId, distanceKm, avgSpeed });
    }
    return calcularXpRutaNueva(params || {});
}

/**
 * Sincroniza la progresión de XP, distancia acumulada y nivel en la tabla 'perfiles'
 * tras finalizar una ruta o travesía GPS.
 */
export async function sincronizarProgresion({ userId, distanceKm = 0, durationMinutes = 0, avgSpeed = 0 }) {
    if (!userId || !supabaseClient) return null;
    const dist = Math.max(0, Number(Number(distanceKm || 0).toFixed(2)));
    const mins = Math.max(0, Number(durationMinutes || 0));
    const speed = Number(avgSpeed || (mins > 0 ? (dist / (mins / 60)) : 0));

    // 1. Calcular XP ganado con validación anti-trampas
    const resXp = await calcularXpRutaNueva({ userId, distanceKm: dist, avgSpeed: speed });
    const xpGanado = resXp.xpGanado || Math.round(dist * 100);

    try {
        // 2. Obtener perfil actual para cálculo atómico
        const { data: perfil, error: errPerf } = await supabaseClient
            .from('perfiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (errPerf) throw errPerf;

        if (perfil) {
            const currentXp = Number(perfil.total_xp ?? perfil.puntos ?? 0);
            const currentDist = Number(perfil.total_distance_km ?? perfil.km_totales ?? 0);
            const nuevoXp = currentXp + xpGanado;
            const nuevaDist = Number((currentDist + dist).toFixed(2));
            const nuevoNivel = Math.floor(Math.sqrt(nuevoXp / 100)) + 1;

            const updatePayload = {
                total_xp: nuevoXp,
                puntos: nuevoXp,
                total_distance_km: nuevaDist,
                km_totales: nuevaDist,
                current_level: nuevoNivel,
                nivel: nuevoNivel
            };

            const { data: perfilActualizado, error: errUpd } = await supabaseClient
                .from('perfiles')
                .update(updatePayload)
                .eq('id', userId)
                .select()
                .maybeSingle();

            if (errUpd) throw errUpd;

            return {
                ok: true,
                xpGanado,
                nuevoXp,
                nuevoNivel,
                nuevaDist,
                perfil: perfilActualizado || { ...perfil, ...updatePayload }
            };
        }
    } catch (e) {
        console.warn('[gamification] Aviso al sincronizar progresión:', e);
    }
    return { ok: false, xpGanado };
}

// ==============================================================================
// 10. CATÁLOGO DE LOGROS MERITOCRÁTICOS ISA & MOTOR DE PRs (PADDLE PROFILE 2.0)
// ==============================================================================

export const CATALOGO_LOGROS_MERITO = [
    {
        id: 'bautismo_mar',
        nombre: 'Bautismo de Mar',
        icono: '🌊',
        descripcion: 'Completa tu 1ª travesía registrada',
        target: 1,
        evaluar: (stats) => {
            const salidas = stats?.totales?.totalSalidas || 0;
            return {
                unlocked: salidas >= 1,
                progressPct: Math.min(100, Math.round((salidas / 1) * 100)),
                progressText: `${salidas} / 1 salida`
            };
        }
    },
    {
        id: 'costero_10k',
        nombre: 'Explorador 10K',
        icono: '🧭',
        descripcion: 'Completa una travesía de >= 10 km en una sesión',
        target: 10,
        evaluar: (stats) => {
            const maxDist = Number(stats?.recordDistancia?.distKm || 0);
            return {
                unlocked: maxDist >= 10,
                progressPct: Math.min(100, Math.round((maxDist / 10) * 100)),
                progressText: `${maxDist.toFixed(1)} / 10 km`
            };
        }
    },
    {
        id: 'ultramaraton_25k',
        nombre: 'Ultramaratón 25K',
        icono: '🔱',
        descripcion: 'Completa una travesía épica de >= 25 km',
        target: 25,
        evaluar: (stats) => {
            const maxDist = Number(stats?.recordDistancia?.distKm || 0);
            return {
                unlocked: maxDist >= 25,
                progressPct: Math.min(100, Math.round((maxDist / 25) * 100)),
                progressText: `${maxDist.toFixed(1)} / 25 km`
            };
        }
    },
    {
        id: 'quilla_veloz',
        nombre: 'Quilla Rápida',
        icono: '⚡',
        descripcion: 'Alcanza >= 5.2 km/h de media en una ruta de >= 3 km',
        target: 5.2,
        evaluar: (stats, perfil, rutas) => {
            let maxVelEn3Km = 0;
            if (Array.isArray(rutas)) {
                rutas.forEach(r => {
                    const dist = Number(r.distance_km || r.distancia_km || 0);
                    const vel = Number(r.avg_speed || r.avg_speed_kmh || 0);
                    if (dist >= 3.0 && vel > maxVelEn3Km) {
                        maxVelEn3Km = vel;
                    }
                });
            }
            return {
                unlocked: maxVelEn3Km >= 5.2,
                progressPct: Math.min(100, Math.round((maxVelEn3Km / 5.2) * 100)),
                progressText: `${maxVelEn3Km.toFixed(1)} / 5.2 km/h`
            };
        }
    },
    {
        id: 'domador_viento',
        nombre: 'Domador del Eolo',
        icono: '💨',
        descripcion: 'Completa una travesía con viento >= 12 kt',
        target: 12,
        evaluar: (stats, perfil, rutas) => {
            let maxViento = 0;
            if (Array.isArray(rutas)) {
                rutas.forEach(r => {
                    let v = 0;
                    if (r.vientoKt) v = Number(r.vientoKt);
                    else if (r.ubicacion && r.ubicacion.vientoKt) v = Number(r.ubicacion.vientoKt);
                    else if (typeof localStorage !== 'undefined') {
                        try {
                            const cached = localStorage.getItem('ps_telemetry_' + r.id);
                            if (cached) {
                                const parsed = JSON.parse(cached);
                                if (parsed && parsed.vientoKt) v = Number(parsed.vientoKt);
                            }
                        } catch (e) {}
                    }
                    if (v > maxViento) maxViento = v;
                });
            }
            return {
                unlocked: maxViento >= 12,
                progressPct: Math.min(100, Math.round((maxViento / 12) * 100)),
                progressText: `${maxViento} / 12 kt`
            };
        }
    },
    {
        id: 'centurion_100k',
        nombre: 'Centurión 100K',
        icono: '🌍',
        descripcion: 'Acumula 100 km totales remados',
        target: 100,
        evaluar: (stats, perfil) => {
            const kmTot = Number(stats?.totales?.kmTotales || perfil?.total_distance_km || perfil?.km_totales || 0);
            return {
                unlocked: kmTot >= 100,
                progressPct: Math.min(100, Math.round((kmTot / 100) * 100)),
                progressText: `${kmTot.toFixed(1)} / 100 km`
            };
        }
    },
    {
        id: 'rey_constancia',
        nombre: 'Constancia Pro',
        icono: '🔥',
        descripcion: 'Acumula 10 salidas registradas en el agua',
        target: 10,
        evaluar: (stats) => {
            const salidas = stats?.totales?.totalSalidas || 0;
            return {
                unlocked: salidas >= 10,
                progressPct: Math.min(100, Math.round((salidas / 10) * 100)),
                progressText: `${salidas} / 10 salidas`
            };
        }
    },
    {
        id: 'estratega_spots',
        nombre: 'Estratega Local',
        icono: '⭐',
        descripcion: 'Guarda 3 o más playas en Mis Spots',
        target: 3,
        evaluar: (stats, perfil) => {
            let spotsGuardados = 0;
            if (typeof localStorage !== 'undefined') {
                try {
                    const saved = localStorage.getItem('ps_saved_spots');
                    if (saved) spotsGuardados = JSON.parse(saved).length;
                } catch (e) {}
            }
            if (Array.isArray(perfil?.saved_spots)) {
                spotsGuardados = Math.max(spotsGuardados, perfil.saved_spots.length);
            }
            return {
                unlocked: spotsGuardados >= 3,
                progressPct: Math.min(100, Math.round((spotsGuardados / 3) * 100)),
                progressText: `${spotsGuardados} / 3 spots`
            };
        }
    }
];

/**
 * Normaliza rutas de `rutas` y `user_routes` y calcula los Récords Personales (PRs)
 * y métricas de carrera (totales, racha, volumen de las últimas 8 semanas).
 * 
 * @param {Array} rutasLista 
 * @returns {Object} { recordDistancia, recordVelocidad, recordDuracion, recordKcal, totales }
 */
export function calcularRecordsYEstadisticasPerfil(rutasLista = []) {
    const rutasRaw = Array.isArray(rutasLista) ? rutasLista : [];
    
    // 1. Normalizar estructura de cada sesión
    const rutas = rutasRaw.map(r => {
        const id = String(r.id || '');
        const titulo = r.title || r.titulo || 'Travesía SUP';
        const distKm = Number(Number(r.distance_km || r.distancia_km || 0).toFixed(2));
        
        let durMin = 0;
        if (r.duration_seconds !== undefined && r.duration_seconds !== null) {
            durMin = Math.max(0, Math.round(Number(r.duration_seconds) / 60));
        } else if (r.tiempo_minutos !== undefined && r.tiempo_minutos !== null) {
            durMin = Math.max(0, Math.round(Number(r.tiempo_minutos)));
        } else if (distKm > 0 && Number(r.avg_speed || r.avg_speed_kmh || 0) > 0) {
            durMin = Math.round((distKm / Number(r.avg_speed || r.avg_speed_kmh)) * 60);
        }

        let velMedia = 0;
        if (r.avg_speed !== undefined && r.avg_speed !== null) {
            velMedia = Number(Number(r.avg_speed).toFixed(2));
        } else if (r.avg_speed_kmh !== undefined && r.avg_speed_kmh !== null) {
            velMedia = Number(Number(r.avg_speed_kmh).toFixed(2));
        } else if (distKm > 0 && durMin > 0) {
            velMedia = Number((distKm / (durMin / 60)).toFixed(2));
        }

        const fecha = r.created_at || r.fecha || r.date || new Date().toISOString();

        let kcal = 0;
        if (r.kcal) {
            kcal = Math.round(Number(r.kcal));
        } else if (typeof window !== 'undefined' && typeof window.calcularBiometriaSup === 'function') {
            try {
                const bio = window.calcularBiometriaSup({ duracionMin: durMin, distKm, velKmh: velMedia });
                kcal = bio?.kcal || Math.round((6.0 + (velMedia > 5 ? 1.5 : 0)) * 75 * (durMin / 60));
            } catch {
                kcal = Math.round((6.0 + (velMedia > 5 ? 1.5 : 0)) * 75 * (durMin / 60));
            }
        } else {
            kcal = Math.round((6.0 + (velMedia > 5 ? 1.5 : 0)) * 75 * (durMin / 60));
        }

        return { id, titulo, distKm, durMin, velMedia, fecha, kcal, raw: r };
    });

    // 2. Récord de Distancia (Máxima distancia alcanzada en una sesión)
    let bestDist = { distKm: 0, rutaId: null, fecha: null, titulo: '--' };
    let bestVel = { velMedia: 0, rutaId: null, fecha: null, titulo: '--' };
    let bestDur = { durMin: 0, rutaId: null, fecha: null, titulo: '--' };
    let bestKcal = { kcal: 0, rutaId: null, fecha: null, titulo: '--' };

    let sumDist = 0;
    let sumDurMin = 0;
    let sumKcal = 0;
    let kmMesActual = 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    rutas.forEach(r => {
        sumDist += r.distKm;
        sumDurMin += r.durMin;
        sumKcal += r.kcal;

        const d = new Date(r.fecha);
        if (!isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            kmMesActual += r.distKm;
        }

        if (r.distKm > bestDist.distKm) {
            bestDist = { distKm: r.distKm, rutaId: r.id, fecha: r.fecha, titulo: r.titulo };
        }

        // Récord de Velocidad: rutas de al menos 1.5 km y velocidad media <= 18 km/h para excluir errores GPS
        if (r.distKm >= 1.5 && r.velMedia <= 18 && r.velMedia > bestVel.velMedia) {
            bestVel = { velMedia: r.velMedia, rutaId: r.id, fecha: r.fecha, titulo: r.titulo };
        }

        if (r.durMin > bestDur.durMin) {
            bestDur = { durMin: r.durMin, rutaId: r.id, fecha: r.fecha, titulo: r.titulo };
        }

        if (r.kcal > bestKcal.kcal) {
            bestKcal = { kcal: r.kcal, rutaId: r.id, fecha: r.fecha, titulo: r.titulo };
        }
    });

    // Si no hubo rutas de >= 1.5 km, fallback de mejor velocidad < 18
    if (bestVel.velMedia === 0 && rutas.length > 0) {
        rutas.forEach(r => {
            if (r.velMedia <= 18 && r.velMedia > bestVel.velMedia) {
                bestVel = { velMedia: r.velMedia, rutaId: r.id, fecha: r.fecha, titulo: r.titulo };
            }
        });
    }

    // 3. Cálculo de Racha de Semanas consecutivas y Volumen de las últimas 8 semanas
    const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = startOfThisWeek.getDay(); // 0 Dom, 1 Lun...
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    startOfThisWeek.setDate(startOfThisWeek.getDate() + diffToMonday);
    startOfThisWeek.setHours(0, 0, 0, 0);

    const activeWeeks = new Set();
    rutas.forEach(r => {
        const d = new Date(r.fecha);
        if (!isNaN(d.getTime())) {
            const weekOffset = Math.floor((startOfThisWeek.getTime() + (7 * 86400000) - 1 - d.getTime()) / (7 * 86400000));
            if (weekOffset >= 0) activeWeeks.add(weekOffset);
        }
    });

    let streak = 0;
    let checkIdx = activeWeeks.has(0) ? 0 : (activeWeeks.has(1) ? 1 : null);
    if (checkIdx !== null) {
        while (activeWeeks.has(checkIdx)) {
            streak++;
            checkIdx++;
        }
    }

    // Volumen 8 semanas (de más antigua S-7 a actual S-0)
    const volumen8Semanas = [];
    for (let i = 7; i >= 0; i--) {
        const wStart = new Date(startOfThisWeek.getTime() - i * 7 * 86400000);
        const wEnd = new Date(wStart.getTime() + 7 * 86400000);
        let label = `S-${i}`;
        if (i === 0) label = 'Esta sem';
        else if (i === 1) label = 'Sem -1';

        let kmSemana = 0;
        let salidasSemana = 0;

        rutas.forEach(r => {
            const t = new Date(r.fecha).getTime();
            if (!isNaN(t) && t >= wStart.getTime() && t < wEnd.getTime()) {
                kmSemana += r.distKm;
                salidasSemana++;
            }
        });

        volumen8Semanas.push({
            label,
            km: Number(kmSemana.toFixed(1)),
            salidas: salidasSemana,
            inicio: wStart.toISOString(),
            fin: wEnd.toISOString()
        });
    }

    return {
        recordDistancia: bestDist,
        recordVelocidad: bestVel,
        recordDuracion: bestDur,
        recordKcal: bestKcal,
        totales: {
            totalSalidas: rutas.length,
            kmTotales: Number(sumDist.toFixed(2)),
            totalHoras: Number((sumDurMin / 60).toFixed(1)),
            totalKcal: sumKcal,
            kmMesActual: Number(kmMesActual.toFixed(2)),
            semanasRacha: streak,
            volumen8Semanas
        }
    };
}

/**
 * Evalúa los logros del usuario a partir del catálogo ISA y sincroniza
 * de forma atómica con Supabase `perfiles.insignias` manteniendo compatibilidad.
 * 
 * @param {Object} perfil 
 * @param {Object} stats 
 * @param {Array} rutas 
 * @returns {Array} Array de insignias evaluadas con status unlocked y progreso
 */
export function evaluarLogrosUsuario(perfil, stats, rutas = []) {
    const statsCalc = stats || calcularRecordsYEstadisticasPerfil(rutas);
    const userProfile = perfil || (typeof window !== 'undefined' && window.appState?.perfilUsuario ? window.appState.perfilUsuario : {});

    const insigniasEvaluadas = CATALOGO_LOGROS_MERITO.map(badge => {
        const evalRes = badge.evaluar(statsCalc, userProfile, rutas);
        return {
            id: badge.id,
            nombre: badge.nombre,
            icono: badge.icono,
            descripcion: badge.descripcion,
            target: badge.target,
            unlocked: Boolean(evalRes.unlocked),
            progressPct: Math.min(100, Math.max(0, Number(evalRes.progressPct) || 0)),
            progressText: evalRes.progressText || ''
        };
    });

    // Sincronizar insignias desbloqueadas en Supabase (perfiles.insignias) de forma no bloqueante
    if (userProfile && userProfile.id && userProfile.id !== 'invitado' && supabaseClient && typeof supabaseClient.from === 'function') {
        const insigniasExistentes = Array.isArray(userProfile.insignias) ? [...userProfile.insignias] : [];
        let huboNuevas = false;

        insigniasEvaluadas.forEach(logro => {
            if (logro.unlocked) {
                const yaExiste = insigniasExistentes.some(item => {
                    if (typeof item === 'string') return item === logro.id;
                    if (item && typeof item === 'object') return item.id === logro.id || item.nombre === logro.nombre;
                    return false;
                });
                if (!yaExiste) {
                    insigniasExistentes.push({
                        id: logro.id,
                        nombre: logro.nombre,
                        icono: logro.icono,
                        descripcion: logro.descripcion,
                        fecha_desbloqueo: new Date().toISOString()
                    });
                    huboNuevas = true;
                }
            }
        });

        if (huboNuevas) {
            userProfile.insignias = insigniasExistentes;
            if (typeof window !== 'undefined' && window.appState?.perfilUsuario && window.appState.perfilUsuario.id === userProfile.id) {
                window.appState.perfilUsuario.insignias = insigniasExistentes;
            }
            supabaseClient
                .from('perfiles')
                .update({ insignias: insigniasExistentes })
                .eq('id', userProfile.id)
                .then(({ error }) => {
                    if (error) console.warn('[gamification] Aviso al persistir insignias:', error.message);
                })
                .catch(e => console.warn('[gamification] Error no crítico actualizando insignias:', e));
        }
    }

    return insigniasEvaluadas;
}

/**
 * Motor Multicategoría y Ámbitos de Ranking con Filtros Anti-Cheat (Batch #11).
 * Normaliza y agrega travesías de public.user_routes y public.rutas,
 * filtrando por periodo, ámbito y categoría deportiva.
 */
export function calcularDatosRankingMulticategoria({
    periodo = 'historico',
    scope = 'global',
    category = 'km_total',
    rutasData = [],
    perfilesData = [],
    clubsData = [],
    membershipsData = [],
    friendshipsData = [],
    currentUserId = null
}) {
    const now = new Date();
    let minTimestamp = 0;

    if (periodo === 'diario') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        minTimestamp = today.getTime();
    } else if (periodo === 'semanal') {
        minTimestamp = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    } else if (periodo === 'mensual') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        minTimestamp = Math.min(startOfMonth, now.getTime() - (30 * 24 * 60 * 60 * 1000));
    } else if (periodo === 'anual') {
        minTimestamp = new Date(now.getFullYear(), 0, 1).getTime();
    }

    // 1. Filtrar rutas por ventana de tiempo
    const rutasPeriodo = (rutasData || []).filter(r => {
        if (!r) return false;
        if (minTimestamp === 0) return true;
        const dateStr = r.created_at || r.fecha || r.date;
        if (!dateStr) return true;
        const t = new Date(dateStr).getTime();
        return !isNaN(t) && t >= minTimestamp;
    });

    // 2. Si el ámbito es 'liga_clubes', agrupar y clasificar por clubes
    if (scope === 'liga_clubes') {
        const clubesMap = new Map();

        (clubsData || []).forEach(c => {
            if (!c || !c.id) return;
            clubesMap.set(String(c.id), {
                id: c.id,
                nombre: c.nombre || c.name || 'Club de Paddle Surf',
                logo_url: c.logo_url || c.logo || '',
                descripcion: c.descripcion || '',
                nivel: c.nivel || 1,
                miembros_ids: new Set(),
                active_paddlers_set: new Set(),
                km_total: 0,
                xp_total: 0,
                total_rutas: 0
            });
        });

        // Mapear miembros de clubs
        (membershipsData || []).forEach(m => {
            if (!m || !m.club_id || !m.user_id) return;
            const club = clubesMap.get(String(m.club_id));
            if (club) club.miembros_ids.add(String(m.user_id));
        });

        // Asignar rutas del periodo al club correspondiente
        rutasPeriodo.forEach(r => {
            const rClubId = r.club_id ? String(r.club_id) : null;
            const rUserId = r.user_id ? String(r.user_id) : null;
            const dist = Number(r.distance_km || r.distancia_km || 0);
            const durSec = Number(r.duration_seconds || (r.tiempo_minutos ? r.tiempo_minutos * 60 : 0));
            const xp = Number(r.xp_earned || r.points_earned || (Math.round(dist * 10) + Math.round(durSec / 60)));

            clubesMap.forEach(club => {
                const belongs = (rClubId && rClubId === club.id) || (rUserId && club.miembros_ids.has(rUserId));
                if (belongs) {
                    club.km_total += dist;
                    club.xp_total += xp;
                    club.total_rutas += 1;
                    if (rUserId) club.active_paddlers_set.add(rUserId);
                }
            });
        });

        const rankingClubs = Array.from(clubesMap.values()).map(c => {
            const activeCount = c.active_paddlers_set.size || c.miembros_ids.size || 0;
            const metricVal = category === 'xp_total' ? Math.round(c.xp_total) : Number(c.km_total.toFixed(2));
            const metricLbl = category === 'xp_total' ? `${metricVal.toLocaleString()} XP` : `${metricVal} km`;

            return {
                id: c.id,
                club_id: c.id,
                nombre: c.nombre,
                logo_url: c.logo_url,
                paddlersCount: activeCount,
                km_total: Number(c.km_total.toFixed(2)),
                xp_total: Math.round(c.xp_total),
                total_rutas: c.total_rutas,
                metric: metricVal,
                metricLabel: metricLbl
            };
        });

        rankingClubs.sort((a, b) => b.metric - a.metric);
        rankingClubs.forEach((c, idx) => { c.rank = idx + 1; });

        return {
            ranking: rankingClubs,
            currentUserRank: null,
            periodo,
            scope,
            category
        };
    }

    // 3. Ámbitos de usuarios: 'global', 'mi_club', 'amigos'
    let allowedUserIds = null;

    if (scope === 'mi_club' && currentUserId) {
        allowedUserIds = new Set([String(currentUserId)]);
        const myClubIds = new Set();
        (membershipsData || []).forEach(m => {
            if (m && String(m.user_id) === String(currentUserId) && m.club_id) {
                myClubIds.add(String(m.club_id));
            }
        });
        (membershipsData || []).forEach(m => {
            if (m && m.club_id && myClubIds.has(String(m.club_id)) && m.user_id) {
                allowedUserIds.add(String(m.user_id));
            }
        });
    } else if (scope === 'amigos' && currentUserId) {
        allowedUserIds = new Set([String(currentUserId)]);
        (friendshipsData || []).forEach(f => {
            if (!f) return;
            const isAccepted = (f.estado === 'aceptada' || f.status === 'accepted');
            if (!isAccepted) return;
            const uId = String(f.usuario_id || f.user_id || '');
            const aId = String(f.amigo_id || f.friend_id || '');
            if (uId === String(currentUserId) && aId) allowedUserIds.add(aId);
            else if (aId === String(currentUserId) && uId) allowedUserIds.add(uId);
        });
    }

    // Indexar perfiles
    const perfilesMap = new Map();
    (perfilesData || []).forEach(p => {
        if (!p || !p.id) return;
        const pId = String(p.id);
        if (allowedUserIds && !allowedUserIds.has(pId)) return;
        // Respetar perfiles privados si es ranking global (excepto el propio usuario)
        if (scope === 'global' && p.is_private && String(currentUserId) !== pId) return;

        perfilesMap.set(pId, {
            user_id: p.id,
            id: p.id,
            nombre: p.nombre || p.user_nombre || p.email || 'Paddler',
            avatar_url: p.avatar_url || '',
            nivel: p.nivel || 1,
            titulo: p.titulo_paddler || p.titulo || `Nivel ${p.nivel || 1}`,
            distancia_total: 0,
            max_route_km: 0,
            best_route_id: null,
            best_route_name: '',
            best_route: null,
            best_speed_kmh: 0,
            best_speed_route_id: null,
            best_speed_route_name: '',
            best_speed_route: null,
            xp_total: 0,
            total_rutas: 0,
            perfil_original: p
        });
    });

    // Asegurar que el usuario actual existe en el mapa si está autenticado
    if (currentUserId && !perfilesMap.has(String(currentUserId))) {
        perfilesMap.set(String(currentUserId), {
            user_id: currentUserId,
            id: currentUserId,
            nombre: 'Tú',
            avatar_url: '',
            nivel: 1,
            titulo: 'Paddler',
            distancia_total: 0,
            max_route_km: 0,
            best_route_id: null,
            best_route_name: '',
            best_route: null,
            best_speed_kmh: 0,
            best_speed_route_id: null,
            best_speed_route_name: '',
            best_speed_route: null,
            xp_total: 0,
            total_rutas: 0,
            perfil_original: null
        });
    }

    // 4. Agregar métricas de rutas por usuario
    rutasPeriodo.forEach(r => {
        const uId = String(r.user_id || '');
        if (!uId || !perfilesMap.has(uId)) return;

        const userStat = perfilesMap.get(uId);
        const distKm = Number(r.distance_km || r.distancia_km || 0);
        const durSec = Number(r.duration_seconds || (r.tiempo_minutos ? r.tiempo_minutos * 60 : 0));
        const durHoras = durSec > 0 ? (durSec / 3600) : 0;
        const velMedia = Number(r.avg_speed || r.avg_speed_kmh || (durHoras > 0 ? (distKm / durHoras) : 0));
        const xp = Number(r.xp_earned || r.points_earned || (Math.round(distKm * 10) + Math.round(durSec / 60)));

        userStat.distancia_total += distKm;
        userStat.xp_total += xp;
        userStat.total_rutas += 1;

        // Mayor travesía
        if (distKm > userStat.max_route_km) {
            userStat.max_route_km = distKm;
            userStat.best_route_id = r.id;
            userStat.best_route_name = r.title || 'Travesía GPS';
            userStat.best_route = r;
        }

        // Mejor velocidad media con FILTRO ANTI-CHEAT ESTRICTO:
        // Solo rutas con distKm >= 2.0 km Y velMedia <= 16.0 km/h (bloquea saltos GPS y registros en vehículo)
        if (distKm >= 2.0 && velMedia <= 16.0) {
            if (velMedia > userStat.best_speed_kmh) {
                userStat.best_speed_kmh = velMedia;
                userStat.best_speed_route_id = r.id;
                userStat.best_speed_route_name = r.title || 'Travesía Rápida';
                userStat.best_speed_route = r;
            }
        }
    });

    // 5. Fallbacks para 'historico' cuando el perfil tiene acumulados pero no rutas desglosadas
    if (periodo === 'historico') {
        perfilesMap.forEach(userStat => {
            const orig = userStat.perfil_original;
            if (orig) {
                if (userStat.distancia_total === 0 && orig.distancia_total_km) {
                    userStat.distancia_total = Number(orig.distancia_total_km || 0);
                }
                if (userStat.xp_total === 0 && (orig.puntos || orig.experiencia)) {
                    userStat.xp_total = Number(orig.puntos || orig.experiencia || 0);
                }
            }
        });
    }

    // 6. Asignar métrica principal según categoría
    const candidatas = Array.from(perfilesMap.values()).map(u => {
        let metric = 0;
        let metricLabel = '';
        let routeId = null;
        let route = null;
        let routeName = '';

        if (category === 'km_total') {
            metric = Number(u.distancia_total.toFixed(2));
            metricLabel = `${metric} km`;
        } else if (category === 'max_route') {
            metric = Number(u.max_route_km.toFixed(2));
            metricLabel = `${metric} km`;
            routeId = u.best_route_id;
            route = u.best_route;
            routeName = u.best_route_name;
        } else if (category === 'best_speed') {
            metric = Number(u.best_speed_kmh.toFixed(1));
            metricLabel = `${metric} km/h`;
            routeId = u.best_speed_route_id;
            route = u.best_speed_route;
            routeName = u.best_speed_route_name;
        } else if (category === 'xp_total') {
            metric = Math.round(u.xp_total);
            metricLabel = `${metric.toLocaleString()} XP`;
        }

        return {
            id: u.id,
            user_id: u.user_id,
            nombre: u.nombre,
            avatar_url: u.avatar_url,
            nivel: u.nivel,
            titulo: u.titulo,
            distancia_total: Number(u.distancia_total.toFixed(2)),
            max_route_km: Number(u.max_route_km.toFixed(2)),
            best_speed_kmh: Number(u.best_speed_kmh.toFixed(1)),
            xp_total: Math.round(u.xp_total),
            total_rutas: u.total_rutas,
            metric,
            metricLabel,
            routeId,
            route,
            routeName
        };
    });

    // Ordenar descendente por métrica
    candidatas.sort((a, b) => b.metric - a.metric);

    // Filtrar candidatos con métrica > 0 (manteniendo al usuario actual para poder calcular su gap si existe)
    const rankingFiltrado = candidatas.filter(c => c.metric > 0 || (currentUserId && String(c.id) === String(currentUserId)));

    rankingFiltrado.forEach((item, index) => {
        item.rank = index + 1;
    });

    // 7. Calcular gap motivacional para el usuario actual
    let currentUserRank = null;
    if (currentUserId) {
        const myIndex = rankingFiltrado.findIndex(c => String(c.id) === String(currentUserId));
        if (myIndex !== -1) {
            const me = rankingFiltrado[myIndex];
            let gapMessage = '';

            if (myIndex === 0) {
                gapMessage = '👑 ¡Lideras esta categoría!';
            } else {
                const rival = rankingFiltrado[myIndex - 1];
                const diff = rival.metric - me.metric;

                if (category === 'best_speed') {
                    gapMessage = `🔥 A solo ${diff.toFixed(1)} km/h de superar a @${rival.nombre} (#${myIndex})`;
                } else if (category === 'xp_total') {
                    gapMessage = `🔥 A solo ${Math.round(diff).toLocaleString()} XP de superar a @${rival.nombre} (#${myIndex})`;
                } else {
                    gapMessage = `🔥 A solo ${diff.toFixed(1)} km de superar a @${rival.nombre} (#${myIndex})`;
                }
            }

            currentUserRank = {
                ...me,
                rank: myIndex + 1,
                totalParticipantes: rankingFiltrado.length,
                gapMessage
            };
        }
    }

    return {
        ranking: rankingFiltrado,
        currentUserRank,
        periodo,
        scope,
        category
    };
}

// ====================================================
// PLANTILLAS Y MOTOR DE RETOS MENSUALES DE CLUB (BATCH #12)
// ====================================================

export const PLANTILLAS_RETOS_CLUB = [
    {
        id: 'colectivo_300k',
        titulo: '🌊 Expedición de Flota 300K',
        descripcion: 'Objetivo de club: sumar entre todos los miembros 300 km en el agua este mes.',
        tipo: 'colectivo_km',
        meta_valor: 300,
        xp_recompensa: 250,
        icono: '🌊'
    },
    {
        id: 'individual_50k',
        titulo: '🔥 Desafío Finisher 50K',
        descripcion: 'Reto personal: completa al menos 50 km durante este mes.',
        tipo: 'individual_km',
        meta_valor: 50,
        xp_recompensa: 300,
        icono: '🔥'
    },
    {
        id: 'constancia_8',
        titulo: '🧭 Constancia: 8 Salidas',
        descripcion: 'Sal al agua un mínimo de 8 sesiones este mes para mantener la quilla activa.',
        tipo: 'individual_salidas',
        meta_valor: 8,
        xp_recompensa: 200,
        icono: '🧭'
    },
    {
        id: 'sprint_5k',
        titulo: '⚡ Rey del Cabo (Sprint >= 3km)',
        descripcion: 'Compite por la mejor velocidad media en travesías de al menos 3.0 km.',
        tipo: 'mejor_ritmo',
        meta_valor: 5.5,
        xp_recompensa: 250,
        icono: '⚡'
    }
];

/**
 * Calcula el progreso de un reto mensual de club considerando sus participantes y rutas en el periodo.
 */
export function calcularProgresoRetoClub(reto, rutasMiembros = [], participantesIds = [], currentUserId = null) {
    if (!reto) return null;

    const metaValor = Number(reto.meta_valor || 100);
    const tipo = reto.tipo || 'colectivo_km';

    // 1. Fechas del reto
    const now = Date.now();
    const inicio = reto.fecha_inicio ? new Date(reto.fecha_inicio).getTime() : new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const fin = reto.fecha_fin ? new Date(reto.fecha_fin).getTime() : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).getTime();

    const diffMs = fin - now;
    const diasRestantes = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // 2. Participantes asignados
    const partSet = new Set((participantesIds || []).map(String));

    // 3. Filtrar rutas en rango cronológico y pertenecientes a participantes (en colectivo_km suman todos los miembros)
    const rutasValidas = (rutasMiembros || []).filter(r => {
        if (!r) return false;
        const uId = String(r.user_id || '');
        if (tipo !== 'colectivo_km' && partSet.size > 0 && !partSet.has(uId)) return false;

        const dateStr = r.created_at || r.fecha;
        if (!dateStr) return true;
        const t = new Date(dateStr).getTime();
        return !isNaN(t) && t >= inicio && t <= fin;
    });

    // Mapeo por usuario de sus métricas personales
    const allUserIds = new Set([
        ...partSet,
        ...(currentUserId ? [String(currentUserId)] : []),
        ...rutasValidas.map(r => String(r.user_id || '')).filter(Boolean)
    ]);
    const userStatsMap = new Map();

    allUserIds.forEach(uId => {
        userStatsMap.set(uId, {
            userId: uId,
            user_id: uId,
            nombre: 'Paddler',
            avatarUrl: '',
            km: 0,
            salidas: 0,
            maxVelocidadMedia: 0,
            aportePct: 0,
            isFinisher: false
        });
    });

    rutasValidas.forEach(r => {
        const uId = String(r.user_id || '');
        if (!userStatsMap.has(uId)) return;
        const stat = userStatsMap.get(uId);

        const dist = Number(r.distance_km || r.distancia_km || 0);
        const durSec = Number(r.duration_seconds || (r.tiempo_minutos ? r.tiempo_minutos * 60 : 0));
        const durH = durSec > 0 ? (durSec / 3600) : 0;
        const vel = Number(r.avg_speed || r.avg_speed_kmh || (durH > 0 ? (dist / durH) : 0));

        stat.km += dist;
        stat.salidas += 1;

        // Filtro estricto para 'mejor_ritmo': dist >= 3.0 km y vel <= 16.0 km/h (anti-cheat)
        if (dist >= 3.0 && vel <= 16.0) {
            if (vel > stat.maxVelocidadMedia) {
                stat.maxVelocidadMedia = vel;
            }
        }
    });

    let totalProgreso = 0;
    let progressPct = 0;
    let completadoGlobal = false;
    const rankingParticipantes = [];

    if (tipo === 'colectivo_km') {
        userStatsMap.forEach(s => {
            s.km = Number(s.km.toFixed(2));
            totalProgreso += s.km;
        });
        totalProgreso = Number(totalProgreso.toFixed(2));
        progressPct = Math.min(100, Math.round((totalProgreso / metaValor) * 100));
        completadoGlobal = totalProgreso >= metaValor;

        userStatsMap.forEach(s => {
            s.aportePct = totalProgreso > 0 ? Math.round((s.km / totalProgreso) * 100) : 0;
            s.valor = s.km;
            s.valorLabel = `${s.km} km`;
            s.progressPct = progressPct;
            s.isFinisher = completadoGlobal;
            rankingParticipantes.push(s);
        });

        rankingParticipantes.sort((a, b) => b.km - a.km);

    } else if (tipo === 'individual_km') {
        userStatsMap.forEach(s => {
            s.km = Number(s.km.toFixed(2));
            totalProgreso += s.km;
            s.valor = s.km;
            s.valorLabel = `${s.km} km`;
            s.progressPct = Math.min(100, Math.round((s.km / metaValor) * 100));
            s.isFinisher = s.km >= metaValor;
            rankingParticipantes.push(s);
        });
        totalProgreso = Number(totalProgreso.toFixed(2));
        rankingParticipantes.sort((a, b) => b.km - a.km);
        progressPct = rankingParticipantes.length > 0 ? rankingParticipantes[0].progressPct : 0;
        completadoGlobal = rankingParticipantes.some(p => p.isFinisher);

    } else if (tipo === 'individual_salidas') {
        userStatsMap.forEach(s => {
            totalProgreso += s.salidas;
            s.valor = s.salidas;
            s.valorLabel = `${s.salidas} salidas`;
            s.progressPct = Math.min(100, Math.round((s.salidas / metaValor) * 100));
            s.isFinisher = s.salidas >= metaValor;
            rankingParticipantes.push(s);
        });
        rankingParticipantes.sort((a, b) => b.salidas - a.salidas);
        progressPct = rankingParticipantes.length > 0 ? rankingParticipantes[0].progressPct : 0;
        completadoGlobal = rankingParticipantes.some(p => p.isFinisher);

    } else if (tipo === 'mejor_ritmo') {
        userStatsMap.forEach(s => {
            s.maxVelocidadMedia = Number(s.maxVelocidadMedia.toFixed(1));
            s.valor = s.maxVelocidadMedia;
            s.valorLabel = `${s.maxVelocidadMedia} km/h`;
            s.progressPct = Math.min(100, Math.round((s.maxVelocidadMedia / metaValor) * 100));
            s.isFinisher = s.maxVelocidadMedia >= metaValor;
            rankingParticipantes.push(s);
        });
        rankingParticipantes.sort((a, b) => b.maxVelocidadMedia - a.maxVelocidadMedia);
        totalProgreso = rankingParticipantes.length > 0 ? rankingParticipantes[0].maxVelocidadMedia : 0;
        progressPct = rankingParticipantes.length > 0 ? rankingParticipantes[0].progressPct : 0;
        completadoGlobal = rankingParticipantes.some(p => p.isFinisher);
    }

    rankingParticipantes.forEach((p, idx) => {
        p.rank = idx + 1;
    });

    let progresoTotalLabel = `${totalProgreso} km`;
    if (tipo === 'individual_salidas') progresoTotalLabel = `${totalProgreso} salidas`;
    else if (tipo === 'mejor_ritmo') progresoTotalLabel = `${totalProgreso} km/h`;

    const targetUserId = currentUserId ? String(currentUserId) : (participantesIds && participantesIds.length > 0 ? String(participantesIds[0]) : null);
    const myStat = (targetUserId && userStatsMap.get(targetUserId)) || (rankingParticipantes.length > 0 ? rankingParticipantes[0] : null);
    const userOrGlobalPct = (currentUserId && myStat) ? myStat.progressPct : progressPct;

    return {
        totalProgreso,
        progresoTotal: totalProgreso,
        progresoTotalLabel,
        metaValor,
        progressPct: userOrGlobalPct,
        porcentaje: userOrGlobalPct,
        completadoGlobal,
        isCompletado: completadoGlobal,
        diasRestantes,
        rankingParticipantes,
        participantes: rankingParticipantes,
        miProgreso: myStat
    };
}

// Exponer en window para acceso global si fuese necesario

/**
 * Renderiza el podio olímpico / Strava Bento Top 3 (Batch #21)
 * Columna 1: #2 Plata (izquierda)
 * Columna 2: #1 Oro (centro elevado)
 * Columna 3: #3 Bronce (derecha)
 * @param {Array} listaUsuarios - Lista de palistas clasificados ordenada por rank
 * @returns {string} Markup HTML del podio Bento
 */
export function renderizarPodioTop3Ranking(listaUsuarios = []) {
    if (!Array.isArray(listaUsuarios) || listaUsuarios.length === 0) {
        return '';
    }

    const p1 = listaUsuarios[0] || null;
    const p2 = listaUsuarios[1] || null;
    const p3 = listaUsuarios[2] || null;

    if (!p1) return '';

    const formatMetric = (p) => {
        if (!p) return '';
        if (p.metricLabel) return p.metricLabel;
        if (p.km_total !== undefined) return `${Number(p.km_total).toFixed(2)} km`;
        if (p.xp_total !== undefined) return `${Math.round(p.xp_total)} XP`;
        if (p.distancia_total_km !== undefined) return `${Number(p.distancia_total_km).toFixed(2)} km`;
        return `${p.metric || 0}`;
    };

    const avatarP1 = (p1 && p1.avatar_url) ? p1.avatar_url : (typeof IMG_FALLBACK !== 'undefined' ? IMG_FALLBACK : 'img/default-avatar.svg');
    const avatarP2 = (p2 && p2.avatar_url) ? p2.avatar_url : (typeof IMG_FALLBACK !== 'undefined' ? IMG_FALLBACK : 'img/default-avatar.svg');
    const avatarP3 = (p3 && p3.avatar_url) ? p3.avatar_url : (typeof IMG_FALLBACK !== 'undefined' ? IMG_FALLBACK : 'img/default-avatar.svg');

    return `
        <div class="ps-bento-card bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 mb-4 shadow-xl">
            <div class="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div class="flex items-center gap-2">
                    <span class="text-base">🏆</span>
                    <h3 class="text-xs font-black uppercase tracking-wider text-amber-400">Podio de Honor · Top 3</h3>
                </div>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/50">Clasificación Élite</span>
            </div>
            
            <div class="grid grid-cols-3 gap-2 sm:gap-3 items-end pt-3 pb-1 w-full max-w-md mx-auto">
                <!-- 2º Puesto (Plata - Izquierda) -->
                <div class="flex flex-col items-center">
                    ${p2 ? `
                        <div role="button" tabindex="0" onclick="if(window.navigateSPA) window.navigateSPA('/user/${p2.id}')" class="cursor-pointer group flex flex-col items-center w-full active:scale-95 transition-transform">
                            <div class="relative mb-1.5">
                                <img src="${avatarP2}" onerror="this.onerror=null; this.src='img/default-avatar.svg';" class="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-slate-300 shadow-lg group-hover:scale-105 transition-transform ring-2 ring-slate-400/30">
                                <span class="absolute -bottom-1 -right-1 text-sm bg-slate-900/90 rounded-full px-1 shadow">🥈</span>
                            </div>
                            <p class="text-[11px] font-black text-white truncate max-w-[90px] text-center">${p2.nombre || 'Paddler'}</p>
                            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate max-w-[90px]">Nivel ${p2.nivel || 1}</span>
                            <span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-800 border border-slate-600 text-slate-200 ps-tabular shadow-xs mb-1.5">${formatMetric(p2)}</span>
                        </div>
                        <div class="w-full h-16 sm:h-18 ps-podium-silver rounded-t-xl flex flex-col items-center justify-center font-black text-slate-200 text-xs shadow-inner border-b-0">
                            <span class="text-sm font-black">2º</span>
                            <span class="text-[8px] text-slate-400 uppercase tracking-widest font-mono">Plata</span>
                        </div>
                    ` : `
                        <div class="w-full h-12 opacity-30 bg-slate-800/60 rounded-t-xl flex items-center justify-center text-[10px] font-bold text-slate-500">--</div>
                    `}
                </div>

                <!-- 1er Puesto (Oro - Centro Elevado) -->
                <div class="flex flex-col items-center -mt-3">
                    ${p1 ? `
                        <div role="button" tabindex="0" onclick="if(window.navigateSPA) window.navigateSPA('/user/${p1.id}')" class="cursor-pointer group flex flex-col items-center w-full active:scale-95 transition-transform">
                            <div class="relative mb-1.5">
                                <span class="text-base absolute -top-4 left-1/2 -translate-x-1/2 animate-bounce">👑</span>
                                <img src="${avatarP1}" onerror="this.onerror=null; this.src='img/default-avatar.svg';" class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-3 border-amber-400 shadow-xl group-hover:scale-105 transition-transform ring-4 ring-amber-400/30">
                                <span class="absolute -bottom-1 -right-1 text-base bg-slate-900/90 rounded-full px-1 shadow">🥇</span>
                            </div>
                            <p class="text-xs sm:text-sm font-black text-amber-300 truncate max-w-[105px] text-center">${p1.nombre || 'Líder'}</p>
                            <span class="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1 truncate max-w-[105px]">${p1.titulo || `Nivel ${p1.nivel || 1}`}</span>
                            <span class="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white ps-tabular shadow-md mb-1.5">${formatMetric(p1)}</span>
                        </div>
                        <div class="w-full h-24 sm:h-28 ps-podium-gold rounded-t-xl flex flex-col items-center justify-center font-black text-amber-200 text-sm shadow-xl border-b-0">
                            <span class="text-base font-black">1º</span>
                            <span class="text-[9px] text-amber-300 uppercase tracking-widest font-mono">Oro</span>
                        </div>
                    ` : ''}
                </div>

                <!-- 3er Puesto (Bronce - Derecha) -->
                <div class="flex flex-col items-center">
                    ${p3 ? `
                        <div role="button" tabindex="0" onclick="if(window.navigateSPA) window.navigateSPA('/user/${p3.id}')" class="cursor-pointer group flex flex-col items-center w-full active:scale-95 transition-transform">
                            <div class="relative mb-1.5">
                                <img src="${avatarP3}" onerror="this.onerror=null; this.src='img/default-avatar.svg';" class="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-amber-600/70 shadow-lg group-hover:scale-105 transition-transform ring-2 ring-amber-600/30">
                                <span class="absolute -bottom-1 -right-1 text-sm bg-slate-900/90 rounded-full px-1 shadow">🥉</span>
                            </div>
                            <p class="text-[11px] font-black text-white truncate max-w-[90px] text-center">${p3.nombre || 'Paddler'}</p>
                            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate max-w-[90px]">Nivel ${p3.nivel || 1}</span>
                            <span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-800 border border-amber-800/60 text-amber-300 ps-tabular shadow-xs mb-1.5">${formatMetric(p3)}</span>
                        </div>
                        <div class="w-full h-12 sm:h-14 ps-podium-bronze rounded-t-xl flex flex-col items-center justify-center font-black text-amber-300 text-xs shadow-inner border-b-0">
                            <span class="text-xs font-black">3º</span>
                            <span class="text-[8px] text-amber-400 uppercase tracking-widest font-mono">Bronce</span>
                        </div>
                    ` : `
                        <div class="w-full h-10 opacity-30 bg-slate-800/60 rounded-t-xl flex items-center justify-center text-[10px] font-bold text-slate-500">--</div>
                    `}
                </div>
            </div>
        </div>
    `;
}

if (typeof window !== 'undefined') {
    window.calcularNivelYProgreso = calcularNivelYProgreso;
    window.calcularXpRutaNueva = calcularXpRutaNueva;
    window.calcularXpRuta = calcularXpRuta;
    window.sincronizarProgresion = sincronizarProgresion;
    window.sincronizarProgresionRuta = sincronizarProgresion;
    window.obtenerPosicionRanking = obtenerPosicionRanking;
    window.guardarRutaDeportivaConGamificacion = guardarRutaDeportivaConGamificacion;
    window.CATALOGO_LOGROS_MERITO = CATALOGO_LOGROS_MERITO;
    window.calcularRecordsYEstadisticasPerfil = calcularRecordsYEstadisticasPerfil;
    window.evaluarLogrosUsuario = evaluarLogrosUsuario;
    window.calcularDatosRankingMulticategoria = calcularDatosRankingMulticategoria;
    window.PLANTILLAS_RETOS_CLUB = PLANTILLAS_RETOS_CLUB;
    window.calcularProgresoRetoClub = calcularProgresoRetoClub;
    window.renderizarPodioTop3Ranking = renderizarPodioTop3Ranking;
}


