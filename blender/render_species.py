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
    import bmesh as _bm

    # ── Colores rojo argentina (muy oscuro adentro, rojo vivo afuera) ───────
    set_mix_colors('petalo_deep',   (0.38, 0.00, 0.00), (0.52, 0.01, 0.01))
    set_mix_colors('petalo_mid',    (0.55, 0.01, 0.01), (0.68, 0.04, 0.03))
    set_mix_colors('petalo_light',  (0.68, 0.03, 0.02), (0.80, 0.08, 0.04))
    set_color('pasto',       0.12, 0.38, 0.08)
    set_color('pasto_borde', 0.08, 0.28, 0.06)

    # ── Ocultar toda la geometría del cosmos ─────────────────────────────────
    PREFIJOS_COSMOS = ['petalo_outer', 'petalo_suelto', 'centro', 'floret', 'antera', 'polen']
    for obj in bpy.data.objects:
        for pfx in PREFIJOS_COSMOS:
            if obj.name == pfx or obj.name.startswith(pfx + '.'):
                obj.hide_render = True
                print(f"  [HIDDEN] {obj.name}")
                break

    # ── Posición de la cabeza de flor (top del tallo) ────────────────────────
    dep = bpy.context.evaluated_depsgraph_get()
    cabeza = bpy.data.objects.get('cabeza')
    if cabeza:
        try:
            head = cabeza.evaluated_get(dep).matrix_world.translation.copy()
        except Exception:
            head = mathutils.Vector((cabeza.location.x, cabeza.location.y, cabeza.location.z))
    else:
        head = mathutils.Vector((0.12, -0.36, 2.52))
    print(f"  [INFO] Rosa: centro en ({head.x:.3f}, {head.y:.3f}, {head.z:.3f})")

    # ── Función: mesh de un pétalo de rosa curvado ───────────────────────────
    def make_petal_bm(pw, ph, prof):
        bm = _bm.new()
        FS, CS = 8, 5
        rows = []
        for rr in range(FS + 1):
            t = rr / FS
            # Ancho: estrecho en base y punta, máximo a 2/3 de altura
            rw = pw * math.sin(math.pi * t * 0.88 + 0.06) * (1 + 0.30 * t * (1 - t) * 4)
            ry = ph * t
            # Curvatura trasera (pétalo se inclina hacia atrás en la punta)
            rz = prof * t * t * math.sin(math.pi * t)
            vrow = []
            for cc in range(CS + 1):
                u = cc / CS - 0.5
                # Cupping lateral (bordes se curvan levemente hacia adelante)
                zc = -prof * 0.35 * u * u * t
                vrow.append(bm.verts.new((u * rw * 2, ry, rz + zc)))
            rows.append(vrow)
        for rr in range(FS):
            for cc in range(CS):
                f = bm.faces.new([rows[rr][cc], rows[rr][cc + 1],
                                  rows[rr + 1][cc + 1], rows[rr + 1][cc]])
                f.smooth = True
        _bm.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm

    # ── Capas de la rosa espiral ─────────────────────────────────────────────
    # (n_petals, radius, dz, tilt°, petal_w, petal_h, prof, material)
    # Escala ×3 respecto al cosmos original (radio exterior ~0.65u).
    # dz comprimido + centro hundido: capullo compacto que ABRE hacia arriba
    # (el tilt se NIEGA abajo para que los pétalos se abran hacia arriba/afuera).
    capas_rosa = [
        (3,  0.000, 0.150,  6,  0.090, 0.300, 0.024, 'petalo_deep'),
        (5,  0.060, 0.140, 12,  0.120, 0.380, 0.039, 'petalo_deep'),
        (5,  0.150, 0.130, 22,  0.165, 0.450, 0.051, 'petalo_deep'),
        (7,  0.255, 0.100, 34,  0.204, 0.510, 0.063, 'petalo_mid'),
        (8,  0.375, 0.060, 47,  0.246, 0.555, 0.075, 'petalo_mid'),
        (9,  0.504, 0.025, 59,  0.276, 0.588, 0.084, 'petalo_light'),
        (9,  0.654, 0.000, 69,  0.291, 0.606, 0.093, 'petalo_light'),
    ]

    total_p = 0
    for idx, (n, r, dz, tilt_deg, pw, ph, prof, mat_name) in enumerate(capas_rosa):
        tilt = -math.radians(tilt_deg)  # negativo: la rosa abre hacia arriba, no cuelga
        # Offset angular entre capas para efecto espiral Fibonacci
        offset = idx * math.pi / max(n, 1) + idx * 0.20
        for i in range(n):
            theta = (2 * math.pi * i / n + offset) if n > 1 else 0.0
            bm = make_petal_bm(pw, ph, prof)
            mesh = bpy.data.meshes.new(f"rosa_{idx}_{i}")
            bm.to_mesh(mesh); bm.free()
            # SubSurf para suavizar curvas en render
            obj = bpy.data.objects.new(f"rosa_{idx}_{i}", mesh)
            scene.collection.objects.link(obj)
            mod = obj.modifiers.new("SS", type='SUBSURF')
            mod.levels = 0
            mod.render_levels = 2
            mod.subdivision_type = 'CATMULL_CLARK'
            # Posición y rotación
            obj.location = (
                head.x + r * math.cos(theta),
                head.y + r * math.sin(theta),
                head.z + dz
            )
            obj.rotation_euler = (tilt, 0.0, theta + math.pi * 0.5)
            mat = bpy.data.materials.get(mat_name)
            if mat:
                obj.data.materials.append(mat)
            total_p += 1

    print(f"  [OK] Rosa argentina: {total_p} pétalos, {len(capas_rosa)} capas")

elif SPECIES == 'bonsai':
    import bmesh as _bmesh

    tronco = bpy.data.objects.get('tronco')
    if tronco:
        # 1. Bajar tronco para que la base quede bien plantada en la arena
        tronco.location.z -= 0.45
        print(f"  [FIX] tronco.z -= 0.45")

        # 2. Sellar TODOS los bordes abiertos del tronco hueco
        #    (360 boundary edges de z=-0.23 a z=1.90 → interior oscuro visible desde arriba)
        bm = _bmesh.new()
        bm.from_mesh(tronco.data)
        bm.verts.ensure_lookup_table()
        bm.edges.ensure_lookup_table()

        boundary = [e for e in bm.edges if len(e.link_faces) == 1]
        print(f"  [INFO] tronco: {len(boundary)} boundary edges encontrados")

        if boundary:
            faces_added = 0
            try:
                res = _bmesh.ops.edgeloop_fill(bm, edges=boundary, mat_nr=0, use_smooth=False)
                new_faces = res.get('faces', [])
                if new_faces:
                    _bmesh.ops.recalc_face_normals(bm, faces=new_faces)
                    faces_added = len(new_faces)
                    print(f"  [FIX] edgeloop_fill: {faces_added} caras de cierre")
            except Exception as ex:
                print(f"  [WARN] edgeloop_fill falló ({ex}), usando fan fill")
                all_bverts = list({v for e in boundary for v in e.verts})
                cx = sum(v.co.x for v in all_bverts) / len(all_bverts)
                cy = sum(v.co.y for v in all_bverts) / len(all_bverts)
                cz = sum(v.co.z for v in all_bverts) / len(all_bverts)
                center_v = bm.verts.new((cx, cy, cz))
                bm.verts.ensure_lookup_table()
                for e in boundary:
                    try:
                        bm.faces.new([e.verts[0], e.verts[1], center_v])
                        faces_added += 1
                    except Exception:
                        pass
                _bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
                print(f"  [FIX] fan fill: {faces_added} triángulos")

            bm.to_mesh(tronco.data)
            tronco.data.update()

        bm.free()

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
