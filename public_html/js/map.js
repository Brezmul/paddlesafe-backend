// ==============================================================================
// PADDLESAFE NEXT-GEN - MAP FACADE & ORCHESTRATOR (map.js)
// Strangler Fig Architecture: Pure Facade Re-Exporting from 9 Submodules
// Submodules: state, core, weather, bento, tracker, poster, routes, coach, spots.
// ==============================================================================

// Telemetría Realtime Presence (Smoke Test & Runtime Verification):
// actualizarMiEstadoPresencia?.('in_water')
// actualizarMiEstadoPresencia?.('online')

// 1. Re-exports universales de los 9 submódulos
export * from './map/map.state.js';
export * from './map/map.core.js';
export * from './map/map.weather.js';
export * from './map/map.bento.js';
export * from './map/map.tracker.js';
export * from './map/map.poster.js';
export * from './map/map.routes.js';
export * from './map/map.coach.js';
export * from './map/map.spots.js';
export { generarGuiaHumanaEquipamiento, calcularEquipamientoTermicoDetallado } from './utils.js';

// 2. Importaciones nombradas para cableado global reactivo en window.*
import { mapRuntime } from './map/map.state.js';
import {
    inicializarMapa, actualizarMapa, buscarYCentrarMapa, obtenerUbicacion,
    TABLAS_SUP_CONFIG, recuperarEquipoUsuario, guardarEquipoUsuario,
    obtenerVelocidadCruceroUsuario, obtenerModificadorDerivaUsuario,
    actualizarTipoTablaDesdeSelect, actualizarVelocidadCruceroManual,
    autoCalibrarRitmoDesdeRutas, toggleSelectorEquipoUsuario, actualizarUIGearSelector,
    descargarZonaMapaOffline, calcularTilesBoundingBox, cambiarCapaBaseMapa
} from './map/map.core.js';
import {
    solicitarPronostico, solicitarPronosticoOpenMeteo, evaluarAlertasGlobales,
    obtenerMotorExperto, renderizarAvisoSuperior, guardarForecastSnapshot,
    recuperarForecastSnapshot, obtenerAutoridadEmergencias112,
    validarVigenciaAlerta, generarExplicacionAvisoAemet, registrarDiagnosticoAemet,
    limpiarAvisosMeteorologicos, escanearMejoresVentanas72h
} from './map/map.weather.js';
import {
    aplicarGlowVerdictBento, renderizarResumenExperto, consultarBasico,
    consultarPuntoProInstantaneo, consultarRutaPro, renderizarDashboardPro,
    cargarPrevisionHorariaExacta, volverPlanificadorPro,
    renderizarRosaVectoresMapa, actualizarHudVectoresMapa,
    activarSkeletonCargaSpot, desactivarSkeletonCargaSpot,
    renderizarMejoresVentanas72h, aplicarVentanaOptimaSpot,
    generarSvgAnilloScore, cambiarSubVistaSpot,
    inicializarPildorasCalendario, actualizarPildorasTiempoUI,
    aplicarFiltroRapidoTiempo, cargarSpotRapido,
    abrirCalculadoraTermica, cerrarCalculadoraTermica,
    actualizarVistaCalculadoraTermica, setCalculadoraTermicaSegment
} from './map/map.bento.js';
import {
    iniciarTravesia, finalizarTravesia, guardarCheckpointTravesia,
    guardarRutaOffline, sincronizarRutasPendientes, restaurarTracker,
    descartarCheckpoint, restaurarTravesiaDesdeCheckpoint, verificarCheckpointPendiente,
    activarWakeLock, liberarWakeLock, normalizarYLimitarRutaGPS, calcularBiometriaSup,
    construirPayloadRutaSupabase, toggleModoTravesia, toggleModoSolTracker,
    compartirPosicionActualLive, compartirPosicionSOS, actualizarRetornoSalidaLive,
    actualizarDuracionCheckin, extenderCheckinTravesia, enviarAlertaCheckinWhatsApp,
    verificarAlertaCheckin, mostrarModalSplitsKm, cerrarModalSplitsKm, syncTrackerState, calcularZonaRitmoLive
} from './map/map.tracker.js';
import { estamparPosterFinisherCanvas } from './map/map.poster.js';
import {
    toggleRutaLibre, limpiarRuta, gestionarClicRuta, gestionarClicRutaLibre,
    deshacerUltimoPunto, reiniciarRutaMultipunto, cerrarIdaYVueltaMultipunto,
    renderPreviewRuta, evaluarVientoRelativoInfo, actualizarMetricasQuedada,
    evaluarMeteoParaQuedada, mostrarFormularioQuedada, volverAlMapaQuedada,
    iniciarCreacionQuedadaClub, cancelarCreacionQuedadaClub, deshacerUltimoPuntoQuedada,
    reiniciarPuntosQuedada, guardarQuedadaDesdeMapa, cargarRutaEnMapaGrande,
    analizarVientoRutaClub, cargarRutaDeportivaEnMapa, exportarRutaPlanificadaGPX,
    activarModoPlanificacionEvento, guardarEventoClub, importarRutaGPXPro,
    centrarTramoMapa, generarGraficoSvgPerfilRuta, calcularMeteoProgresivaPorTramo,
    iniciarReplayRuta, togglePlayPauseReplayRuta, detenerReplayRuta,
    actualizarPosicionReplayProgreso, cambiarVelocidadReplayRuta, toggleReplaySeguirCamara, obtenerInterpolacionProgreso
} from './map/map.routes.js';
import {
    solicitarCoachIAPro, renderizarCoachProCard, solicitarCoachIABasico,
    solicitarAnalisisIARutaDeportiva, normalizarUnidadesCoach,
    renderizarCoachProFallbackLocal, generarAnalisisIARutaFallback
} from './map/map.coach.js';
import {
    abrirModalReporteSpot, cerrarModalReporteSpot, seleccionarTagReporte,
    seleccionarTagReporteSpot, confirmarEnvioReporteSpot, enviarReporteSpot,
    cargarReportesSpot, cargarSpotsGuardadosUsuario, renderizarBarraSpotsGuardados,
    renderizarListaSpotsGuardadosModal, abrirModalSpotsGuardados, cerrarModalSpotsGuardados,
    actualizarEstadoBotonGuardarSpot, guardarSpotActual, guardarSpotActualEnBBDD,
    eliminarSpotGuardado, seleccionarSpotGuardado, seleccionarSpotGuardadoPorId,
    abrirSpotActualEnPlanificadorPro, abrirModalComparadorSpots, cerrarModalComparadorSpots,
    seleccionarSpotParaComparar, quitarSpotDeComparacion, renderizarTablaComparativaSpots,
    compararSpotsGuardados, cargarJornadaCompletaSpot, renderizarTimelineJornadaCompleta,
    renderizarScrubber24hSpot, seleccionarHoraTimeline, seleccionarHoraScrubber24h,
    actualizarRelojTimelineUI, reproducirTimeline24hSpot, pausarTimeline24hSpot,
    alternarPlayTimeline24hSpot, calcularDistanciaGeodesicaKm, analizarHistorialYSmartMatchSpot,
    calcularSesgoTermicoSpot, toggleFormBitacoraSpot, abrirModalLogbookCondicion,
    cerrarModalLogbookCondicion, seleccionarBiasLogbook, seleccionarBiasSpot,
    setLogbookRating, seleccionarRatingLogbook, guardarEntradaBitacoraSpot,
    guardarEntradaLogbookCondicion, cargarBitacoraSpot, abrirModalNotasTacticasSpot,
    cerrarModalNotasTacticasSpot, confirmarGuardarNotasTacticas, guardarNotasTacticasSpot,
    renderizarInteligenciaYDiarioSpot, PACKS_SPOTS_COSTEROS, cargarPackSpotsCostero,
    abrirAsistenteConfiguracion, cerrarAsistenteConfiguracion,
    seleccionarTablaAsistente, cargarPackYFinalizarAsistente
} from './map/map.spots.js';
import { parseGPX, generarGPX, descargarGPX } from './gpxParser.js';
import { calcularSolYCrepusculo, generarGuiaHumanaEquipamiento, calcularEquipamientoTermicoDetallado } from './utils.js';
import { generarPerfilTacticoSpot } from './engine/coastal.js';

// 3. Inyección y sincronización global en window.* para el 100% de retrocompatibilidad
if (typeof window !== 'undefined') {
    Object.assign(window, {
        mapRuntime, inicializarMapa, actualizarMapa, buscarYCentrarMapa, obtenerUbicacion,
        TABLAS_SUP_CONFIG, recuperarEquipoUsuario, guardarEquipoUsuario,
        obtenerVelocidadCruceroUsuario, obtenerModificadorDerivaUsuario,
        actualizarTipoTablaDesdeSelect, actualizarVelocidadCruceroManual,
        autoCalibrarRitmoDesdeRutas, toggleSelectorEquipoUsuario, actualizarUIGearSelector,
        descargarZonaMapaOffline, calcularTilesBoundingBox, cambiarCapaBaseMapa,
        solicitarPronostico, solicitarPronosticoOpenMeteo, evaluarAlertasGlobales,
        obtenerMotorExperto, renderizarAvisoSuperior, guardarForecastSnapshot,
        recuperarForecastSnapshot, obtenerAutoridadEmergencias112,
        validarVigenciaAlerta, generarExplicacionAvisoAemet, registrarDiagnosticoAemet,
        limpiarAvisosMeteorologicos, escanearMejoresVentanas72h,
        aplicarGlowVerdictBento, renderizarResumenExperto, consultarBasico,
        consultarPuntoProInstantaneo, consultarRutaPro, renderizarDashboardPro,
        cargarPrevisionHorariaExacta, volverPlanificadorPro,
        renderizarRosaVectoresMapa, actualizarHudVectoresMapa,
        activarSkeletonCargaSpot, desactivarSkeletonCargaSpot,
        renderizarMejoresVentanas72h, aplicarVentanaOptimaSpot,
        generarSvgAnilloScore, cambiarSubVistaSpot,
        iniciarTravesia, finalizarTravesia, guardarCheckpointTravesia,
        guardarRutaOffline, sincronizarRutasPendientes, restaurarTracker,
        descartarCheckpoint, restaurarTravesiaDesdeCheckpoint, verificarCheckpointPendiente,
        activarWakeLock, liberarWakeLock, normalizarYLimitarRutaGPS, calcularBiometriaSup,
        construirPayloadRutaSupabase, toggleModoTravesia, toggleModoSolTracker,
        compartirPosicionActualLive, compartirPosicionSOS, actualizarRetornoSalidaLive,
        actualizarDuracionCheckin, extenderCheckinTravesia, enviarAlertaCheckinWhatsApp,
        verificarAlertaCheckin, mostrarModalSplitsKm, cerrarModalSplitsKm, syncTrackerState, calcularZonaRitmoLive,
        estamparPosterFinisherCanvas,
        toggleRutaLibre, limpiarRuta, gestionarClicRuta, gestionarClicRutaLibre,
        deshacerUltimoPunto, reiniciarRutaMultipunto, cerrarIdaYVueltaMultipunto,
        renderPreviewRuta, evaluarVientoRelativoInfo, actualizarMetricasQuedada,
        evaluarMeteoParaQuedada, mostrarFormularioQuedada, volverAlMapaQuedada,
        iniciarCreacionQuedadaClub, cancelarCreacionQuedadaClub, deshacerUltimoPuntoQuedada,
        reiniciarPuntosQuedada, guardarQuedadaDesdeMapa, cargarRutaEnMapaGrande,
        analizarVientoRutaClub, cargarRutaDeportivaEnMapa, exportarRutaPlanificadaGPX,
        activarModoPlanificacionEvento, guardarEventoClub, importarRutaGPXPro,
        centrarTramoMapa, generarGraficoSvgPerfilRuta, calcularMeteoProgresivaPorTramo,
        solicitarCoachIAPro, renderizarCoachProCard, solicitarCoachIABasico,
        solicitarAnalisisIARutaDeportiva, normalizarUnidadesCoach,
        renderizarCoachProFallbackLocal, generarAnalisisIARutaFallback,
        abrirModalReporteSpot, cerrarModalReporteSpot, seleccionarTagReporte,
        seleccionarTagReporteSpot, confirmarEnvioReporteSpot, enviarReporteSpot,
        cargarReportesSpot, cargarSpotsGuardadosUsuario, renderizarBarraSpotsGuardados,
        renderizarListaSpotsGuardadosModal, abrirModalSpotsGuardados, cerrarModalSpotsGuardados,
        actualizarEstadoBotonGuardarSpot, guardarSpotActual, guardarSpotActualEnBBDD,
        eliminarSpotGuardado, seleccionarSpotGuardado, seleccionarSpotGuardadoPorId,
        abrirSpotActualEnPlanificadorPro, abrirModalComparadorSpots, cerrarModalComparadorSpots,
        seleccionarSpotParaComparar, quitarSpotDeComparacion, renderizarTablaComparativaSpots,
        compararSpotsGuardados, cargarJornadaCompletaSpot, renderizarTimelineJornadaCompleta,
        renderizarScrubber24hSpot, seleccionarHoraTimeline, seleccionarHoraScrubber24h,
        actualizarRelojTimelineUI, reproducirTimeline24hSpot, pausarTimeline24hSpot,
        alternarPlayTimeline24hSpot, calcularDistanciaGeodesicaKm, analizarHistorialYSmartMatchSpot,
        calcularSesgoTermicoSpot, toggleFormBitacoraSpot, abrirModalLogbookCondicion,
        cerrarModalLogbookCondicion, seleccionarBiasLogbook, seleccionarBiasSpot,
        setLogbookRating, seleccionarRatingLogbook, guardarEntradaBitacoraSpot,
        guardarEntradaLogbookCondicion, cargarBitacoraSpot, abrirModalNotasTacticasSpot,
        cerrarModalNotasTacticasSpot, confirmarGuardarNotasTacticas, guardarNotasTacticasSpot,
        renderizarInteligenciaYDiarioSpot, PACKS_SPOTS_COSTEROS, cargarPackSpotsCostero,
        abrirAsistenteConfiguracion, cerrarAsistenteConfiguracion,
        seleccionarTablaAsistente, cargarPackYFinalizarAsistente,
        parseGPX, generarGPX, descargarGPX,
        calcularSolYCrepusculo, generarPerfilTacticoSpot,
        inicializarPildorasCalendario, actualizarPildorasTiempoUI,
        aplicarFiltroRapidoTiempo, cargarSpotRapido, generarGuiaHumanaEquipamiento,
        iniciarReplayRuta, togglePlayPauseReplayRuta, detenerReplayRuta,
        actualizarPosicionReplayProgreso, cambiarVelocidadReplayRuta, toggleReplaySeguirCamara, obtenerInterpolacionProgreso,
        abrirCalculadoraTermica, cerrarCalculadoraTermica, actualizarVistaCalculadoraTermica, setCalculadoraTermicaSegment, calcularEquipamientoTermicoDetallado,
        descargarRutaActivaGPX: exportarRutaPlanificadaGPX,
        descartarCheckpointTravesia: descartarCheckpoint
    });

    window.addEventListener('online', () => {
        if (typeof sincronizarRutasPendientes === 'function') void sincronizarRutasPendientes();
    });

    window.addEventListener('beforeunload', (event) => {
        if (mapRuntime.isTracking) {
            const advertencia = "Tienes una travesía en curso. Si cierras la pestaña, se perderá el progreso no guardado.";
            event.returnValue = advertencia;
            return advertencia;
        }
    });
}
