// ==============================================================================
// PADDLESAFE NEXT-GEN - PERFILES DEPORTIVOS Y BEGINNER INDEX (sports.js)
// Adapta las recomendaciones a la disciplina específica (Paddle Surf, SUP Race,
// SUP Touring, Kayak, Surf, Wing Foil) y calcula el PaddleSafe Beginner Index.
// ==============================================================================

export const DEPORTES = {
    paddle_surf: {
        nombre: 'Paddle Surf (All-Round)',
        icono: '🏄',
        vientoMax: { Principiante: 8, Intermedio: 12, Avanzado: 16, Competicion: 20 },
        olaMax:    { Principiante: 0.3, Intermedio: 0.6, Avanzado: 1.0, Competicion: 1.5 },
        requiereOlas: false,
        requiereViento: false
    },
    sup_race: {
        nombre: 'SUP Race (14\')',
        icono: '⚡',
        vientoMax: { Principiante: 10, Intermedio: 15, Avanzado: 20, Competicion: 26 },
        olaMax:    { Principiante: 0.4, Intermedio: 0.8, Avanzado: 1.3, Competicion: 2.0 },
        requiereOlas: false,
        requiereViento: false
    },
    sup_touring: {
        nombre: 'SUP Travesía / Touring',
        icono: '🧭',
        vientoMax: { Principiante: 8, Intermedio: 13, Avanzado: 18, Competicion: 22 },
        olaMax:    { Principiante: 0.3, Intermedio: 0.7, Avanzado: 1.1, Competicion: 1.6 },
        requiereOlas: false,
        requiereViento: false
    },
    kayak: {
        nombre: 'Kayak de Mar / Travesía',
        icono: '🛶',
        vientoMax: { Principiante: 10, Intermedio: 16, Avanzado: 22, Competicion: 28 },
        olaMax:    { Principiante: 0.5, Intermedio: 1.0, Avanzado: 1.6, Competicion: 2.5 },
        requiereOlas: false,
        requiereViento: false
    },
    surf: {
        nombre: 'Surf',
        icono: '🌊',
        vientoMax: { Principiante: 10, Intermedio: 15, Avanzado: 20, Competicion: 25 },
        olaMinima: { Principiante: 0.4, Intermedio: 0.7, Avanzado: 1.0, Competicion: 1.3 },
        requiereOlas: true,
        requiereViento: false
    },
    wing_foil: {
        nombre: 'Wing Foil',
        icono: '🪁',
        vientoMin: 11, // necesita viento para sustentación
        vientoMax: { Principiante: 18, Intermedio: 24, Avanzado: 30, Competicion: 35 },
        olaMax:    { Principiante: 0.6, Intermedio: 1.2, Avanzado: 2.0, Competicion: 2.8 },
        requiereOlas: false,
        requiereViento: true
    }
};

/**
 * Calcula el PaddleSafe Beginner Index específico para principiantes y escuelas
 * @returns {Object} { nivel: 'Muy Fácil'|'Fácil'|'Moderado'|'Exigente'|'No Recomendado', score, motivo, consejo }
 */
export function calcularBeginnerIndex({
    vientoKt = 0,
    rachasKt = 0,
    oleajeM = 0,
    componente = 'side-shore',
    esCosta = true,
    alertaEmergencia = false
}) {
    if (alertaEmergencia) {
        return {
            nivel: 'Prohibido por Emergencia',
            color: 'text-red-500 font-bold bg-red-950/80 border border-red-600',
            score: 0,
            motivo: 'Alerta oficial de emergencias activa (112 / Protección Civil). Queda prohibida la actividad.',
            consejo: 'Bajo alerta oficial de emergencias está terminantemente prohibido salir al agua.'
        };
    }

    const isOffshore = esCosta && componente === 'offshore';

    if (vientoKt > 13 || rachasKt > 17 || oleajeM > 0.8 || (isOffshore && vientoKt > 7)) {
        return {
            nivel: 'No Recomendado',
            color: 'text-red-500 bg-red-50 border-red-200',
            score: 20,
            motivo: isOffshore && vientoKt > 7
                ? 'Viento hacia mar abierto (offshore): alto riesgo de alejarse sin fuerza para retornar.'
                : 'Viento o marejada por encima del margen de seguridad para iniciación.',
            consejo: 'Cancela la sesión de iniciación o busca una bahía interior totalmente resguardada.'
        };
    }

    if (vientoKt >= 10 || rachasKt >= 14 || oleajeM >= 0.5) {
        return {
            nivel: 'Exigente',
            color: 'text-orange-500 bg-orange-50 border-orange-200',
            score: 45,
            motivo: 'Condiciones de exigencia física alta para principiantes.',
            consejo: 'Solo con monitor titulado y chaleco salvavidas obligatorio. Permanece a menos de 50m de la orilla.'
        };
    }

    if (vientoKt >= 7 || oleajeM >= 0.3 || (isOffshore && vientoKt > 4)) {
        return {
            nivel: 'Moderado',
            color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
            score: 70,
            motivo: 'Brisa presente y pequeña ondulación de agua.',
            consejo: 'Aprende a ponerte de rodillas si sientes pérdida de equilibrio. Rema siempre contra el viento al inicio.'
        };
    }

    if (vientoKt >= 4 || oleajeM >= 0.15) {
        return {
            nivel: 'Fácil',
            color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
            score: 90,
            motivo: 'Condiciones suaves y seguras para el aprendizaje.',
            consejo: 'Excelente para practicar la postura erguida, equilibrio y paladas básicas.'
        };
    }

    return {
        nivel: 'Muy Fácil',
        color: 'text-emerald-600 bg-emerald-50 border-emerald-300 font-black',
        score: 100,
        motivo: 'Mar plato, brisa casi nula. Condiciones de piscina.',
        consejo: 'Condiciones ideales e inmejorables para una primera toma de contacto con el agua.'
    };
}

/**
 * Evalúa las condiciones para un deporte y nivel específico
 */
export function evaluarCondicionesDeporte({
    deporteKey = 'paddle_surf',
    nivelUsuario = 'Intermedio',
    vientoKt = 0,
    rachasKt = 0,
    oleajeM = 0,
    periodoOlaS = 0,
    swellM = 0,
    componente = 'side-shore',
    alertaEmergencia = false
}) {
    const deporte = DEPORTES[deporteKey] || DEPORTES.paddle_surf;
    const nivelNorm = ['Principiante', 'Intermedio', 'Avanzado', 'Competicion'].includes(nivelUsuario)
        ? nivelUsuario
        : 'Intermedio';

    if (alertaEmergencia) {
        return {
            recomendable: false,
            estado: 'Prohibido por Emergencia',
            motivo: 'Alerta oficial de emergencias activa (112 / Protección Civil). Salida al agua desaconsejada y prohibida por riesgo extremo.',
            consejo: 'Cancela de inmediato la salida y permanece en tierra firme siguiendo las indicaciones de las autoridades.'
        };
    }

    const maxV = deporte.vientoMax[nivelNorm] || 12;
    const maxO = deporte.olaMax ? (deporte.olaMax[nivelNorm] || 0.6) : 99;

    // Regla especial para Wing Foil (requiere viento mínimo)
    if (deporte.requiereViento && vientoKt < (deporte.vientoMin || 11)) {
        return {
            recomendable: false,
            estado: 'Viento en calma para Foil',
            motivo: `El Wing Foil requiere al menos ${deporte.vientoMin} kt para sustentación en foil (viento actual: ${vientoKt} kt).`,
            consejo: 'Viento suave ideal para Paddle Surf recreativo. Espera a la brisa térmica si deseas practicar Wing Foil.'
        };
    }

    // Regla especial para Surf (requiere olas / swell)
    if (deporte.requiereOlas) {
        const olaEfectiva = swellM > 0 ? swellM : oleajeM;
        const minO = deporte.olaMinima[nivelNorm] || 0.5;
        if (olaEfectiva < minO) {
            return {
                recomendable: false,
                estado: 'Sin oleaje suficiente',
                motivo: `No hay suficiente rompiente para surfear (olas de ${olaEfectiva.toFixed(1)} m, mínimo recomendado: ${minO} m).`,
                consejo: 'Día ideal para entrenar remada en Paddle Surf o Kayak en aguas tranquilas.'
            };
        }
    }

    // Comprobación de límites de seguridad
    const superaViento = vientoKt > maxV;
    const superaRacha = rachasKt > (maxV + 6);
    const superaOla = oleajeM > maxO;

    if (superaViento || superaRacha || superaOla) {
        return {
            recomendable: false,
            estado: 'Condiciones exigentes / Límite superado',
            motivo: superaViento
                ? `Viento de ${vientoKt} kt supera el límite cómodo (${maxV} kt) para tu nivel en ${deporte.nombre}.`
                : superaOla
                    ? `Oleaje de ${oleajeM.toFixed(1)} m supera el límite de seguridad (${maxO} m).`
                    : `Rachas de ${rachasKt} kt comprometen la estabilidad.`,
            consejo: 'Valora salir con una embarcación de mayor manga, posponer la sesión o buscar una zona protegida.'
        };
    }

    return {
        recomendable: true,
        estado: 'Favorable',
        motivo: `Condiciones acordes para ${deporte.nombre} (${nivelNorm.toLowerCase()}). Viento ${vientoKt} kt y olas ${oleajeM.toFixed(1)} m.`,
        consejo: 'Disfruta de la sesión manteniendo siempre el leash y el chaleco puestos.'
    };
}

