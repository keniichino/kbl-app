#!/usr/bin/env bash
# Genera los turntables de las etapas jovenes de crecimiento.
#
# Dos pasos por etapa, a proposito:
#   1. especies_isla.py --etapa N --solo-blend  -> geometria atenuada
#   2. render_species.py --dist/--height        -> frames con el encuadre CLAVADO
#      al de la etapa madura. Sin eso cada etapa se auto-encuadra, la camara se
#      acerca al brote hasta llenarle el cuadro, y las 4 etapas se ven del mismo
#      tamaño: justo lo contrario de mostrar que el arbol crecio.
#
# Los valores de dist/height salen de:
#   blender --background ESPECIE_isla.blend --python render_species.py -- ESPECIE x --solo-encuadre
#
# Afuera por ahora:
#   bonsai -> su follaje viene despegado del tronco (defecto previo al encuadre
#             automatico) y achicarlo lo hace evidente.
#   flor   -> su geometria final (la rosa) la arma render_species.py reemplazando
#             la cosmos, asi que atenuar el .blend no la toca.
#   Ambas siguen creciendo por escala en la app (fallback de app.js).
set -euo pipefail

BLENDER="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
BASE="G:/Mi unidad/KBL APP Personal"
cd "$BASE/blender"

# especie:dist:height (encuadre de la etapa madura)
ESPECIES="arbolito:12.3582:0.8404 roble:12.3344:1.5391 sakura:12.4087:1.4687"
ETAPAS="0 1 2"

for spec in $ESPECIES; do
  esp="${spec%%:*}"; resto="${spec#*:}"
  dist="${resto%%:*}"; height="${resto##*:}"
  for n in $ETAPAS; do
    out="$BASE/app/assets/360/$esp/etapa$n"
    echo "### $esp etapa $n -> $out"
    "$BLENDER" --background --python especies_isla.py -- \
      --especie "$esp" --etapa "$n" --solo-blend 2>&1 | grep -E "=== ETAPA|=== BLEND"
    mkdir -p "$out"
    "$BLENDER" --background "${esp}_isla_etapa${n}.blend" --python render_species.py -- \
      "$esp" "$out" --dist "$dist" --height "$height" 2>&1 | grep -E "CLAVADO|36/36|ERROR"
  done
done

echo "### LISTO"
