// ==============================================================================
// PADDLESAFE NEXT-GEN - DETECTOR DE VENTANAS ÓPTIMAS DE SALIDA (windows.js)
// Escanea la jornada horaria para identificar automáticamente la mejor franja
// de navegación según viento, oleaje, térmica y seguridad.
// ==============================================================================

/**
 * Analiza el pronóstico horario diurno (07:00 - 21:00) y detecta la ventana más favorable.
 * @param {Array<Object>} horasPronostico Array de objetos { hora: '08:00', vientoKt, rachasKt, oleajeM, lluviaMm, weatherCode }
 * @param {string} userLevel 'Principiante' | 'Intermedio' | 'Avanzado'
 */
export function detectarVentanasOptimas(horasPronostico = [], userLevel = 'Intermedio') {
    if (!Array.isArray(horasPronostico) || horasPronostico.length === 0) {
        return {
            hayVentana: false,
            textoResumen: 'No hay datos horarios suficientes para calcular la ventana óptima.',
            mejorVentana: null,
            evolucionAviso: null
        };
    }

    // Filtrar franja diurna útil (07:00 a 21:00)
    const diurnas = horasPronostico.filter(h => {
        const horaNum = parseInt(String(h.hora || '').slice(0, 2), 10);
        return !isNaN(horaNum) && horaNum >= 7 && horaNum <= 21;
    });

    if (diurnas.length === 0) {
        return {
            hayVentana: false,
            textoResumen: 'Consulta en horario diurno para ver las mejores ventanas de remada.',
            mejorVentana: null,
            evolucionAviso: null
        };
    }

    // Puntuación de cada hora para SUP (100 = perfecto, 0 = no recomendable)
    const umbrales = {
        Principiante: { vMax: 8, oMax: 0.35 },
        Intermedio:   { vMax: 13, oMax: 0.65 },
        Avanzado:     { vMax: 18, oMax: 1.10 }
    }[userLevel] || { vMax: 13, oMax: 0.65 };

    const horasCalificadas = diurnas.map(h => {
        const v = Number(h.vientoKt || 0);
        const r = Number(h.rachasKt || v);
        const o = Number(h.oleajeM || 0);
        const code = Number(h.weatherCode || 0);
        const esTormenta = [95, 96, 99].includes(code);

        let score = 100;
        if (esTormenta) score = 0;
        else {
            if (v > umbrales.vMax) score -= (v - umbrales.vMax) * 12;
            if (r - v > 5) score -= (r - v) * 3;
            if (o > umbrales.oMax) score -= (o - umbrales.oMax) * 50;
            if (h.lluviaMm > 2) score -= 15;
        }
        score = Math.max(0, Math.min(100, Math.round(score)));
        const esApta = score >= 60 && !esTormenta;

        return { ...h, score, esApta, horaNum: parseInt(String(h.hora || '').slice(0, 2), 10) };
    });

    // Agrupar horas aptas consecutivas en ventanas
    const ventanas = [];
    let ventanaActual = null;

    for (const h of horasCalificadas) {
        if (h.esApta) {
            if (!ventanaActual) {
                ventanaActual = { inicio: h.hora, fin: h.hora, horas: [h] };
            } else {
                ventanaActual.fin = h.hora;
                ventanaActual.horas.push(h);
            }
        } else {
            if (ventanaActual) {
                ventanas.push(ventanaActual);
                ventanaActual = null;
            }
        }
    }
    if (ventanaActual) ventanas.push(ventanaActual);

    if (ventanas.length === 0) {
        return {
            hayVentana: false,
            textoResumen: 'Condiciones exigentes durante toda la jornada diurna. No se detectan ventanas seguras.',
            mejorVentana: null,
            evolucionAviso: 'Se prevé viento sostenido o marejada a lo largo del día. Conviene aplazar la salida.'
        };
    }

    // Calcular calidad de cada ventana
    ventanas.forEach(w => {
        const avgScore = w.horas.reduce((sum, item) => sum + item.score, 0) / w.horas.length;
        const avgV = w.horas.reduce((sum, item) => sum + (item.vientoKt || 0), 0) / w.horas.length;
        const avgO = w.horas.reduce((sum, item) => sum + (item.oleajeM || 0), 0) / w.horas.length;
        w.avgScore = Math.round(avgScore);
        w.avgVientoKt = Number(avgV.toFixed(1));
        w.avgOleajeM = Number(avgO.toFixed(1));
        // Extender hora fin 1 hora después del último slot para rango natural (ej: 08:00 a 10:00 -> 08:00 - 11:00)
        const finNum = Math.min(21, parseInt(w.fin.slice(0, 2), 10) + 1);
        w.finDisplay = `${String(finNum).padStart(2, '0')}:00`;
    });

    // Ordenar por score promedio y duración
    ventanas.sort((a, b) => (b.avgScore * 10 + b.horas.length * 5) - (a.avgScore * 10 + a.horas.length * 5));
    const mejor = ventanas[0];

    // Detección de aviso de evolución (ej: subida de viento térmico por la tarde)
    let evolucionAviso = null;
    const cambioViento = horasCalificadas.find((h, idx) =>
        idx > 0 && h.vientoKt >= 12 && horasCalificadas[idx - 1].vientoKt < 10
    );
    if (cambioViento) {
        evolucionAviso = `A partir de las ${cambioViento.hora} se prevé aumento de viento hasta ${cambioViento.vientoKt} kt. Planifica el regreso antes de esa hora.`;
    }

    const textoResumen = `Mejor ventana para remar hoy: ${mejor.inicio} - ${mejor.finDisplay} (Viento ~${mejor.avgVientoKt} kt, mar ~${mejor.avgOleajeM} m).`;

    return {
        hayVentana: true,
        textoResumen,
        mejorVentana: {
            inicio: mejor.inicio,
            fin: mejor.finDisplay,
            duracionHoras: mejor.horas.length,
            score: mejor.avgScore,
            vientoKt: mejor.avgVientoKt,
            oleajeM: mejor.avgOleajeM
        },
        ventanasSecundarias: ventanas.slice(1).map(w => ({
            inicio: w.inicio,
            fin: w.finDisplay,
            score: w.avgScore,
            vientoKt: w.avgVientoKt
        })),
        evolucionAviso
    };
}
