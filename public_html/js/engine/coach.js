// ==============================================================================
// PADDLESAFE NEXT-GEN - INSTRUCTOR PROFESIONAL DE PADDLE SURF (coach.js)
// Actúa como un Instructor Profesional de Paddle Surf certificado (ISA / FESurfing).
// Convierte datos meteorológicos y marinos en DECISIONES náuticas y de seguridad.
// NUNCA repite datos visibles en pantalla. Adapta los consejos al nivel real.
// ==============================================================================

import { esc, deduplicateInsights, kmhANudos, sonMensajesEquivalentes, filtrarConsejosRedundantes } from '../utils.js';

/**
 * Genera el análisis experto completo del Coach Instructor Profesional
 * @param {Object} params
 * @param {Object} params.condiciones Objeto con viento, rachas, oleaje, direccion, componenteViento, etc.
 * @param {string} params.userLevel 'Principiante' | 'Intermedio' | 'Avanzado' | 'Competición'
 * @param {Object} params.motor Veredicto del motor experto con seguridad, alerta, etc.
 * @param {Array}  params.tramosData Datos de los tramos si es una ruta planificada
 * @param {string} params.ubicacion Nombre o referencia del spot
 * @returns {Object} Estructura completa del Coach ISA
 */
export function generarConsejoCoach({
    condiciones = {},
    userLevel = 'Intermedio',
    motor = null,
    tramosData = [],
    ubicacion = 'Spot de Costa'
}) {
    const nivel = normalizarNivel(userLevel);

    // 1. PRIORIDAD ABSOLUTA: Tormentas eléctricas (Veto Infranqueable)
    const esTormenta = Boolean(
        motor?.tormentaElectrica
        || motor?.nextGen?.estado === 'Tormenta eléctrica'
        || [95, 96, 99].includes(Number(condiciones.weatherCode ?? condiciones.weather_code ?? 0))
        || /tormenta|rayos|lightning|descarga electrica/i.test(String(condiciones.clima || ''))
    );

    if (esTormenta) {
        return {
            score: 0,
            veredicto: "⛔ NO RECOMENDADO SALIR A REMAR",
            resumen: "Existe riesgo de tormenta eléctrica en la zona. Aunque otros parámetros puedan parecer favorables, las descargas eléctricas y los cambios bruscos del viento convierten la actividad en una situación de riesgo vital. Cancela o pospón la salida y busca refugio seguro en tierra firme.",
            dureza_ruta: {
                nivel: "Salida Desaconsejada",
                descripcion: "Peligro severo e impredecible: el agua es conductora de electricidad y la pala de carbono o aluminio actúa como un pararrayos en superficie plana."
            },
            estrategia_viento: {
                tramo_facil: "No aplica.",
                tramo_exigente: "Ráfagas descendentes violentas y cambios súbitos de dirección asociados a cúmulos de tormenta.",
                consejo_pacing: "Permanece en tierra firme y bajo techo."
            },
            analisis_deriva: "Riesgo extremo de turbonadas que pueden arrastrar la tabla mar adentro en cuestión de segundos.",
            consejos_nivel: [
                "Bajo ninguna circunstancia entres al agua si hay aviso o presencia de tormenta eléctrica.",
                "Si te sorprende un trueno mientras remas, regresa de inmediato a la orilla más cercana, deja la tabla en la arena y aléjate del agua."
            ],
            consejo_instructor: "La regla de oro de cualquier marinero: ante aparato eléctrico en el cielo, nos quedamos en tierra sin excepción.",
            seguridad_estrategia: [
                "Salida estrictamente cancelada por riesgo vital de descargas eléctricas.",
                "Espera al menos 30 minutos tras el último trueno o relámpago antes de considerar volver a la orilla."
            ],
            tecnica_postura: ["No aplica."],
            material_recomendado: ["Ropa seca y estancia protegida en tierra."],
            regla_oro: "En el mar no hay refugio frente a un rayo. Un buen navegante sabe cuándo no salir."
        };
    }

    // 2. PRIORIDAD ABSOLUTA: Alertas oficiales de emergencias (Veto Infranqueable - Prohibido salir a remar)
    const esEmergencia = Boolean(
        motor?.alertaEmergenciaActiva
        || motor?.nextGen?.alertaEmergenciaActiva
        || motor?.nextGen?.estado === 'Prohibido salir por emergencia'
        || motor?.recomendacion === 'PROHIBIDO POR EMERGENCIA'
        || motor?.aemet?.alertas?.some(a =>
            a.esEspecial ||
            /^1-?1-?2/i.test(a.origen || '') ||
            /protecci[oó]n\s*civil/i.test(a.origen || a.tipo || '') ||
            ['NARANJA', 'ROJA'].includes(String(a.nivel || '').toUpperCase()) ||
            Boolean(a.urlDoc)
        )
        || (condiciones.alertaOficial?.activa && (
            condiciones.alertaOficial.esEspecial ||
            /^1-?1-?2/i.test(condiciones.alertaOficial.origen || '') ||
            ['NARANJA', 'ROJA'].includes(String(condiciones.alertaOficial.nivel || '').toUpperCase())
        ))
    );

    if (esEmergencia) {
        const aut = motor?.aemet?.autoridad?.nombre
            || motor?.aemet?.alertas?.find(a => /^1-?1-?2/i.test(a?.origen || ''))?.origen
            || 'Protección Civil / 112';
        return {
            score: 0,
            veredicto: "⛔ PROHIBIDO SALIR A REMAR",
            resumen: `Existe una ALERTA OFICIAL DE EMERGENCIAS ACTIVA emitida por ${aut}. Queda terminantemente prohibido y desaconsejado entrar al agua. Bajo situación de emergencia meteorológica o costera, las condiciones marinas se vuelven impredecibles y el riesgo de ser arrastrado mar adentro por avenidas súbitas o corrientes violentas es extremo. La regla de oro es cancelar la salida y permanecer en tierra firme.`,
            dureza_ruta: {
                nivel: "Salida Prohibida",
                descripcion: "Riesgo vital por emergencia costera oficial. Ninguna condición ni técnica compensa el peligro de navegar bajo alerta de Protección Civil."
            },
            estrategia_viento: {
                tramo_facil: "No aplica.",
                tramo_exigente: "Condiciones de emergencia costera incompatibles con la navegación deportiva.",
                consejo_pacing: "Permanece en tierra y respeta las indicaciones de las autoridades de emergencia."
            },
            analisis_deriva: "Riesgo crítico de corrientes de arrastre mar adentro, avenidas de agua en desembocaduras y oleaje súbito.",
            consejos_nivel: [
                "Bajo alerta oficial de emergencias, ningún nivel de experiencia garantiza tu seguridad en el agua.",
                "Cancela de inmediato la salida y no te acerques a espigones, rompeolas ni zonas de desembocadura."
            ],
            consejo_instructor: `🚨 ALERTA OFICIAL DE EMERGENCIAS (${aut}): Prohibido salir al agua. La primera regla de seguridad de un deportista náutico responsable es no entrar al mar cuando Protección Civil decreta alerta.`,
            seguridad_estrategia: [
                "Salida cancelada por protocolo de Protección Civil y Emergencias.",
                "Permanece en tierra firme y sigue las indicaciones oficiales del 112."
            ],
            tecnica_postura: ["No aplica."],
            material_recomendado: ["Ropa seca y estancia protegida fuera de la línea de costa."],
            regla_oro: "Cuando el 112 decreta alerta de emergencias, el mar no se negocia: nos quedamos en tierra."
        };
    }

    // 3. Extracción de variables físicas normalizadas (sin exponerlas como números brutos)
    const vKt = condiciones.vientoNudos ?? (condiciones.viento ? kmhANudos(condiciones.viento) : (motor?.vientoNudos ?? 0));
    const rKt = condiciones.rachasNudos ?? (condiciones.rachas ? kmhANudos(condiciones.rachas) : vKt);
    const oleajeM = Number(condiciones.oleaje ?? condiciones.waveHeight ?? motor?.nextGen?.detallesTecnicos?.oleajeM ?? 0);
    const compCostera = condiciones.componenteViento || motor?.derivaCostera?.componente || 'desconocida';
    const esEmbalse = motor?.derivaCostera?.costa?.esEmbalse || motor?.nextGen?.entorno === 'embalse_interior';
    const distKm = Number(condiciones.distanciaKm || 0);

    // 3. Interpretación Náutica de la Deriva (Sin jerga técnica ni datos numéricos crudos)
    let textoDeriva = '';
    if (esEmbalse) {
        textoDeriva = "Al navegar en aguas interiores (embalse o pantano), no existe riesgo de deriva hacia mar abierto, pero las rachas pueden dificultar el regreso al embarcadero o empujar hacia orillas escarpadas.";
    } else if (compCostera === 'offshore') {
        textoDeriva = "Estas condiciones pueden favorecer un alejamiento progresivo de la costa. El mar parece engañosamente plano cerca de la orilla, pero empuja hacia fuera. Mantén una ruta conservadora y revisa frecuentemente tu posición respecto a tierra.";
    } else if (compCostera === 'onshore') {
        textoDeriva = "El viento previsto favorece el retorno hacia tierra, reduciendo notablemente el riesgo de deriva mar adentro. La entrada al agua requerirá sortear el choque del oleaje frontal.";
    } else if (compCostera === 'side-shore') {
        textoDeriva = "El viento sopla a lo largo de la costa, generando un desplazamiento lateral constante. Conviene remar con mayor frecuencia por el lado expuesto y planificar un punto de desembarque que anticipe esta deriva.";
    } else {
        textoDeriva = "No ha sido posible determinar con precisión si el viento favorece el acercamiento a la costa o un desplazamiento mar adentro. Por prudencia, evita alejarte más de lo necesario y mantén siempre referencias visuales fijas.";
    }

    // 4. Análisis del Esfuerzo Físico y Demanda Muscular (Dureza de la Ruta)
    const { nivelDureza, scoreDureza, descDureza } = calcularDemandaFisica(vKt, rKt, oleajeM, distKm, nivel, compCostera);

    // 5. Ventana Óptima de Navegación
    const ventana = motor?.ventanaRecomendada || motor?.ventanas?.mejorVentana || motor?.nextGen?.ventanas?.mejorVentana;
    let textoVentana = '';
    if (ventana && ventana.inicio && ventana.fin) {
        textoVentana = `La mejor ventana del día se concentra entre las ${ventana.inicio} y las ${ventana.fin}, cuando las condiciones son más estables y el estado del agua permanece contenido.`;
    } else {
        textoVentana = "Las primeras horas de la mañana suelen ofrecer la superficie más limpia antes de que se activen las brisas térmicas habituales.";
    }

    // 6. Resumen Pedagógico Adaptado por Nivel (Convierte datos en decisiones)
    const resumen = generarResumenNautico(vKt, rKt, oleajeM, compCostera, nivel, esEmbalse, motor);

    // 7. Estrategia de Viento, Tramos y Dosificación (Pacing)
    const estrategiaViento = generarEstrategiaViento(condiciones, compCostera, vKt, tramosData, nivel);

    // 8. Consejos Específicos por Nivel
    const consejosNivel = generarConsejosNivel(nivel, vKt, oleajeM, compCostera);

    // 9. Técnica, Postura y Mecánica de Remada
    const tecnicaPostura = generarTecnicaPostura(nivel, vKt, oleajeM);

    // 10. Material y Equipamiento de Seguridad ISA
    const materialRecomendado = generarMaterialRecomendado(oleajeM, compCostera, esEmbalse);

    // 11. Consejo Personalizado del Instructor (Recomendación Principal Única)
    const consejoInstructor = generarConsejoInstructor(nivel, compCostera, vKt, oleajeM, distKm, motor);

    // 12. Regla de Oro (se alinea con el consejo para evitar discrepancias)
    const reglaOro = generarReglaOro(nivel, compCostera, vKt, motor);

    // Deduplicación semántica para evitar que sub-bloques repitan el consejo principal
    const consejosNivelFiltrados = filtrarConsejosRedundantes(consejosNivel, [consejoInstructor, estrategiaViento?.consejo_pacing]);
    const seguridadFiltrada = filtrarConsejosRedundantes([
        textoDeriva,
        ...generarSeguridadEstrategia(nivel, compCostera, vKt, oleajeM)
    ], [consejoInstructor, reglaOro]);

    // 13. Veredicto Ejecutivo del Instructor
    const veredicto = generarVeredictoEjecutivo(motor?.seguridad?.score ?? 80, vKt, rKt, oleajeM, compCostera, nivel, motor);

    return {
        score: motor?.seguridad?.score ?? 85,
        veredicto,
        resumen,
        dureza_ruta: {
            nivel: `${nivelDureza} (${scoreDureza}/10)`,
            descripcion: descDureza
        },
        estrategia_viento: estrategiaViento,
        analisis_deriva: textoDeriva,
        analisis_zona: {
            orografia: esEmbalse ? "Entorno de aguas interiores abrigadas con posibles encajonamientos de viento." : "Costa con exposición al régimen de vientos y oleaje marítimo.",
            peligros_detectados: generarPeligrosZona(compCostera, vKt, oleajeM, esEmbalse),
            recomendacion_seguridad: esEmbalse ? "Navega con chaleco y mantén distancia de presas y aliviaderos." : "Navega paralelo a la costa y mantén línea de visión despejada hacia la orilla."
        },
        ventana_recomendada: textoVentana,
        consejos_nivel: consejosNivelFiltrados.length > 0 ? consejosNivelFiltrados : consejosNivel,
        consejo_instructor: consejoInstructor,
        seguridad_estrategia: seguridadFiltrada.length > 0 ? seguridadFiltrada : [textoDeriva],
        tecnica_postura: tecnicaPostura,
        material_recomendado: materialRecomendado,
        regla_oro: reglaOro
    };
}

// ==============================================================================
// FUNCIONES AUXILIARES INTERNAS DEL COACH ISA
// ==============================================================================

function normalizarNivel(nivel) {
    const s = String(nivel || '').toLowerCase();
    if (s.includes('competi') || s.includes('race') || s.includes('pro')) return 'Competición';
    if (s.includes('avan') || s.includes('experto')) return 'Avanzado';
    if (s.includes('inter')) return 'Intermedio';
    return 'Principiante';
}

function generarResumenNautico(vKt, rKt, oleajeM, compCostera, nivel, esEmbalse, motor = null) {
    if (motor?.aemet?.activa) {
        const topAlerta = motor.aemet.alertas?.[0] || {};
        const origen = topAlerta.origen || 'Protección Civil / AEMET';
        return `⚠️ Aviso oficial de emergencias activo (${origen} - ${topAlerta.nivel || 'Naranja'}). Aunque la superficie del agua parezca tranquila momentáneamente, existe riesgo de cambios bruscos, avenidas repentinas en ramblas hacia el mar o fenómenos adversos. Se aconseja aplazar la actividad y permanecer en tierra firme.`;
    }

    if (vKt <= 7 && oleajeM <= 0.35) {
        if (nivel === 'Principiante') {
            return "Las condiciones son ideales para ganar confianza sobre la tabla sin enfrentarte a un entorno exigente. La superficie suave facilita mantener el equilibrio y concentrarse en la postura erguida.";
        }
        if (nivel === 'Intermedio') {
            return "Escenario cómodo y fluido para una sesión de travesía. Podrás mantener una cadencia constante con mínimo desgaste físico y trabajar la amplitud de la palada.";
        }
        if (nivel === 'Avanzado') {
            return "Mar calmo idóneo para entrenar velocidad pura, cambios de ritmo y giros rápidos en boya con total estabilidad bajo los pies.";
        }
        return "Las primeras horas ofrecen condiciones perfectas para mantener una velocidad constante, cronometrar tramos y minimizar pérdidas por resistencia aerodinámica.";
    }

    if (vKt >= 15 || oleajeM >= 0.9) {
        if (nivel === 'Principiante') {
            return "Condiciones muy exigentes para la iniciación. El viento y el oleaje provocarán inestabilidad constante y dificultarán el avance. Se recomienda posponer la sesión o practicar en zonas totalmente protegidas.";
        }
        if (nivel === 'Intermedio') {
            return "La salida exigirá una gestión activa del equilibrio y de la energía. Anticipa que remar contra el viento requerirá un esfuerzo físico muy superior al habitual.";
        }
        if (nivel === 'Avanzado') {
            return "Condiciones estimulantes de mar vivo que permiten entrenamientos intensos de resistencia y lectura de ola. Requiere técnica sólida y concentración constante.";
        }
        return "Excelente escenario para simular condiciones de regata técnica en mar abierto (technical race) y entrenar transiciones con mar cruzado.";
    }

    // Condiciones medias (8 a 14 kt)
    if (compCostera === 'offshore') {
        if (nivel === 'Principiante') {
            return "Ojo con el viento durante el regreso: aunque la orilla parezca tranquila, el viento empuja hacia mar abierto y exigirá mucho más esfuerzo para volver al punto de partida.";
        }
        return "El viento empuja mar adentro. Permite un inicio muy rápido, pero obliga a guardar fuerzas suficientes para remontar contra el viento en el retorno.";
    }

    if (nivel === 'Principiante') {
        return "Las condiciones son navegables pero requerirán atención. Mantente cerca de la orilla para evitar que la deriva o el oleaje aumenten la fatiga antes de tiempo.";
    }
    if (nivel === 'Intermedio') {
        return "Las condiciones permiten una salida cómoda y dinámica, aunque conviene anticipar los cambios de viento previstos conforme avance la jornada.";
    }
    return "Las condiciones permiten entrenamientos de distancia con un nivel de exigencia moderado y buena respuesta de la tabla en el agua.";
}

function calcularDemandaFisica(vKt, rKt, oleajeM, distKm, nivel, compCostera) {
    let score = 3.0;

    if (vKt > 8) score += (vKt - 8) * 0.45;
    if (rKt - vKt > 4) score += (rKt - vKt) * 0.25;
    if (oleajeM > 0.4) score += (oleajeM - 0.4) * 3.5;
    if (compCostera === 'offshore') score += 1.5;
    if (distKm > 6) score += 3.0;
    else if (distKm > 3) score += 1.8;
    else if (distKm > 1) score += 0.8;

    if (nivel === 'Principiante') score += 1.2;
    if (nivel === 'Competición') score -= 0.8;

    const finalScore = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

    let nivelDureza = "Baja / Plácida";
    let descDureza = "Condiciones suaves que favorecen una navegación relajada con bajo consumo aeróbico. Fatiga muscular mínima.";

    if (finalScore >= 7.0) {
        nivelDureza = "Alta / Exigente";
        descDureza = "Hoy remar requerirá notablemente más esfuerzo de lo habitual debido a la resistencia del viento y la inestabilidad del agua. La fatiga aparecerá rápido en hombros y lumbares si no se dosifican las fuerzas.";
    } else if (finalScore >= 4.5) {
        nivelDureza = "Moderada / Media";
        descDureza = "Demanda física intermedia: el avance requerirá trabajo continuo de core y correcciones frecuentes de rumbo. Buen estímulo cardiovascular sin sobrecarga crítica.";
    }

    return { nivelDureza, scoreDureza: finalScore, descDureza };
}

function generarEstrategiaViento(cond, compCostera, vKt, tramosData, nivel) {
    let tramoFavor = null;
    let tramoContra = null;

    if (Array.isArray(tramosData) && tramosData.length > 0) {
        for (const t of tramosData) {
            const rel = String(t.viento_relativo || '').toUpperCase();
            if (rel.includes('FAVOR') && !tramoFavor) tramoFavor = t;
            if (rel.includes('CONTRA') && !tramoContra) tramoContra = t;
        }
    }

    let facil = "";
    let exigente = "";

    if (tramoFavor) {
        facil = `En el tramo "${tramoFavor.nombre}" navegarás con el viento empujando por la popa (downwind), aprovechando la inercia para deslizar la tabla con poco esfuerzo.`;
    } else if (compCostera === 'onshore') {
        facil = "La aproximación final a tierra será la más cómoda, ya que el viento empuja de forma natural hacia la orilla.";
    } else {
        facil = "El tramo inicial a favor de la brisa será el más rápido y descansado; no te confíes de esa facilidad inicial.";
    }

    if (tramoContra) {
        exigente = `Atención al tramo "${tramoContra.nombre}": remarás contra el viento. Flexiona rodillas, inclina el tronco hacia proa y acorta la palada.`;
    } else if (compCostera === 'offshore') {
        exigente = "El regreso a la playa será el momento más crítico: remarás contra la corriente de aire que sopla hacia mar abierto.";
    } else {
        exigente = "Cualquier tramo en el que remes enfrentando el viento aumentará el rozamiento y ralentizará el avance de la proa.";
    }

    const pacing = (nivel === 'Principiante' || compCostera === 'offshore')
        ? "Regla del 30%: Guarda siempre un tercio de tus fuerzas y de agua para el tramo final del regreso a tierra."
        : "Sal siempre remando contra el viento mientras estés descansado; así el regreso te asistirá cuando aparezca la fatiga.";

    return {
        tramo_facil: facil,
        tramo_exigente: exigente,
        consejo_pacing: pacing
    };
}

function generarConsejosNivel(nivel, vKt, oleajeM, compCostera) {
    if (nivel === 'Principiante') {
        return [
            "Mantén la mirada al frente en el horizonte; mirar a la tabla o a los pies desequilibra el centro de gravedad.",
            "Técnica de palada: mantén la mano superior sobre el pomo en línea vertical con la mano inferior para que la tabla avance recta.",
            "Navega en todo momento a menos de 100 metros de la orilla y ten una referencia visual fija en tierra para controlar tu deriva."
        ];
    }
    if (nivel === 'Intermedio') {
        return [
            "Inicia la sesión contra el viento mientras conservas energía fresca, reservando la remada a favor para la vuelta.",
            "Transfiere la fuerza desde la cadera y los dorsales con rotación de core, evitando que los bíceps asuman toda la carga de tracción.",
            "Anticipa el oleaje lateral manteniendo una postura con los pies ligeramente escalonados para ganar margen de estabilidad."
        ];
    }
    if (nivel === 'Avanzado') {
        return [
            "Aprovecha las pequeñas ondulaciones a favor para bombear con paladas vivas y conectar planeos seguidos.",
            "Modula la cadencia entre 45 y 52 SPM según la resistencia del tramo para optimizar el consumo de energía en travesía larga.",
            "Utiliza paladas de timón (J-stroke o cross-bow) para corregir el rumbo sin interrumpir el avance de la tabla."
        ];
    }
    // Competición
    return [
        "Las primeras horas brindan la lámina de agua idónea para calibrar ritmo de regata constante con mínima resistencia aerodinámica.",
        "Mantén la pala pegada a la borda con entrada vertical limpia (catch) y liberación rápida a la altura del talón para no frenar la tabla.",
        "Trabaja series de ritmo sostenido en 55-60 SPM con vigilancia estricta de la frecuencia cardiaca y el gasto energético."
    ];
}

function generarTecnicaPostura(nivel, vKt, oleajeM) {
    const list = [];
    if (oleajeM > 0.45) {
        list.push("Postura escalonada (surf stance moderada): separa los pies con uno ligeramente adelantado para absorber el bamboleo del mar.");
    } else {
        list.push("Pies paralelos al ancho de caderas centrados en el asa de transporte, con el peso apoyado en la almohadilla plantar.");
    }

    if (vKt > 10) {
        list.push("Viento en contra: baja el centro de gravedad flexionando rodillas e inclina el torso levemente hacia proa para reducir resistencia al aire.");
        list.push("Acorta la longitud de la palada y acelera la cadencia para que la tabla no pierda inercia entre paladas.");
    } else {
        list.push("Remada fluida: hunde la pala por completo antes de tirar hacia atrás para aprovechar el 100% del empuje del agua.");
        list.push("Mirada fija en el destino para mantener la línea de rumbo recta sin correcciones innecesarias.");
    }

    return list;
}

function generarMaterialRecomendado(oleajeM, compCostera, esEmbalse) {
    const list = [];

    if (oleajeM > 0.6 && !esEmbalse) {
        list.push("Leash recto (inventor de ola) fijado al tobillo: permite que la tabla se aleje con seguridad tras una caída en la rompiente.");
    } else {
        list.push("Leash tipo coiled (muelle) fijado bajo la rodilla o cintura: no arrastra en el agua ni se enreda con algas o ramas.");
    }

    list.push("Chaleco de flotabilidad 50N homologado (CE/ISO): indispensable para mantener la cabeza fuera del agua en caso de cansancio súbito.");
    list.push("Funda de móvil estanca con cordón de seguridad y batería al 100% (teléfono de emergencias 112 / Salvamento Marítimo 900 202 202).");

    return list;
}

function generarConsejoInstructor(nivel, compCostera, vKt, oleajeM, distKm, motor = null) {
    if (motor?.aemet?.activa) {
        return "Con aviso oficial de emergencias activo, la prudencia manda: no te confíes de la calma momentánea, respeta las directrices de Protección Civil y aplaza la sesión.";
    }
    if (compCostera === 'offshore') {
        return "Hoy la clave es la disciplina: rema paralelo a la costa y comprueba cada cinco minutos tu distancia respecto a un punto de referencia en la arena.";
    }
    if (vKt <= 7 && oleajeM <= 0.35) {
        return "Hoy es un día magnífico para practicar técnica pura, postura erguida y respiración acompasada en un entorno amable.";
    }
    if (nivel === 'Principiante') {
        return "Ante cualquier duda, racha repentina o desequilibrio: a rodillas, centro de gravedad bajo y regreso en calma a la orilla.";
    }
    if (distKm > 4) {
        return "Lleva hidratación suficiente y avisa en tierra de tu hora estimada de desembarque antes de entrar al agua.";
    }
    return "Las condiciones actuales son favorables para una sesión provechosa, pero recuerda revisar periódicamente si el viento cambia de intensidad.";
}

function generarReglaOro(nivel, compCostera, vKt, motor = null) {
    if (motor?.aemet?.activa) {
        return "Ante un aviso oficial de emergencias, el mejor marinero es el que sabe quedarse en tierra.";
    }
    if (compCostera === 'offshore') {
        return "Con viento hacia mar abierto: si la orilla parece alejarse, ponte de rodillas y rema directo a tierra sin vacilar.";
    }
    if (nivel === 'Principiante') {
        return "Ante cualquier duda, racha repentina o desequilibrio: a rodillas, centro de gravedad bajo y regreso en calma a la orilla.";
    }
    return "En el agua manda la prudencia: guarda siempre un tercio de energía para el regreso y nunca subestimes el mar.";
}

function generarVeredictoEjecutivo(score, vKt, rKt, oleajeM, compCostera, nivel, motor = null) {
    if (motor?.aemet?.activa) {
        return "⚠️ SALIDA DESACONSEJADA: AVISO OFICIAL DE EMERGENCIAS ACTIVO";
    }
    if (score >= 80 && compCostera !== 'offshore') {
        if (nivel === 'Principiante') return "DÍA EXCELENTE PARA APRENDIZAJE Y SEGURIDAD";
        if (nivel === 'Competición') return "VENTANA ÓPTIMA PARA RITMO DE COMPETICIÓN";
        return "CONDICIONES FAVORABLES PARA NAVEGACIÓN Y PROGRESIÓN";
    }
    if (compCostera === 'offshore') {
        return "PRECAUCIÓN POR VIENTO HACIA MAR ABIERTO (OFFSHORE)";
    }
    if (score >= 50) {
        return "SALIDA VIABLE CON PRECAUCIÓN Y ATENCIÓN AL ENTORNO";
    }
    return "CONDICIONES EXIGENTES: VALORAR APLAZAR O RUTA MUY RESGUARDADA";
}

function generarPeligrosZona(compCostera, vKt, oleajeM, esEmbalse) {
    const peligros = [];
    if (esEmbalse) {
        peligros.push("Fondos irregulares y ramas sumergidas cerca de las orillas: cuidado con el calado de la quilla.");
        peligros.push("Corrientes invisibles en proximidades de compuertas o aliviaderos de la presa.");
    } else {
        if (compCostera === 'offshore') {
            peligros.push("Efecto trampa del terral: el agua parece una balsa cerca de la arena pero empuja con fuerza hacia fuera.");
        }
        if (vKt >= 12) {
            peligros.push("Aceleración del viento en salientes rocosos y espigones por efecto Venturi.");
        }
        if (oleajeM >= 0.5) {
            peligros.push("Mar cruzado y rebote de olas (clapotis) cerca de acantilados o muros de puertos.");
        }
        peligros.push("Presta atención al calado de la quilla central al embarcar y desembarcar en la rompiente de orilla.");
    }
    return peligros;
}

function generarSeguridadEstrategia(nivel, compCostera, vKt, oleajeM) {
    const list = [];
    if (compCostera === 'offshore') {
        list.push("Navega siempre en paralelo a la orilla sin superar la distancia que puedas nadar en caso de emergencia.");
        list.push("Fija dos puntos de referencia visuales en tierra y comprueba tu posición cada pocos minutos para detectar deriva involuntaria.");
    } else {
        list.push("Planifica la ruta para realizar el tramo más exigente contra el viento al inicio, reservando la remada a favor para el regreso.");
    }

    if (vKt >= 12 || oleajeM >= 0.6) {
        list.push("Aplica la regla del compañero (buddy system): en condiciones vivas o exigentes, evita salir en solitario.");
    } else {
        list.push("Comunica siempre a alguien en tierra tu zona de remada y la hora estimada de regreso antes de entrar al agua.");
    }

    if (nivel === 'Principiante') {
        list.push("Ante cualquier racha o pérdida de estabilidad, adopta inmediatamente la postura de rodillas (kneeling) para recuperar el control.");
    } else {
        list.push("Dosifica la intensidad manteniendo siempre un tercio de tu reserva de energía para imprevistos en la aproximación final a tierra.");
    }

    return list;
}

