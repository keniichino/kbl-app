# KBL App Personal

PWA personal multi-módulo: **Foco** (v1, listo) · Gastos (v2) · Notas (v3) · IA con n8n + Claude (v4).

## Estructura

```
app/            ← la aplicación (buildless: HTML + CSS + JS, sin node_modules)
  index.html
  css/app.css
  js/app.js     ← lógica del módulo Foco
  js/tree.js    ← árbol SVG procedural (especies, carita, bosque)
  js/store.js   ← capa de datos (hoy localStorage, mañana Supabase)
  sw.js         ← service worker (offline)
  manifest.webmanifest
  icons/
supabase/schema.sql  ← esquema listo para la fase de sync
```

## Cómo funciona el timer

No cuenta segundos en el dispositivo: guarda el **timestamp de inicio** y calcula
el progreso contra la hora actual. Si cerrás la app a mitad de sesión y la abrís
después, el árbol está donde tiene que estar (y si la sesión terminó, se completa sola).

## Deploy (elegir uno)

1. **Netlify Drop** (más rápido): arrastrar la carpeta `app/` a https://app.netlify.com/drop
2. **GitHub + Netlify/Vercel**: repo con el contenido de `app/`, deploy automático en cada push.

> La PWA (instalar en iPhone, offline, ícono) solo funciona bajo **HTTPS**, o sea, ya deployada.

## Instalar en iPhone

Safari → abrir la URL → botón Compartir → **Agregar a pantalla de inicio**.

## Instalar en PC

Chrome/Edge → abrir la URL → ícono de instalar en la barra de direcciones.

## Fase 2 — Sync PC ↔ iPhone

1. Crear proyecto en supabase.com (free tier).
2. Correr `supabase/schema.sql` en el SQL Editor.
3. Pasar URL + anon key a Claude para conectar `js/store.js`.
