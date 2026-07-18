# Tareas de Keni — KBL App

> Ver [`PROMPTS_EXPERTOS.md`](PROMPTS_EXPERTOS.md) para el estado completo del proyecto y prompts listos para abrir en chats nuevos por tema (3D/Blender, crecimiento real, backend/login, n8n, producto).

## Ahora
- [ ] **Revocar el token de Supabase** que anduvo pegado en el chat: https://supabase.com/dashboard/account/tokens → borrar. (Sigue activo, se usó una vez más para armar n8n — cuando quieras cerrarlo, adelante.)
- [ ] **Subir el CSV de tu tarjeta** a `gastos-import/` — lo sigo esperando para armar la importación + categorización automática.
- [ ] **Mandar tu número de WhatsApp** (formato `54911XXXXXXXX@s.whatsapp.net`) para activar el resumen semanal de gastos que ya está armado en n8n.
- [ ] **Instalar la app en la PC**: Chrome/Edge → https://keniichino.github.io/kbl-app/ → ícono de instalar en la barra de direcciones.

## Cuando puedas
- [ ] **Configurar el Modo Concentración en iOS**: Ajustes → Concentración → "+" → crear modo "Foco" → silenciar Instagram/TikTok/etc. Se activa desde el Centro de Control al plantar.
- [ ] **Recomendado**: revisá la carpeta `C:\Back Up\...\add ons y apss craked` — evaluá si vale el riesgo de tener activadores craqueados en una máquina con credenciales de trabajo.

## Decisiones pendientes
- [ ] Multi-usuario real (login) — a futuro, para cuando tus amigos usen la app cada uno con su cuenta.
- [ ] Migrar el proyecto Supabase del trabajo (APP - AIAP) fuera de tu cuenta personal — conversación con la empresa.

## Estado de los módulos (resumen)
- **Foco**: timer + isla 3D girable creciendo por escala (no etapas reales todavía) + vista previa 3D en pantalla de inicio.
- **Bosque**: catálogo de 5 especies (sakura, arbolito, roble, flor, bonsai) con visor 360 fluido (crossfade). Ronda 3/4 de calidad 3D cerrada (2026-07-18): estilo low-poly redondeado (bevel + shading suave) en las 5, sin clipping ni objetos invisibles verificado en los 36 frames de cada turntable, Flor rediseñada sobre fotos reales de Cosmos bipinnatus, e isla propia por especie (bonsai=maceta zen, sakura=musgo de bosque, roble=rocas+raíces expuestas, arbolito=pradera pulida, flor=cantero). Detalle en `PROMPTS_EXPERTOS.md`.
- **Gastos**: carga rápida, categorías, sync en la nube — sin login todavía (tablas abiertas).
- **Notas**: lista + editor con autosave, sync en la nube.
- **n8n**: resumen semanal armado, inactivo, esperando tu número.
