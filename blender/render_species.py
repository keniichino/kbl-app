"""
render_species.py v3
Uso:
  blender --background ARCHIVO.blend --python render_species.py -- SPECIES OUTPUT_DIR

Mejoras v3:
  - 128 samples (era 64): renders más limpios, sin ruido
  - suavizar_base(): smooth shading + SubSurf en 'tierra' para TODOS los modelos
  - Bonsai: tronco bajado 0.2u para ocultar el hueco negro en la base
  - Bonsai: hide completa (acento × 10, hoja_bonsai × 5, racimo × 7)
  - Flor: petalo_suelto × 7 ocultos (manchas rojas sobre el pasto)
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

# ===== RENDER SETTINGS =====
scene.render.engine = 'CYCLES'
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 92
scene.render.resolution_x = 800
scene.render.resolution_y = 1000

scene.cycles.samples = 128
scene.cycles.use_denoising = True

# GPU si está disponible
prefs = bpy.context.preferences.addons.get('cycles', None)
if prefs:
    cprefs = prefs.preferences
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
    """Cambia Color1/Color2 del nodo MIX_RGB → Principled."""
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
    """Cambia Base Color del Principled BSDF."""
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

def suavizar_base():
    """
    Aplica smooth shading + Subdivision Surface a 'tierra'
    para redondear la base piramidal angular de todos los modelos.
    """
    obj = bpy.data.objects.get('tierra')
    if not obj or obj.type != 'MESH':
        print("  [SKIP] 'tierra' no encontrado")
        return
    # Smooth shading por polígono (sin cambiar geometría)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()
    # Subdivisión Catmull-Clark: redondea las aristas duras
    mod = obj.modifiers.new("Subsurf_Base", type='SUBSURF')
    mod.levels = 1
    mod.render_levels = 2
    mod.subdivision_type = 'CATMULL_CLARK'
    print("  [OK] tierra: smooth + SubSurf(render=2) aplicado")


# ===== SUAVIZADO DE BASE (todas las especies) =====
print(f"\n=== BASE SUAVIZADA ===")
suavizar_base()


# ===== MODIFICACIONES POR ESPECIE =====
print(f"\n=== MODIFICACIONES PARA: {SPECIES} ===")

if SPECIES == 'flor':
    # Pétalos: cosmos rosa → rosa roja
    # (nota: geometría es un cosmos de 7 pétalos, no una rosa en forma)
    set_mix_colors('petalo_deep',   (0.55, 0.01, 0.01), (0.68, 0.04, 0.04))
    set_mix_colors('petalo_mid',    (0.72, 0.03, 0.03), (0.82, 0.08, 0.06))
    set_mix_colors('petalo_light',  (0.80, 0.05, 0.04), (0.90, 0.14, 0.09))
    # Centro: dorado cálido (estambre)
    set_color('centro_flor',        0.95, 0.82, 0.10)
    set_color('centro_flor_oscuro', 0.78, 0.48, 0.04)
    # Isla verde vivo
    set_color('pasto',       0.12, 0.38, 0.08)
    set_color('pasto_borde', 0.08, 0.28, 0.06)
    # Ocultar pétalos caídos: con rojo intenso → manchas sobre pasto verde
    for i in range(7):
        name = 'petalo_suelto' if i == 0 else f'petalo_suelto.{i:03d}'
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_render = True
            print(f"  [HIDDEN] {name}")

elif SPECIES == 'bonsai':
    # Fix: bajar el tronco para ocultar el hueco negro en la base
    tronco = bpy.data.objects.get('tronco')
    if tronco:
        tronco.location.z -= 0.45
        print(f"  [FIX] tronco.z -= 0.45 (oculta hueco)")

    # Ocultar todos los objetos problemáticos
    HIDE_BONSAI = [
        # hoja_acento: material rojo → fragmentos en la copa
        'hoja_acento_bonsai', 'hoja_acento_bonsai.001', 'hoja_acento_bonsai.002',
        'hoja_acento_bonsai.003', 'hoja_acento_bonsai.004', 'hoja_acento_bonsai.005',
        'hoja_acento_bonsai.006', 'hoja_acento_bonsai.007', 'hoja_acento_bonsai.008',
        'hoja_acento_bonsai.009',
        # hoja_bonsai: mismo material rojo
        'hoja_bonsai', 'hoja_bonsai.001', 'hoja_bonsai.002', 'hoja_bonsai.003', 'hoja_bonsai.004',
        # racimo: material copa (teal) → manchas en base del tronco
        'racimo', 'racimo.001', 'racimo.002', 'racimo.003', 'racimo.004', 'racimo.005', 'racimo.006',
    ]
    for name in HIDE_BONSAI:
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_render = True
            print(f"  [HIDDEN] {name}")

else:
    print(f"  (sin modificaciones adicionales para {SPECIES!r})")


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

TARGET = mathutils.Vector((0.0, 0.0, 0.5))
cam_start = camera.location.copy()
dist  = math.sqrt(cam_start.x**2 + cam_start.y**2)
height = cam_start.z

print(f"\n=== RENDER: {FRAMES} frames, dist={dist:.3f}, height={height:.3f}, samples=128 ===")
print(f"  Output: {OUT_DIR}")

for i in range(FRAMES):
    angle = (2.0 * math.pi * i) / FRAMES
    camera.location.x = dist * math.sin(angle)
    camera.location.y = -dist * math.cos(angle)
    camera.location.z = height

    direction = TARGET - camera.location
    rot_quat  = direction.to_track_quat('-Z', 'Y')
    camera.rotation_euler = rot_quat.to_euler()

    filename = f"{str(i).zfill(2)}.webp"
    scene.render.filepath = os.path.join(OUT_DIR, filename)
    bpy.ops.render.render(write_still=True)
    print(f"  [{i+1:02d}/{FRAMES}] {filename} OK")

print(f"\n=== DONE {SPECIES} ===\n")
