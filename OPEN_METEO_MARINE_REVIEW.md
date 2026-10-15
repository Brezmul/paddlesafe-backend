# AUDITORÍA Y OPTIMIZACIÓN DE OPEN-METEO MARINE PARA PADDLESAFE
**Documento Técnico de Diseño y Evaluación de Potencial**  
**Fecha:** 15 de Octubre de 2026  
**Estado:** Documento de Diseño Arquitectónico (Fase previa a implementación)  
**Objetivo:** Determinar el grado de aprovechamiento actual de Open-Meteo Marine API, identificar variables críticas no utilizadas y diseñar un sistema náutico avanzado para Paddle Surf, SUP Touring, SUP Race y Seguridad Costera.

---

## 1. RADIOGRAFÍA DE LA INTEGRACIÓN ACTUAL

Actualmente, PaddleSafe consulta Open-Meteo Marine en `public_html/js/map.js` (línea 240) mediante la siguiente URL:

```javascript
const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${zona}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity&start_date=${fechaStr}&end_date=${fechaStr}`;
```

### Tabla Comparativa: Variables Solicitadas vs Utilizadas Realmente

| Variable Solicitada en API | Nombre en Open-Meteo | ¿Se desempaqueta en `dx`? | ¿Se usa en Motor Experto (`verdict.js`)? | ¿Se usa en Coach ISA (`coach.js`)? | ¿Se muestra en la UI? | Estado de Aprovechamiento |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Altura de ola** | `wave_height` | ✅ Sí | ✅ Sí (`oleajeM`) | ✅ Sí (Texto) | ✅ Sí (`proWaveHeight`) | **Aprovechada** (Pondera score de seguridad). |
| **Periodo de ola** | `wave_period` | ✅ Sí | ⚠️ Parcial ($\ge 10\text{s}$) | ⚠️ Parcial | ✅ Sí (`proWavePeriod`) | **Infrautilizada** (Solo nota de texto si es largo). |
| **Dirección de ola** | `wave_direction` | ✅ Sí | ❌ No | ❌ No | ❌ No | **Desperdiciada** (0% aprovechamiento). |
| **Altura de swell** | `swell_wave_height` | ✅ Sí | ⚠️ Solo Surf en `sports.js` | ❌ No | ❌ No | **Infrautilizada** (Ignorada en SUP y Kayak). |
| **Periodo de swell** | `swell_wave_period` | ✅ Sí | ❌ No | ❌ No | ❌ No | **Desperdiciada** (0% aprovechamiento). |
| **Dirección de swell** | `swell_wave_direction`| ✅ Sí | ❌ No | ❌ No | ❌ No | **Desperdiciada** (0% aprovechamiento). |
| **Temperatura del mar**| `sea_surface_temperature`| ✅ Sí | ❌ No | ❌ No | ⚠️ Solo dato numérico | **Infrautilizada** (Sin reglas de hipotermia ni neopreno). |
| **Velocidad de corriente**| `ocean_current_velocity`| ✅ Sí | ❌ No | ❌ No | ❌ No | **Desperdiciada** (No entra en cálculo de deriva). |

> [!WARNING] DIAGNÓSTICO DE APROVECHAMIENTO
> De las 8 variables marinas solicitadas en la red, **solo 1 (`wave_height`) se utiliza plenamente en el cálculo de seguridad**. Las variables de mar de fondo (swell), dirección del oleaje, temperatura del agua y corrientes marinas se descargan en cada consulta pero se descartan en el motor de cálculo. Estamos utilizando **menos del 25% del potencial real** de los datos que ya estamos pagando en tiempo de descarga.

---

## 2. CATÁLOGO COMPLETO DE VARIABLES DISPONIBLES EN OPEN-METEO MARINE

Open-Meteo Marine ofrece un conjunto exhaustivo de variables provenientes de los modelos globales ECMWF WAM (Wave Analysis Model), GFS Wave de NOAA y Copernicus Marine Service.

### A. Descomposición Espectral del Oleaje
1. **Mar Total Combinado (Wind Wave + Swell)**:
   - `wave_height`: Altura significativa del oleaje resultante de todas las componentes.
   - `wave_direction`: Dirección media de donde proceden las olas (grados 0–360°).
   - `wave_period`: Periodo medio entre crestas sucesivas (segundos).
   - `wave_peak_period`: **Periodo pico** (el periodo de las olas que transportan la mayor cantidad de energía en el espectro marino).
2. **Mar de Viento Local (Wind Waves / Chop)**:
   - `wind_wave_height`: Altura de las olas generadas directamente por el viento local en la zona.
   - `wind_wave_direction`: Dirección de las olas de viento (suele coincidir con el viento local).
   - `wind_wave_period`: Periodo corto (3 a 6 segundos), típicamente abrupto y picado (*choppy*).
   - `wind_wave_peak_period`: Periodo pico del mar de viento.
3. **Mar de Fondo Primario (Ground Swell)**:
   - `swell_wave_height`: Altura de las olas generadas por borrascas lejanas que han viajado cientos de millas.
   - `swell_wave_direction`: Dirección del tren principal de mar de fondo.
   - `swell_wave_period`: Periodo largo (8 a 18 segundos), olas ordenadas y de gran masa de agua.
   - `swell_wave_peak_period`: Periodo pico del swell.
4. **Mar de Fondo Secundario (Secondary Swell)**:
   - `swell_wave_height_secondary`: Altura de un segundo tren de mar de fondo independiente.
   - `swell_wave_direction_secondary`: Dirección del segundo tren.
   - `swell_wave_period_secondary`: Periodo del segundo tren.

### B. Dinámica de Aguas y Corrientes
5. **Corrientes Marinas Superficiales**:
   - `ocean_current_velocity`: Velocidad de la corriente en superficie (m/s o km/h).
   - `ocean_current_direction`: **Dirección hacia donde fluye la corriente** (grados 0–360°). *Crucial: Open-Meteo entrega el rumbo hacia donde va la corriente*.

### C. Parámetros Físicos del Agua
6. **Temperatura Superficial del Mar**:
   - `sea_surface_temperature`: Temperatura del agua a 0.5 m de profundidad (°C).

---

## 3. ANÁLISIS EN PROFUNDIDAD DE LAS VARIABLES CLAVE

### 3.1. `wave_height` vs Descomposición de Ola (Mar de Viento vs Swell)
- **Problema actual**: El sistema evalúa `wave_height = 0.8m` por igual, ya sea mar de fondo ordenado o mar de viento caótico.
- **Realidad náutica**:
  - **Swell largo de 0.8m (Periodo 12s)**: Son ondulaciones suaves y redondeadas. Una tabla de Paddle Surf All-Round sube y baja fluidamente sin perder estabilidad.
  - **Mar de viento de 0.8m (Periodo 4s)**: Es agua picada (*chop* desordenado), con crestas quebradizas cada 4 segundos que chocan contra el canto de la tabla, provocando desequilibrio constante y fatiga muscular extrema en tobillos y gemelos.
- **Oportunidad**: Si `wind_wave_height > 0.4m`, penalizar la estabilidad y advertir sobre el *chop*. Si `swell_wave_height` domina con periodo $>10\text{s}$, indicar mar ondulado pero limpio para navegar.

### 3.2. `wave_direction` vs `wind_direction` (Detección de Mar Cruzado / Cross-Sea)
- **El mayor peligro oculto en deportes de tabla**: Cuando la dirección del mar de fondo (`swell_wave_direction`) y el mar de viento local (`wind_wave_direction`) tienen una diferencia angular $\ge 45^\circ$, se genera un **mar cruzado (*cross-sea* o mar piramidal)**.
- **Impacto**: Las olas chocan entre sí creando picos verticales impredecibles sin un ritmo definido. Mantenerse de pie en una tabla de SUP se vuelve extremadamente difícil incluso para practicantes avanzados.
- **Oportunidad**: Calcular la diferencia angular:
  $$\Delta\theta_{\text{mar}} = |\text{wind\_wave\_direction} - \text{swell\_wave\_direction}| \pmod{360^\circ}$$
  Si $\Delta\theta_{\text{mar}} \in [45^\circ, 135^\circ]$ con alturas significativas $\ge 0.4\text{m}$, emitir alerta técnica: *"Riesgo de mar cruzado: superficie piramidal e inestable. Dificultad alta para mantener el equilibrio de pie."*

### 3.3. `wave_period` y `wave_peak_period` (Shorebreak y Energía)
- **Física de las olas**: La energía de una ola es proporcional a la altura al cuadrado multiplicada por el periodo ($E \propto H^2 \cdot T$). Una ola de 1.0 m con 14 segundos tiene más del doble de potencia destructiva que una ola de 1.0 m con 6 segundos.
- **Peligro en la orilla (*Shorebreak*)**: Un periodo largo ($T > 11\text{ s}$) que incide directamente sobre playas someras no rompe mar adentro; viaja intacto y descarga toda su energía en los últimos 3 metros contra la arena.
- **Impacto en Paddle Surf**: Es la causa del 70% de remos partidos, quillas rotas y lesiones cervicales en paddlers recreativos al intentar desembarcar.
- **Oportunidad**: Si `swell_wave_period \ge 11\text{ s}` y `wave_height \ge 0.6\text{ m}` con dirección hacia la costa, advertir explícitamente: *"Atención en el desembarque: oleaje con alto periodo genera rompiente violenta de orilla (shorebreak). Sal a gatas o sentado."*

### 3.4. `ocean_current_velocity` y `ocean_current_direction` (Corrientes y Deriva Real)
- **El límite del modelo actual**: PaddleSafe calcula la deriva basándose únicamente en el viento.
- **Realidad física**: El agua es 800 veces más densa que el aire. Una corriente marina superficial de tan solo **0.4 m/s (0.8 nudos / 1.5 km/h)** arrastra la tabla de paddle surf con más fuerza hidrodinámica que un viento de 8 nudos.
- **Oportunidad**: Integrar la suma vectorial:
  $$\vec{V}_{\text{deriva total}} = \vec{V}_{\text{viento}} \cdot C_{\text{viento}} + \vec{V}_{\text{corriente}} \cdot C_{\text{agua}}$$
  Permitiendo identificar corrientes de marea, corrientes de deriva litoral paralelas a la playa y zonas de canalización.

### 3.5. `sea_surface_temperature` (Seguridad Térmica y Neopreno ISA)
- **La trampa térmica primaveral/otoñal**: En mayo, la temperatura del aire en Valencia o Alicante puede ser de 26°C (sensación veraniega), pero el mar permanece a 15°C. En Galicia o Cantabria el mar puede estar a 13°C.
- **Riesgo fisiológico**: Un palista que entra al agua en bañador pensando que hace calor, al caer al agua sufre *shock por agua fría* (hiperventilación involuntaria, pérdida de fuerza motriz en dedos en 10 minutos y riesgo de ahogamiento).
- **Oportunidad**: Diseñar un **Recomendador Inteligente de Neopreno ISA**:
  - $T_{\text{agua}} < 12^\circ\text{C}$: Traje 4/3 mm o 5/4 mm sellado + escarpines de neopreno. Chaleco obligatorio por flotabilidad térmica.
  - $12^\circ\text{C} \le T_{\text{agua}} < 16^\circ\text{C}$: Traje 3/2 mm largo o traje de travesía.
  - $16^\circ\text{C} \le T_{\text{agua}} < 19^\circ\text{C}$: Neopreno corto (*shorty*) o pantalón térmico de 2 mm.
  - $T_{\text{agua}} \ge 20^\circ\text{C}$: Licra técnica con protección solar UV50+.

---

## 4. PROPUESTAS DE MEJORA POR DISCIPLINA

```
┌────────────────────────────────────────────────────────────────────────┐
│             NUEVA MATRIZ DE APROVECHAMIENTO MARINO PADDLESAFE          │
└────────────────────────────────────────────────────────────────────────┘
          │                                           │
          ▼                                           ▼
┌───────────────────────────────┐           ┌───────────────────────────┐
│     PADDLE SURF & TOURING     │           │         SUP RACE          │
├───────────────────────────────┤           ├───────────────────────────┤
│ • Mar cruzado (Chop vs Swell) │           │ • Potencial Downwind      │
│ • Rompiente de orilla         │           │   (Alineación Viento-Mar) │
│ • Clapotis en acantilados     │           │ • Drafting y cabeceo      │
│ • Deriva combinada (Corriente)│           │ • Periodo pico para glide │
│ • Neopreno según temp. agua   │           │ • Corriente a favor/contra│
└───────────────────────────────┘           └───────────────────────────┘
```

### 4.1. Paddle Surf Recreativo (All-Round)
1. **Índice de Estabilidad del Agua (Water Cleanliness Index)**:
   - Medir el cociente entre mar de viento y mar de fondo.
   - Si `wind_wave_height < 0.2m`: *"Superficie lisa / plato (glassy): remada suave con mínimo equilibrio requerido."*
   - Si `wind_wave_height \ge 0.5m`: *"Superficie rizada y picada (chop): exige flexión constante de rodillas y remada corta."*
2. **Recomendación de Material Térmico**:
   - Indicar automáticamente en la tarjeta del spot el grosor del neopreno recomendado antes de entrar al agua.

### 4.2. SUP Touring (Travesías Costeras de Media/Larga Distancia)
1. **Análisis de Orografía y Rebote Costero (Clapotis)**:
   - Si el spot es costa acantilada (detectado por la base de datos de costas o elevación costera adyacente $>20\text{m}$) y el mar de fondo (`swell_wave_direction`) incide perpendicularmente contra la costa ($\pm 30^\circ$):
     - Emitir recomendación de travesía: *"Zona de acantilados expuesta a rebote de olas (clapotis). Navega al menos a 100 metros de la pared de roca para evitar la zona de turbulencia."*
2. **Corriente de Marea / Litoral en Travesía**:
   - Si la ruta trazada coincide con el vector de corriente: indicar tramo asistido (+20% velocidad) o tramo de sobreesfuerzo contra corriente.

### 4.3. SUP Race (Competición y Alto Rendimiento)
1. **Índice de Downwind Gliding**:
   - Evaluar si se dan las condiciones para el *Downwind*:
     - Viento $\ge 14\text{ kt}$.
     - Diferencia angular entre viento y dirección de olas de viento $\le 25^\circ$.
     - Altura de ola de viento $\ge 0.6\text{ m}$.
   - Clasificación: **Downwind Épico**, **Downwind Favorable**, **Desalineado (Técnico)** o **No Apto**.
2. **Análisis de Pacing por Fricción de Corriente**:
   - El competidor de SUP Race planifica su estrategia según la corriente: en contra de la corriente, la mejor táctica es navegar pegado a la costa aprovechando la fricción de bajíos; a favor de la corriente, buscar el centro del canal.

### 4.4. Seguridad Costera Universal
1. **Shorebreak Warning System**:
   - Cruce de `swell_wave_period` ($>11\text{s}$) + `swell_wave_height` ($>0.6\text{m}$) + playa abierta a mar abierto.
2. **Índice de Deriva Acoplada Viento + Corriente**:
   - Sustituir la estimación puramente eólica por una suma vectorial ponderada. Si el viento empuja *offshore* y la corriente oceánica también fluye mar adentro, el riesgo se eleva automáticamente a **Extremo**.

---

## 5. DISEÑO TÉCNICO DE LA INTEGRACIÓN

### 5.1. Consulta HTTP Optimizada a Open-Meteo Marine
Ampliación de parámetros en `map.js`:

```text
https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}&hourly=wave_height,wave_direction,wave_period,wave_peak_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,swell_wave_peak_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&start_date={fecha}&end_date={fecha}
```

### 5.2. Métricas Derivadas a Incorporar en el Motor Experto (`verdict.js`)

```javascript
// Estructura de diagnóstico marino avanzado a generar
const diagnosticoMarino = {
    // 1. Estado de la superficie
    tipoSuperficie: 'chop' | 'glassy' | 'swell_limpio' | 'mar_cruzado',
    indiceChop: 0 a 100, // Intensidad del mar de viento desordenado
    marCruzado: {
        detectado: Boolean,
        anguloCruceDeg: Number,
        severidad: 'Baja' | 'Moderada' | 'Severa'
    },
    // 2. Seguridad en orilla
    shorebreak: {
        riesgo: 'Bajo' | 'Moderado' | 'Peligroso',
        periodoPicoSegundos: Number,
        avisoNautico: String
    },
    // 3. Corrientes
    corrienteSuperficial: {
        velocidadKt: Number,
        rumboDeg: Number,
        componenteCostera: 'offshore' | 'onshore' | 'litoral_paralela'
    },
    // 4. Confort térmico e hipotermia
    termicaAgua: {
        temperaturaC: Number,
        trajeRecomendado: 'Bañador/Licra' | 'Shorty 2mm' | 'Largo 3/2mm' | 'Invierno 4/3mm + escarpines',
        riesgoHipotermia: 'Nulo' | 'Leve' | 'Moderado' | 'Alto'
    },
    // 5. Potencial deportivo especializado
    downwindAptitud: {
        esDownwind: Boolean,
        calidad: 'No apto' | 'Técnico' | 'Bueno' | 'Excelente'
    }
};
```

---

## 6. CONCLUSIONES Y HOJA DE RUTA

1. **La API de Open-Meteo Marine ya proporciona todos los datos necesarios sin coste adicional**: No se requieren suscripciones de pago a otros proveedores marítimos (como Stormglass o Windy API).
2. **El mayor salto cualitativo para PaddleSafe reside en la interpretación, no en la recolección**: Los deportistas náuticos no quieren ver tablas con 15 números; quieren saber si el agua va a estar picada, si les va a costar subir a la tabla por mar cruzado, si el agua está fría para ir sin neopreno y si la rompiente de orilla es peligrosa.
3. **Paso siguiente**: Una vez validado este documento de diseño, proceder a la implementación controlada en dos fases:
   - **Fase A**: Enriquecimiento de variables en la consulta marina y cálculo del índice de neopreno y mar cruzado.
   - **Fase B**: Integración de corrientes oceánicas en el cálculo de deriva costera y detección de downwind para SUP Race.

---
*Fin del documento de revisión técnica.*

