# Resúmenes de tarjeta → historial de la app

Scripts para convertir los PDF de los resúmenes en el historial que necesita el
Panel. Cubre **Galicia** (Visa + Mastercard) y **Mercado Pago**, que usan tres
formatos distintos. Todo local: los PDF no salen de la máquina.

## Uso

```bash
# --- Galicia (Visa + Mastercard) ---
# 1. Leer los PDF y verificar que cierren contra el total del banco
node tools/resumenes/parse-resumenes.js "C:/ruta/a/los/pdf/de/galicia"

# 2. Generar el SQL de suscripciones y fijos con su historial
node tools/resumenes/generar-sql.js

# --- Mercado Pago ---
# 3. Leer los PDF de MP y verificar contra sus subtotales
node tools/resumenes/parse-mp.js "C:/ruta/a/los/pdf/de/mp"

# 4. Generar el SQL de las cuotas de MP según el último resumen
node tools/resumenes/generar-cuotas-mp.js
```

Cada parser imprime el cruce contra el total que declara el propio resumen.
**Si algo no cierra, no cargues nada**: significa que el parser se está
comiendo consumos y el historial va a salir mal.

Requiere `pdftotext` (viene con Git Bash en `/mingw64/bin`) y Node.

## Lo que costó hacer que cierren los 10 resúmenes

Cuatro trampas, todas encontradas comparando contra el total que imprime el
banco. Sin ese cruce, cualquiera de las cuatro pasa desapercibida y el
historial sale mal sin que nada avise:

1. **Los dos plásticos usan formatos distintos.** Visa: `31-05-26 * ZARA 03/03 000909 35.336,66`. Mastercard: `10-Jul-26 APPLE.COM/BILL (USA,USD, 2,99) 00698 2,99`, con fecha en letras y el importe original entre paréntesis.

2. **`NN/NN` significa dos cosas según la sección.** En `COMPRAS DEL MES` y `DEBITOS AUTOMATICOS` es el período (`07/26` = julio 2026); en `CUOTA DEL MES` es la cuota (`02/09`). Confundirlas contaba compras del mes como cuotas.

3. **Dedup por comprobante, no por (fecha + comercio + monto).** Las cuatro cuotas de EDUCACIONIT del 31/03 tienen dos pares de importes idénticos: un dedup "razonable" borraba dos y faltaban exactamente $40.679 en cuatro de los cinco meses.

4. **Visa no imprime "TOTAL CONSUMOS DEL MES".** Hay que derivarlo:
   `consumos = TOTAL A PAGAR − percepciones − DB.RG 5617 + DEV.IMP. RG 5617`.
   El `DB.RG 5617 30%` (impuesto sobre consumos en dólares) explicaba las
   diferencias de $60.901 en abril, $11.006 en junio y $8.979 en agosto.

## Dos decisiones de criterio

**El mes va por fecha del consumo, no por período del resumen.** El cierre cae
a mitad de mes, así que un resumen puede traer dos cargos del mismo servicio y
el siguiente ninguno. Con Personal Flow pasaba: agrupado por resumen mostraba
$79.986 en junio y nada en julio; por fecha real es $34.020 en mayo y $45.966
en junio, que es la curva verdadera.

**Netflix se normaliza al precio de lista.** Viene cobrado de dos formas: por
DLocal en Visa el importe ya trae IVA y percepciones ($30.198), e
internacional en Mastercard viene limpio ($19.999) — y $19.999 × 1,51 = $30.198,49
exacto. Sin normalizar, la app avisaba "Netflix bajó 34%", que es falso: no
bajó el precio, cambió quién lo cobra.

## Mercado Pago: el año no existe en el PDF

Formato más limpio que el de Galicia (subtotal por sección, cuota como "5 de 6"),
pero con una trampa: **las fechas no tienen año**. Ni las de los consumos ni la
del cierre — el PDF dice "Este es tu resumen de julio" y "Fecha de cierre 5 de
julio", y tampoco está en los metadatos.

Por eso `parse-mp.js` recibe el año por archivo, en el mapa `ANIOS`. El de los
tres del lote actual se confirmó **encadenando saldos**: el "Total a pagar del
periodo anterior" del resumen de agosto ($465.008,58) es el "Total a pagar" del
de julio, y el de julio ($452.442,58) el de junio. El de enero no encadena con
nada: queda asumido como enero 2026 por descarte.

Dentro de un resumen, un consumo cuyo mes es POSTERIOR al mes de cierre es del
año anterior: en el de agosto un `21/feb` es de febrero del mismo año, pero en
el de enero un `24/dic` es de diciembre del año pasado.

## Pendiente

- **Dólares de Visa.** Los pesos cierran en los 5 resúmenes, pero los totales
  en USD no (leo US$10,60 contra US$30,60 en agosto). Falta identificar en qué
  sección lista Visa los consumos en dólares. No afecta el historial en pesos.
- **Recibos de sueldo.** Sólo hay tres (ago-2025, SAC dic-2025, jun-2026), así
  que la curva de ingreso queda con huecos. Faltan marzo a mayo y julio-agosto
  de 2026.
- **Meses intermedios de MP.** Hay resúmenes de enero, julio y agosto; entre
  febrero y junio no hay datos. El estado actual de las cuotas sí se reconstruye
  (es lo que usa la app), pero el historial mes a mes de MP no.
