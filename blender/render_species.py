"""
Uso:
  blender --background ARCHIVO.blend --python render_species.py -- SPECIES OUTPUT_DIR

Ejemplo:
  blender --background flor_isla.blend --python render_species.py -- flor C:/ruta/flor
"""
import bpy
import sys
import os
import math
import mathutils

argv = sys.argv
try:
    idx = argv.index("--") + 1
except ValueError:
    print("ERROR: faltan argumentos después de '--'")
    sys.exit(1)

SPECIES = argv[idx]
OUT_DIR  = argv[idx + 1]
FRAMES   = 36

os.makedirs(OUT_DIR, exist_ok=True)
scene = bpy.context.scene

# ===== RENDER SETTINGS (igual al original para consistencia) =====
scene.render.engine = 'CYCLES'
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 90
scene.render.resolution_x = 800
scene.render.resolution_y = 1000

# Samples: suficientes para calidad limpia sin partículas ruidosas
scene.cycles.samples = 64
scene.cycles.use_denoising = True

# GPU si está disponible
prefs = bpy.context.preferences.addons.get('cycles', None)
if prefs:
    cprefs = prefs.preferences
    # Intentar OptiX/CUDA/HIP/Metal
    for compute_type in ('OPTIX', 'CUDA', 'HIP', 'METAL'):
        try:
            cprefs.compute_device_type = compute_type
            devices = cprefs.get_devices_for_type(compute_type)
            if devices:
                for d in devices:
                    d.use = True
                scene.cycles.device = 'GPU'
                print(f"GPU habilitado: {compute_type}")
                break
        except Exception:
            continue


# ===== HELPERS =====
def set_mix_colors(mat_name, c1, c2):
    """Cambia Color1 y Color2 del nodo Mix (Legacy) que alimenta al Principled."""
    mat = bpy.data.materials.get(mat_name)
    if not mat:
        print(f"  [WARN] {mat_name!r} no encontrado"); return
    if mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'MIX_RGB':
                node.inputs['Color1'].default_value = (*c1, 1.0)
                node.inputs['Color2'].default_value = (*c2, 1.0)
                print(f"  [OK] {mat_name} MIX → {c1} | {c2}")
                return
    print(f"  [WARN] {mat_name} sin nodo MIX_RGB")

def set_color(mat_name, r, g, b):
    """Cambia el Base Color del Principled (cuando no hay Mix)."""
    mat = bpy.data.materials.get(mat_name)
    if not mat:
        print(f"  [WARN] {mat_name!r} no encontrado"); return
    if mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Base Color'].default_value = (r, g, b, 1.0)
                print(f"  [OK] {mat_name} BSDF → ({r:.2f}, {g:.2f}, {b:.2f})")
                return
    mat.diffuse_color = (r, g, b, 1.0)


# ===== MODIFICACIONES POR ESPECIE =====
print(f"\n=== MODIFICACIONES PARA: {SPECIES} ===")

if SPECIES == 'flor':
    # Cosmos rosa → Rosa roja (estilizada lowpoly)
    # Los materiales de pétalos usan Fresnel → MIX_RGB → Principled
    # Hay que cambiar Color1 (zona iluminada/fresnel) y Color2 (zona oscura/interior)
    set_mix_colors('petalo_deep',   (0.60, 0.02, 0.02), (0.72, 0.06, 0.05))  # interior oscuro
    set_mix_colors('petalo_mid',    (0.75, 0.04, 0.04), (0.85, 0.10, 0.07))  # cuerpo principal
    set_mix_colors('petalo_light',  (0.82, 0.06, 0.05), (0.92, 0.16, 0.10))  # borde iluminado
    # Centro: dorado cálido (estambre de rosa)
    set_color('centro_flor',        0.95, 0.82, 0.10)
    set_color('centro_flor_oscuro', 0.80, 0.52, 0.05)
    # Isla: pasto verde (la flor tenía tierra oscura, le damos vida)
    set_color('pasto',       0.15, 0.42, 0.10)
    set_color('pasto_borde', 0.10, 0.32, 0.08)
    # Ocultar pétalos sueltos: con color rojo quedan como manchas/artefactos sobre el pasto
    for i in range(7):
        name = 'petalo_suelto' if i == 0 else f'petalo_suelto.{i:03d}'
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_render = True
            print(f"  [HIDDEN] {name}")

elif SPECIES == 'bonsai':
    # Ocultar fragmentos rojos (bonsai_acento), hojas sueltas, y racimos fuera de lugar
    HIDE_BONSAI = [
        # hojas de acento: material rojo oscuro → fragmentos visibles en la copa
        'hoja_acento_bonsai', 'hoja_acento_bonsai.001', 'hoja_acento_bonsai.002',
        'hoja_acento_bonsai.003', 'hoja_acento_bonsai.004', 'hoja_acento_bonsai.005',
        'hoja_acento_bonsai.006', 'hoja_acento_bonsai.007', 'hoja_acento_bonsai.008',
        'hoja_acento_bonsai.009',
        # hojas sueltas: mismo material rojo, algunas fuera de la maceta
        'hoja_bonsai', 'hoja_bonsai.001', 'hoja_bonsai.002', 'hoja_bonsai.003', 'hoja_bonsai.004',
        # racimos: usan material copa (teal) y quedan como manchas en la base del tronco
        'racimo', 'racimo.001', 'racimo.002', 'racimo.003', 'racimo.004', 'racimo.005', 'racimo.006',
    ]
    for name in HIDE_BONSAI:
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_render = True
            print(f"  [HIDDEN] {name}")

else:
    print(f"  (sin modificaciones para {SPECIES!r})")


# ===== ORBITAR CÁMARA Y RENDERIZAR =====
camera = scene.camera
if not camera:
    for obj in scene.objects:
        if obj.type == 'CAMERA':
            camera = obj
            scene.camera = camera
            break

if not camera:
    print("ERROR: no hay cámara en la scene")
    sys.exit(1)

# Centro visual del modelo (el pivot está en el origen)
TARGET = mathutils.Vector((0.0, 0.0, 0.5))

cam_start = camera.location.copy()
dist = math.sqrt(cam_start.x**2 + cam_start.y**2)
height = cam_start.z

print(f"\n=== RENDER: {FRAMES} frames orbita, dist={dist:.3f}, height={height:.3f} ===")
print(f"  Output: {OUT_DIR}")

for i in range(FRAMES):
    angle = (2.0 * math.pi * i) / FRAMES
    camera.location.x = dist * math.sin(angle)
    camera.location.y = -dist * math.cos(angle)
    camera.location.z = height

    # Track al centro visual
    direction = TARGET - camera.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    camera.rotation_euler = rot_quat.to_euler()

    filename = f"{str(i).zfill(2)}.webp"
    scene.render.filepath = os.path.join(OUT_DIR, filename)
    bpy.ops.render.render(write_still=True)
    print(f"  [{i+1:02d}/{FRAMES}] {filename} OK")

print(f"\n=== DONE {SPECIES} ===\n")
