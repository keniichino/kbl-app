# Tareas de Keni — KBL App

> Ver [`PROMPTS_EXPERTOS.md`](PROMPTS_EXPERTOS.md) para el estado completo del proyecto y prompts listos para abrir en chats nuevos por tema (3D/Blender, crecimiento real, backend/login, n8n, producto).

## Ahora
- [ ] **Pegar la `service_role` en la credencial de n8n** — es lo único que traba el resumen semanal por mail (2 minutos):
  1. https://supabase.com/dashboard/project/jcsenhpuvvbxcxapoaia/settings/api-keys → copiar la **service_role** (la secreta, NO la anon).
  2. https://n8n.kblia.cloud → Credentials → **KBL Supabase (Header Auth)** → Name: `apikey`, Value: la service_role → Save.
  3. Avisame y activo el workflow. **No la pegues en el chat.**
- [ ] **Revocar el token de Supabase** que anduvo pegado en el chat: https://supabase.com/dashboard/account/tokens → borrar.
- [ ] **Subir el CSV de tu tarjeta** a `gastos-import/` — lo sigo esperando para armar la importación + categorización automática.
- [ ] **Mandar tu número de WhatsApp** (formato `54911XXXXXXXX@s.whatsapp.net`) — opcional: el nodo ya está en el workflow, desactivado. El mail no lo necesita.
- [ ] **Instalar la app en la PC**: Chrome/Edge → https://keniichino.github.io/kbl-app/ → ícono de instalar en la barra de direcciones.

## Cuando puedas
- [ ] **Configurar el Modo Concentración en iOS**: Ajustes → Concentración → "+" → crear modo "Foco" → silenciar Instagram/TikTok/etc. Se activa desde el Centro de Control al plantar.
- [ ] **Recomendado**: revisá la carpeta `C:\Back Up\...\add ons y apss craked` — evaluá si vale el riesgo de tener activadores craqueados en una máquina con credenciales de trabajo.

## Decisiones pendientes
- [ ] Multi-usuario real (login) — a futuro, para cuando tus amigos usen la app cada uno con su cuenta.
- [ ] Migrar el proyecto Supabase del trabajo (APP - AIAP) fuera de tu cuenta personal — conversación con la empresa.

## Estado de los módulos (resumen)
- **Foco**: timer + isla 3D girable creciendo por escala (no etapas reales todavía) + vista previa 3D en pantalla de inicio.
- **Bosque**: catálogo de 5 especies (sakura, arbolito, roble, flor, bonsai) con visor 360 fluido (crossfade). Ronda 3/4 de calidad 3D cerrada (2026-07-18): estilo low-poly redondeado (bevel + shading suave) en las 5, sin clipping ni objetos invisibles verificado en los 36 frames de cada turntable, Flor rediseñada sobre fotos reales de Cosmos bipinnatus, e isla propia por especie (bonsai=maceta zen, sakura=musgo de bosque, roble=rocas+raíces expuestas, arbolito=pradera pulida, flor=cantero). Ronda de pulido (2026-07-19) cerrada también: glare/bloom sutil de compositor en las 5 (ver `PROMPTS_EXPERTOS.md`), íconos PWA regenerados desde el hero nuevo de sakura, margen del roble re-confirmado sin clipping en varios ángulos. Detalle en `PROMPTS_EXPERTOS.md`.
- **Gastos**: carga rápida, categorías, sync en la nube, con login + RLS (cada cuenta ve solo lo suyo).
- **Notas**: lista + editor con autosave, sync en la nube.
- **Cuotas**: proyección de los próximos meses por tarjeta.
- **n8n** (`KBL - Resumen Semanal Gastos`, id `fwNr0Wokpp1qV0oU`): lunes 9:00 → lee gastos de los últimos 7 días + cuotas activas → arma un mail HTML → Gmail a keniburgues@gmail.com. Inactivo hasta que la credencial tenga la service_role (con la anon key devuelve 0 filas por RLS). El código del nodo "Armar resumen" vive en `n8n/resumen_semanal_code.js` y se sube con `node n8n/actualizar_resumen_semanal.js`.
