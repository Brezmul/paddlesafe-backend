// ==============================================================================
// PADDLESAFE NEXT-GEN - DETECTOR DE VENTANAS ÓPTIMAS DE SALIDA (windows.js)
// Escanea la jornada horaria para identificar automáticamente la mejor franja
// para remar según viento, oleaje, térmica y seguridad.
// ==============================================================================

function parsearHoraNumero(horaStr) {
    if (!horaStr) return NaN;
    const str = String(horaStr);
    const match = str.match(/(?:T|\b)(\d{1,2}):\d{2}/);
    if (match) return parseInt(match[1], 10);
    const n = parseInt(str.slice(0, 2), 10);
    return isNaN(n) ? NaN : n;
}

function normalizarHoraDisplay(horaStr) {
    if (!horaStr) return '00:00';
    const str = String(horaStr);
    const match = str.match(/(?:T|\b)(\d{1,2}):(\d{2})/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
    return str.slice(0, 5);
}

/**
 * Analiza el pronóstico horario diurno (07:00 - 21:00) y detecta la ventana más favorable.
 * @param {Array<Object>} horasPronostico Array de objetos { hora: '08:00', vientoKt, rachasKt, oleajeM, lluviaMm, weatherCode }
 * @param {string} userLevel 'Principiante' | 'Intermedio' | 'Avanzado'
 */
export function detectarVentanasOptimas(horasPronostico = [], userLevel = 'Intermedio', alertaEmergencia = false) {
    if (alertaEmergencia) {
        return {
            hayVentana: false,
            textoResumen: 'Alerta oficial de emergencias activa. Prohibido salir a remar durante toda la jornada.',
            mejorVentana: null,
            evolucionAviso: 'Protección Civil / 112 ha activado alerta de emergencia en la costa. Queda suspendida cualquier salida al agua.'
        };
    }

    if (!Array.isArray(horasPronostico) || horasPronostico.length === 0) {
        return {
            hayVentana: false,
            textoResumen: 'No hay datos horarios suficientes para calcular la ventana óptima.',
            mejorVentana: null,
            evolucionAviso: null
        };
    }

    // Filtrar franja diurna útil (06:00 a 21:00)
    const diurnas = horasPronostico.filter(h => {
        const horaNum = parsearHoraNumero(h.hora || h.time || h.date);
        return !isNaN(horaNum) && horaNum >= 6 && horaNum <= 21;
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
        const sinDatos = (h.vientoKt == null || isNaN(Number(h.vientoKt))) && (h.oleajeM == null || isNaN(Number(h.oleajeM)));
        const horaNum = parsearHoraNumero(h.hora || h.time || h.date);
        const horaDisplay = normalizarHoraDisplay(h.hora || h.time || h.date);
        if (sinDatos) {
            return { ...h, horaDisplay, score: 0, esApta: false, horaNum };
        }
        const v = Number(h.vientoKt || 0);
        const r = Number(h.rachasKt || v);
        const o = (h.oleajeM !== null && Number.isFinite(Number(h.oleajeM))) ? Number(h.oleajeM) : 0;
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

        return { ...h, horaDisplay, score, esApta, horaNum };
    });

    // Agrupar horas aptas consecutivas en ventanas
    const ventanas = [];
    let ventanaActual = null;

    for (const h of horasCalificadas) {
        if (h.esApta) {
            const hLabel = h.horaDisplay || h.hora;
            if (!ventanaActual) {
                ventanaActual = { inicio: hLabel, fin: hLabel, ultHoraNum: h.horaNum, horas: [h] };
            } else {
                ventanaActual.fin = hLabel;
                ventanaActual.ultHoraNum = h.horaNum;
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
        const vientosValidos = w.horas.map(item => item.vientoKt).filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)));
        const avgV = vientosValidos.length ? vientosValidos.reduce((sum, item) => sum + Number(item), 0) / vientosValidos.length : 0;
        const olasValidas = w.horas.map(item => item.oleajeM).filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)));
        const avgO = olasValidas.length ? olasValidas.reduce((sum, item) => sum + Number(item), 0) / olasValidas.length : 0;
        w.avgScore = Math.round(avgScore);
        w.avgVientoKt = Number(avgV.toFixed(1));
        w.avgOleajeM = Number(avgO.toFixed(1));
        // Extender hora fin 1 hora después del último slot para rango natural (ej: 08:00 a 10:00 -> 08:00 - 11:00)
        const finBase = w.ultHoraNum !== undefined && !isNaN(w.ultHoraNum) ? w.ultHoraNum : parsearHoraNumero(w.fin);
        const finNum = Math.min(21, (isNaN(finBase) ? 20 : finBase) + 1);
        w.finDisplay = `${String(finNum).padStart(2, '0')}:00`;
    });

    // Ordenar por score promedio y duración
    ventanas.sort((a, b) => (b.avgScore * 10 + b.horas.length * 5) - (a.avgScore * 10 + a.horas.length * 5));
    const mejor = ventanas[0];

    // Detección de aviso de evolución (ej: subida de viento térmico por la tarde)
    let evolucionAviso = null;
    const cambioViento = horasCalificadas.find((h, idx) =>
        idx > 0 && Number(h.vientoKt || 0) >= 12 && Number(horasCalificadas[idx - 1].vientoKt || 0) < 10
    );
    if (cambioViento) {
        evolucionAviso = `A partir de las ${cambioViento.horaDisplay || cambioViento.hora} se prevé aumento de viento hasta ${cambioViento.vientoKt} kt. Planifica el regreso antes de esa hora.`;
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
            duracionHoras: w.horas.length
        })),
        evolucionAviso
    };
}
