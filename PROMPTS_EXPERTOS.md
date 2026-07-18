# KBL App — estado del proyecto y prompts para continuar

Última actualización: 2026-07-18 (cierre de la ronda de calidad 3D — ver
sección "Ronda 3/4 cerrada" debajo del Prompt 1). Este documento es para abrir **chats nuevos** (sin memoria de la sesión donde se escribió) y seguir trabajando en un tema puntual. Cada prompt de abajo es autocontenido: pegalo entero en un chat nuevo de Claude Code con acceso a esta carpeta.

---

## Panorama general — qué hay y qué falta

**Hecho y en producción** (https://keniichino.github.io/kbl-app/, repo github.com/keniichino/kbl-app, cuenta personal keniichino):
- App PWA sin build (HTML/CSS/JS planos) con 4 módulos: Foco (timer + árbol/isla 3D), Bosque (catálogo + estadísticas + visor 360), Gastos, Notas.
- 5 especies de islas 3D flotantes (sakura, arbolito, roble, flor, bonsai) generadas por script de Blender headless, renderizadas como turntables de 36 fotos (WEBP) y mezcladas en un `<canvas>` con crossfade para que el giro se sienta fluido.
- Crecimiento "3D" en Foco: hoy es **solo escala** del modelo final (no etapas reales de crecimiento) — pendiente mejorar.
- Sync en tiempo real con Supabase para Foco, Gastos y Notas (sin login todavía — tablas abiertas).
- Diseño estilo iOS: SF Pro, controles segmentados, diálogos de confirmación propios, paneles vidriados.
- Un workflow de n8n armado (resumen semanal de gastos por WhatsApp) — creado pero inactivo, falta un dato de Keni para prenderlo.

**Bloqueo de Blender:** resuelto. En la sesión del 2026-07-18 `blender.exe --background --version` arrancó sin problemas (el apagado abrupto que lo rompía ya no afecta tras el reinicio de la PC). Si vuelve a pasar, mismo diagnóstico: pedirle a Keni que reinicie la PC completa y probar ese comando antes de nada.

**Pendiente, en orden de lo que Keni fue pidiendo:**
1. ~~Terminar la ronda de calidad 3D en curso (ver Prompt 1)~~ — **CERRADA el 2026-07-18**, ver detalle debajo del Prompt 1. Queda un pulido menor abierto (glare/bloom de compositor, íconos PWA regenerados desde el nuevo hero de sakura) para quien quiera afinar más, pero no bloquea nada.
2. Etapas de crecimiento reales, no solo escala (Prompt 2) — ahora sí desbloqueado, la ronda de calidad de los modelos base ya cerró.
3. "Bosque acumulativo": que los árboles ya ganados aparezcan de fondo en la escena (Prompt 5) — sin diseñar todavía.
4. Multi-usuario real con login (Prompt 3) — Keni quiere que en el futuro sus amigos usen la app cada uno con su cuenta.
5. Terminar automatizaciones de n8n (Prompt 4) — activar el resumen semanal, e importar el CSV de la tarjeta de Keni cuando él lo suba a `gastos-import/` (todavía no lo hizo).

---

## PROMPT 1 — Arte 3D / Blender (el bloque más activo ahora mismo)

```
Sos un director de arte 3D senior con años de experiencia en low-poly
estilizado para apps móviles premium (pensá Monument Valley, Alto's
Odyssey, Assemble with Care) — dominás Blender scripting headless en
Python, shading procedural, y sistemas de partículas/geometry nodes
para follaje realista.

Proyecto: app personal "KBL" de Keni, en
G:\Mi unidad\KBL APP Personal\. Blender 5.2 instalado en
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe".

ANTES QUE NADA: probá que Blender arranque
("blender.exe --background --version"). La última sesión terminó con
Blender crasheando al instante (posible estado de driver gráfico roto
tras un apagado abrupto) — si sigue roto, pedile a Keni que reinicie
la PC por completo antes de seguir.

## Qué existe hoy
`blender\especies_isla.py` es el generador único parametrizado de las
5 especies (CLI: `-- --especie sakura|arbolito|roble|flor|bonsai
--seed N [--test] [--engine cycles|eevee] [--samples N]`). Cada
especie es una isla flotante (disco de pasto + cono de tierra
invertido) con el árbol/flor encima. El follaje YA fue rediseñado una
vez: pasó de "racimos de pocas esferas grandes" (se veía como nube de
espuma) a sistemas de partículas HAIR que instancian cientos/miles de
hojas o pétalos individuales chicos — mirá los heroes actuales
(`blender\turntable_<especie>\hero.png`) antes de tocar nada, son la
vara a superar, no el punto de partida ingenuo.

Estándar técnico fijo (NO romper): cámara en (0, -12.193, 0.962),
lente 50mm; radio de pasto ~2.48; salida WEBP RGBA calidad 85,
800x1000px, fondo transparente (film_transparent), view_transform
'Standard' (AgX desatura los pasteles); 36 frames por turntable (un
Empty pivot rotando 10°/frame); motor Cycles (se comparó contra EEVEE
y ganó por mejor luz/sombra, a costo aceptable). Turntables van a
`blender\turntable_<especie>\00.webp`...`35.webp` + `hero.png`
(frame 0 en PNG); `.blend` actualizado en `blender\<especie>_isla.blend`.

## Lo que falta cerrar (pedido explícito de Keni, textual)
1. **Redondear el estilo**: "no sea tan low poly literal, sino que sea
   más redondeada". Probar shade_smooth() en vez de flat shading en
   troncos/hulls/islas, Bevel en aristas duras (borde del disco de
   pasto, cono de tierra), quizás Subdivision Surface leve. Buscar el
   punto medio entre "sigue siendo low-poly cute" y "no parece una
   demo técnica de facetas".
2. **Rediseñar la Flor con fotos reales**: a Keni no le gusta la
   actual. Buscá (WebSearch/WebFetch, después Read de las imágenes
   para mirarlas de verdad) referencias reales de una flor de jardín
   tipo Cosmos bipinnatus u otra similar. La última investigación
   encontró: pétalo real ancho y chato con 3 muescas onduladas en la
   punta (no una punta única tipo "cometa"), un solo anillo de 8
   pétalos con leve superposición en la base, centro con anillos
   concéntricos densos de florecitas tubulares con anteras oscuras
   asomando (no una esfera lisa con bultos).
3. **Isla propia por especie** (hoy las 5 comparten la misma isla
   genérica). Ideas ya dadas por Keni y el diseño previo:
   - **Sakura**: al ser un árbol japonés, sumarle una MONTAÑA A LO
     LEJOS en el fondo, estilo Monte Fuji (silueta simple en el
     horizonte, nieve en la punta).
   - **Flor**: una MACETA simple de cerámica en vez de la isla
     flotante genérica.
   - **Roble**: terreno más rocoso, raíces gruesas asomando del borde.
   - **Arbolito**: pradera fresca y simple, sensación de recién
     plantado.
   - **Bonsai**: ya tiene tronco en curva S + almohadillas + piedra
     zen — pulir en esa línea (más musgo, sensación de jardín japonés).
   - Si una especie cambia de "isla flotante" a otra base (ej. la
     maceta de la flor), el encuadre puede ajustarse para ESA especie
     puntual, pero el tamaño del sujeto principal dentro del cuadro
     de 800x1000 debe seguir siendo comparable a las otras 4 (el
     selector de la app alterna entre especies y no debe saltar de
     escala de forma chocante).
4. **Pulido general "más iOS/premium"**: Keni pidió explícitamente
   subir el nivel de realismo/fluidez/pulido en las 5, no solo aplicar
   parches puntuales. Experimentá con glare/bloom sutil en el
   compositor, coat/sheen en materiales, mejor volumen de luz.

NO toques etapas de crecimiento (eso es el Prompt 2, pausado a
pedido de Keni hasta que este bloque cierre).

## Método
Iterá especie por especie, LEYENDO los renders con la herramienta
Read entre cada intento (usá `--test` para un solo ángulo rápido antes
de gastar tiempo en el turntable de 36 frames completo). Sin límite de
iteraciones ni de tiempo — Keni explícitamente pidió "dedicá todo,
tomate el tiempo que haga falta". Verificá clipping por alpha en los
píxeles de borde en cada resultado final, en varios ángulos del
turntable, no solo el frame 0.

CRÍTICO: esperá SIEMPRE de forma síncrona (dentro de tu propia sesión,
con sleeps/polling) a que cada render termine antes de seguir o de
cerrar tu turno. Rondas anteriores fallaron por lanzar el render como
proceso de Windows aparte y terminar el turno antes de que acabara,
dejando a Keni esperando sin aviso.

## Integración final (cuando termines)
1. Copiar los WEBP nuevos: `cp blender/turntable_<sp>/*.webp
   app/assets/360/<sp>/` para cada especie tocada.
2. Si cambió el hero de sakura, regenerar íconos de la PWA con un
   script tipo (ajustá rutas): carga `blender/turntable_sakura/hero.png`
   con System.Drawing, la dibuja centrada sobre un fondo con
   gradiente, y guarda `app/icons/icon-512.png`, `icon-192.png`,
   `apple-touch-icon.png`.
3. Bump de versión de caché en `app/sw.js` (buscar `const CACHE =
   'kbl-vN'` y subir el número).
4. Probar en el navegador (preview local, puerto 4173, configurado en
   `.claude/launch.json` como "kbl-app") que las especies tocadas
   carguen sin error en el selector de Bosque.
5. Commit + push al repo (ya logueado como keniichino vía gh CLI en
   esta máquina — el helper de credenciales está seteado en el
   `.git/config` de esta carpeta específica, no toques la config
   global). El push dispara el deploy automático a GitHub Pages
   (workflow ya configurado, ~15-20s).

Reportá al final: qué técnica funcionó para cada prioridad, iteraciones
totales, y cuál de las 5 especies quedó mejor / cuál sigue con margen.
```

### Ronda 3/4 cerrada (2026-07-18) — qué se hizo

Todo en `blender/especies_isla.py`, re-renderizado en Cycles GPU/OPTIX 160
samples, copiado a `app/assets/360/<especie>/`, cache de la PWA subida a
`kbl-v15` (`app/sw.js`), verificado en preview local (todas las especies
cargan sus 36 frames con 200 OK, sin errores de consola), commit + push
hecho a `main`.

1. **Redondeo (prioridad 1, las 5 especies)**: nuevo helper `add_round_bevel`
   (Bevel modifier real + `harden_normals` + shading suave) aplicado a disco
   de pasto, cono de tierra, piedras, bellotas y maceta del bonsai. Las
   hojas/pétalos (`make_petal_mesh`, usado por las 5 especies) pasaron a
   shading suave (antes quedaban flat-shaded, se veían como origami). Nada
   de esto tocó la cantidad de facetas grandes (silueta low-poly intacta),
   solo se suavizaron los bordes.
2. **Clipping/invisibles (prioridad 2)**: el script ya traía un chequeo
   automático (`check_border_alpha` sobre los 36 frames + margen analítico
   vs. el frustum de cámara). Con el render final de esta ronda, **las 5
   especies dieron `WORST BORDER ALPHA: 0.0` (sin clipping en ningún
   frame)**. El ROBLE sigue con margen superior justo (`0.08` unidades,
   contra `~0.2-1.5` de las otras) — es un margen ajustado pero POSITIVO y
   confirmado sin clipping real en los 36 ángulos; si alguien quiere más
   colchón a futuro, achicar un poco la altura de la copa. No se encontraron
   materiales con backface culling activado ni normales invertidas en
   ninguna de las 5 (se revisó especialmente el tronco en curva S del
   bonsai, convertido a mesh para el displace de corteza — normales
   correctas en los 2 ángulos inspeccionados).
3. **Flor rediseñada (prioridad 3)**: se bajaron y miraron fotos reales de
   Cosmos bipinnatus (Wikimedia Commons, licencia libre) antes de tocar la
   geometría. Cambios: pasó de 2 anillos tipo dalia/zinnia (8 + 6 pétalos) a
   **1 solo anillo de 8 pétalos** anchos tipo paleta, con **muesca/hendidura
   en la punta** (parámetro nuevo `notch` en `make_petal_mesh`, arma 2
   lóbulos chicos en vez de un pico único), casi planos en vez de caídos
   (la cosmos real no se pliega tanto como una dalia). Centro más chico y
   compacto + **aro de "anteras" oscuras con punta clara** (conos finos +
   esferita crema) copiando el detalle que se ve clarito en las macro fotos
   de referencia.
4. **Identidad por isla (prioridad 4, las 5)**: nuevo dict `SUELO` (color de
   disco por especie) + funciones `deco_<especie>()`: **bonsai** = aro de
   cerámica (torus) + arena/grava con rastrillado simulado vía material
   (Wave RINGS + Bump, sin geometría extra); **sakura** = musgo denso
   (`add_moss_tuft`, mismo truco de racimos chatos que ya usaba el bonsai) +
   una piedra grande cubierta de musgo; **roble** = terreno rocoso + 5
   raíces gruesas expuestas (curvas NURBS con la misma técnica de corteza
   por displace que el tronco) asomando del borde, más piedras y musgo;
   **arbolito** = la pradera genérica de siempre, solo pulida (redondeo +
   bevel, sin rediseño de props, tal como pedía la prioridad); **flor** =
   tierra oscura de cantero + borde de 15 piedras bajas en anillo + hojitas
   sueltas. El radio de isla (`GRASS_R`) y la cámara quedaron exactamente
   iguales en las 5 — el selector de la app no salta de escala.

**No se llegó a hacer** (queda para quien retome): pulido de compositor
(glare/bloom sutil, mencionado como prioridad 4 del prompt original de esta
ronda) y regenerar los íconos de la PWA (`app/icons/icon-*.png`,
`apple-touch-icon.png`) desde el nuevo hero de sakura — siguen siendo los
del hero viejo, no rotos pero desactualizados.

---

## PROMPT 2 — Etapas de crecimiento real (Fase B, hoy pausada)

```
Sos un creative technologist senior especializado en animación
procedural y experiencias de "crecimiento orgánico" en apps (pensá
juegos idle/incremental tipo Two Dots, Alto's Odyssey, o el propio
Forest app de productividad) — dominás técnicas de interpolación
visual entre assets pre-renderizados.

Proyecto: app "KBL" de Keni en G:\Mi unidad\KBL APP Personal\.

## Contexto del problema
Hoy, cuando Keni hace una sesión de foco, la app muestra la isla 3D de
la especie correspondiente (turntables pre-renderizados en Blender,
ver `app/assets/360/<especie>/00-35.webp`) creciendo — pero el
"crecimiento" es LITERALMENTE escalar el modelo YA COMPLETO de chico a
grande (`escalaCrecimiento(p)` en `app/js/app.js`, curva
`0.12 + 0.88 * p^0.55`). Keni lo notó de inmediato: "la flor va
escalando, no va creciendo real". Quiere geometría distinta en cada
etapa (un brote, un tallo corto, una copa a medio formar), no una foto
final encogida.

ESTA TAREA ESTÁ PAUSADA HASTA QUE LA RONDA DE CALIDAD DE LOS MODELOS
BASE CIERRE (ver PROMPT 1) — Keni fue explícito: "primero tendríamos
que tener bien los modelos". Si arrancás este prompt en un chat nuevo,
preguntale a Keni si esa ronda ya cerró antes de invertir tiempo acá.

## Cómo está armado hoy (para no romper nada)
- `app/js/viewer360.js`: visor 360 en `<canvas>` que mezcla
  (crossfade) los dos frames de ROTACIÓN vecinos según la posición
  fraccional del dedo — es lo que hace que el giro se sienta fluido
  en vez de "tac tac tac". Función clave: `frameEnRango(f)` calcula
  índice + fracción.
- `app/js/app.js`: `cargarIsla3D(durationMin)` carga el set de 36
  frames de la especie correspondiente
  (`ISLA_POR_MIN = {15:'flor',25:'arbolito',50:'roble',90:'sakura',
  120:'bonsai'}`); `tick()` llama `renderTree(svg,p,...,{soloCielo:
  true})` para el fondo 2D (cielo/luna/colinas) y aplica la escala al
  `<canvas>` vía `focoCanvas.style.transform`.

## La tarea
Reemplazar el escalado por generación real de 4-5 ETAPAS de geometría
por especie (semilla/brote → joven → media → casi completa →
completa), cada una renderizada como su propio turntable de 36 frames
en Blender (usando `blender/especies_isla.py` como base, parametrizado
para aceptar una etapa de crecimiento además de `--especie`). El costo
de render es bajo (~30s-3min por set de 36 frames según motor/detalle),
así que 5 etapas × 5 especies es viable en minutos de cómputo — el
costo real es DISEÑAR geometría intermedia creíble por especie, no
el tiempo de render.

Para la reproducción en la app: extender `viewer360.js` para
interpolar en DOS dimensiones (ángulo de rotación × etapa de
crecimiento) en vez de solo una — mismo mecanismo de crossfade que ya
funciona para rotación, aplicado también entre el frame N de la etapa
actual y el frame N de la etapa siguiente a medida que `p` avanza.
Portá la lógica de "elegir el set de imágenes correcto según p" desde
`escalaCrecimiento` (que hoy solo calcula un número de escala) hacia
algo que elija/mezcle CARPETAS de assets.

Considerá el peso: 5 etapas × 5 especies × 36 frames × ~30-80KB por
WEBP puede sumar varios MB extra en total — aceptable para una PWA
cacheada, pero verificalo y avisale a Keni si se vuelve pesado.

Mantené intacto todo lo que ya funciona: el crossfade de rotación
existente, el fondo 2D de cielo (`soloCielo:true` en tree.js), la
vista previa en la pantalla de inicio (`mostrarPreviewIdle` en
app.js), y el resto de los módulos (Gastos, Notas, Bosque).
```

---

## PROMPT 3 — Backend: multi-usuario real con login

```
Sos un ingeniero backend senior especializado en Supabase (Postgres +
Auth + Row Level Security) y arquitecturas multi-tenant para apps
personales que escalan a multi-usuario.

Proyecto: app "KBL" de Keni en G:\Mi unidad\KBL APP Personal\.
Supabase project "KBL APP" (ref `jcsenhpuvvbxcxapoaia`, us-east-1).

## Estado actual (el problema a resolver)
Las tablas `foco_sessions`, `foco_active`, `gastos`, `notas` están
TODAS abiertas — sin autenticación, sin RLS que filtre por usuario.
La app usa una anon key PÚBLICA embebida en `app/js/config.js`
(el repo `github.com/keniichino/kbl-app` es público). Hoy funciona
porque es de uso personal de Keni, pero cualquiera con la key podría
leer/escribir esas tablas. Keni dijo explícitamente que a futuro
quiere que "ingresen personas y se guarden cada uno como si fuera su
sesión" — o sea, multi-usuario real, cada quien con sus propios datos.

## La tarea
1. Activar Supabase Auth — recomendado: magic link por email (sin
   contraseñas que gestionar, más simple para una app personal/de
   amigos).
2. Agregar columna `user_id uuid references auth.users` a las 4
   tablas (foco_sessions, foco_active necesita repensarse: hoy es una
   fila ÚNICA con id=1 compartida por "el dispositivo actual de
   Keni" — con multi-usuario debería ser una fila por usuario, o una
   tabla con user_id como parte de la key primaria).
3. Políticas RLS: cada usuario solo lee/escribe sus propias filas
   (`user_id = auth.uid()`).
4. UI de login/signup coherente con el estilo iOS ya establecido
   (SF Pro, paneles vidriados, diálogos propios en `app/js/dialog.js`)
   — pantalla simple de "ingresá tu email" + link mágico.
5. Actualizar `app/js/store.js` (la capa de sync) para incluir el
   usuario autenticado en todas las queries y en las suscripciones de
   Realtime — hoy asume una sola "sesión global" sin usuario.
6. Decidir y documentar: ¿qué pasa con los datos que Keni ya cargó
   (sesiones de foco, gastos, notas) sin user_id? Necesitan una
   migración para asignárselos a su cuenta una vez que exista.
7. Mantené el modo local-first (localStorage) como fallback offline —
   es una decisión de arquitectura ya validada en toda la app, no la
   descartes.

Verificá todo con pruebas reales (crear 2 usuarios de prueba, confirmar
que no se ven los datos entre sí) antes de dar por terminado, siguiendo
el mismo estándar de verificación end-to-end que se usó para el resto
de la app (nada de "debería funcionar", probarlo en el navegador con
las herramientas de preview).
```

---

## PROMPT 4 — n8n: terminar automatizaciones

```
Sos un ingeniero de automatización senior especializado en n8n, con
experiencia integrando APIs REST (Supabase/PostgREST), WhatsApp
Business (Evolution API) y modelos de IA para categorización de datos.

Proyecto: app "KBL" de Keni. Instancia n8n personal de Keni en
`https://n8n.kblia.cloud` (NO es infraestructura restringida de
Grupo Ceta, aunque comparte servidor con workflows de esa empresa —
Keni confirmó que es su instancia y que no hay conflicto en usarla
para esto). API REST pública funciona con header
`X-N8N-API-KEY: <token>` — el token (JWT) está en
`C:\Users\Kenichi Burgues\.claude\.mcp.json` bajo el server "n8n"
(campo `headers.Authorization`, quitarle el prefijo "Bearer " para
usarlo como valor de X-N8N-API-KEY).

## Lo que ya existe
Workflow **"KBL - Resumen Semanal Gastos"** (id `fwNr0Wokpp1qV0oU`),
creado pero INACTIVO a propósito. Lunes 9am → consulta la tabla
`gastos` de Supabase (proyecto KBL APP, ref `jcsenhpuvvbxcxapoaia`) →
agrupa por categoría con emojis → arma mensaje → lo manda por
WhatsApp reusando la credencial Evolution API ya existente
("Evolution account", id `9JFFoPXTUTITfw6p`, instancia `KeniMain`).
El nodo final "Enviar WhatsApp" tiene `remoteJid` en placeholder
literal `"PENDIENTE_NUMERO_WHATSAPP"` — necesita el número real de
Keni en formato `54911XXXXXXXX@s.whatsapp.net`. Pedíselo si no lo
tenés, actualizá ese nodo (PATCH `/api/v1/workflows/{id}`) y activalo
(`PATCH` con `active:true`, o `POST /api/v1/workflows/{id}/activate`
según la versión de la API).

Credencial de Supabase ya creada: "KBL Supabase (Header Auth)"
(id `OnoA45298Z6UvmmR`, tipo httpHeaderAuth con la anon key de KBL).

## Lo que falta
1. **Activar el resumen semanal** (arriba) — solo falta el número.
2. **Importar el CSV de la tarjeta de Keni**: preguntale si ya subió
   el archivo a `G:\Mi unidad\KBL APP Personal\gastos-import\` (la
   última vez que se le pidió, no lo había hecho). Si está: parsear
   el formato (bancos argentinos varían), mapear a la tabla `gastos`
   (columnas: monto, descripcion, categoria, fecha), e insertar via
   la REST API de Supabase. Las filas importadas NO van a tener
   categoría elegida por Keni — dejarlas con `categoria = null` o un
   sentinel como `'sin_categorizar'`.
3. **Categorización automática con IA**: construir JUNTO con el punto
   2 (no antes — no tiene sentido sin datos que categorizar). Workflow
   en n8n: Schedule Trigger periódico → query a Supabase
   `gastos?categoria=is.null` (o el sentinel elegido) → por cada fila,
   llamar a un modelo (Keni ya usa GPT-4o-mini en su agente de
   WhatsApp vía OpenAI, credencial ya existente en la instancia —
   reusala si tiene sentido, o proponé Gemini si el volumen justifica
   ahorro de costo) con el `descripcion`+`monto` para inferir una de
   las categorías fijas de la app (`comida, super, transporte,
   salidas, casa, salud, otros` — ver `app/js/gastos.js` para la
   lista exacta y sus emojis) → PATCH la fila con la categoría
   inferida.

## Lecciones técnicas de la sesión anterior (para no perder tiempo)
- Crear workflows/credenciales via API con PowerShell: si el JSON
  tiene emojis (ej. en un Code node), `Invoke-RestMethod -Body
  $stringConEmojis` sin especificar encoding rompe con 500 opaco. Fix:
  `[IO.File]::ReadAllText(...)` + `[System.Text.Encoding]::UTF8.
  GetBytes(...)` + `-ContentType "application/json; charset=utf-8"`.
- Credenciales tipo `httpHeaderAuth` creadas via
  `POST /api/v1/credentials` necesitan `data.allowedDomains` (aunque
  sea string vacío) o la API rechaza con 400.
- Para debuggear un 500 opaco: probar con un workflow mínimo (un solo
  nodo trigger) y ir agregando nodos de a uno para aislar cuál rompe,
  en vez de adivinar sobre el JSON completo.

Verificá cada workflow antes de darlo por terminado (ejecución de
prueba real, no solo "debería andar").
```

---

## PROMPT 5 — Producto/Frontend: bosque acumulativo y pulido general

```
Sos un product designer + frontend engineer senior especializado en
PWAs con estética Apple/iOS, con experiencia diseñando sistemas de
progresión visual (gamification) sin sacrificar performance ni peso
de assets.

Proyecto: app "KBL" de Keni en G:\Mi unidad\KBL APP Personal\app\
(PWA sin build, ES modules planos, deployada en GitHub Pages).
Módulos: Foco (`js/app.js`, `js/tree.js`), Bosque (stats + catálogo +
visor 360 en `js/viewer360.js`), Gastos (`js/gastos.js`), Notas
(`js/notas.js`), sync (`js/store.js`), diálogos propios
(`js/dialog.js`). Estilo: SF Pro, controles segmentados iOS, paneles
"Liquid Glass" (backdrop-filter blur + destello especular), 5 islas
3D low-poly pre-renderizadas como turntables WEBP.

## La tarea: "bosque acumulativo"
Idea de Keni, sin diseñar todavía: que los árboles/flores que ya ganó
(sesiones de foco completadas, guardadas en `foco_sessions` vía
Supabase) empiecen a aparecer DE FONDO en la escena — dando la
sensación de que el bosque crece con el uso real de la app, no solo en
la pestaña Bosque separada.

Puntos a resolver con criterio propio de diseño:
- ¿Dónde se ve el bosque acumulado? ¿Detrás de la isla activa en Foco?
  ¿Como fondo de la pestaña Bosque en vez del catálogo actual? ¿Ambos?
- Peso/performance: cada árbol ganado es hoy un turntable de 36 fotos
  de ~30-80KB — mostrar DECENAS de árboles ganados como islas 3D
  completas de fondo puede volverse pesado rápido. Pensar en
  alternativas: siluetas planas (recorte de un solo frame, no
  turntable completo) a menor resolución para los árboles de fondo,
  reservando el turntable completo/interactivo solo para el árbol
  "activo" en primer plano.
- Consistencia visual: que el bosque de fondo no compita ni ensucie
  la legibilidad del árbol que está creciendo ahora (jerarquía visual
  clara: 1 protagonista + fondo con textura/profundidad).

## Pulido general pendiente
Keni pidió repetidamente "más iOS" a lo largo del proyecto. Revisar
con ojo crítico dónde la app todavía se siente "hecha con código" en
vez de "hecha por Apple": transiciones entre pantallas, feedback
táctil (haptics via navigator.vibrate si aplica), estados de carga,
posible dark mode real (hoy el ciclo día/noche cambia el fondo de la
escena pero no hay un modo oscuro real de UI para las pestañas
Gastos/Notas), tipografía y espaciado en los módulos más nuevos
(Gastos, Notas) comparado contra Foco/Bosque que tuvieron más rondas
de pulido.

Verificá todo en el navegador (preview local puerto 4173, config
"kbl-app" en `.claude/launch.json`) antes de dar algo por terminado —
capturas, interacción real, no solo "el código está bien".
```

---

## Notas para quien retome esto

- **Cuentas**: GitHub `keniichino` es la cuenta PERSONAL de Keni (no
  confundir con `keniburgues`, que es la del trabajo en Grupo Ceta,
  aunque el mail sea @gmail). El repo de esta app vive en la personal.
- **Carpetas**: proyectos de facultad van en `G:\Mi unidad\UADE`,
  trabajo en `H:\Mi unidad\AIAP - Sinc`, esto es personal en
  `G:\Mi unidad\KBL APP Personal`.
- **Nunca falta recordarle a Keni**: revisar si sigue con algún token
  de Supabase (`sbp_...`) pegado en algún chat viejo — se le pidió
  revocar más de una vez.
