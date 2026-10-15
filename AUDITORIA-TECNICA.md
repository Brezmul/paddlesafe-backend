# Auditoría técnica de seguridad meteorológica — PaddleSafe

**Estado:** Correcciones del frontend verificadas; integración server-side con feeds RSS públicos AEMET implementada en un worktree backend separado, pendiente de desplegar y validar de extremo a extremo.

## 1. Archivos modificados

- [`public_html/js/utils.js`](./public_html/js/utils.js): reglas del motor experto, límites y confianza del análisis, estado de datos incompletos, texto de tormenta y deduplicación de conclusiones.
- [`public_html/js/map.js`](./public_html/js/map.js): fallback de pronóstico, análisis y presentación de alertas, banners de fuente, diagnóstico optativo y restricciones del Coach.
- [`public_html/index.html`](./public_html/index.html): orden de alertas, meteorología, resumen experto y Coach; protección del manejador de búsqueda de ubicación durante la carga.
- [`public_html/sw.js`](./public_html/sw.js) y [`public_html/version.json`](./public_html/version.json): versión de caché actualizada a `paddlesafe-v40` / `5.38`.
- Worktree backend `C:\Users\Usuario\Desktop\PaddleSafe-forecast-fix`: `forecast.js`, `lib/aemet.js`, `README.md` y `AUDITORIA_TECNICA.md`. Cambios aún no desplegados ni integrados en esta rama frontend.

## 2. Problemas encontrados y causa raíz

1. **Avisos AEMET no confirmables en el despliegue actual:** el backend consultado no integraba avisos oficiales en el pronóstico. La rama `fix/forecast-open-meteo-retry` (commit [`509ee71`](https://github.com/Brezmul/paddlesafe-backend/commit/509ee71137018f2389f56f0cb170426d30206b1e)) genera alertas heurísticas con StormGlass, no avisos oficiales. Además, el parser del frontend podía etiquetar campos genéricos como AEMET. Se identificaron y verificaron feeds RSS CAP públicos en la web oficial, y se implementó su consulta server-side en el worktree separado, sin requerir clave AEMET.
2. **Errores del pronóstico principal:** una consulta directa de prueba al backend devolvió HTTP 500 con un error de resolución de zona horaria. La aplicación no podía completar esa consulta por la ruta principal.
3. **Exceso de optimismo ante datos parciales:** los estados y el Coach podían presentar condiciones favorables sin confirmar variables relevantes o la disponibilidad de avisos. La puntuación no distinguía adecuadamente la calidad de los datos.
4. **Tormentas sin prohibición absoluta:** se identificaba actividad eléctrica como riesgo, pero faltaba una regla de veto que prevaleciera sobre el resto de las condiciones.
5. **Repetición y jerarquía visual:** el Coach repetía factores del resumen experto, y el resumen aparecía antes de la meteorología en algunas vistas.

## 3. Solución aplicada

- Se añadió fallback directo a Open-Meteo para errores transitorios y respuestas 5xx del backend. El fallback incorpora código WMO, rachas y datos marinos horarios; identifica expresamente que la fuente no incluye avisos oficiales AEMET.
- El parser admite distintas estructuras de respuesta, deduplica registros y distingue avisos con origen AEMET explícito de alertas meteorológicas genéricas. La indisponibilidad de AEMET se muestra como tal; no equivale a “sin avisos”.
- Cada evaluación incluye `analysisConfidence`. El score de seguridad queda limitado por esa confianza; la falta de variables relevantes impide emitir `SALIDA RECOMENDADA`. La falta de confirmación AEMET reduce la confianza y la seguridad mostrada.
- Las alertas amarillas, naranjas y rojas limitan la puntuación a 70, 50 y 25 respectivamente. Los códigos WMO 95/96/99 y las señales textuales de actividad eléctrica fuerzan score 0, `NO RECOMENDADO`, el mensaje obligatorio y un banner visible.
- El Coach no ofrece recomendaciones afirmativas salvo que la evaluación esté completa y el motor autorice expresamente la salida. Se eliminaron listas y narrativas que duplicaban el resumen experto.
- Se movió el resumen para que aparezca después de los datos y antes del Coach. Los diagnósticos `[AEMET]` se mantienen desactivados por defecto y solo se escriben en consola si `localStorage["paddlesafe:debug-weather"]` vale `true`.
- En el worktree backend, `forecast` consulta avisos AEMET por comunidad autónoma, filtra por vigencia y franja horaria, expone `aemetAvailable` y `aemet_alerts`, y resuelve la región desde geocodificación. Los fallos de proveedor, áreas no identificadas y formatos no reconocidos se reportan como indisponibilidad, nunca como confirmación de ausencia de avisos. La caché del pronóstico se redujo a 10 minutos para limitar avisos obsoletos.
- La integración backend consulta feeds RSS CAP públicos AEMET, comprobados sin credenciales, valida su fecha de actualización y filtra los avisos por franja horaria. El alcance es regional y no filtra por polígono costero exacto.

## 4. Pruebas ejecutadas

- `git diff --check`: correcto, sin errores de whitespace.
- Diagnósticos del editor para `map.js` y `utils.js`: sin errores.
- Diagnósticos del editor para el backend `forecast.js` y `lib/aemet.js`: sin errores.
- Prueba en navegador con dos respuestas HTTP 500 simuladas: el cliente reintentó, consultó Open-Meteo y Marine, mostró los banners de fuente alternativa y AEMET no disponible, y entregó datos utilizables. Resultado de prueba: confianza y score 68; el Coach indicó que no se salga hasta completar la información.
- Pruebas del motor: amarillo `70`; naranja `35` (≤50); rojo `0` (≤25); tormenta eléctrica `0`, `NO RECOMENDADO` y mensaje obligatorio exacto; datos vacíos `0`, confianza `0` y `ANÁLISIS INCOMPLETO`.
- Pruebas del parser/UI con respuestas simuladas: los tres niveles AEMET generaron sus banners; una tormenta produjo el banner de peligro y la prohibición; una alerta genérica se mostró como meteorológica, no como AEMET.
- Duplicados de tormenta y oleaje equivalente se redujeron a una sola conclusión.
- Orden DOM comprobado: alerta antes de meteorología; resumen experto después de meteorología y antes del Coach.
- La prueba de navegador solo registró los HTTP 500 intencionados del caso de fallback y el aviso ya existente del CDN de Tailwind. No se observaron errores JavaScript no capturados en la última ejecución.
- No se ejecutó una suite convencional de Node/npm: esos ejecutables no están disponibles en este entorno. Las pruebas funcionales se hicieron en el navegador con el runtime de la aplicación.
- Se comprobaron directamente seis feeds RSS públicos (HTTP 200): Andalucía (38 avisos), Aragón (0), Canarias (0), Cataluña (21), Comunitat Valenciana (6) y Melilla (0). Los 65 avisos publicados incluyeron intervalos de vigencia parseables; en las áreas sin avisos se recibió el feed válido. No se pudo ejecutar el parser JavaScript backend porque no hay runtime Node/npm. La conexión de la UI al backend desplegado sigue pendiente.

## 5. Riesgos residuales

- **Avisos oficiales AEMET: integración pendiente de despliegue.** Los cambios están en `C:\Users\Usuario\Desktop\PaddleSafe-forecast-fix` y no se han desplegado. No hace falta `AEMET_API_KEY`; el servidor consume los RSS públicos. Los feeds se verificaron directamente, pero falta ejecutar el parser y comprobar que el backend desplegado entrega los avisos al frontend. La consulta actual es regional, no una selección por zona costera.
- El fallback depende de Open-Meteo, conectividad desde el navegador y cobertura de sus APIs de pronóstico marino. No sustituye avisos oficiales ni una fuente marítima de emergencia.
- La confianza es una heurística preventiva; requiere calibración con datos históricos y revisión de especialistas marítimos. La orientación respecto a costa continúa siendo una entrada explícita: si falta, el sistema no afirma que la salida esté recomendada.
- La advertencia de Tailwind por uso del CDN continúa presente y no forma parte de estos cambios.

## 6. Mejoras futuras recomendadas

1. Revisar e integrar los cambios del worktree backend y validar en producción que los feeds RSS AEMET se transforman en alertas visibles en la interfaz.
2. Añadir pruebas automatizadas para los esquemas de AEMET, límites de puntuación, storm veto, fallbacks y mensajes del Coach.
3. Calibrar y documentar los pesos de confianza con revisión de meteorología marítima y seguridad de SUP.
4. Determinar componente de viento y orientación costera desde la ruta real, con procedencia y hora de actualización de cada fuente.
5. Sustituir el CDN de Tailwind por una compilación local para reducir dependencias en ejecución.

## 7. Corrección de regresión del motor experto (v5.39 - paddlesafe-v41)

- **Causa raíz corregida:** La confianza y el veredicto requerían estrictamente avisos AEMET y componente costero, penalizando la indisponibilidad de AEMET con -15% y bloqueando el score en ≤79. Esto forzaba que consultas válidas y seguras de Open-Meteo cayeran en "Información insuficiente" y "No recomendado", bloqueando además el Coach IA en la interfaz.
- **Jerarquía de fuentes restablecida:**
  - *Nivel 1 (Fuentes Principales: Open-Meteo, marina, viento, oleaje):* Aportan por sí solas hasta 90-100% de confianza y permiten generar recomendaciones y puntuaciones normales.
  - *Nivel 2 (Fuentes Complementarias: AEMET):* Enriquecen con avisos oficiales. Si no están disponibles (Caso B), se muestra aviso informativo y leve ajuste de confianza (-5%), sin invalidar el análisis.
- **Casos implementados y verificados con tests automatizados (33/33 assertions):**
  - **Caso A:** AEMET responde sin alertas -> Evaluación normal, recomendación "SALIDA RECOMENDADA" (si tiempo en calma), score alto.
  - **Caso B:** AEMET no disponible -> Banner informativo, Open-Meteo y marinos activos, recomendación y score reales, no se bloquea.
  - **Caso C:** Alerta AEMET amarilla/naranja/roja -> Banner visible, score acotado (≤70, ≤45, ≤20), veredicto ajustado.
  - **Caso D:** Alerta de tormenta/temporal -> Banner prioritario, extrema precaución, score ≤40.
  - **Caso E:** Tormenta eléctrica confirmada -> Prohibición absoluta ⛔ "NO RECOMENDADO SALIR A REMAR", score 0, mensaje prioritario.
- **Desbloqueo del Coach:** El Coach ya no se cancela con filtros rígidos de `< 80%` ni bloquea condiciones de precaución o favorables.
