# Arbol sakura procedural — estilo "3D render dreamy"
# Corre headless: blender.exe --background --python arbol_sakura.py
import bpy, math, random
from mathutils import Vector

# ------------------------------------------------------------------ params
SEED           = 11
TREE_H         = 4.0          # altura objetivo aprox del arbol
TRUNK_LEN      = 0.92
TRUNK_R        = 0.15
LEVELS         = 3            # trunk + 2 niveles de ramas
FILL_FRACTION  = 0.85         # arbol ocupa este % del alto del cuadro
N_EXTRA_CLOUD  = 48           # esferas extra para densificar la copa
CLUSTER_R      = (0.32, 0.52) # rango de radio de racimos
OUT_DIR        = r"G:\Mi unidad\KBL APP Personal\blender"
OUT_PNG        = OUT_DIR + r"\arbol_test.png"
OUT_BLEND      = OUT_DIR + r"\arbol_trabajo.blend"

random.seed(SEED)

def srgb2lin(hexstr):
    out = []
    for i in (0, 2, 4):
        c = int(hexstr[i:i+2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)

COL_BARK   = srgb2lin("3a2820")
COL_MID    = srgb2lin("f272b6")
COL_LIGHT  = srgb2lin("ffc9e4")
COL_DARK   = srgb2lin("ad3d7f")

# ------------------------------------------------------------------ escena limpia
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ------------------------------------------------------------------ materiales
def make_bark():
    m = bpy.data.materials.new("bark")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*COL_BARK, 1)
    bsdf.inputs["Roughness"].default_value = 0.95
    return m

def make_blossom():
    m = bpy.data.materials.new("blossom")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    info = nt.nodes.new("ShaderNodeObjectInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    soft_dark = tuple(0.42 * d + 0.58 * m for d, m in zip(COL_DARK, COL_MID))
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*soft_dark, 1)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (*COL_LIGHT, 1)
    mid = ramp.color_ramp.elements.new(0.4)
    mid.color = (*COL_MID, 1)
    nt.links.new(info.outputs["Random"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m

MAT_BARK = make_bark()
MAT_BLOSSOM = make_blossom()

# ------------------------------------------------------------------ tronco y ramas (curva con bevel)
cu = bpy.data.curves.new("tree", 'CURVE')
cu.dimensions = '3D'
cu.bevel_depth = 1.0          # el radio por punto multiplica esto
cu.bevel_resolution = 5
cu.resolution_u = 12
cu.fill_mode = 'FULL'
tree_obj = bpy.data.objects.new("tronco", cu)
scene.collection.objects.link(tree_obj)
tree_obj.data.materials.append(MAT_BARK)

tips = []   # (pos, dir) puntas donde van los racimos

def add_spline(points):
    """points: lista de (Vector, radius)"""
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, (co, r) in zip(sp.points, points):
        p.co = (co.x, co.y, co.z, 1.0)
        p.radius = r
    sp.use_endpoint_u = True
    sp.order_u = 4

def grow(pos, dirv, length, r0, r1, level):
    """crece una rama; devuelve puntos de spawn para hijos"""
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

# tronco: leve curva en S, apoyado en z=0
spawn0, (top, topd) = grow(Vector((0, 0, 0)), Vector((0.12, -0.05, 1)),
                           TRUNK_LEN, TRUNK_R, TRUNK_R * 0.55, 0)

# nivel 1: ramas principales abiertas en abanico
n_main = 4
base_ang = random.uniform(0, math.pi * 2)
level1_ends = []
for k in range(n_main):
    ang = base_ang + k * (2 * math.pi / n_main) + random.uniform(-0.4, 0.4)
    tilt = random.uniform(0.65, 1.1)           # apertura respecto de vertical
    d = Vector((math.cos(ang) * math.sin(tilt),
                math.sin(ang) * math.sin(tilt),
                math.cos(tilt)))
    src = top if k < 3 else spawn0[len(spawn0) // 2][0]
    r_here = TRUNK_R * 0.55 if k < 3 else spawn0[len(spawn0) // 2][2]
    sp, end = grow(src, d, TREE_H * 0.42, r_here * 0.8, r_here * 0.32, 1)
    level1_ends.append((sp, end))

# nivel 2: twigs
for sp, end in level1_ends:
    picks = random.sample(sp, min(2, len(sp))) + [end + (None,)][:0]
    # twigs desde puntos de la rama + una continuacion desde la punta
    srcs = [(p, d, r) for (p, d, r) in picks]
    srcs.append((end[0], end[1], TRUNK_R * 0.18))
    for (p, d, r) in srcs:
        dd = (d + Vector((random.uniform(-0.8, 0.8),
                          random.uniform(-0.8, 0.8),
                          random.uniform(0.05, 0.5)))).normalized()
        grow(p, dd, TREE_H * 0.22, max(r * 0.6, 0.02), 0.012, 2)

# ------------------------------------------------------------------ copa: racimos de icoesferas desplazadas
tex = bpy.data.textures.new("clouds", 'CLOUDS')
tex.noise_scale = 0.75
tex.noise_depth = 2

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
    ob.data.materials.append(MAT_BLOSSOM)
    bpy.ops.object.shade_smooth()
    return ob

cluster_centers = []
# racimos chicos sobre los codos de las ramas principales (tapan la zona pelada)
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

# densificar: esferas entre puntas y centroide de la copa
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
    # racimos colgantes para que la copa caiga como sakura
    low_tips = sorted(cluster_centers, key=lambda v: v.z)[:5]
    for a in low_tips:
        c = a + Vector((random.uniform(-0.25, 0.25),
                        random.uniform(-0.25, 0.25),
                        random.uniform(-0.55, -0.2)))
        add_cluster(c, random.uniform(CLUSTER_R[0] * 0.8, CLUSTER_R[0] * 1.1))

# ------------------------------------------------------------------ bbox global (evaluado)
deps = bpy.context.evaluated_depsgraph_get()
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
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
    oe.to_mesh_clear()
print("=== TRIS:", tri_total)
print("=== BBOX lo", tuple(round(v, 2) for v in lo), "hi", tuple(round(v, 2) for v in hi))

# ------------------------------------------------------------------ luces
def add_sun(name, rot, energy, color):
    li = bpy.data.lights.new(name, 'SUN')
    li.energy = energy
    li.color = color
    li.angle = math.radians(28)
    ob = bpy.data.objects.new(name, li)
    ob.rotation_euler = rot
    scene.collection.objects.link(ob)

add_sun("sol_calido", (math.radians(48), 0, math.radians(-38)), 3.0, (1.0, 0.90, 0.78))
add_sun("relleno_frio", (math.radians(70), 0, math.radians(140)), 0.9, (0.72, 0.82, 1.0))

world = bpy.data.worlds.new("mundo")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.87, 0.88, 1.0, 1)
bg.inputs["Strength"].default_value = 0.6

# ------------------------------------------------------------------ camara portrait
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("camara", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

h = hi.z - lo.z
w = max(hi.x - lo.x, hi.y - lo.y)
cz = (hi.z + lo.z) / 2
# FOV vertical: sensor fit AUTO usa 36mm en la dimension mayor (Y aca)
half_v = math.atan(18.0 / cam_data.lens)
half_h = math.atan(18.0 * 0.8 / cam_data.lens)   # 800/1000
d_v = (h / FILL_FRACTION) / 2 / math.tan(half_v)
d_h = (w * 1.12) / 2 / math.tan(half_h)
dist = max(d_v, d_h)
cx = (hi.x + lo.x) / 2
cy = (hi.y + lo.y) / 2
cam.location = (cx, cy - dist, cz)
cam.rotation_euler = (math.radians(90), 0, 0)
print("=== CAM dist", round(dist, 2), "h", round(h, 2), "w", round(w, 2))

# ------------------------------------------------------------------ render
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x = 800
scene.render.resolution_y = 1000
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = OUT_PNG
try:
    scene.eevee.taa_render_samples = 64
except Exception:
    pass

bpy.ops.render.render(write_still=True)
print("=== RENDER OK:", OUT_PNG)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("=== BLEND OK:", OUT_BLEND)
