# Tareas de Keni — KBL App

> Ver [`PROMPTS_EXPERTOS.md`](PROMPTS_EXPERTOS.md) para el estado completo del proyecto y prompts listos para abrir en chats nuevos por tema (3D/Blender, crecimiento real, backend/login, n8n, producto).

## Ahora
- [ ] **Pegar la `service_role` en la credencial de n8n** — es lo único que traba el resumen semanal por mail (2 minutos):
  1. https://supabase.com/dashboard/project/jcsenhpuvvbxcxapoaia/settings/api-keys → copiar la **service_role** (la secreta, NO la anon).
  2. https://n8n.kblia.cloud → Credentials → **KBL Supabase (Header Auth)** → Name: `apikey`, Value: la service_role → Save.
  3. Avisame y activo el workflow. **No la pegues en el chat.**
- [ ] **Revocar el token de Supabase** que anduvo pegado en el chat: https://supabase.com/dashboard/account/tokens → borrar.
- [ ] **Confirmar los 6 gastos del 26/07 que cargó el agente de WhatsApp** ($96.500) — no coinciden con ningún movimiento del resumen y sus montos se parecen sospechosamente a los consumos reales de ese día ($98.157). Si son los mismos cargados a ojo, hay que borrarlos. No los toqué porque los montos no son idénticos y no quise borrar plata por sospecha.
- [ ] ~~Subir el CSV de tu tarjeta~~ — ya no hace falta para agosto: se cargó todo a mano desde las fotos de los resúmenes (28/07). Sigue siendo útil si querés automatizar los meses que vienen.
- [ ] **Mandar tu número de WhatsApp** (formato `54911XXXXXXXX@s.whatsapp.net`) — opcional: el nodo ya está en el workflow, desactivado. El mail no lo necesita.
- [ ] **Instalar la app en la PC**: Chrome/Edge → https://keniichino.github.io/kbl-app/ → ícono de instalar en la barra de direcciones.

## Cuando puedas
- [ ] **Configurar el Modo Concentración en iOS**: Ajustes → Concentración → "+" → crear modo "Foco" → silenciar Instagram/TikTok/etc. Se activa desde el Centro de Control al plantar.
- [ ] **Recomendado**: revisá la carpeta `C:\Back Up\...\add ons y apss craked` — evaluá si vale el riesgo de tener activadores craqueados en una máquina con credenciales de trabajo.

## Pendiente en el crecimiento por etapas (Fase B)
- [ ] **Bonsái**: quedó afuera porque su follaje viene despegado del tronco (defecto anterior, ya anotado al hacer el encuadre automático) y achicarlo lo vuelve evidente. Hay que arreglar la geometría primero.
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
- **n8n** (`KBL - Resumen Semanal Gastos`, id `fwNr0Wokpp1qV0oU`): lunes 9:00 → lee gastos de los últimos 7 días + cuotas activas → arma un mail HTML → Gmail a keniburgues@gmail.com. Inactivo hasta que la credencial tenga la service_role (con la anon key devuelve 0 filas por RLS). El código del nodo "Armar resumen" vive en `n8n/resumen_semanal_code.js` y se sube con `node n8n/actualizar_resumen_semanal.js`.
