# PADDLESAFE CONSENSUS ENGINE
**Diseño Arquitectónico del Motor de Consenso Multi-Modelo para Deportes Acuáticos**  
**Fecha:** 15 de Octubre de 2026  
**Inspiración Náutica:** Filosofía comparativa de Windy, PredictWind y Windguru adaptada a PaddleSafe  
**Principio Rector:** *Inteligencia interna profunda, simplicidad náutica externa (cero alarmismo y cero jerga técnica innecesaria)*

---

## 1. VISIÓN Y FILOSOFÍA

En la navegación costera y los deportes acuáticos (Paddle Surf, SUP Touring, SUP Race, Kayak), la meteorología nunca es una verdad matemática absoluta. Una predicción meteorológica no es una certeza, sino una estimación probabilística calculada por supercomputadores que resuelven ecuaciones de mecánica de fluidos sobre una malla espacial.

### La Filosofía de los Grandes Referentes
- **PredictWind**: Utiliza un ensamble de 4 modelos independientes (PWG, PWE, GFS, ECMWF) y analiza su dispersión. Si todos los modelos coinciden, el navegante puede confiar plenamente en la estrategia de ruta; si divergen, el software avisa de incertidumbre sinóptica.
- **Windy**: Expone los modelos ECMWF, GFS, ICON y Meteoblue en pestañas comparativas para que el usuario experimentado los compare manualmente.
- **Windguru**: Presenta tablas multimodelo horizontales para spots costeros.

### La Diferencia Esencial en PaddleSafe
En Windy o Windguru, el usuario debe interpretar por sí mismo qué modelo es más fiable o qué significa que GFS dé 14 nudos y ECMWF 8 nudos. Un palista en la playa que va a salir con su tabla no tiene tiempo ni conocimientos meteorológicos avanzados para auditar modelos numéricos.

**En PaddleSafe:**
1. **La comparación multi-modelo se realiza de forma automática e interna.**
2. **El usuario nunca ve jerga técnica cruda** (nombres de modelos, resoluciones en kilómetros ni spreads matemáticos).
3. **El consenso modula automáticamente el nivel de seguridad y el consejo del Coach**, traduciendo la incertidumbre en recomendaciones náuticas accionables (ej. vigilar la orilla, dosificar el esfuerzo, navegar cerca de tierra).

---

## 2. ANÁLISIS DE DISPONIBILIDAD DE MODELOS EN OPEN-METEO

Open-Meteo Forecast API permite consultar simultáneamente los principales modelos numéricos meteorológicos del mundo en una única petición HTTP ligera, sin claves de pago y con latencias inferiores a 200 ms:

```text
https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&models=best_match,ecmwf_ifs025,gfs_seamless,icon_seamless&start_date={fecha}&end_date={fecha}
```

### Tabla Comparativa de Modelos Disponibles

| Modelo | Organismo Emisor | Resolución Espacial | Cobertura | Frecuencia de Actualización | Fortalezas Náuticas en España y Costas | Debilidades Conocidas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ECMWF IFS** (`ecmwf_ifs025`) | Centro Europeo (ECMWF) | 0.25° (~25 km) | Global | 4 veces al día (00, 06, 12, 18 UTC) | **Referente mundial de precisión sinóptica.** Excelente cálculo del viento medio y frentes oceánicos en el Atlántico y Cantábrico. | Al tener 25 km de celda, suaviza térmicas locales muy estrechas (ej. brisas de calas cerradas). |
| **ICON** (`icon_seamless` / `icon_eu`) | Servicio Alemán (DWD) | 13 km Global / **7 km Europa (ICON-EU)** | Global y Europa | 4 veces al día (actualizaciones rápidas cada 3h) | **Altísima resolución costera en España y Mediterráneo.** Captura brisas térmicas (virazones, embates), efecto Venturi en cabos y canalizaciones orográficas mejor que ningún otro modelo global. | Sensible a pequeñas variaciones convectivas en verano. |
| **GFS** (`gfs_seamless`) | NOAA (Estados Unidos) | 0.25° / 0.13° (~15-25 km) | Global | 4 veces al día (00, 06, 12, 18 UTC) | Fiable para detectar avance rápido de frentes y gradientes de presión a gran escala. | Tiende a sobreestimar rachas de viento y a adelantar frentes varias horas respecto a la realidad. |

---

## 3. ARQUITECTURA MATEMÁTICA Y VECTORIAL DEL MOTOR DE CONSENSO

El motor opera sobre los vectores de viento de los 3 modelos para la franja horaria seleccionada:

$$\vec{V}_{\text{ECMWF}} = (v_1, \theta_1), \quad \vec{V}_{\text{ICON}} = (v_2, \theta_2), \quad \vec{V}_{\text{GFS}} = (v_3, \theta_3)$$

```
                               ┌─────────────────────────────────┐
                               │   OPEN-METEO MULTI-MODELO       │
                               │  - ECMWF IFS (25 km)            │
                               │  - ICON Europe (7 km)           │
                               │  - GFS Seamless (15 km)         │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │    PADDLESAFE CONSENSUS ENGINE  │
                               │                                 │
                               │ 1. Dispersión Velocidad (Spread)│
                               │ 2. Promedio Vectorial Circular  │
                               │ 3. Dispersión Angular Máxima    │
                               │ 4. Coherencia en Ráfagas        │
                               └────────────────┬────────────────┘
                                                │
                     ┌──────────────────────────┼──────────────────────────┐
                     ▼                          ▼                          ▼
           ┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
           │   CONSENSO ALTO   │      │  CONSENSO MEDIO   │      │   CONSENSO BAJO   │
           │ (Spread <= 3 kt   │      │ (Spread 3-6 kt    │      │ (Spread > 6 kt    │
           │  DifDir <= 25°)   │      │  DifDir 25-50°)   │      │  DifDir > 50°)    │
           └─────────┬─────────┘      └─────────┬─────────┘      └─────────┬─────────┘
                     │                          │                          │
                     ▼                          ▼                          ▼
           ┌─────────────────────────────────────────────────────────────────────────┐
           │                      USO INTERNO EN MOTOR EXPERTO                       │
           │  • Modulación de confianza del análisis (75% a 95%)                     │
           │  • Selección de velocidad conservadora (Media vs Percentil 75)          │
           │  • Generación de consejo del Coach ISA (traducción pedagógica limpia)   │
           └─────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Dispersión Cuantitativa de Velocidad ($\text{Spread}_V$)
Se calcula la diferencia entre el modelo más optimista y el más exigente:

$$\text{Spread}_V = \max(v_1, v_2, v_3) - \min(v_1, v_2, v_3)$$

### 3.2. Promedio Vectorial Circular de Rumbo ($\overline{\theta}$)
Para evitar el error de cálculo clásico en ángulos de brújula (donde el promedio aritmético simple entre $355^\circ$ y $5^\circ$ resultaría absurdamente en $180^\circ$ en vez de $0^\circ$/Norte), se realiza descomposición trigonométrica:

$$S = \sum_{i=1}^N \sin\left(\frac{\theta_i \cdot \pi}{180}\right), \quad C = \sum_{i=1}^N \cos\left(\frac{\theta_i \cdot \pi}{180}\right)$$

$$\overline{\theta} = \left(\text{atan2}(S, C) \cdot \frac{180}{\pi} + 360\right) \pmod{360^\circ}$$

### 3.3. Dispersión Angular Máxima ($\Delta\theta_{\max}$)
Se evalúa la mayor discrepancia angular entre cualquier par de modelos:

$$\Delta\theta(a, b) = \min(|a - b|, 360 - |a - b|)$$

$$\Delta\theta_{\max} = \max\left(\Delta\theta(\theta_{\text{ECMWF}}, \theta_{\text{ICON}}), \Delta\theta(\theta_{\text{ECMWF}}, \theta_{\text{GFS}}), \Delta\theta(\theta_{\text{ICON}}, \theta_{\text{GFS}})\right)$$

---

## 4. LOS 3 NIVELES DE CONSENSO Y SU TRADUCCIÓN NÁUTICA

### Nivel 1: Consenso Alto
- **Criterio Numérico**:
  $$\text{Spread}_V \le 3.0\text{ kt} \quad \text{y} \quad \Delta\theta_{\max} \le 25^\circ$$
- **Ejemplo**: ECMWF = 8 kt (E), ICON = 9 kt (E), GFS = 8 kt (ESE).
- **Diagnóstico Meteorológico**: Todos los modelos convergen en intensidad y dirección. La atmósfera en la zona muestra estabilidad y alta previsibilidad.
- **Acción Interna de PaddleSafe**:
  - Velocidad asignada: Media ponderada ($8.3\text{ kt}$).
  - Confianza del análisis: **Alta (95%)**.
  - Permisividad: Se respeta el veredicto del motor experto sin penalizaciones defensivas.
- **Mensaje al Usuario (Coach / UI)**:
  - *Cero tecnicismos.*
  - Mensaje en Coach: *"Condiciones muy estables y de alta predictibilidad para la franja horaria. Navegación fluida y consistente."*

---

### Nivel 2: Consenso Medio (Moderado)
- **Criterio Numérico**:
  $$3.0\text{ kt} < \text{Spread}_V \le 6.0\text{ kt} \quad \text{o} \quad 25^\circ < \Delta\theta_{\max} \le 50^\circ$$
- **Ejemplo**: ECMWF = 6 kt (S), ICON = 10 kt (SE), GFS = 8 kt (SSE).
- **Diagnóstico Meteorológico**: Coincidencia en la tendencia general, pero discrepancia moderada en la hora de entrada de la brisa o en la velocidad de propagación.
- **Acción Interna de PaddleSafe**:
  - Velocidad asignada: **Percentil 75 / Modelo más conservador** (se adopta $9.5\text{ kt}$ en vez de la media de $8\text{ kt}$ para proteger al deportista).
  - Confianza del análisis: **Moderada (85%)**.
  - Si el viento roza el límite de un nivel (ej. 9.5 kt cerca de los 10 kt del principiante), el motor sugiere margen preventivo.
- **Mensaje al Usuario (Coach / UI)**:
  - *Cero tecnicismos.*
  - Mensaje en Coach: *"Se prevé viento activo con ligera variabilidad horaria. Planifica la ruta dosificando fuerzas y vigila el cambio de intensidad."*

---

### Nivel 3: Consenso Bajo (Discrepancia Alta)
- **Criterio Numérico**:
  $$\text{Spread}_V > 6.0\text{ kt} \quad \text{o} \quad \Delta\theta_{\max} > 50^\circ$$
- **Ejemplo**: ECMWF = 5 kt (S), ICON = 14 kt (NW - terral), GFS = 11 kt (W).
- **Diagnóstico Meteorológico**: Incertidumbre sinóptica severa. Podría tratarse de un frente con hora de paso errática o de una zona orográfica compleja donde un modelo prevé calma y otro prevé viento terral acelerado.
- **Acción Interna de PaddleSafe**:
  - **Principio de Seguridad Vital**: La seguridad del deportista está por encima del optimismo.
  - Velocidad asignada: **Modelo más desfavorable para la seguridad** ($14\text{ kt}$).
  - Confianza del análisis: Se ajusta a **70-75%**.
  - Modulación de Estado: Si el análisis medio hubiera sido `Favorable`, pasa automáticamente a `Precaución`.
- **Mensaje al Usuario (Coach / UI)**:
  - *Cero alarmismo, pero máxima instrucción preventiva.*
  - Mensaje en Coach: *"Existe alta variabilidad entre predicciones meteorológicas para esta zona. Por seguridad náutica, no te alejes de la costa, mantén referencias visuales fijas y rema en paralelo a la orilla."*

---

## 5. REGLAS DE ORO DE EXPERIENCIA DE USUARIO (UX)

Para cumplir la directriz de **no mostrar mensajes técnicos innecesarios**, se establecen las siguientes reglas de presentación:

1. **PROHIBIDO mostrar tablas crudas de modelos al usuario final en la vista básica**:
   - Nunca mostrar: *"ECMWF IFS025: 7.2 kt, GFS025: 14.1 kt, ICON-EU: 11.0 kt (Spread 6.9 kt)"*.
   - El usuario común se confunde, pierde confianza y no sabe a quién creer.
2. **PERMITIDO mostrar una micro-píldora de certeza en la vista Pro**:
   - En la tarjeta técnica para usuarios avanzados o instructores, basta una píldora discreta:
     - 🟢 *Consenso de modelos: Alto*
     - 🟡 *Consenso de modelos: Moderado*
     - 🟠 *Consenso de modelos: Variable*
3. **Traducción transparente en el Coach**:
   - El valor del consenso se convierte en **conducta náutica**:
     - Consenso Alto $\implies$ *"Puedes navegar con tranquilidad siguiendo tu plan previsto."*
     - Consenso Variable $\implies$ *"Guarda reserva física y no cruces bahías abiertas ante la posible entrada imprevista de viento."*

---

## 6. PLAN DE IMPLEMENTACIÓN TÉCNICA

### Paso 1: Optimización de la Solicitud Multi-Modelo en el Cliente (`map.js`)
Asegurar que la consulta a Open-Meteo solicite consistentemente:
```javascript
models: 'best_match,ecmwf_ifs025,gfs_seamless,icon_seamless'
```
Y desempaquete las series horarias correspondientes:
- `wind_speed_10m_ecmwf_ifs025`, `wind_direction_10m_ecmwf_ifs025`
- `wind_speed_10m_gfs_seamless`, `wind_direction_10m_gfs_seamless`
- `wind_speed_10m_icon_seamless`, `wind_direction_10m_icon_seamless`

### Paso 2: Robustecimiento del Módulo `consensus.js`
Refinar [`public_html/js/engine/consensus.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/consensus.js) para que devuelva la estructura canónica normalizada:
```javascript
export function calcularConsensoModelos({ ecmwfVientoKt, gfsVientoKt, iconVientoKt, ecmwfDirDeg, gfsDirDeg, iconDirDeg, fallbackVientoKt, fallbackDirDeg }) {
    // Retorna:
    // {
    //    nivelConsenso: 'ALTO' | 'MEDIO' | 'BAJO' | 'UNICO',
    //    confianzaConsenso: 75 | 85 | 95,
    //    spreadVelocidadKt: Number,
    //    consensoVientoKt: Number (valor ponderado conservador),
    //    consensoDirDeg: Number (promedio vectorial circular),
    //    discrepanciaDireccionDeg: Number,
    //    consejoNautico: String,
    //    valoresPorModelo: { ecmwf, gfs, icon }
    // }
}
```

### Paso 3: Integración en el Motor Canónico (`verdict.js`)
En [`public_html/js/engine/verdict.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/verdict.js):
- Si `consenso.nivelConsenso === 'BAJO'`, aplicar criterio defensivo: utilizar `consenso.consensoVientoKt` como viento de evaluación, evitando que una discrepancia severa ponga en peligro a un principiante.
- Si era `FAVORABLE` y el spread de viento supera los 6 nudos, modular el estado a `PRECAUCION`.

### Paso 4: Integración en el Coach ISA (`coach.js`)
En [`public_html/js/engine/coach.js`](file:///c:/Users/Usuario/Desktop/WEBS/PaddleSafe/public_html/js/engine/coach.js):
- Incorporar en el apartado de estrategia de viento el consejo pedagógico derivado del consenso, sin citar acrónimos técnicos de modelos.

### Paso 5: Banco de Pruebas Automatizado (Verification Suite)
Añadir pruebas sintéticas en Node.js que simulen:
1. Caso Consenso Alto (ECMWF 8 kt, ICON 9 kt, GFS 8 kt) $\implies$ Consenso Alto, confianza 95%.
2. Caso Consenso Medio (ECMWF 7 kt, ICON 12 kt, GFS 9 kt) $\implies$ Consenso Medio, velocidad adoptada 11-12 kt.
3. Caso Discrepancia Alta (ECMWF 5 kt, ICON 15 kt, GFS 12 kt) $\implies$ Consenso Bajo, velocidad adoptada 15 kt, recomendación defensiva.

---

## 7. RESUMEN DE VALOR PARA EL USUARIO

Con esta arquitectura, PaddleSafe adquiere la potencia de predicción de centros de alto rendimiento de navegación oceánica (PredictWind / Windy), pero manteniendo una interfaz limpia, comprensible y orientada al 100% a la toma de decisiones seguras para cualquier deportista acuático.

---
*Fin del documento de diseño de PaddleSafe Consensus Engine.*

