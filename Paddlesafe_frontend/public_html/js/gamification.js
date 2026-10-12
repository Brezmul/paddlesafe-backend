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

    // 3. Actualizar el perfil del usuario: sumar total_xp, total_distance_km y calcular current_level
    let perfilActualizado = null;
    let subioDeNivel = false;

    try {
        const { data: perfilActual } = await supabaseClient
            .from('perfiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        const xpPrevio = Number(perfilActual?.total_xp ?? perfilActual?.puntos ?? 0);
        const distPrevia = Number(perfilActual?.total_distance_km ?? perfilActual?.km_totales ?? 0);
        const nivelPrevio = Number(perfilActual?.current_level ?? perfilActual?.nivel ?? 1);

        const nuevoTotalXp = xpPrevio + xpEarned;
        const nuevoTotalDist = Number((distPrevia + rutaPayload.distance_km).toFixed(2));
        
        // Fórmula de nivel requerida:
        const nuevoNivel = Math.floor(Math.sqrt(nuevoTotalXp / 100)) + 1;
        subioDeNivel = nuevoNivel > nivelPrevio;

        const updateData = {
            total_xp: nuevoTotalXp,
            total_distance_km: nuevoTotalDist,
            current_level: nuevoNivel,
            // Sincronización con campos heredados de la aplicación
            puntos: nuevoTotalXp,
            km_totales: nuevoTotalDist,
            nivel: nuevoNivel
        };

        const { data: resUpd, error: errUpd } = await supabaseClient
            .from('perfiles')
            .update(updateData)
            .eq('id', userId)
            .select()
            .maybeSingle();

        perfilActualizado = resUpd || { ...(perfilActual || {}), ...updateData };
    } catch (errPerfil) {
        console.warn('[gamification] Aviso al sincronizar perfil en base de datos:', errPerfil);
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

// Exponer en window para acceso global si fuese necesario
if (typeof window !== 'undefined') {
    window.calcularNivelYProgreso = calcularNivelYProgreso;
    window.calcularXpRutaNueva = calcularXpRutaNueva;
    window.obtenerPosicionRanking = obtenerPosicionRanking;
    window.guardarRutaDeportivaConGamificacion = guardarRutaDeportivaConGamificacion;
}
