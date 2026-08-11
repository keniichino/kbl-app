# Tareas de Keni — KBL App

> Ver [`PROMPTS_EXPERTOS.md`](PROMPTS_EXPERTOS.md) para el estado completo del proyecto y prompts listos para abrir en chats nuevos por tema (3D/Blender, crecimiento real, backend/login, n8n, producto).

## Historial real desde los resúmenes (2026-08-08)
Se leyeron los 10 resúmenes de Galicia (Visa + Mastercard, abril a agosto 2026) y los 3 recibos de sueldo de `Desktop\Gacilia`. Herramienta reutilizable en `tools/resumenes/` (ver su README).

- **Los 10 resúmenes cierran contra el total del banco**: Mastercard al centavo, Visa con hasta $70 por centavos de impuestos que el PDF redondea. Sin ese cruce no se carga nada — es el mismo criterio del 28/07.
- **SQL listo para correr**: `supabase/recurrentes-historial-2026-08.sql`. Carga 14 conceptos (12 suscripciones/fijos + sueldo) con su historial marzo–julio. Idempotente por nombre: si el concepto ya existe, le agrega el historial sin duplicarlo ni pisar lo que hayas puesto a mano.
- **Lo que apareció en los números:**
  - **Personal Flow subió 48% en 5 meses**: 31.766 → 32.872 → 34.020 → 45.966 → 46.883.
  - **YouTube Premium aumentó 32%** en julio ($3.399 → $4.499) y no estaba declarado.
  - **Xbox Game Pass** ($11.999) sólo aparece en abril y mayo, y **CapCut** (US$13,99) desaparece en julio: o los diste de baja, o falta el dato.
  - **Netflix no es una suscripción en dólares**: se factura $19.999 y el resumen de Mastercard la liquida en US$13,70.
  - Percepciones AFIP: te cobraron $99.080 y te devolvieron $97.259. El costo fiscal real de 5 meses es **~$50.300**, casi todo IVA DTO 354/18.
  - El recibo de JUN 2026 muestra neto $1.356.747, pero incluye un **"Descuento Anticipo" de $800.000**: el ingreso real del mes fue $2.156.747.
### Mercado Pago (también 2026-08-08)
Se sumaron los 3 resúmenes de MP (enero, julio y agosto 2026). **Los 3 cierran exacto contra su propio subtotal**, en pesos y en dólares. Parser en `tools/resumenes/parse-mp.js`.

- **Trampa del formato MP: las fechas no tienen año.** Ni las de los consumos ni la del cierre, y tampoco está en los metadatos. El año se pasa a mano en el mapa `ANIOS` del script; el de estos tres se confirmó encadenando saldos (el "periodo anterior" de agosto = el "total a pagar" de julio). El de enero queda **supuesto** como enero 2026.
- **Hallazgo importante: MP no es una cuota de $383.889, son CINCO compras con plazos distintos.** Si estaba cargada como una sola, la proyección mostraba el mismo importe todos los meses en vez de escalonarse:

  | compra | cuota | por mes | quedan | pendiente |
  |---|---|---|---|---|
  | MERCADOLIBRE | 6/6 | $23.103 | 1 | $23.103 |
  | IXPETS | 4/9 | $16.178 | 6 | $97.066 |
  | ARRAYSRL | 2/3 | $280.337 | 2 | $560.673 |
  | MERCADOLIBRE | 2/4 | $24.000 | 3 | $71.999 |
  | ELECTROWORLD | 2/2 | $40.273 | 1 | $40.273 |

  Total este mes **$383.889,47** (cierra exacto contra el resumen) · saldo pendiente **$793.114**.
- **La deuda de MP se desploma después de septiembre**: ago $383.889 → sep $320.514 → oct $40.177 → nov-ene $16.178. Las dos compras que terminan este mes (MERCADOLIBRE 6/6 y ELECTROWORLD 2/2) son $63.375 mensuales que se liberan.
- **SQL listo**: `supabase/cuotas-mp-2026-08.sql`. Verificado contra `calendarioCuotas()` de la app: da $383.889,47 en agosto y la proyección escalonada correcta.

- **Falta todavía**: los dólares de Visa (los pesos cierran en los 5, los USD no), los recibos de marzo a mayo y julio-agosto para que la curva de sueldo no tenga huecos, y los resúmenes de MP de febrero a junio si se quiere su historial mes a mes.

### Gastos por cuenta de otro (2026-08-08)
Caso que lo motivó: **$56.775 de una multa de ACARA pagados por el padre**, que después transfirió $80.000. Esa plata salió de la caja pero no es consumo propio, y contarla como gasto inflaba el mes, el promedio de variable, la alerta de "día caro" y el ritmo del mes.

- Campos nuevos en `gastos`: `reintegro` (`null` = propio, `'pendiente'`, `'cobrado'`) y `reintegro_de`. SQL: `supabase/gastos-reintegro.sql`.
- Botón **🤝** en cada gasto de la lista. Cicla: propio → te lo deben (pide el nombre) → ya te lo devolvió → propio.
- Un gasto marcado **no suma en ninguna de las dos bases** y aparece tachado en la lista. Card nueva **"Te deben"** en el Panel con el saldo por persona y desde cuándo.
- Alerta a los 20 días: "X te debe $Y, lo pusiste hace N días". A los 60 sube a nivel medio.
- Verificado: con la multa marcada, el total de agosto pasa de $207.975 a **$151.200** (143.000 + 8.200), y los $56.775 aparecen en "Te deben — Papá".
- Se agregó `pedirTexto()` a `dialog.js` porque `prompt()` nativo no funciona en PWA instalada en iOS.

### Resumen de MP de septiembre (2026-08-08)
De la captura del resumen en curso: **tres compras nuevas del 7 de agosto** que todavía no estaban cargadas.

- Mercado Libre $49.900 (1/2), $56.000 (1/2) y $45.395,77 (1/3) → comprometen **$347.987** en total.
- **Septiembre pasa de $320.514 a $471.810.** La proyección queda: sep $471.810 → oct $191.473 → nov $61.573 → dic-ene $16.178.
- Las dos que se terminan con el resumen de agosto (MERCADOLIBRE 6/6 y ELECTROWORLD 2/2) liberan **$63.375 por mes**.
- SQL: `supabase/cuotas-mp-2026-09.sql` (reemplaza al de agosto). **ARRAYSRL 3/3 está inferido**: la captura estaba cortada en "6 de junio", así que si el resumen real trae algo más hay que agregarlo.

### Tanda de arreglos de UI (2026-08-08, tarde)
- **Caja / Consumo era ilegible en oscuro.** `.seg-btn.selected` tenía `background: #fff` con `color: var(--ink)`, que en el tema oscuro es `#e8eef7`: blanco sobre blanco. Ahora usa pastilla translúcida — medido **9,97:1** el seleccionado y 7,68:1 el otro.
- **La luna chocaba con "‹ Agosto 2026 ›".** Estaba `fixed` arriba a la derecha, encima del navegador de meses. Pasó abajo a la derecha, sobre la tabbar (y en escritorio a la esquina, donde la tabbar es lateral). Verificado que ya no se superponen.
- **Suscripciones y fijos: total combinado.** "$ 9.381 + US$ 22,87" no decía cuánto era en total. Se agregó la línea "Todo junto, a MEP de hoy" con la suma a la cotización elegida (tocándola cicla MEP → Blue → Cripto). Lo mismo en el hero.
- **Las cuotas ahora se ven en base Consumo.** No suman al total (son compras de meses anteriores; sumarlas contaría dos veces la misma plata), pero van en su propia línea con la explicación. Antes simplemente no estaban y parecía que faltaban.
- **Detalle de deuda por mes.** Las columnas del gráfico son botones: tocás un mes y abajo aparece qué compras lo componen, con el número de cuota y cuáles son la última. Antes el monto vivía sólo en el `title` del hover, que en el celular no existe.
- **Bug de cotización caída:** mostraba "≈ $ 0 MEP" cuando la API no responde. Ahora se oculta.

### Historial de gastos para el flujo de 6 meses (2026-08-08)
`supabase/gastos-historial-2026-08.sql` — **322 consumos** de marzo a agosto 2026, de los tres emisores. Es lo que hace que el flujo, el promedio de variable y las comparaciones contra meses anteriores tengan con qué comparar. Generado con `tools/resumenes/generar-gastos.js`.

No incluye cuotas (van en `cuotas`) ni conceptos ya declarados como fijo/suscripción (van en `recurrentes`): sumarlos contaría dos veces.

Curva de gasto variable que queda: mar $512.831 → abr $598.102 → may $1.468.057 → jun $1.432.090 → jul $1.073.654 → ago $306.865 (mes en curso).

**Ojo con las bases:** en base **Caja** el flujo de 6 meses da casi cero, y está bien — casi todo se paga con tarjeta, así que el gasto aparece recién cuando se paga el resumen, y sólo hay cuotas cargadas desde agosto. La curva de consumo real se ve en base **Consumo**.

### Bonsái: el bug real no era el que pensábamos (2026-08-08)
Encuadre calculado (`dist=12.3106 height=1.4618`) y agregado a `render_etapas.sh`. El primer render salió con el follaje **todavía flotando**, así que el anclaje de las almohadillas era sólo la mitad del problema.

**La causa de fondo estaba en el escalado de etapas, no en la geometría del bonsái.** El bloque `if MADUREZ < 1.0` hacía, objeto por objeto:

```python
ob.scale = tuple(s * m for s in ob.scale)
ob.location = tuple(c * m for c in ob.location)   # "ancla en el suelo (z=0)"
```

Eso vale para objetos sueltos, pero **`location` es relativa al padre**. El bonsái agrupa tronco, ramas y almohadillas bajo `bonsai_canopy_root`, así que cada pieza se movía hacia el origen *local* y el conjunto se desarmaba. Peor: el EMPTY raíz quedaba fuera del loop (filtra por `MESH`/`CURVE`), así que **el root seguía en escala 1.950 mientras el tronco bajaba a 0.750** — follaje de tamaño completo sobre un tronco al 75%.

Se ve clarísimo en el diagnóstico del `.blend` viejo:

| objeto | antes | después |
|---|---|---|
| `bonsai_canopy_root` | 1.950 (sin atenuar) | **1.463** = 1.950 × 0.75 |
| `tronco` | 0.750 | 1.000 (hereda del root) |
| `bonsai_pad_hull.003` | 0.991 | 1.321 (su escala propia, intacta) |

Fix: los objetos con padre se saltean, y se escalan los EMPTY raíz (`cabeza`, `bonsai_canopy_root`) después. La jerarquía se encarga de mantener las proporciones.

Verificado que no rompe a las demás: arbolito maduro TOPE 2.95 → etapa 1 (madurez 0.50) TOPE 1.47, exacto la mitad. Se re-renderizaron las 4 especies porque el cambio las toca a todas, y **roble, sakura y arbolito quedaron bien** (revisados los frames).

**Pero el bonsái seguía roto, y el defecto no era ese.** Con el escalado ya arreglado, el render mostraba el mismo follaje flotando — y el bonsái MADURO también, o sea que nunca fue un problema de las etapas.

**La causa real: el displace de corteza era más grande que el radio del tronco.**

| | radio | displace | resultado |
|---|---|---|---|
| tronco arriba | 0.058 | 0.075 | se da vuelta del revés y desaparece |
| punta de rama | 0.011 | 0.075 | se desintegra por completo |

El modificador empujaba los vértices más lejos que el propio grosor de la pieza. Ese es el "tramo invisible" que se veía: la mitad superior del árbol no se renderizaba, y las almohadillas no *flotaban* — se había borrado la rama que las sostenía.

Regla que quedó: **ninguna sección puede tener radio menor a ~2× el strength del displace.** Los valores finales, calibrados en tres renders de prueba de un frame:

- displace `0.075 → 0.035` (+ el fino `0.025 → 0.012`)
- tronco: mínimo `0.058 → 0.095`
- ramas: base `0.040 → 0.085`, y el afinado de `0.55/0.28` a `0.78/0.62`
- follaje: `4200 → 7000` de densidad y hoja `1.15 → 1.32`, porque un tronco más ancho tapa las hojas que antes asomaban por detrás y las almohadillas quedaban ralas

El primer intento subió los radios a 0.14 y quedó con tronco de baobab: sobrevivía al displace pero perdía la silueta afinada. 0.095 es el punto donde se ve completo y sigue siendo un bonsái.

`--inspect` y `--test` (un frame, 48 samples, ~1 min) fueron lo que permitió iterar sin pagar 25 minutos de turntable por intento.

Los `ERROR Failed to create OIDN CPU device` del log son del denoiser y no bloquean: los frames salen igual.

### Ajustes y 4 detecciones más (2026-08-08, noche)
**Panel de Ajustes** (`app/js/ajustes.js`) — bottom sheet que junta lo que estaba disperso: el tema vivía en un botón flotante suelto, la cotización se cambiaba tocando cualquier importe en dólares (y había que saberlo), la meta de ahorro estaba escondida dentro del formulario de movimientos de ahorro, y "Salir" sólo existía en el header del Bosque. Ahora todo en un lugar, más el recuento de datos guardados. Sheet y no vista propia porque seis pestañas ya son las que entran en la tabbar de un celular.

Se agregó `elegirCasa()` y `todasLasCotizaciones()` a `cotizacion.js` — Ajustes muestra las tres casas con su valor y se elige directo, en vez de ciclar de a una.

Dos bugs propios encontrados al probarlo:
- El slider de meta dejaba de guardar después de tocar el tema: cambiar cualquier opción repinta el sheet y el listener directo se moría con el nodo viejo. Pasó a delegación.
- El guard `if (sheet) return` dejaba el panel muerto para siempre si el nodo se sacaba del DOM por afuera. Ahora chequea `isConnected`.

**Detecciones nuevas** (`detecciones.js`), todas probadas con un escenario que las dispara:
- 🎈 **Se libera plata**: cuotas cuya última cuota cae este mes. Es la única alerta buena del lote y la más accionable — saber que en un mes se te liberan $63.375 cambia decisiones hoy, y ninguna app lo dice porque todas miran lo que gastás, no lo que dejás de deber.
- ⚠️ **Doble cobro**: la misma suscripción en dos tarjetas. Pasa de verdad cuando se cambia el medio de pago y el viejo no se da de baja; en el resumen de cada tarjeta por separado cada cobro parece legítimo.
- 🧊 **Ingreso quieto**: hace N meses que el sueldo no se mueve. Con inflación es una pérdida que no aparece como gasto, aparece como que cada vez alcanza menos.
- 📅 **Día de la semana caro**: "los viernes gastás 208% más", con el anualizado de la diferencia.

Contraste del sheet medido en los dos temas: mínimo **5,77 claro / 4,63 oscuro**. El botón de cerrar sesión quedaba en 4,36 con `--fin-mal`, así que lleva color propio.

### Panel de Mercado (2026-08-09)
`app/js/mercado.js` — S&P 500 (SPY) y Nasdaq 100 (QQQ) vía CEDEAR, que es lo que se compra desde acá.

**Fuente: `data912.com`.** Gratis, sin API key y con CORS abierto — se probaron seis y es la única que sirve desde el browser (Yahoo y stooq bloquean CORS, Alpha Vantage pide key). Tiene precios en vivo, 856 días de histórico OHLC y hasta volatilidades implícitas. **Su propio autor la define como un proyecto educativo y avisa que no es tiempo real**; eso está dicho en la UI.

**El bug que hubiera arruinado todo: la fuente no ajusta por splits.** El CEDEAR de SPY hizo un split 1:3 el 29/05/2026 (de $56.000 a $18.760) y sin corregirlo el panel mostraba **"drawdown de -63,6%" y "-53% bajo su media de 200 días" para el S&P 500** — números disparatados que igual se veían creíbles en una tarjeta. `ajustarSerie()` detecta los saltos >25%, distingue split (reescala todo lo anterior) de precio mal cargado (el 03/08/2023 aparece a -41% y vuelve al día siguiente: se interpola). Con eso SPY pasa a drawdown 0% y +15,3% sobre su media, que es lo real.

**Qué muestra y qué no.** No hay pronósticos ni señales de compra: nadie puede calibrar eso y una app que lo muestre con un número invita a creerle. Muestra el estado (distancia al máximo, a la media de 200 días, volatilidad anualizada) y la estadística condicional **con la muestra a la vista**: "de las 110 veces que estuvo así, a 6 meses la mediana fue +8,9%, el rango p25–p75 va de -2,5% a +18,4%, y subió en 65 de cada 100". Se muestra el rango entero y no sólo la mediana porque la dispersión ES el dato.

Se conecta con la realidad de la app: "con los $X que te quedan libres este mes entran N CEDEARs". Cachea 30 min y se pinta asincrónico para no dejar el panel en blanco si la API tarda o está caída.

Contraste medido en los dos temas: mínimo **4,63**.

## Pendiente de correr (2026-08-08)
- [x] ~~**`bash blender/render_etapas.sh`**~~ — **hecho y verificado el 08/08.** Las 4 especies con sus 3 etapas jóvenes (36 frames cada una), revisadas frame por frame: bonsái con el tronco completo, roble y sakura sin cambios de calidad. `CON_ETAPAS` en `app/js/app.js` ya incluye `bonsai`, así que crece por geometría real y no por escala.
- [x] ~~**`supabase/inversiones-setup.sql` en el proyecto PERSONAL (KBL APP)**~~ — **ya estaba corrido**, verificado contra la base el 09/08: la tabla `inversiones` existe, con RLS, su política y los cuatro campos de tesis (`tesis`, `precio_objetivo`, `fecha_objetivo`, `invalidacion`). Sincroniza. Está vacía porque no cargaste nada, no porque falte el script.

## La tarjeta no existía en base Caja (2026-08-10)

El bug más caro que tuvo la app y el más silencioso: **agosto/2026 mostraba ~$0
de egreso en base Caja el mismo mes en que se debitaba el resumen entero de las
dos tarjetas de Galicia.** (Los importes de este episodio están en
`RETOMAR-ACA.md`, que no va al repo.)

La causa era estructural. `egresoCaja` = `estructuralCaja + cuotas + gastos que
no son de tarjeta`, y resulta que los 15 recurrentes menos el sueldo se pagan
con Visa o Mastercard (→ `estructuralCaja` = $0) y los gastos de agosto eran
todos de Visa (→ `varCaja` = $0). Los consumos en un pago con tarjeta no
aparecían en ningún sumando: no son "cuota" y están excluidos del variable de
caja para no duplicar. Simplemente desaparecían.

- **`cuotas` dejó de duplicar a `gastos`.** Había 49 filas 1/1, una por consumo,
  espejo de la de `gastos`. Se borraron: ahora `cuotas` son sólo planes de 2 o
  más y `gastos` es la única fuente de los pagos únicos.
- **`contexto()` arma dos índices** en vez de uno: `gastosPorMes` (mes
  calendario → base CONSUMO) y `gastosPorPeriodo` (período de facturación →
  base CAJA). Antes uno solo hacía de las dos cosas, así que cargar el día de
  cierre habría roto la base Consumo.
- **Serie nueva "Resumen tarjeta"** (`--fin-tarjeta`) en el hero, el desglose y
  las barras apiladas. Sólo en base Caja.
- `indicadores`, `ritmoDisponible` y las detecciones `techo` y `colchon`
  arrastraban el mismo error al revés: usaban `estructuralCaja` "para no
  duplicar con cuotas", pero esa duplicación nunca existió y el resultado era
  que las suscripciones con tarjeta no contaban en ningún lado. Va
  `estructuralTotal`.

**Verificación (el patrón vale para cualquier cambio de este cálculo).** Que la
app "se vea bien" no prueba nada; lo que prueba es cerrar contra el banco:
`gastos del período + cuotas del mes` tiene que dar **exactamente** los consumos
que declara el resumen, en pesos y en dólares — Mastercard cierra al centavo en
las dos monedas. Y el pronóstico de cuotas tiene que coincidir mes a mes con la
tabla "Cuotas a vencer" que imprime el propio PDF, que es una fuente
independiente del cálculo. Más 12 casos de prueba sobre `fotoDelMes`,
`calendarioCuotas` y `deudaPendiente`.

**Segundo hueco, del mismo día: lo que ya pagaste este mes desaparecía del
mes.** `calendarioCuotas()` salteaba los planes con `estado != 'activa'` (un
plan terminado no aportaba a ningún mes, ni a los pasados) y cortaba las cuotas
anteriores a `cuota_actual` con `mes >= MES_HOY`, o sea incluyendo el mes
corriente. Entre las dos cosas, **el resumen entero de Mercado Pago que venció
el 10/08 no aparecía en agosto por ningún lado**. Ahora el calendario
es de caja (cada cuota en el mes que se cobró, con `pagada: true` en el item) y
`deudaPendiente()` filtra por `!pagada` — "cuánto salió en agosto" y "cuánto
debo" son dos preguntas y las resolvía el mismo número. Una cuota ya paga sí se
sigue suprimiendo si cae en un mes futuro: eso es fecha mal cargada.

**Lo que no cierra, y por qué.** `medios_pago.dia_cierre` es un `int`, pero
Galicia cierra el 8/7, el 6/8 y el 10/9, los consumos del día del cierre caen en
el resumen siguiente y el 08/07 hay dos compras, una en cada resumen. Con
cierre 5 (el valor cargado) el mes corriente se lleva dos días de compras que
pagó el resumen anterior: **+1,9% de error** medido contra el débito real. Con
cierre 7 el error sería el doble. La solución de verdad es una tabla de cierres
por mes en vez de un `int`.

## Limpieza de la base (2026-08-09)

Hecha directo por MCP contra el proyecto personal (`jcsenhpuvvbxcxapoaia`),
verificando el destino con `get_project_url` antes de escribir una sola consulta.

**Gastos: 692 → 342.** Se borraron 350 filas repetidas. El script masivo había
corrido dos veces completo, y el 28/07 a las 17:31 una tercera vez sobre julio
10–26, así que había consumos cargados hasta tres veces.

La regla fue quedarse con la fila más vieja de cada
`(fecha, round(monto,2), descripcion)`. Cómo se validó que no se borrara nada real:

- La fuente (`CARGA-COMPLETA.sql`, 322 filas) tiene **un solo** repetido
  legítimo: `2026-05-23 · $36.000 · MERPAGO*UMOCLUB`. En la base había 4 =
  2 compras reales × 2 corridas. Se conservaron las 2. El modelo cierra exacto.
- Las filas con hora `00:01`/`00:02`/`00:03`, que parecían carga manual, son el
  desfasaje de minutos que el propio script le pone a los consumos del mismo
  día. **Ninguna carga manual cayó dentro de un grupo duplicado.**
- **Prueba final:** marzo, abril, mayo y junio quedaron coincidiendo fila por
  fila con la fuente (28 / 46 / 102 / 84). Julio (68 vs 49) y agosto (14 vs 13)
  tienen de más los 20 gastos que cargaste a mano desde las fotos del resumen.
- Tampoco quedaron duplicados escondidos por mayúsculas: chequeado agrupando por
  descripción normalizada (convivían `DLO*DiDi` y `DLO*DIDI`).

**Recurrentes: 17 → 15.** Sobraban dos "Claude" (ver el bug de abajo). Los 14 de
la fuente estaban todos con su historial; el 15º es Claude, cargado a mano.

**Cuotas: ya estaban bien.** MP quedó en 6 activas / $ 471.809,86 (los 9 centavos
contra los $ 471.809,77 esperados son redondeo, no un error).

**Respaldo:** `public.gastos_backup_20260809`, 692 filas, con RLS activado y sin
políticas (o sea, no se lee desde la app). **Mientras exista, el borrado es
reversible.** Borrala con `drop table public.gastos_backup_20260809` cuando
hayas mirado la app y esté todo bien.

## Arreglado el 2026-08-09

- **Los conceptos recurrentes se duplicaban cada vez que los dabas de alta.**
  Es lo que dejó tres "Claude" idénticos (07/08 23:21, 08/08 01:04, 08/08 17:31).
  `upsertRecurrente()` deduplica **por id**, pero los dos lugares que dan de alta
  un concepto —el botón "Agregar X" de las alertas y el formulario de conceptos—
  le pasaban un `crypto.randomUUID()` nuevo cada vez, así que el "upsert" era
  siempre un insert. Alcanzaba con que la alerta reapareciera (se descarta en
  local, así que otro dispositivo la vuelve a mostrar) para dejar un duplicado
  por toque. Lo mismo pasaba escribiendo "Netflix" dos veces en el alta manual.
  - Fix: `fusionarConcepto()` en `app/js/panel.js`. Busca por nombre
    (sin distinguir mayúsculas) y reusa el id si ya existe.
  - Conserva el `historial` previo y sólo pisa el mes que llega: son montos mes
    a mes que no se pueden reconstruir. Respeta también el `estado`, para que un
    concepto que pausaste a propósito no se reactive solo.

## Arreglado el 2026-08-08
- **Doble conteo de fijos y suscripciones pagados con tarjeta.** Era el bug de "declaré Personal Flow como fijo y el mes subió $46.883". Un concepto que se paga con tarjeta de crédito ya viaja dentro de `cuotas`; sumarlo otra vez en base CAJA lo contaba dos veces. Ahora `fotoDelMes()` separa `fijosCaja`/`fijosTarjeta` y en Caja sólo suma la parte que sale del bolsillo. Verificado: declarar el fijo mueve el total en $0.
  - Consecuencia visible: el "101% / 102% del ingreso comprometido" de las alertas estaba inflado. `techo()`, `colchon()` e `indicadores()` ahora usan `estructuralCaja + cuotas`.
  - Para que la plata no "desaparezca": las filas de Fijos y Suscripciones llevan el badge `💳 lo paga el resumen`, hay un subtotal debajo del total y el hero aclara cuánto se fue a Cuotas.
- **La deuda ahora baja.** No existía "pagué la cuota de este mes": el único botón era "completada", que borraba la compra entera. `cuota_actual` nunca avanzaba, así que "2 de 9" quedaba fijo para siempre y el saldo sólo bajaba por el paso del calendario.
  - Botón **"Pagué la Nª"** por cuota y **"Ya lo pagué"** por resumen completo (que es como se paga de verdad: avanza todas las cuotas de esa tarjeta de una).
  - Botón **↩ deshacer** por si tocaste de más.
  - Aviso arriba de Cuotas y alerta de nivel alto cuando hay cuotas **vencidas sin marcar**: mientras estén así el saldo está inflado y todo el panel miente.
- **Recordatorios de vencimiento (`app/js/recordatorio.js`).** Botón "🔔 Recordarme" en cada tarjeta del próximo resumen: elegís hora (chips + reloj libre), cuántos días antes y si repite todos los meses; genera un `.ics` con dos VALARM. Se eligió calendario y no push porque el push con la app cerrada necesita servidor (sigue pendiente abajo) y una notificación local se pierde si no abrís la app.
- **Módulo Inversiones (`app/js/inversiones.js` + `broker-parser.js`).** Carga por foto del comprobante del broker con la misma pila de OCR que Gastos (Tesseract local, import diferido). Separa **lo que queda invertido** (cantidad × precio) de **lo que sale de tu caja** (+ comisiones + gastos), porque la diferencia es costo de transacción y no vuelve. Valida la identidad `cantidad × precio + costos = total` y avisa si el OCR no cuadra. Posiciones con costo promedio ponderado, concentración de cartera y cuánto te sale operar.
- **Indicadores y ritmo diario en el Panel.** Carga de deuda (DTI), ingreso comprometido, cobertura de fijos, tasa de ahorro, colchón en meses y deuda/ingreso — cada uno con semáforo y su umbral explicado. Arriba, "te queda $X por día" contra "venís gastando $Y por día".
- **Alertas nuevas nivel contador:** cuotas vencidas sin marcar, presupuesto diario, erosión (tus fijos suben más rápido que el sueldo), cierre de tarjeta cerca (comprar hoy vs mañana = 30 días de financiación), colchón bajo, concentración de gasto y costo de operar en inversiones.
- **Contraste.** Se midió el ratio real de 26 elementos en los dos temas componiendo el fondo a mano (las tarjetas son semitransparentes sobre un cielo con gradiente, así que el fondo efectivo cambia según la hora). Los peores estaban en 1,4:1 — las pestañas del tabbar eran casi invisibles. Ahora el mínimo es **4,66:1 en claro y 6,19:1 en oscuro**, todo AA.
  - Trampa encontrada: `transition: color` sobre una propiedad que resuelve `var()` hace que Chrome no re-evalúe al cambiar de tema. Las pestañas se quedaban con el color del tema anterior. Se sacó `color` de la transición.
- **Escritorio (rehecho).** El primer intento repartía las tarjetas en 3-4 columnas por auto-placement y quedaba peor que el celular: las alertas, marcadas como fila completa, medían **1321×570px** y te comían la pantalla antes del primer número; encima los `<details>` colapsados (1px de alto, ancho completo) cortaban la grilla y dejaban huecos. Ahora es un dashboard de dos columnas con roles: **izquierda los números** (hero, KPIs, ritmo, indicadores, tablas), **derecha el feed** (alertas con scroll propio, ingresos, ahorro, inversiones, tesis). Tres columnas arriba de 1800px.
  - Dos trampas de CSS Grid que costaron encontrar: sin `grid-auto-flow: dense` el hero caía a la fila siguiente y dejaba 645px de columna izquierda en blanco; y como las filas comparten alto, las alertas necesitan `grid-row: span 3` para ocupar su propio tramo vertical en vez de estirar la fila.
  - Resultado medido a 1730px: el hero pasó de y=997 a **y=352** (entra sin scroll) y el alto total del panel bajó de 4037 a **2857px**.
  - Las vistas de lista (Gastos, Cuotas, Notas) centran su contenido a 680px en vez de estirarse — una línea de 200 caracteres no se lee.
- **Registro de tesis y punto de equilibrio (`app/js/inversiones.js`).** Al cargar una compra anotás **por qué** comprás, a qué precio vendés, antes de cuándo y qué te haría estar equivocado. Escrito antes de saber el resultado, que es lo único que después distingue tener criterio de acordarse selectivamente de los aciertos.
  - **Punto de equilibrio**, matemática pura sin pronóstico: `X = P·(1+tasa)/(1−tasa)`, estimando el costo de salida con la tasa de entrada. Verificado: el neto al precio de empate da exactamente $0. Con la compra real de NFLX (40 a $2.448, 0,605% de costo) el empate está en **$2.478 — necesita +1,22% sólo para no perder**. Si sube 1%, se pierden $212.
  - Aviso cuando **tu precio objetivo está por debajo del punto de equilibrio**: aunque se cumpla exacto lo que pensás, perdés plata. Le pasó a la tesis de NFLX con objetivo $2.470.
  - **Scorecard**: de las tesis cerradas, cuántas dieron ganancia neta, resultado acumulado y comparación entre las que sostuviste +90 días y las que cerraste en −30. Con menos de 8 casos cerrados **no muestra veredicto** y lo dice: a esa altura cualquier resultado es suerte.
  - Alerta nueva: tesis que pasó su propio plazo y sigue abierta. No dice qué hacer — dice que llegó la fecha que pusiste vos.
- **Bosque.** Las islas vecinas se apagaban a opacidad 0,5 y el follaje fino se transparentaba: leía como "árbol roto", no como "está más atrás". Ahora la profundidad la da el desenfoque y la opacidad no baja de 0,72.
- **Bonsái (pendiente de render).** Encontrado el origen del follaje despegado: las almohadillas se centraban en la PUNTA de la rama, dejando un tramo de rama desnudo entre el tronco y el verde. Ahora se centran al 70% del recorrido anclaje→punta (`a.lerp(tip, 0.70)` en `especies_isla.py`). **No verificado: hay que re-renderizar.**

## Ahora
- [x] ~~Pegar la `service_role` en la credencial de n8n~~ — **hecho y verificado el 28/07.** El resumen semanal quedó **ACTIVO**: te llega todos los lunes a las 9 a keniburgues@gmail.com. Se mandó uno de prueba el 28/07 (revisá la casilla).
- [x] ~~Revocar el token de Supabase~~ — **decisión de Keni (28/07): queda activo a propósito, lo usa para otra cosa. No volver a pedirlo.**
- [x] ~~Los 6 gastos del agente de WhatsApp~~ — borrados el 28/07. **Regla oficial: los gastos reales son los de los resúmenes de Galicia y Mercado Pago.** Lo que el agente cargue por WhatsApp y no aparezca en un resumen, no cuenta.
- [ ] ~~Subir el CSV de tu tarjeta~~ — ya no hace falta para agosto: se cargó todo a mano desde las fotos de los resúmenes (28/07). Sigue siendo útil si querés automatizar los meses que vienen.
- [ ] **Mandar tu número de WhatsApp** (formato `54911XXXXXXXX@s.whatsapp.net`) — opcional: el nodo ya está en el workflow, desactivado. El mail no lo necesita.
- [ ] **Instalar la app en la PC**: Chrome/Edge → https://keniichino.github.io/kbl-app/ → ícono de instalar en la barra de direcciones.

## Notificaciones — qué anda y qué falta

Son tres canales distintos, no uno. Conviene no mezclarlos:

1. **Bandeja de alertas en el Panel** — ✅ andando. No pide permiso, no depende de nada, funciona offline.
2. **Notificación del sistema al abrir la app** — ✅ andando, hay que activarla una vez desde el botón "🔔 Activar avisos" del Panel. Sólo avisa cosas de nivel alto, máximo 2 por vez y con 8 horas de piso entre tandas. **En iPhone hace falta tener la app instalada en la pantalla de inicio** (Compartir → "Agregar a pantalla de inicio"): Safari no le da permiso a una pestaña común.
3. **Push con la app cerrada** — ❌ falta. El service worker ya sabe recibir el push (`sw.js`, handlers `push` y `notificationclick`); lo que no existe es **quién lo manda**. Dos caminos:
   - **n8n → mail o WhatsApp** (recomendado): reusa la instancia que ya te manda el resumen semanal. Un Schedule diario que corre las mismas reglas contra Supabase y manda un digest. Cero infraestructura nueva. Para WhatsApp falta sólo tu número en formato JID; para mail no falta nada.
   - **Web Push real** (VAPID + `web-push` en una Edge Function de Supabase + tabla de suscripciones + cron): es la notificación nativa de verdad, pero es un proyecto aparte y hay que probarlo sí o sí en tu iPhone.

## Cuando puedas
- [ ] **Configurar el Modo Concentración en iOS**: Ajustes → Concentración → "+" → crear modo "Foco" → silenciar Instagram/TikTok/etc. Se activa desde el Centro de Control al plantar.
- [ ] **Recomendado**: revisá la carpeta `C:\Back Up\...\add ons y apss craked` — evaluá si vale el riesgo de tener activadores craqueados en una máquina con credenciales de trabajo.

## Pendiente en el crecimiento por etapas (Fase B)
- [x] ~~**Bonsái**: follaje despegado del tronco~~ — **cerrado el 08/08, renderizado y verificado.** El follaje nunca estuvo despegado: el displace de corteza (0.075) era más grande que el radio del tronco arriba (0.058) y de las ramas (0.011), los daba vuelta del revés y desaparecían del render. Se veía como almohadillas flotando porque se había borrado la rama que las sostenía. Ya crece por geometría real en las 4 etapas (ver el detalle arriba).
- [ ] **Flor**: quedó afuera porque su geometría final (la rosa) la arma `render_species.py` reemplazando la cosmos, así que atenuar el `.blend` no la toca. Necesita que la rosa se pueda escalar desde ese script.
- [ ] **Vuelta fina**: hoy la etapa joven es la planta madura atenuada (escala + menos hojas + hojas proporcionalmente más grandes + sin frutos). Un árbol joven de verdad tiene además el tronco proporcionalmente más fino y menos ramas — eso pide tocar cada `build_*()` de `especies_isla.py`.
- [ ] Las sombras de contacto del suelo no se achican con el árbol (la del tronco queda un poco grande en las etapas tempranas).

Regenerar etapas: `bash blender/render_etapas.sh` (~90 min, Cycles GPU).

## Cruce contra los resúmenes (28/07/2026)
Se cruzaron los tres resúmenes de agosto 2026 (Mercado Pago, Galicia Mastercard 7541 y Galicia Visa 6255) contra la base. Resultado:

- **Mercado Pago**: las 5 cuotas estaban las 5 y correctas. Se corrigió `fecha_primer_venc` de 13/08 a **10/08**, que es el vencimiento real.
- **Galicia Visa**: faltaban **20 consumos por $360.881,55** (todo lo posterior al 16/07). Cargados.
- **Galicia Mastercard**: faltaban ADOBE y MERPAGO*MELI. Cargados. Los 4 EDUCACIONIT del resumen están consolidados en una sola fila de $81.358 (la suma real es $81.358,16).
- **Dólares**: se cargaron los 10 consumos en USD. El total por tarjeta da **exacto** contra el resumen (U$D 8,09 en la Mastercard, U$D 30,16 en la Visa).
- **Cuota MERPAGO*MERCADOLIBRE $23.213,19 (2 de 9)**: era una compra devuelta (confirmado por Keni) — el reverso de -$23.213,19 del 13/07 la cancela. No se carga, y las 7 cuotas restantes no se van a cobrar.
- **Los 6 gastos del 26/07 que cargó el agente de WhatsApp** ($96.500 en total) no corresponden a ningún movimiento de los resúmenes: son montos redondeados a mano. Quedan pendientes de confirmar (ver arriba).

**Las tres tarjetas cierran al centavo contra el resumen** (`cuotas`, estado activa):

| tarjeta | app | resumen | dif |
|---|---|---|---|
| Galicia Visa 6255 | $939.861,61 / U$D 30,16 | ídem | $0,00 |
| Galicia Mastercard 7541 | $600.848,82 / U$D 8,09 | ídem | $0,00 |
| Mercado Pago | $383.889,47 | ídem | $0,00 |

Para llegar ahí se completaron los consumos de un pago en `cuotas` (todo consumo con tarjeta tiene que estar en el monto a pagar, sea en cuotas o de un pago) y se corrigieron a valor exacto 9 montos que estaban redondeados al peso.

**Criterio acordado — `gastos` y `cuotas` no son redundantes.** Un consumo de un pago va en las dos tablas a propósito: `gastos` registra **cuándo gastaste**, `cuotas` **cuándo lo pagás**. Los dos números tienen que existir. Lo que hay que evitar es que un mismo cálculo sume las dos tablas.

## Decisiones pendientes
- [ ] Multi-usuario real (login) — a futuro, para cuando tus amigos usen la app cada uno con su cuenta.
- [ ] Migrar el proyecto Supabase del trabajo (APP - AIAP) fuera de tu cuenta personal — conversación con la empresa.

## Estado de los módulos (resumen)
- **Foco**: timer + isla 3D girable + vista previa 3D en pantalla de inicio. El árbol crece por **etapas de geometría reales** (4 turntables por especie: brote → joven → crecido → maduro), mezcladas con el mismo crossfade que usa el giro. La isla queda del mismo tamaño en las 4 y crece sólo la planta — antes se escalaba el canvas entero, o sea que "crecía" también el suelo. Hecho en **arbolito, roble y sakura**; bonsái y flor siguen creciendo por escala (ver abajo).
- **Bosque**: catálogo de 5 especies (sakura, arbolito, roble, flor, bonsai) con visor 360 fluido (crossfade). Ronda 3/4 de calidad 3D cerrada (2026-07-18): estilo low-poly redondeado (bevel + shading suave) en las 5, sin clipping ni objetos invisibles verificado en los 36 frames de cada turntable, Flor rediseñada sobre fotos reales de Cosmos bipinnatus, e isla propia por especie (bonsai=maceta zen, sakura=musgo de bosque, roble=rocas+raíces expuestas, arbolito=pradera pulida, flor=cantero). Ronda de pulido (2026-07-19) cerrada también: glare/bloom sutil de compositor en las 5 (ver `PROMPTS_EXPERTOS.md`), íconos PWA regenerados desde el hero nuevo de sakura, margen del roble re-confirmado sin clipping en varios ángulos. Detalle en `PROMPTS_EXPERTOS.md`.
- **Gastos**: carga rápida, categorías, sync en la nube, con login + RLS (cada cuenta ve solo lo suyo). **Se puede cargar en pesos o en dólares** (selector al lado del monto, arranca en pesos). Los dólares nunca se suman a los pesos: van en su propia línea, en la app y en el mail semanal.
- **Notas**: lista + editor con autosave, sync en la nube.
- **Cuotas**: proyección de los próximos meses por tarjeta.
- **Panel** (nuevo, 05/08): la foto financiera del mes. Dos bases de cálculo que nunca se mezclan — **Caja** (lo que sale del bolsillo: fijos + suscripciones + cuotas + gastos sin tarjeta) y **Consumo** (fijos + suscripciones + todos los gastos, sin cuotas), porque `gastos` y `cuotas` miden cosas distintas y sumarlas duplica. Incluye: barra de composición del ingreso, 4 KPIs con sparkline de 6 meses, gastos fijos con historial mes a mes (qué subió y cuánto), suscripciones con anualizado y costo real de las que están en dólares, deuda (saldo, mes pico, cuándo te liberás), ahorro (stock, tasa, meta) y flujo/proyección a 6 meses. Se puede navegar mes por mes hacia atrás.
  - Datos nuevos en Supabase: tablas `recurrentes` (ingresos, fijos y suscripciones, con `historial` jsonb mes→monto) y `ahorros` (movimientos). Con RLS + realtime, igual que el resto. Script: `supabase/panel-setup.sql`, ya aplicado.
  - Si cargás un gasto cuya descripción coincide con el nombre de un concepto fijo, el panel lo toma como ese concepto (no lo cuenta dos veces) y usa el monto real para el historial.
- **Alertas automáticas** (arriba del Panel, `app/js/detecciones.js`): suscripciones y fijos que están en tus gastos pero no declarados (se agregan con un toque y se llevan su historial), aumentos de un concepto contra el mes anterior, días caros o gastos grandes contra tu día normal, ritmo del mes contra el mismo tramo del mes pasado, cargos duplicados, vencimiento de resumen a menos de 6 días, fijos que solés cargar y este mes faltan, suscripciones que dejaron de cobrarse, % del ingreso ya comprometido y meses que cierran en rojo. Cada alerta se descarta y no vuelve.
  - **Catálogo de comercios** (`app/js/catalogo.js`): traduce lo que escupe el resumen a algo con sentido. Saca los prefijos de pasarela (`MERPAGO*`, `DLO*`, `PAYU*AR*`, `SIPAGO *`, `WL *`) y reconoce ~90 comercios argentinos. Dos datos por comercio: en qué categoría cae y si es algo que se repite (suscripción / fijo / suelto).
    - **Al cargar un gasto**, la categoría se pone sola con la descripción ("Coto" → 🛒 Súper). Si tocás un chip a mano, deja de meterse hasta el próximo gasto.
    - **Suscripciones conocidas se detectan al PRIMER cargo**, sin esperar tres meses: Netflix es Netflix la primera vez que aparece.
    - Categoría nueva **🔁 Servicios** para streaming, software, telefonía e internet, que antes caían todos en "Otros".
    - **Gastos hormiga** 🐜: cuenta las compras chicas de los últimos 30 días (ventana móvil, no mes calendario, para que sirva el día 3 igual que el 28). Deja afuera súper, casa y salud, que son necesidades. Te dice cuánto suman, qué porcentaje del ingreso es y cuánto da al año.
    - Alerta de **recategorización masiva**: los gastos que quedaron en "Otros" pero el catálogo reconoce se acomodan de un toque (nunca toca una categoría que pusiste vos a propósito).
  - **Criterio: precisión antes que cantidad.** Una alerta falsa cuesta más de lo que gana una cierta. Por eso, por ejemplo, una suscripción tiene que cobrarse ~1 vez por mes (si no, el súper entraría), y los conceptos ya declarados no cuentan para "día caro" (si no, el alquiler haría caro al día 10 de todos los meses).
- **Cotización del dólar** (`app/js/cotizacion.js`, 28/07): al lado de cada monto en USD aparece el equivalente en pesos. Fuente `dolarapi.com` (pública, sin key). Default **MEP**, porque es a lo que comprás en Mercado Pago — el blue es efectivo y no es tu precio. Tocás el equivalente y cicla MEP → Blue → Cripto, y se acuerda. Sin internet muestra el último valor guardado. En el resumen de tarjeta compara contra el **dólar tarjeta**: te dice cuánto ahorrás por cubrir los USD con dólares propios en vez de dejar que te los cobre el banco. Lo mismo va en el mail semanal.
- **n8n** (`KBL - Resumen Semanal Gastos`, id `fwNr0Wokpp1qV0oU`): **ACTIVO desde el 28/07**. Lunes 9:00 (hora de Buenos Aires) → gastos de los últimos 7 días + cuotas activas → mail HTML por Gmail a keniburgues@gmail.com. Pesos y dólares van separados en las dos secciones. Probado end-to-end contra los datos reales: los cuatro totales (gastos ARS/USD y cuotas de agosto ARS/USD) dan exactos contra SQL.
  - El código del nodo "Armar resumen" vive en `n8n/resumen_semanal_code.js`; se sube con `node n8n/actualizar_resumen_semanal.js` (`--sin-mail` apaga el envío para probar, `--dump` sólo imprime el JSON).
  - **Trampa que ya nos mordió:** los nodos HTTP llevan `executeOnce: true`. Sin eso, "Traer cuotas" se ejecuta una vez **por cada gasto** de entrada y el total del mes sale multiplicado (dio ×22 el 28/07: $42M en vez de $1,9M).
