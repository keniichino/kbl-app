# Arbol sakura dreamy sobre isla flotante low poly + turntable 360
# Uso:
#   blender.exe --background --python arbol_isla.py -- --seed 11 --test   (solo hero de prueba)
#   blender.exe --background --python arbol_isla.py -- --seed 11          (hero PNG + 36 WEBP + blend)
import bpy, math, random, sys, time
from mathutils import Vector

# ------------------------------------------------------------------ args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SEED = 11
TEST_MODE = "--test" in argv
if "--seed" in argv:
    SEED = int(argv[argv.index("--seed") + 1])

# ------------------------------------------------------------------ params
TREE_H         = 4.0
TRUNK_LEN      = 0.92
TRUNK_R        = 0.15
LEVELS         = 3
FILL_FRACTION  = 0.75
N_EXTRA_CLOUD  = 48
CLUSTER_R      = (0.32, 0.52)
N_PETALS_COPA  = 130
N_PETALS_CAER  = 36
SAMPLES        = 32 if TEST_MODE else 64
OUT_DIR        = r"G:\Mi unidad\KBL APP Personal\blender"
TT_DIR         = OUT_DIR + r"\turntable"

random.seed(SEED)
t0 = time.time()

def srgb2lin(hexstr):
    out = []
    for i in (0, 2, 4):
        c = int(hexstr[i:i+2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)

COL_BARK    = srgb2lin("3a2820")
COL_MID     = srgb2lin("f272b6")
COL_LIGHT   = srgb2lin("ffc9e4")
COL_DARK    = srgb2lin("ad3d7f")
COL_PASTO   = srgb2lin("6cc464")
COL_PASTO_B = srgb2lin("4aa851")
COL_TIERRA  = srgb2lin("6e4a32")
COL_TIERRA_D= srgb2lin("523624")
COL_PIEDRA  = srgb2lin("9a9a9a")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ------------------------------------------------------------------ materiales
def simple_mat(name, col, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    return m

def make_blossom():
    m = bpy.data.materials.new("blossom")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    info = nt.nodes.new("ShaderNodeObjectInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    soft_dark = tuple(0.42 * d + 0.58 * mm for d, mm in zip(COL_DARK, COL_MID))
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*soft_dark, 1)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (*COL_LIGHT, 1)
    mid = ramp.color_ramp.elements.new(0.4)
    mid.color = (*COL_MID, 1)
    nt.links.new(info.outputs["Random"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m

MAT_BARK    = simple_mat("bark", COL_BARK, 0.95)
MAT_BLOSSOM = make_blossom()
MAT_PETALO  = simple_mat("petalo", tuple(0.6 * l + 0.4 for l in COL_LIGHT), 0.7)
MAT_PASTO   = simple_mat("pasto", COL_PASTO, 0.95)
MAT_PASTO_B = simple_mat("pasto_borde", COL_PASTO_B, 0.95)
MAT_TIERRA  = simple_mat("tierra", COL_TIERRA, 1.0)
MAT_TIERRA_D= simple_mat("tierra_oscura", COL_TIERRA_D, 1.0)
MAT_PIEDRA  = simple_mat("piedra", COL_PIEDRA, 0.9)
MAT_FLOR_B  = simple_mat("flor_blanca", (0.9, 0.9, 0.92), 0.8)
MAT_FLOR_R  = simple_mat("flor_rosa", COL_LIGHT, 0.8)

# ------------------------------------------------------------------ arbol: curva con bevel
cu = bpy.data.curves.new("tree", 'CURVE')
cu.dimensions = '3D'
cu.bevel_depth = 1.0
cu.bevel_resolution = 5
cu.resolution_u = 12
cu.fill_mode = 'FULL'
tree_obj = bpy.data.objects.new("tronco", cu)
scene.collection.objects.link(tree_obj)
tree_obj.data.materials.append(MAT_BARK)

tips = []

def add_spline(points):
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, (co, r) in zip(sp.points, points):
        p.co = (co.x, co.y, co.z, 1.0)
        p.radius = r
    sp.use_endpoint_u = True
    sp.order_u = 4

def grow(pos, dirv, length, r0, r1, level):
    n = 7
    d = dirv.normalized()
    pts = [(pos.copy(), r0)]
    spawn = []
    step = length / n
    for i in range(1, n + 1):
        jitter = Vector((random.uniform(-1, 1), random.uniform(-1, 1),
                         random.uniform(-0.3, 1.0))) * 0.28
        up = Vector((0, 0, 0.22 if level == 0 else 0.10))
        d = (d + jitter * (0.5 if level == 0 else 1.0) + up).normalized()
        pos = pos + d * step
        t = i / n
        r = r0 + (r1 - r0) * t
        pts.append((pos.copy(), r))
        if t >= 0.45:
            spawn.append((pos.copy(), d.copy(), r))
    add_spline(pts)
    if level >= LEVELS - 1:
        tips.append((pos.copy(), d.copy()))
    return spawn, (pos.copy(), d.copy())

spawn0, (top, topd) = grow(Vector((0, 0, 0)), Vector((0.12, -0.05, 1)),
                           TRUNK_LEN, TRUNK_R, TRUNK_R * 0.55, 0)

n_main = 4
base_ang = random.uniform(0, math.pi * 2)
level1_ends = []
for k in range(n_main):
    ang = base_ang + k * (2 * math.pi / n_main) + random.uniform(-0.4, 0.4)
    tilt = random.uniform(0.65, 1.1)
    d = Vector((math.cos(ang) * math.sin(tilt),
                math.sin(ang) * math.sin(tilt),
                math.cos(tilt)))
    src = top if k < 3 else spawn0[len(spawn0) // 2][0]
    r_here = TRUNK_R * 0.55 if k < 3 else spawn0[len(spawn0) // 2][2]
    sp, end = grow(src, d, TREE_H * 0.42, r_here * 0.8, r_here * 0.32, 1)
    level1_ends.append((sp, end))

for sp, end in level1_ends:
    picks = random.sample(sp, min(2, len(sp)))
    srcs = [(p, d, r) for (p, d, r) in picks]
    srcs.append((end[0], end[1], TRUNK_R * 0.18))
    for (p, d, r) in srcs:
        dd = (d + Vector((random.uniform(-0.8, 0.8),
                          random.uniform(-0.8, 0.8),
                          random.uniform(0.05, 0.5)))).normalized()
        grow(p, dd, TREE_H * 0.22, max(r * 0.6, 0.02), 0.012, 2)

# ------------------------------------------------------------------ copa (2 niveles de displacement)
tex = bpy.data.textures.new("clouds", 'CLOUDS')
tex.noise_scale = 0.75
tex.noise_depth = 2
tex_fine = bpy.data.textures.new("clouds_fino", 'CLOUDS')
tex_fine.noise_scale = 0.16
tex_fine.noise_depth = 2

clusters = []   # (centro Vector, radio efectivo)

def add_cluster(center, radius):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=radius,
                                          location=center)
    ob = bpy.context.active_object
    ob.name = "racimo"
    ob.scale = (random.uniform(0.85, 1.25),
                random.uniform(0.85, 1.25),
                random.uniform(0.7, 1.0))
    ob.rotation_euler = (random.uniform(0, 3), random.uniform(0, 3),
                         random.uniform(0, 3))
    mod = ob.modifiers.new("disp", 'DISPLACE')
    mod.texture = tex
    mod.strength = radius * 0.38
    mod2 = ob.modifiers.new("disp_fino", 'DISPLACE')
    mod2.texture = tex_fine
    mod2.strength = radius * 0.10
    ob.data.materials.append(MAT_BLOSSOM)
    bpy.ops.object.shade_smooth()
    clusters.append((Vector(center), radius))
    return ob

cluster_centers = []
for sp, end in level1_ends:
    for (p, d, r) in sp[-2:]:
        c = p + Vector((random.uniform(-0.1, 0.1),
                        random.uniform(-0.1, 0.1),
                        random.uniform(0.02, 0.15)))
        add_cluster(c, random.uniform(0.24, 0.34))
for (p, d) in tips:
    c = p + d * random.uniform(0.05, 0.2)
    r = random.uniform(*CLUSTER_R)
    add_cluster(c, r)
    cluster_centers.append(c)

if cluster_centers:
    centroid = sum(cluster_centers, Vector()) / len(cluster_centers)
    centroid.z += 0.15
    for _ in range(N_EXTRA_CLOUD):
        a = random.choice(cluster_centers)
        t = random.uniform(0.15, 0.75)
        c = a.lerp(centroid, t) + Vector((random.uniform(-0.6, 0.6),
                                          random.uniform(-0.6, 0.6),
                                          random.uniform(-0.5, 0.45)))
        add_cluster(c, random.uniform(CLUSTER_R[0] * 0.9, CLUSTER_R[1] * 1.15))
    low_tips = sorted(cluster_centers, key=lambda v: v.z)[:5]
    for a in low_tips:
        c = a + Vector((random.uniform(-0.25, 0.25),
                        random.uniform(-0.25, 0.25),
                        random.uniform(-0.55, -0.2)))
        add_cluster(c, random.uniform(CLUSTER_R[0] * 0.8, CLUSTER_R[0] * 1.1))

canopy_r = max(math.hypot(c.x, c.y) + r for c, r in clusters)
canopy_lo = min(c.z - r for c, r in clusters)

# ------------------------------------------------------------------ petalos (mesh compartido, instancias linkeadas)
pet_me = bpy.data.meshes.new("petalo")
pet_me.from_pydata(
    [(-0.035, 0, 0), (0, 0.024, 0.007), (0.035, 0, 0), (0, -0.024, 0.007)],
    [], [(0, 1, 2, 3)])
pet_me.materials.append(MAT_PETALO)

def add_petal(loc):
    ob = bpy.data.objects.new("petalo", pet_me)
    ob.location = loc
    ob.rotation_euler = (random.uniform(0, 6.28), random.uniform(0, 6.28),
                         random.uniform(0, 6.28))
    s = random.uniform(0.8, 1.5)
    ob.scale = (s, s, s)
    scene.collection.objects.link(ob)

for _ in range(N_PETALS_COPA):
    c, r = random.choice(clusters)
    d = Vector((random.gauss(0, 1), random.gauss(0, 1),
                abs(random.gauss(0, 0.9)))).normalized()
    add_petal(c + d * r * random.uniform(1.0, 1.12))
for _ in range(N_PETALS_CAER):
    ang = random.uniform(0, 6.28)
    rr = random.uniform(0.25, canopy_r * 0.7)
    z = random.uniform(0.12, canopy_lo + 0.4)
    add_petal(Vector((math.cos(ang) * rr, math.sin(ang) * rr, z)))

# ------------------------------------------------------------------ isla flotante
# diametro del pasto ~1.25 x diametro de la copa
grass_r = canopy_r * 1.25
GRASS_TH = 0.30

bpy.ops.mesh.primitive_cylinder_add(vertices=22, radius=grass_r, depth=GRASS_TH,
                                    location=(0, 0, -GRASS_TH / 2))
disco = bpy.context.active_object
disco.name = "pasto"
disco.data.materials.append(MAT_PASTO)
disco.data.materials.append(MAT_PASTO_B)
for poly in disco.data.polygons:
    poly.material_index = 0 if poly.normal.z > 0.5 else 1
# jitter suave del borde
for v in disco.data.vertices:
    if abs(v.co.x) > 0.01 or abs(v.co.y) > 0.01:
        f = 1 + random.uniform(-0.05, 0.05)
        v.co.x *= f
        v.co.y *= f

CONE_D = 1.9
bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=grass_r * 0.94, radius2=0,
                                depth=CONE_D,
                                location=(0, 0, -GRASS_TH - CONE_D / 2))
cono = bpy.context.active_object
cono.name = "tierra"
cono.data.materials.append(MAT_TIERRA)
cono.data.materials.append(MAT_TIERRA_D)
for poly in cono.data.polygons:
    poly.material_index = random.choice((0, 0, 1))
for v in cono.data.vertices:
    local_z = v.co.z
    if local_z > CONE_D / 2 - 0.01:      # anillo superior: no tocar z
        v.co.x *= 1 + random.uniform(-0.06, 0.06)
        v.co.y *= 1 + random.uniform(-0.06, 0.06)
    else:
        v.co.x += random.uniform(-0.15, 0.15)
        v.co.y += random.uniform(-0.15, 0.15)
        v.co.z += random.uniform(-0.18, 0.10)

# florcitas y piedritas
for _ in range(24):
    ang = random.uniform(0, 6.28)
    rr = random.uniform(grass_r * 0.25, grass_r * 0.9)
    r = random.uniform(0.028, 0.05)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r,
        location=(math.cos(ang) * rr, math.sin(ang) * rr, r * 0.6))
    fl = bpy.context.active_object
    fl.name = "flor"
    fl.data.materials.append(MAT_FLOR_B if random.random() < 0.5 else MAT_FLOR_R)
for _ in range(3):
    ang = random.uniform(0, 6.28)
    rr = random.uniform(grass_r * 0.4, grass_r * 0.85)
    r = random.uniform(0.08, 0.14)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r,
        location=(math.cos(ang) * rr, math.sin(ang) * rr, r * 0.45))
    st = bpy.context.active_object
    st.name = "piedra"
    st.scale = (random.uniform(0.8, 1.3), random.uniform(0.8, 1.3),
                random.uniform(0.5, 0.8))
    st.rotation_euler = (0, 0, random.uniform(0, 3))
    st.data.materials.append(MAT_PIEDRA)

# ------------------------------------------------------------------ pivot
pivot = bpy.data.objects.new("pivot", None)
scene.collection.objects.link(pivot)
for ob in list(scene.objects):
    if ob.type in {'MESH', 'CURVE'}:
        ob.parent = pivot

# ------------------------------------------------------------------ bbox + tris (evaluado)
deps = bpy.context.evaluated_depsgraph_get()
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
max_r = 0.0
tri_total = 0
for ob in scene.objects:
    if ob.type not in {'MESH', 'CURVE'}:
        continue
    oe = ob.evaluated_get(deps)
    me = oe.to_mesh()
    tri_total += sum(len(p.vertices) - 2 for p in me.polygons)
    for v in me.vertices:
        w = oe.matrix_world @ v.co
        lo.x = min(lo.x, w.x); lo.y = min(lo.y, w.y); lo.z = min(lo.z, w.z)
        hi.x = max(hi.x, w.x); hi.y = max(hi.y, w.y); hi.z = max(hi.z, w.z)
        max_r = max(max_r, math.hypot(w.x, w.y))
    oe.to_mesh_clear()
print("=== TRIS:", tri_total)
print("=== ALTO:", round(hi.z - lo.z, 2), "MAXR:", round(max_r, 2))

# ------------------------------------------------------------------ luces
def add_sun(name, rot, energy, color, ang=28):
    li = bpy.data.lights.new(name, 'SUN')
    li.energy = energy
    li.color = color
    li.angle = math.radians(ang)
    ob = bpy.data.objects.new(name, li)
    ob.rotation_euler = rot
    scene.collection.objects.link(ob)

add_sun("sol_calido", (math.radians(48), 0, math.radians(-38)), 3.0, (1.0, 0.90, 0.78))
add_sun("relleno_frio", (math.radians(70), 0, math.radians(140)), 0.9, (0.72, 0.82, 1.0))
# rim rosado desde atras-arriba (camara esta en -Y)
add_sun("rim_rosa", (math.radians(62), 0, math.radians(180)), 1.6, (1.0, 0.62, 0.82), 18)

world = bpy.data.worlds.new("mundo")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.87, 0.88, 1.0, 1)
bg.inputs["Strength"].default_value = 0.6

# ------------------------------------------------------------------ camara portrait fija
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("camara", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

h = hi.z - lo.z
w = max_r * 2          # peor caso rotando
cz = (hi.z + lo.z) / 2
half_v = math.atan(18.0 / cam_data.lens)
half_h = math.atan(18.0 * 0.8 / cam_data.lens)
d_v = (h / FILL_FRACTION) / 2 / math.tan(half_v)
d_h = (w * 1.10) / 2 / math.tan(half_h)
dist = max(d_v, d_h)
cam.location = (0, -dist, cz)
cam.rotation_euler = (math.radians(90), 0, 0)
print("=== CAM dist", round(dist, 2))

# ------------------------------------------------------------------ render settings
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x = 800
scene.render.resolution_y = 1000
scene.eevee.taa_render_samples = SAMPLES

import os
os.makedirs(TT_DIR, exist_ok=True)

if TEST_MODE:
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = OUT_DIR + rf"\seed_test_{SEED}.png"
    bpy.ops.render.render(write_still=True)
    print("=== TEST RENDER:", scene.render.filepath)
else:
    # hero PNG (frame 0)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = OUT_DIR + r"\arbol_final.png"
    bpy.ops.render.render(write_still=True)
    print("=== HERO OK", round(time.time() - t0, 1), "s")
    # tambien pisamos arbol_test.png con el hero
    scene.render.filepath = OUT_DIR + r"\arbol_test.png"
    bpy.ops.render.render(write_still=True)
    # turntable WEBP
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 85
    for i in range(36):
        pivot.rotation_euler.z = math.radians(i * 10)
        scene.render.filepath = TT_DIR + rf"\sakura_{i:02d}.webp"
        bpy.ops.render.render(write_still=True)
    print("=== TURNTABLE OK", round(time.time() - t0, 1), "s total")
    pivot.rotation_euler.z = 0
    bpy.ops.wm.save_as_mainfile(filepath=OUT_DIR + r"\arbol_isla.blend")
    print("=== BLEND OK")
