"""
test_rosa.py — Renderiza UN solo frame (vista lateral) para validar la
orientación de la rosa antes de comprometer un render completo de 36 frames.

Uso:
  blender --background flor_isla.blend --python test_rosa.py -- VARIANTE OUTFILE
  VARIANTE: cadena tipo "tilt=-1,prof=1"  (signos a probar)
"""
import bpy, sys, os, math, mathutils
import bmesh as _bm

argv = sys.argv
idx = argv.index("--") + 1
VARIANTE = argv[idx]       # ej "tilt=-1,prof=1"
OUTFILE  = argv[idx + 1]

# parsear signos
signs = {"tilt": 1.0, "prof": 1.0}
for tok in VARIANTE.split(","):
    k, v = tok.split("=")
    signs[k.strip()] = float(v)
SIGN_TILT = signs["tilt"]
SIGN_PROF = signs["prof"]

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 92
scene.render.resolution_x = 800
scene.render.resolution_y = 1000
scene.cycles.samples = 64
scene.cycles.use_denoising = True
prefs = bpy.context.preferences.addons.get('cycles', None)
if prefs:
    cprefs = prefs.preferences
    for ct in ('OPTIX', 'CUDA', 'HIP', 'METAL'):
        try:
            cprefs.compute_device_type = ct
            devs = cprefs.get_devices_for_type(ct)
            if devs:
                for d in devs: d.use = True
                scene.cycles.device = 'GPU'; break
        except Exception:
            continue

def set_mix_colors(mat_name, c1, c2):
    mat = bpy.data.materials.get(mat_name)
    if mat and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'MIX_RGB':
                node.inputs['Color1'].default_value = (*c1, 1.0)
                node.inputs['Color2'].default_value = (*c2, 1.0)
                return

set_mix_colors('petalo_deep',   (0.38, 0.00, 0.00), (0.52, 0.01, 0.01))
set_mix_colors('petalo_mid',    (0.55, 0.01, 0.01), (0.68, 0.04, 0.03))
set_mix_colors('petalo_light',  (0.68, 0.03, 0.02), (0.80, 0.08, 0.04))

# ocultar cosmos
PREFIJOS = ['petalo_outer', 'petalo_suelto', 'centro', 'floret', 'antera', 'polen']
for obj in bpy.data.objects:
    for pfx in PREFIJOS:
        if obj.name == pfx or obj.name.startswith(pfx + '.'):
            obj.hide_render = True; break

dep = bpy.context.evaluated_depsgraph_get()
cabeza = bpy.data.objects.get('cabeza')
if cabeza:
    head = cabeza.evaluated_get(dep).matrix_world.translation.copy()
else:
    head = mathutils.Vector((0.12, -0.36, 2.52))

def make_petal_bm(pw, ph, prof):
    bm = _bm.new()
    FS, CS = 8, 5
    rows = []
    for rr in range(FS + 1):
        t = rr / FS
        rw = pw * math.sin(math.pi * t * 0.88 + 0.06) * (1 + 0.30 * t * (1 - t) * 4)
        ry = ph * t
        rz = SIGN_PROF * prof * t * t * math.sin(math.pi * t)
        vrow = []
        for cc in range(CS + 1):
            u = cc / CS - 0.5
            zc = SIGN_PROF * (-prof * 0.35 * u * u * t)
            vrow.append(bm.verts.new((u * rw * 2, ry, rz + zc)))
        rows.append(vrow)
    for rr in range(FS):
        for cc in range(CS):
            f = bm.faces.new([rows[rr][cc], rows[rr][cc + 1],
                              rows[rr + 1][cc + 1], rows[rr + 1][cc]])
            f.smooth = True
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

capas_rosa = [
    (3,  0.000, 0.150,  6,  0.090, 0.300, 0.024, 'petalo_deep'),
    (5,  0.060, 0.140, 12,  0.120, 0.380, 0.039, 'petalo_deep'),
    (5,  0.150, 0.130, 22,  0.165, 0.450, 0.051, 'petalo_deep'),
    (7,  0.255, 0.100, 34,  0.204, 0.510, 0.063, 'petalo_mid'),
    (8,  0.375, 0.060, 47,  0.246, 0.555, 0.075, 'petalo_mid'),
    (9,  0.504, 0.025, 59,  0.276, 0.588, 0.084, 'petalo_light'),
    (9,  0.654, 0.000, 69,  0.291, 0.606, 0.093, 'petalo_light'),
]

for idx2, (n, r, dz, tilt_deg, pw, ph, prof, mat_name) in enumerate(capas_rosa):
    tilt = SIGN_TILT * math.radians(tilt_deg)
    offset = idx2 * math.pi / max(n, 1) + idx2 * 0.20
    for i in range(n):
        theta = (2 * math.pi * i / n + offset) if n > 1 else 0.0
        bm = make_petal_bm(pw, ph, prof)
        mesh = bpy.data.meshes.new(f"rosa_{idx2}_{i}")
        bm.to_mesh(mesh); bm.free()
        obj = bpy.data.objects.new(f"rosa_{idx2}_{i}", mesh)
        scene.collection.objects.link(obj)
        mod = obj.modifiers.new("SS", type='SUBSURF')
        mod.levels = 0; mod.render_levels = 2
        mod.subdivision_type = 'CATMULL_CLARK'
        obj.location = (head.x + r * math.cos(theta),
                        head.y + r * math.sin(theta),
                        head.z + dz)
        obj.rotation_euler = (tilt, 0.0, theta + math.pi * 0.5)
        mat = bpy.data.materials.get(mat_name)
        if mat: obj.data.materials.append(mat)

# cámara: frame lateral (i=9 → angle 90°)
camera = scene.camera
TARGET = mathutils.Vector((0.0, 0.0, 0.5))
cs = camera.location.copy()
dist = math.sqrt(cs.x**2 + cs.y**2); height = cs.z
angle = (2.0 * math.pi * 9) / 36
camera.location.x = dist * math.sin(angle)
camera.location.y = -dist * math.cos(angle)
camera.location.z = height
direction = TARGET - camera.location
camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

scene.render.filepath = OUTFILE
bpy.ops.render.render(write_still=True)
print(f"DONE variante={VARIANTE} -> {OUTFILE}")
