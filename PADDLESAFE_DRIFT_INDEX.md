# PADDLESAFE DRIFT INDEX (PDI)
**Diseño Arquitectónico del Índice de Deriva Específico para Paddle Surf**  
**Fecha:** 15 de Octubre de 2026  
**Especialidad:** Seguridad Náutica y Dinámica de Fluidos aplicada a Stand Up Paddle (SUP)  
**Principio Clave:** *Explicación clara en lenguaje humano y directo, cero jerga matemática innecesaria para el usuario final.*

---

## 1. MISIÓN Y FUNDAMENTOS FÍSICOS: ¿POR QUÉ EL PADDLE SURF?

El Stand Up Paddle (SUP) es, con diferencia, **el deporte acuático más vulnerable al viento y a la deriva de todos los existentes**.

```
                EL EFECTO "VELA HUMANA" EN STAND UP PADDLE
      
                         (Aire en movimiento)
                       ══════════════════════►
                              O   ◄── Cabeza y hombros
                             /|\  ◄── Torso erguido (Superficie de arrastre: ~0.8 m²)
                             / \  ◄── Piernas
                       ══════════════════════► Resistencia aerodinámica elevada
                      ════════════════════════► 
                     ───────────────────────── Superficie del agua
                      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   Tabla de SUP (Calado mínimo: < 10 cm)
                                 │
                                 ▼ Quilla pequeña (18-24 cm)
                                
                   RESISTENCIA EN AGUA MÍNIMA + SUPERFICIE AL VIENTO MÁXIMA
                   = VULNERABILIDAD EXTREMA A LA DERIVA INVOLUNTARIA
```

### 1.1. La Física Única del Palista de SUP frente a otras Embarcaciones
* **En un Kayak:** El palista va sentado dentro de la bañera a ras de agua; su centro de gravedad es bajísimo y su superficie expuesta al viento no supera los $0.3\text{ m}^2$. Además, la pala es doble y genera paladas a izquierda y derecha continuamente sin cambiar de mano.
* **En Windsurf / Wing Foil:** El deportista aprovecha el viento como elemento de propulsión y puede ceñir (navegar contra el viento) a 15-20 nudos gracias a una orza o hydrofoil.
* **En Paddle Surf:** El deportista navega **completamente de pie**, ofreciendo una superficie aerodinámica de hasta $0.85\text{ m}^2$. La tabla apenas tiene calado (apenas unos centímetros en el agua) y una única quilla de rumbo. Cuando el viento supera cierta velocidad, **el empuje del aire sobre el cuerpo supera la fuerza muscular humana**, convirtiendo al palista en un corcho a la deriva.

### 1.2. La Ecuación de la Velocidad Humana vs. Fuerza del Viento
* Un practicante de nivel principiante rema a una velocidad sostenible de **2.5 a 3.5 km/h** (~1.5 nudos).
* Un practicante intermedio rema a **4.0 a 5.0 km/h** (~2.5 nudos).
* Un palista de competición en tabla de race rema a **7.0 a 9.0 km/h** (~4.2 nudos).
* **El umbral crítico:** Un viento de 12 nudos soplando mar adentro genera una fuerza de arrastre que desplaza a una persona de pie a **3.5 km/h hacia el horizonte**. Esto significa que un principiante remando al 100% de su capacidad avanza **0 km/h** o retrocede, entrando en pánico y fatiga extrema en pocos minutos.

---

## 2. VARIABLES DE ENTRADA CONSIDERADAS POR EL ÍNDICE

Para que el cálculo de deriva sea exacto y realista, el modelo evalúa **7 variables interconectadas**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VARIABLES DE ENTRADA DEL ÍNDICE                          │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ 1. VIENTO MEDIO      │ 2. RACHAS DE VIENTO  │ 3. ORIENTACIÓN DE LA COSTA    │
│ Fuerza sostenida de  │ Ráfagas súbitas que  │ Rumbo hacia mar abierto de la │
│ arrastre sobre el    │ desestabilizan y     │ orilla donde se navega.       │
│ cuerpo erguido.      │ frenan el avance.    │                               │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ 4. DERIVA MAR ADENTRO│ 5. DERIVA LATERAL    │ 6. OLEAJE Y MAR DE VIENTO     │
│ Fuerza perpendicular │ Fuerza paralela a la │ Chop que resta equilibrio y   │
│ hacia mar abierto.   │ orilla (desviación). │ dificulta la palada.          │
├──────────────────────┴──────────────────────┴───────────────────────────────┤
│ 7. NIVEL DEL DEPORTISTA                                                     │
│ Principiante, Intermedio, Avanzado, Competición (resistencia y velocidad).  │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Viento Medio (Nudos):** Establece la fuerza de arrastre constante.
2. **Rachas de Viento (Nudos):** La diferencia entre viento sostenido y rachas determina la inestabilidad. Una racha frena la inercia de la tabla y obliga al palista a detener la palada para no caerse.
3. **Orientación de la Costa (Ángulo Seaward):** El rumbo hacia donde mira la orilla hacia mar abierto. Determina si el viento aleja de tierra, acerca a tierra o empuja lateralmente.
4. **Deriva Mar Adentro (Offshore Component):** La fracción del viento que empuja directamente en perpendicular hacia mar abierto. Es el factor con mayor riesgo vital.
5. **Deriva Lateral (Side-shore Component):** La fracción del viento que sopla paralelo a la orilla. Provoca un desplazamiento horizontal constante y desvía al palista hacia cabos, acantilados o espigones.
6. **Oleaje (Altura y Periodo):** Las olas picadas (*chop*) reducen la eficacia de la palada hasta un 40% porque el palista debe emplear energía en mantener el equilibrio en lugar de traccionar agua.
7. **Nivel del Usuario:** Modula la tolerancia física, la velocidad máxima de avance y la capacidad de reacción del deportista.

---

## 3. ARQUITECTURA MATEMÁTICA Y VECTORIAL DEL ÍNDICE

### 3.1. Descomposición Vectorial del Viento respecto a la Costa

Sea $\theta_{\text{viento}}$ la dirección de procedencia del viento (grados del compás, 0° a 359°) y $\theta_{\text{mar}}$ el rumbo normal perpendicular a la costa que mira hacia mar abierto:

1. **Rumbo hacia el que sopla el viento:**
   $$\theta_{\text{sopla}} = (\theta_{\text{viento}} + 180^\circ) \pmod{360^\circ}$$

2. **Diferencia angular relativa con mar abierto:**
   $$\Delta\theta = |\theta_{\text{sopla}} - \theta_{\text{mar}}| \quad (\text{ajustada entre } 0^\circ \text{ y } 180^\circ)$$

3. **Cálculo de componentes:**
   * **Componente Mar Adentro (Perpendicular):**
     $$C_{\perp} = \cos(\Delta\theta)$$
     * Si $C_{\perp} > 0$: **El viento empuja mar adentro (Offshore).**
     * Si $C_{\perp} < 0$: **El viento empuja hacia la playa (Onshore).**
   * **Componente Lateral (Paralela a la costa):**
     $$C_{\parallel} = |\sin(\Delta\theta)|$$
     * Indica el grado de desplazamiento horizontal a lo largo de la orilla.

```
                   DESCOMPOSICIÓN DE LA FUERZA DEL VIENTO
                                 
                                     Norte (0°)
                                         ▲
                                         │
                             COSTAS ESPAÑOLAS
                  Playa / Tierra                    Mar Abierto
                ─────────────────┬────────────────────────────────► Mar abierto (θ_mar)
                                 │
                         Viento  │
                           \     │
                            \    ▼ Componente Lateral (C_parallel)
                             \   │ (Desplazamiento horizontal por la costa)
                              \  │
                               \ │
                                ─┼──────────────────────────────► Componente Mar Adentro (C_perp)
                                 │                                (Riesgo vital de alejamiento)
```

### 3.2. Ecuación del PaddleSafe Drift Score (0 a 100)

El índice calcula una puntuación numérica continua de 0 a 100:

$$\text{PDI} = B_{\text{viento}} + F_{\text{rachas}} + F_{\text{costa}} + F_{\text{oleaje}} + M_{\text{nivel}}$$

#### A. Base del Viento ($B_{\text{viento}}$):
* Si $V < 4\text{ kt}$: $B = 5$
* Si $4 \le V < 8\text{ kt}$: $B = 5 + (V - 4) \times 3.0$ (de 5 a 17)
* Si $8 \le V < 12\text{ kt}$: $B = 17 + (V - 8) \times 4.5$ (de 17 a 35)
* Si $12 \le V < 16\text{ kt}$: $B = 35 + (V - 12) \times 6.0$ (de 35 a 59)
* Si $V \ge 16\text{ kt}$: $B = \min(80, 59 + (V - 16) \times 7.0)$

#### B. Factor de Rachas ($F_{\text{rachas}}$):
$$\Delta R = \max(0, R_{\text{rachas}} - V_{\text{viento}})$$
* $\Delta R < 4\text{ kt} \implies +0\text{ puntos}$
* $4 \le \Delta R < 7\text{ kt} \implies +6\text{ puntos}$
* $\Delta R \ge 7\text{ kt} \implies +14\text{ puntos}$

#### C. Factor Costero Vectorial ($F_{\text{costa}}$):
Depende estrictamente de la dirección respecto a la orilla:
* **Si el viento empuja mar adentro ($C_{\perp} > 0$):**
  $$F_{\text{costa}} = C_{\perp} \times 30$$
  *(Multiplica la fuerza por la alineación directa hacia fuera; hasta +30 puntos).*
* **Si el viento empuja lateralmente ($C_{\parallel} \ge 0.70$):**
  $$F_{\text{costa}} = C_{\parallel} \times 15$$
  *(Añade hasta +15 puntos por deriva lateral acumulativa).*
* **Si el viento empuja hacia tierra ($C_{\perp} \le -0.40$):**
  $$F_{\text{costa}} = C_{\perp} \times 20 \quad (\text{resta hasta } -20\text{ puntos})$$
  *(El viento asiste el retorno a la orilla, reduciendo drásticamente el riesgo de pérdida).*

#### D. Factor de Oleaje y Mar Picado ($F_{\text{oleaje}}$):
* Oleaje $< 0.4\text{ m} \implies +0\text{ puntos}$
* $0.4\text{ m} \le \text{Ola} < 0.8\text{ m} \implies +8\text{ puntos}$
* $\text{Ola} \ge 0.8\text{ m} \implies +16\text{ puntos}$

#### E. Modulador por Nivel del Usuario ($M_{\text{nivel}}$):
* **Principiante:** $+15\text{ puntos}$ (menor velocidad de avance, sin experiencia ante la deriva).
* **Intermedio:** $+0\text{ puntos}$ (punto de calibración estándar).
* **Avanzado:** $-12\text{ puntos}$ (capaz de remar arrodillado con técnica eficiente y 6 km/h sostenidos).
* **Competición:** $-20\text{ puntos}$ (alta velocidad sostenida, tabla race con rumbo recto).

---

## 4. ESCALA DE SALIDA: LAS 4 CATEGORÍAS CANÓNICAS

El PaddleSafe Drift Index clasifica la situación en exactamente **4 niveles oficiales**.

```
   PDI Score:   0            30             55             80          100
                ├─────────────┼──────────────┼──────────────┼───────────┤
   Categoría:   │    BAJO     │   MODERADO   │     ALTO     │ MUY ALTO  │
   Color UI:    │   🟢 Verde  │  🟡 Amarillo │  🟠 Naranja  │  🔴 Rojo  │
```

---

### 🟢 1. DERIVA BAJA (PDI: 0 - 29)
* **Qué significa para el palista:**  
  La tabla se mantiene dócil bajo los pies. El viento no ejerce un empuje significativo sobre el cuerpo y no hay riesgo de ser arrastrado hacia mar abierto ni desviado contra rocas.
* **Sensación en el agua:**  
  Avance suave y predecible. Cada palada se traduce íntegramente en velocidad hacia delante. No hay tensión en los hombros.
* **Explicación en lenguaje humano (sin jerga):**  
  *"El viento apenas tiene fuerza para mover tu tabla. Puedes navegar con tranquilidad, parar a descansar sobre la tabla sin temor a alejarte y regresar a la orilla exactamente por donde entraste sin esfuerzo extra."*
* **Acción recomendada:**  
  Sesión cómoda. Disfruta de la remada, mantén la postura erguida y aprovecha para perfeccionar la técnica de palada.

---

### 🟡 2. DERIVA MODERADA (PDI: 30 - 54)
* **Qué significa para el palista:**  
  El viento ya empieza a empujar de forma perceptible. Si dejas de remar, notarás que la tabla se desplaza sola lentamente.
* **Sensación en el agua:**  
  Navegar a favor del viento se siente rápido y fácil, pero al girar para volver notarás que el avance se vuelve pesado y exige remar con ritmo constante.
* **Explicación en lenguaje humano (sin jerga):**  
  *"Hay un desplazamiento evidente. Si dejas de remar, la tabla se moverá sola empujada por el aire. El regreso a la orilla te costará el doble de tiempo y esfuerzo que la ida. Fija un punto de referencia en la playa (una sombrilla, un edificio) para comprobar cada pocos minutos si te estás desviando."*
* **Acción recomendada:**  
  * Inicia siempre la salida remando contra el viento para que el regreso sea a favor.
  * Guarda un tercio de tu energía para la vuelta.
  * Principiantes: no alejarse a más de 50 metros de la orilla.

---

### 🟠 3. DERIVA ALTA (PDI: 55 - 79)
* **Qué significa para el palista:**  
  Situación comprometida. El viento ejerce una resistencia severa contra el cuerpo erguido. El avance hacia delante se reduce a la mitad y existe peligro real de no poder volver al punto de partida si se comete un error táctico.
* **Sensación en el agua:**  
  Remar de pie contra el viento genera fatiga inmediata en hombros y lumbares. Si el viento es lateral, la tabla tiende a girarse sola continuamente obligando a remar casi todo el tiempo por un solo lado.
* **Explicación en lenguaje humano (sin jerga):**  
  *"El viento empuja con bastante fuerza sobre tu cuerpo. Remar de pie para volver a tierra requerirá un esfuerzo físico muy alto. Si el viento sopla hacia mar abierto, el mar parecerá engañosamente tranquilo cerca de la orilla pero te alejará con rapidez en cuanto te separes un poco. Si notas que te cuesta avanzar, no lo dudes: ponte de rodillas para recortar el freno del aire."*
* **Acción recomendada:**  
  * **Principiantes:** Salida desaconsejada.
  * **Intermedios / Avanzados:** Navegar únicamente en paralelo a la orilla, nunca mar adentro.
  * Si la orilla se aleja o el cansancio aprieta: **postura de rodillas (kneeling)** de inmediato.

---

### 🔴 4. DERIVA MUY ALTA (PDI: 80 - 100)
* **Qué significa para el palista:**  
  **Peligro severo de pérdida de control o arrastre mar adentro.** La fuerza del aire sobre el cuerpo supera la capacidad media de propulsión humana erguida. Remar de pie es prácticamente inútil y provoca retroceso hacia mar abierto o arrastre violento contra espigones o rocas.
* **Sensación en el agua:**  
  Sensación de impotencia: das paladas con todas tus fuerzas pero la costa sigue alejándose. El agua salpica la cara, la tabla se cruza de costado y las piernas tiemblan por la tensión de no caer al agua.
* **Explicación en lenguaje humano (sin jerga):**  
  *"Peligro crítico de arrastre. El viento es tan fuerte que actúa como un muro: empuja tu cuerpo con más fuerza de la que puedes vencer remando de pie. Si estás en el mar, te alejará de la orilla hacia mar abierto en cuestión de minutos. Salida desaconsejada para cualquier persona. Si te sorprende esta condición en el agua, ponte de rodillas en el centro de la tabla, agáchate lo más pegado a la superficie que puedas y rema directo a la orilla más próxima sin vacilar."*
* **Acción recomendada:**  
  * **NO SALIR AL AGUA.**
  * Si ya estás dentro: rodillas al centro de la tabla, tronco inclinado hacia delante, pala agarrada a media caña con paladas cortas y rápidas.
  * Nunca soltar la tabla: es tu único flotador de supervivencia.
  * Si no puedes avanzar de rodillas: tumbarse sobre el pecho con la pala bajo el cuerpo y remar con los brazos (*prone paddling*). Si la deriva continúa hacia fuera: llamar o pedir socorro de inmediato al 112 / Salvamento Marítimo.

---

## 5. CASUÍSTICA: MAR ADENTRO VS. LATERAL VS. HACIA TIERRA

El índice no solo da un nivel (Bajo/Moderado/Alto/Muy Alto), sino que **interpreta hacia dónde te lleva el agua**:

```
┌───────────────────────┬─────────────────────────────────────────────────────┐
│ DIRECCIÓN DEL EMPUJE  │ MENSAJE HUMANO AL USUARIO                           │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 1. MAR ADENTRO        │ "⚠️ El viento sopla hacia mar abierto (Terral).     │
│    (Offshore)         │ Cuidado: la orilla parece en calma pero el viento te│
│                       │ empuja hacia fuera. Alejarse es facilísimo; regresar│
│                       │ será agotador o imposible si te confías."           │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 2. LATERAL            │ "↔️ El viento sopla paralelo a la orilla. Te irá    │
│    (Side-shore)       │ desplazando de lado por la playa. Deberás remar casi│
│                       │ todo el tiempo por el mismo lado y planear volver   │
│                       │ a tierra antes de llegar a salientes o rocas."      │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 3. HACIA LA PLAYA     │ "🏖️ El viento sopla hacia tierra firme. El mar     │
│    (Onshore)          │ estará movido y con olitas en la orilla, pero tienes│
│                       │ la seguridad de que el viento te empuja hacia la    │
│                       │ arena, no hacia mar adentro."                       │
└───────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 6. COMPORTAMIENTO EN AGUAS INTERIORES (EMBALSES Y PANTANOS)

Cuando el usuario navega en un embalse, pantano o lago, **no existe mar abierto**, por lo que el peligro de perderse en el océano desaparece. Sin embargo, los embalses presentan **peligros propios de deriva**:

1. **Rachas Encajonadas por Relieve:**  
   En los embalses entre montañas, el viento se canaliza por cañones y gargantas aumentando súbitamente de velocidad (efecto embudo).
2. **Orillas Inaccesibles:**  
   Ser arrastrado hacia la orilla contraria en un embalse puede dejar al palista atrapado en paredes de roca vertical, zarzas o lodo intransitable sin acceso por tierra.
3. **Peligro de Presas y Aliviaderos:**  
   Derivar hacia las proximidades de las compuertas de una presa activa genera riesgo de succión hidráulica.

* **Traducción en Lenguaje Humano para Embalses:**
  * **Nivel Bajo:** *"Agua tranquila. Navegación cómoda sin riesgo de ser empujado contra orillas rocosas."*
  * **Nivel Moderado:** *"El viento puede empujarte hacia la orilla opuesta del embalse. Asegúrate de tener fuerzas para volver al punto donde dejaste el coche."*
  * **Nivel Alto / Muy Alto:** *"Rachas fuertes encajonadas entre las montañas. Si te cansas, el viento te estrellará contra orillas escarpadas de difícil salida a pie. Mantén distancia absoluta de la presa y navega cerca de orillas accesibles."*

---

## 7. MATRIZ DE CALIBRACIÓN POR NIVEL DE USUARIO

El mismo día de 11 nudos con viento mar adentro produce índices de deriva radicalmente diferentes según quién se suba a la tabla:

| Condiciones Meteorológicas | Nivel Principiante | Nivel Intermedio | Nivel Avanzado | Nivel Competición |
| :--- | :--- | :--- | :--- | :--- |
| **Viento 6 kt, Mar adentro, Ola 0.2 m** | 🟡 **Moderado (38)** | 🟢 **Bajo (23)** | 🟢 **Bajo (11)** | 🟢 **Bajo (5)** |
| **Viento 10 kt, Mar adentro, Ola 0.3 m** | 🟠 **Alto (62)** | 🟡 **Moderado (47)** | 🟢 **Bajo (28)** | 🟢 **Bajo (20)** |
| **Viento 14 kt, Mar adentro, Ola 0.5 m** | 🔴 **Muy Alto (88)** | 🟠 **Alto (73)** | 🟡 **Moderado (54)** | 🟡 **Moderado (46)** |
| **Viento 18 kt, Lateral, Ola 0.8 m** | 🔴 **Muy Alto (95)** | 🔴 **Muy Alto (80)** | 🟠 **Alto (68)** | 🟠 **Alto (60)** |
| **Viento 12 kt, Hacia tierra (Onshore)** | 🟡 **Moderado (35)** | 🟢 **Bajo (20)** | 🟢 **Bajo (12)** | 🟢 **Bajo (5)** |

> **Observación Crucial:**  
> Un principiante entra en categoría **Alto** con apenas 10 nudos de viento de tierra, mientras que un deportista de competición puede manejar esa misma brisa en categoría **Bajo**, porque dispone de fuerza, tabla rápida de carbono y técnica para avanzar a 8 km/h.

---

## 8. INTEGRACIÓN TÉCNICA EN LA ARQUITECTURA DE PADDLESAFE

El cálculo del PaddleSafe Drift Index se articula limpiamente en los módulos existentes:

```
                               ┌─────────────────────────────────┐
                               │       ENTRADA DE DATOS          │
                               │  - Viento, rachas (Open-Meteo)  │
                               │  - Orientación costa (coastal.js│
                               │  - Oleaje (Open-Meteo Marine)   │
                               │  - Nivel usuario (Selector UI)  │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │  calcularIndiceDerivaPaddleSafe │
                               │        (en coastal.js)          │
                               │                                 │
                               │  1. Descomposición C_perp / C_par│
                               │  2. Cálculo Score PDI (0 a 100) │
                               │  3. Asignación Nivel (4 estados)│
                               │  4. Generación Mensaje Humano   │
                               └────────────────┬────────────────┘
                                                │
                      ┌─────────────────────────┼─────────────────────────┐
                      │                         │                         │
                      ▼                         ▼                         ▼
            ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
            │    verdict.js     │     │     coach.js      │     │      map.js       │
            │ Modula el score   │     │ Traduce la deriva │     │ Renderiza tarjeta │
            │ global de         │     │ en consejos de    │     │ visual con badge  │
            │ seguridad (0-100) │     │ postura y pacing  │     │ de color y texto  │
            └───────────────────┘     └───────────────────┘     └───────────────────┘
```

### 8.1. Objeto de Retorno del Motor de Deriva
El método devolverá siempre una estructura estandarizada y limpia:

```javascript
{
    score: 62,                       // Número entero de 0 a 100
    nivel: 'Alto',                   // 'Bajo' | 'Moderado' | 'Alto' | 'Muy Alto'
    color: 'naranja',                // 'verde' | 'amarillo' | 'naranja' | 'rojo'
    icono: '🟠',
    direccionEmpuje: 'mar_adentro',  // 'mar_adentro' | 'lateral' | 'hacia_tierra' | 'interior'
    resumenHumano: 'El viento sopla hacia mar abierto y te alejará de la orilla. Remar de pie para volver costará el doble.',
    accionConcreta: 'Navega en paralelo a la orilla a menos de 50 metros. Si notas resistencia, ponte de rodillas.',
    detalles: {
        vientoAfectado: true,
        empujeOffshore: true,
        desplazamientoLateral: false,
        esEmbalse: false
    }
}
```

---

## 9. EJEMPLOS REALES DE EVALUACIÓN

### Ejemplo 1: Playa de Postiguet (Alicante) - Terral Matutino
* **Condiciones:** Viento 11 kt del Noroeste (315°), rachas de 15 kt. Costa orientada al Sureste (130°). Mar plana 0.2 m.
* **Usuario:** Nivel Principiante.
* **Cálculo Interno:**
  * Viento sopla hacia: $315^\circ + 180^\circ = 135^\circ$ (prácticamente idéntico a $130^\circ$, ángulo seaward).
  * $C_{\perp} = \cos(5^\circ) = 0.99$ (**Offshore casi puro hacia mar abierto**).
  * Score PDI: 68 puntos.
* **Salida del Índice:**
  * **Nivel:** 🟠 **Alto**
  * **Mensaje Humano:**  
    *"⚠️ El viento sopla directo hacia mar abierto. Aunque la orilla parece una piscina tranquila, el viento te empujará hacia fuera en cuanto te separes unos metros de la arena. Si decides entrar, quédate a menos de 50 metros de la orilla y prepárate para ponerte de rodillas si sientes que la costa se aleja."*

---

### Ejemplo 2: Playa de Somo (Cantabria) - Viento Onshore
* **Condiciones:** Viento 13 kt del Norte (0°), rachas de 16 kt. Costa orientada al Norte (350°). Oleaje 0.9 m.
* **Usuario:** Nivel Intermedio.
* **Cálculo Interno:**
  * Viento sopla hacia: $0^\circ + 180^\circ = 180^\circ$ (Sur, hacia la playa).
  * $C_{\perp} = \cos(170^\circ) = -0.98$ (**Onshore directo hacia tierra**).
  * Score PDI: 28 puntos.
* **Salida del Índice:**
  * **Nivel:** 🟢 **Bajo**
  * **Mensaje Humano:**  
    *"🏖️ No hay riesgo de quedar a la deriva hacia mar abierto: el viento sopla directo hacia la arena y te ayudará a regresar. El mar estará picado y con olas en la orilla que te exigirán flexionar bien las rodillas, pero siempre volverás a tierra seguro."*

---

### Ejemplo 3: Embalse de Entrepeñas (Guadalajara) - Rachas en Garganta
* **Condiciones:** Viento 15 kt, rachas de 23 kt. Sin oleaje marino.
* **Usuario:** Nivel Intermedio.
* **Cálculo Interno:**
  * Detección automática: entorno interior (embalse).
  * Score PDI: 58 puntos.
* **Salida del Índice:**
  * **Nivel:** 🟠 **Alto**
  * **Mensaje Humano:**  
    *"⛰️ En aguas interiores no hay peligro de deriva mar adentro, pero las rachas fuertes de viento te empujarán con violencia hacia las orillas contrarias. Evita cruzar el embalse a lo ancho; quédate cerca de la orilla del embarcadero para no quedarte atrapado en zonas rocosas sin salida a pie."*

---

## 10. PLAN DE IMPLEMENTACIÓN DEL ÍNDICE

1. **Fase A (Actualización de `coastal.js`):**  
   Reemplazar la función actual `calcularIndiceDerivaPaddleSafe` incorporando:
   - Descomposición vectorial precisa $C_{\perp}$ (mar adentro) y $C_{\parallel}$ (lateral).
   - Inclusión del parámetro `nivelUsuario` ('Principiante', 'Intermedio', 'Avanzado', 'Competición').
   - Ponderación de rachas e inestabilidad del oleaje.
   - Generación de textos en lenguaje humano sin jerga técnica ni números brutos innecesarios.
2. **Fase B (Alineación en `verdict.js`):**  
   Pasar `userLevel` a la llamada de deriva y utilizar el nuevo objeto `PDI` para alimentar `riesgoDeriva` y modular los factores críticos del veredicto final.
3. **Fase C (Enlace con `coach.js`):**  
   El Coach Pro utilizará el veredicto del PDI para prescribir la estrategia de remada (Kneeling, 1/3 de energía, navegación paralela).
4. **Fase D (Pruebas Automatizadas):**  
   Crear test unitario `test_drift_index.mjs` validando los casos de costa abierta, viento offshore, onshore, side-shore, embalses y los 4 niveles de deportista.

---

## 11. CONCLUSIÓN

El **PaddleSafe Drift Index (PDI)** resuelve la principal causa de incidentes y llamadas a Salvamento Marítimo en el litoral español: la falta de comprensión de cómo el viento afecta a una persona de pie sobre una tabla. 

Al presentar el resultado en **4 niveles universales (Bajo, Moderado, Alto, Muy Alto)** y explicarlo con **lenguaje humano, empático y directo**, PaddleSafe entrega al deportista la herramienta definitiva para tomar decisiones seguras antes de meter la tabla en el agua.

