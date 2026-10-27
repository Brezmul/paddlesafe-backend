// ==============================================================================
// PADDLESAFE NEXT-GEN - MOTOR DE CONSENSO DE MODELOS (consensus.js)
// Compara automáticamente ECMWF IFS, GFS y ICON (vía Open-Meteo) para estimar
// la certeza meteorológica y mejorar la precisión náutica sin alarmismos.
// ==============================================================================

/**
 * Calcula el promedio vectorial de direcciones (en grados 0-360)
 */
export function promedioVectorialDireccion(direccionesGrados = []) {
    if (!Array.isArray(direccionesGrados)) return null;
    const validas = direccionesGrados.filter(d => d !== null && d !== undefined && Number.isFinite(Number(d)));
    if (!validas.length) return null;

    let sumaSin = 0;
    let sumaCos = 0;
    for (const d of validas) {
        const rad = (Number(d) * Math.PI) / 180;
        sumaSin += Math.sin(rad);
        sumaCos += Math.cos(rad);
    }
    const avgRad = Math.atan2(sumaSin / validas.length, sumaCos / validas.length);
    let avgDeg = (avgRad * 180) / Math.PI;
    if (avgDeg < 0) avgDeg += 360;
    return Math.round(avgDeg) % 360;
}

/**
 * Calcula la diferencia angular mínima entre dos rumbos (0 a 180°)
 */
export function diferenciaAngular(a, b) {
    if (a === null || b === null || a === undefined || b === undefined) return 0;
    const nA = Number(a);
    const nB = Number(b);
    if (!Number.isFinite(nA) || !Number.isFinite(nB)) return 0;
    const diff = Math.abs(nA - nB) % 360;
    return diff > 180 ? 360 - diff : diff;
}

/**
 * Evalúa el consenso de modelos meteorológicos globales
 * @param {Object} params
 * @param {number|null} params.ecmwfVientoKt
 * @param {number|null} params.gfsVientoKt
 * @param {number|null} params.iconVientoKt
 * @param {number|null} params.ecmwfDirDeg
 * @param {number|null} params.gfsDirDeg
 * @param {number|null} params.iconDirDeg
 * @param {number|null} params.fallbackVientoKt
 * @param {number|null} params.fallbackDirDeg
 */
export function calcularConsensoModelos({
    ecmwfVientoKt = null,
    gfsVientoKt = null,
    iconVientoKt = null,
    ecmwfDirDeg = null,
    gfsDirDeg = null,
    iconDirDeg = null,
    fallbackVientoKt = null,
    fallbackDirDeg = null
}) {
    const cleanFallbackV = (fallbackVientoKt !== null && Number.isFinite(Number(fallbackVientoKt)))
        ? Number(Number(fallbackVientoKt).toFixed(1))
        : null;
    const cleanFallbackDir = (fallbackDirDeg !== null && Number.isFinite(Number(fallbackDirDeg)))
        ? Math.round(Number(fallbackDirDeg))
        : null;

    const velocidades = [
        { model: 'ECMWF', val: ecmwfVientoKt },
        { model: 'GFS',   val: gfsVientoKt },
        { model: 'ICON',  val: iconVientoKt }
    ].filter(m => m.val !== null && m.val !== undefined && Number.isFinite(Number(m.val)))
     .map(m => ({ model: m.model, val: Number(Number(m.val).toFixed(1)) }));

    const direcciones = [
        { model: 'ECMWF', val: ecmwfDirDeg },
        { model: 'GFS',   val: gfsDirDeg },
        { model: 'ICON',  val: iconDirDeg }
    ].filter(m => m.val !== null && m.val !== undefined && Number.isFinite(Number(m.val)))
     .map(m => ({ model: m.model, val: Math.round(Number(m.val)) }));

    // Si no hay modelos específicos suficientes, recurrir al valor único o fallback saneado
    if (velocidades.length < 2) {
        return {
            nivelConsenso: 'UNICO',
            confianzaConsenso: 85,
            spreadVelocidadKt: 0,
            consensoVientoKt: velocidades[0]?.val ?? cleanFallbackV,
            consensoDirDeg: direcciones[0]?.val ?? cleanFallbackDir,
            modelosDisponibles: velocidades.map(m => m.model),
            descripcion: 'Pronóstico basado en el mejor ensamble disponible.'
        };
    }

    const valoresV = velocidades.map(m => m.val);
    const minV = Math.min(...valoresV);
    const maxV = Math.max(...valoresV);
    const spreadV = Number((maxV - minV).toFixed(1));
    const avgV = Number((valoresV.reduce((a, b) => a + b, 0) / valoresV.length).toFixed(1));

    const avgDir = promedioVectorialDireccion(direcciones.map(d => d.val));
    const maxDiffDir = direcciones.length >= 2
        ? Math.max(...direcciones.map((d1, i) =>
            Math.max(...direcciones.slice(i + 1).map(d2 => diferenciaAngular(d1.val, d2.val)))
          ))
        : 0;

    let nivelConsenso = 'ALTO';
    let confianzaConsenso = 95;
    let descripcion = 'Alto grado de consenso entre ECMWF, GFS e ICON. Pronóstico de alta certeza.';

    if (spreadV > 6.0 || maxDiffDir >= 60) {
        nivelConsenso = 'BAJO';
        confianzaConsenso = 75;
        descripcion = `Discrepancia entre modelos (${spreadV} kt de diferencia). Se recomienda monitorear la evolución del viento in situ.`;
    } else if (spreadV > 3.0 || maxDiffDir >= 30) {
        nivelConsenso = 'MODERADO';
        confianzaConsenso = 85;
        descripcion = 'Consenso moderado entre modelos principales. Evolución meteorológica consistente.';
    }

    return {
        nivelConsenso,
        confianzaConsenso,
        spreadVelocidadKt: spreadV,
        consensoVientoKt: avgV,
        consensoDirDeg: avgDir ?? direcciones[0]?.val ?? cleanFallbackDir,
        modelosDisponibles: velocidades.map(m => m.model),
        valoresPorModelo: {
            ecmwf: ecmwfVientoKt,
            gfs: gfsVientoKt,
            icon: iconVientoKt
        },
        descripcion
    };
}
