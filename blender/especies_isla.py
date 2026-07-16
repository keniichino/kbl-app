# Especies de la app (arbolito / roble / flor) sobre isla flotante low poly
# Mismo estandar que arbol_isla.py (sakura). Camara e isla FIJAS para que el
# selector de la app no salte de escala entre especies.
#
# Uso:
#   blender.exe --background --python especies_isla.py -- --especie arbolito --test
#   blender.exe --background --python especies_isla.py -- --especie roble
#   blender.exe --background --python especies_isla.py -- --especie flor --seed 7
import bpy, math, random, sys, time, os
from mathutils import Vector

# ------------------------------------------------------------------ args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ESPECIE = "arbolito"
if "--especie" in argv:
    ESPECIE = argv[argv.index("--especie") + 1]
assert ESPECIE in ("arbolito", "roble", "flor"), ESPECIE
SEEDS_DEF = {"arbolito": 21, "roble": 31, "flor": 41}
SEED = SEEDS_DEF[ESPECIE]
if "--seed" in argv:
    SEED = int(argv[argv.index("--seed") + 1])
TEST_MODE = "--test" in argv
SAMPLES = 32 if TEST_MODE else 64

OUT_DIR = r"G:\Mi unidad\KBL APP Personal\blender"
TT_DIR = os.path.join(OUT_DIR, "turntable_" + ESPECIE)

# ------------------------------------------------------------------ constantes de encuadre (medidas de arbol_isla.blend)
CAM_DIST = 12.193          # misma camara que la sakura -> misma escala en pantalla
CAM_Z    = 0.962
CAM_LENS = 50.0
GRASS_R  = 2.48            # mismo radio de isla que la sakura
GRASS_TH = 0.30
CONE_D   = 1.9 * 0.62      # cono ~35% mas chato que el de la sakura
APEX_EXTRA = 0.22          # estiron del apice para punta definida

random.seed(SEED)
t0 = time.time()

def srgb2lin(hexstr):
    out = []
    for i in (0, 2, 4):
        c = int(hexstr[i:i+2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)

# paletas exactas de la app
PAL = {
    "arbolito": dict(light=srgb2lin("c8f59a"), mid=srgb2lin("7ed957"),
                     deep=srgb2lin("3d9433"), bark=srgb2lin("6e472f"),
                     rim=(0.85, 1.0, 0.72)),
    "roble":    dict(light=srgb2lin("a5ecbc"), mid=srgb2lin("4dc973"),
                     deep=srgb2lin("1f7a44"), bark=srgb2lin("4a3220"),
                     rim=(0.80, 1.0, 0.80)),
    "flor":     dict(light=srgb2lin("ffd3e8"), mid=srgb2lin("ff8fc7"),
                     deep=srgb2lin("c94b8e"), bark=srgb2lin("3d9433"),
                     rim=(1.0, 0.62, 0.82)),
}[ESPECIE]
COL_CENTRO  = srgb2lin("ffd76e")
COL_PASTO   = srgb2lin("6cc464")
COL_PASTO_B = srgb2lin("4aa851")
COL_TIERRA  = srgb2lin("6e4a32")
COL_TIERRA_D= srgb2lin("523624")
COL_PIEDRA  = srgb2lin("9a9a9a")
COL_HOJA    = srgb2lin("7ed957")

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

def ramp3_mat(name, deep, mid, light, soften=0.5, pos_mid=0.42, pos_light=0.80):
    """Material con variacion por objeto: deep->mid->light via Object Info Random."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    info = nt.nodes.new("ShaderNodeObjectInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    soft_deep = tuple(soften * d + (1 - soften) * mm for d, mm in zip(deep, mid))
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*soft_deep, 1)
    ramp.color_ramp.elements[1].position = pos_light
    ramp.color_ramp.elements[1].color = (*light, 1)
    e_mid = ramp.color_ramp.elements.new(pos_mid)
    e_mid.color = (*mid, 1)
    nt.links.new(info.outputs["Random"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m

MAT_BARK    = simple_mat("bark", PAL["bark"], 0.95)
RAMP_CFG = {  # soften, pos_mid, pos_light (mas alto = menos claro)
    "arbolito": (0.62, 0.42, 0.80),
    "roble":    (0.80, 0.52, 0.93),
    "flor":     (0.80, 0.38, 0.88),
}[ESPECIE]
MAT_COPA    = ramp3_mat("copa", PAL["deep"], PAL["mid"], PAL["light"],
                        soften=RAMP_CFG[0], pos_mid=RAMP_CFG[1],
                        pos_light=RAMP_CFG[2])
MAT_PASTO   = simple_mat("pasto", COL_PASTO, 0.95)
MAT_PASTO_B = simple_mat("pasto_borde", COL_PASTO_B, 0.95)
MAT_TIERRA  = simple_mat("tierra", COL_TIERRA, 1.0)
MAT_TIERRA_D= simple_mat("tierra_oscura", COL_TIERRA_D, 1.0)
MAT_PIEDRA  = simple_mat("piedra", COL_PIEDRA, 0.9)
MAT_FLOR_B  = simple_mat("flor_blanca", (0.9, 0.9, 0.92), 0.8)
MAT_FLOR_R  = simple_mat("flor_rosa", srgb2lin("ffc9e4"), 0.8)
MAT_HOJA    = simple_mat("hojita", COL_HOJA, 0.85)
MAT_PET_SUELTO = simple_mat("petalo_suelto",
                            tuple(0.55 * l + 0.45 * m for l, m in
                                  zip(PAL["light"], PAL["mid"])), 0.7)
MAT_CENTRO  = simple_mat("centro_flor", COL_CENTRO, 0.85)
MAT_TALLO   = simple_mat("tallo", srgb2lin("4aa851"), 0.9)

# ------------------------------------------------------------------ helpers de arbol (curva NURBS con bevel)
def new_tree_curve(name, mat):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 5
    cu.resolution_u = 12
    cu.fill_mode = 'FULL'
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return cu, ob

def add_spline(cu, points):
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, (co, r) in zip(sp.points, points):
        p.co = (co.x, co.y, co.z, 1.0)
        p.radius = r
    sp.use_endpoint_u = True
    sp.order_u = 4

def grow(cu, pos, dirv, length, r0, r1, jitter=0.28, up=0.10, tips=None):
    n = 7
    d = dirv.normalized()
    pts = [(pos.copy(), r0)]
    spawn = []
    step = length / n
    for i in range(1, n + 1):
        jit = Vector((random.uniform(-1, 1), random.uniform(-1, 1),
                      random.uniform(-0.3, 1.0))) * jitter
        d = (d + jit + Vector((0, 0, up))).normalized()
        pos = pos + d * step
        t = i / n
        r = r0 + (r1 - r0) * t
        pts.append((pos.copy(), r))
        if t >= 0.45:
            spawn.append((pos.copy(), d.copy(), r))
    add_spline(cu, pts)
    if tips is not None:
        tips.append((pos.copy(), d.copy()))
    return spawn, (pos.copy(), d.copy())

# ------------------------------------------------------------------ copa (icoesferas con displace)
tex = bpy.data.textures.new("clouds", 'CLOUDS')
tex.noise_scale = 0.75
tex.noise_depth = 2
tex_fine = bpy.data.textures.new("clouds_fino", 'CLOUDS')
tex_fine.noise_scale = 0.16
tex_fine.noise_depth = 2

clusters = []

def add_cluster(center, radius, squash=(0.7, 1.0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=radius,
                                          location=center)
    ob = bpy.context.active_object
    ob.name = "racimo"
    ob.scale = (random.uniform(0.85, 1.25),
                random.uniform(0.85, 1.25),
                random.uniform(*squash))
    ob.rotation_euler = (random.uniform(0, 3), random.uniform(0, 3),
                         random.uniform(0, 3))
    mod = ob.modifiers.new("disp", 'DISPLACE')
    mod.texture = tex
    mod.strength = radius * 0.38
    mod2 = ob.modifiers.new("disp_fino", 'DISPLACE')
    mod2.texture = tex_fine
    mod2.strength = radius * 0.10
    ob.data.materials.append(MAT_COPA)
    bpy.ops.object.shade_smooth()
    clusters.append((Vector(center), radius))
    return ob

# ------------------------------------------------------------------ hojita / petalo suelto (quad kite chico)
def make_quad_mesh(name, w, l, lift, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w, 0, 0), (0, l * 0.6, lift), (w, 0, 0), (0, -l * 0.4, lift)],
                   [], [(0, 1, 2, 3)])
    me.materials.append(mat)
    return me

def scatter_quad(me, loc, smin=0.8, smax=1.5):
    ob = bpy.data.objects.new(me.name, me)
    ob.location = loc
    ob.rotation_euler = (random.uniform(0, 6.28), random.uniform(0, 6.28),
                         random.uniform(0, 6.28))
    s = random.uniform(smin, smax)
    ob.scale = (s, s, s)
    scene.collection.objects.link(ob)
    return ob

# ------------------------------------------------------------------ ESPECIES
def build_arbolito():
    """Arbol clasico joven: copa redonda compacta, mas chico que la sakura."""
    cu, _ = new_tree_curve("tronco", MAT_BARK)
    tips = []
    # tronco corto
    _, (top, topd) = grow(cu, Vector((0, 0, 0)), Vector((0.06, -0.03, 1)),
                          0.85, 0.13, 0.075, jitter=0.14, up=0.18)
    # 4 ramitas cortas hacia la copa
    base_ang = random.uniform(0, math.pi * 2)
    for k in range(4):
        ang = base_ang + k * (math.pi / 2) + random.uniform(-0.3, 0.3)
        tilt = random.uniform(0.5, 0.85)
        d = Vector((math.cos(ang) * math.sin(tilt),
                    math.sin(ang) * math.sin(tilt), math.cos(tilt)))
        grow(cu, top, d, 0.75, 0.055, 0.02, jitter=0.22, up=0.12, tips=tips)
    # copa: blob esferico compacto alrededor de C
    C = Vector((0, 0, 2.05))
    add_cluster(C + Vector((0, 0, 0.02)), 0.74)
    for k in range(7):
        ang = k * (2 * math.pi / 7) + random.uniform(-0.22, 0.22)
        rr = random.uniform(0.55, 0.70)
        c = C + Vector((math.cos(ang) * rr, math.sin(ang) * rr,
                        random.uniform(-0.12, 0.18)))
        add_cluster(c, random.uniform(0.42, 0.52))
    add_cluster(C + Vector((random.uniform(-0.15, 0.15),
                            random.uniform(-0.15, 0.15), 0.60)),
                random.uniform(0.44, 0.52))
    for _ in range(2):
        c = C + Vector((random.uniform(-0.35, 0.35),
                        random.uniform(-0.35, 0.35),
                        random.uniform(-0.55, -0.42)))
        add_cluster(c, random.uniform(0.34, 0.42))
    # 3 hojitas verdes cayendo
    hoja_me = make_quad_mesh("hojita", 0.045, 0.10, 0.012, MAT_HOJA)
    for _ in range(3):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.35, 1.0)
        z = random.uniform(0.25, 1.3)
        scatter_quad(hoja_me, Vector((math.cos(ang) * rr,
                                      math.sin(ang) * rr, z)), 0.9, 1.3)

def build_roble():
    """Roble imponente: tronco grueso y alto, copa masiva y ancha en dos lobulos."""
    cu, _ = new_tree_curve("tronco", MAT_BARK)
    tips = []
    _, (top, topd) = grow(cu, Vector((0, 0, 0)), Vector((0.05, 0.02, 1)),
                          1.35, 0.27, 0.155, jitter=0.10, up=0.20)
    # lobulos de la copa
    lobeA = Vector((0.95, 0.10, 3.30))    # lobulo principal
    lobeB = Vector((-0.95, -0.12, 2.85))  # lobulo secundario
    # 5 ramas principales, apuntadas a los lobulos
    targets = [lobeA, lobeA, lobeA, lobeB, lobeB]
    lvl1 = []
    for i, tgt in enumerate(targets):
        goal = tgt + Vector((random.uniform(-0.5, 0.5),
                             random.uniform(-0.5, 0.5),
                             random.uniform(-0.3, 0.3)))
        d = (goal - top).normalized()
        sp, end = grow(cu, top, d, random.uniform(1.4, 1.7), 0.13, 0.045,
                       jitter=0.20, up=0.06, tips=tips)
        lvl1.append((sp, end))
    # sub-ramas
    for sp, end in lvl1:
        for (p, d, r) in random.sample(sp, min(2, len(sp))):
            dd = (d + Vector((random.uniform(-0.7, 0.7),
                              random.uniform(-0.7, 0.7),
                              random.uniform(0.1, 0.5)))).normalized()
            grow(cu, p, dd, 0.8, max(r * 0.55, 0.025), 0.015,
                 jitter=0.3, up=0.08, tips=tips)
    # clusters en puntas
    for (p, d) in tips:
        c = p + d * random.uniform(0.05, 0.2)
        add_cluster(c, random.uniform(0.42, 0.58))
    # relleno masivo alrededor de ambos lobulos (A mas denso)
    for lobe, n, spread in ((lobeA, 26, 0.62), (lobeB, 18, 0.55)):
        for _ in range(n):
            c = lobe + Vector((random.gauss(0, spread),
                               random.gauss(0, spread * 0.8),
                               random.gauss(0, spread * 0.62)))
            c.x = max(-1.85, min(1.85, c.x))
            c.y = max(-1.55, min(1.55, c.y))
            c.z = max(2.1, min(3.90, c.z))
            add_cluster(c, random.uniform(0.40, 0.60))
    # puente entre lobulos (mas bajo, para que se lean los dos lobulos)
    for _ in range(6):
        t = random.uniform(0.3, 0.7)
        c = lobeA.lerp(lobeB, t) + Vector((0, random.uniform(-0.35, 0.35),
                                           random.uniform(-0.25, 0.15)))
        add_cluster(c, random.uniform(0.40, 0.52))
    for _ in range(5):
        c = Vector((random.uniform(-1.3, 1.3), random.uniform(-0.8, 0.8),
                    random.uniform(1.95, 2.35)))
        add_cluster(c, random.uniform(0.36, 0.48))

def build_flor():
    """Flor gigante: tallo curvado con 2 hojas, 8 petalos kite + centro amarillo."""
    # tallo
    cu, _ = new_tree_curve("tallo", MAT_TALLO)
    stem_pts = [(Vector((0, 0, 0)), 0.10),
                (Vector((0.10, 0.04, 0.62)), 0.088),
                (Vector((0.27, 0.02, 1.28)), 0.075),
                (Vector((0.30, -0.10, 1.92)), 0.062),
                (Vector((0.15, -0.28, 2.38)), 0.055)]
    add_spline(cu, stem_pts)
    head_pos = Vector((0.12, -0.36, 2.52))
    tilt = math.radians(48)   # cabeza mirando arriba + hacia camara (-Y)

    head = bpy.data.objects.new("cabeza", None)
    head.location = head_pos
    head.rotation_euler = (tilt, 0, 0)
    scene.collection.objects.link(head)

    # petalo kite grande (apunta a +X local, con leve curvatura hacia arriba)
    L, W = 1.24, 0.50
    pet_me = bpy.data.meshes.new("petalo_kite")
    pet_me.from_pydata(
        [(0.14, 0, 0.02),
         (0.14 + L * 0.42, W, 0.07),
         (0.14 + L, 0, 0.16),
         (0.14 + L * 0.42, -W, 0.07),
         (0.14 + L * 0.42, 0, 0.03)],   # vertice central para leve concavidad
        [], [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)])
    pet_me.materials.append(MAT_COPA)   # ramp rosa por objeto
    for k in range(8):
        ob = bpy.data.objects.new("petalo", pet_me)
        ob.parent = head
        ob.rotation_euler = (random.uniform(-0.05, 0.05),
                             random.uniform(-0.10, -0.02),  # leve alzado
                             k * (math.pi / 4) + math.pi / 8
                             + random.uniform(-0.05, 0.05))
        s = random.uniform(0.96, 1.04)
        ob.scale = (s, s, s)
        scene.collection.objects.link(ob)

    # centro amarillo facetado (esfera achatada, flat shading)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.34,
                                          location=(0, 0, 0))
    cen = bpy.context.active_object
    cen.name = "centro"
    cen.parent = head
    cen.location = (0, 0, 0.10)
    cen.scale = (1, 1, 0.5)
    cen.data.materials.append(MAT_CENTRO)   # queda flat (facetado)

    # 2 hojas en el tallo
    hoja_me = bpy.data.meshes.new("hoja_tallo")
    hL, hW = 0.85, 0.30
    hoja_me.from_pydata(
        [(0.05, 0, 0), (hL * 0.45, hW, 0.10), (hL, 0, 0.30), (hL * 0.45, -hW, 0.10)],
        [], [(0, 1, 2, 3)])
    hoja_me.materials.append(MAT_HOJA)
    for (loc, angz, tiltx) in ((Vector((0.08, 0.05, 0.55)), math.radians(35), -0.15),
                               (Vector((0.26, 0.0, 1.22)), math.radians(205), -0.1)):
        ob = bpy.data.objects.new("hoja", hoja_me)
        ob.location = loc
        ob.rotation_euler = (tiltx, math.radians(-18), angz)
        scene.collection.objects.link(ob)

    # petalos sueltos cayendo
    pet_small = make_quad_mesh("petalo_suelto", 0.05, 0.12, 0.015, MAT_PET_SUELTO)
    for _ in range(6):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.35, 1.5)
        z = random.uniform(0.2, 1.7)
        scatter_quad(pet_small, Vector((math.cos(ang) * rr,
                                        math.sin(ang) * rr, z)), 0.9, 1.4)

{"arbolito": build_arbolito, "roble": build_roble, "flor": build_flor}[ESPECIE]()

# ------------------------------------------------------------------ isla flotante (aprobada, cono 35% mas chato)
bpy.ops.mesh.primitive_cylinder_add(vertices=22, radius=GRASS_R, depth=GRASS_TH,
                                    location=(0, 0, -GRASS_TH / 2))
disco = bpy.context.active_object
disco.name = "pasto"
disco.data.materials.append(MAT_PASTO)
disco.data.materials.append(MAT_PASTO_B)
for poly in disco.data.polygons:
    poly.material_index = 0 if poly.normal.z > 0.5 else 1
for v in disco.data.vertices:
    if abs(v.co.x) > 0.01 or abs(v.co.y) > 0.01:
        f = 1 + random.uniform(-0.05, 0.05)
        v.co.x *= f
        v.co.y *= f

bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=GRASS_R * 0.94, radius2=0,
                                depth=CONE_D,
                                location=(0, 0, -GRASS_TH - CONE_D / 2))
cono = bpy.context.active_object
cono.name = "tierra"
cono.data.materials.append(MAT_TIERRA)
cono.data.materials.append(MAT_TIERRA_D)
for poly in cono.data.polygons:
    poly.material_index = random.choice((0, 0, 1))
for v in cono.data.vertices:
    if abs(v.co.x) < 0.01 and abs(v.co.y) < 0.01:
        # apice: punta definida, sin jitter lateral, estirada hacia abajo
        v.co.z = -CONE_D / 2 - APEX_EXTRA
    elif v.co.z > CONE_D / 2 - 0.01:     # anillo superior: no tocar z
        v.co.x *= 1 + random.uniform(-0.06, 0.06)
        v.co.y *= 1 + random.uniform(-0.06, 0.06)
    else:
        v.co.x += random.uniform(-0.12, 0.12)
        v.co.y += random.uniform(-0.12, 0.12)
        v.co.z += random.uniform(-0.10, 0.06)

for _ in range(24):
    ang = random.uniform(0, 6.28)
    rr = random.uniform(GRASS_R * 0.25, GRASS_R * 0.9)
    r = random.uniform(0.028, 0.05)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r,
        location=(math.cos(ang) * rr, math.sin(ang) * rr, r * 0.6))
    fl = bpy.context.active_object
    fl.name = "flor_isla"
    fl.data.materials.append(MAT_FLOR_B if random.random() < 0.5 else MAT_FLOR_R)
for _ in range(3):
    ang = random.uniform(0, 6.28)
    rr = random.uniform(GRASS_R * 0.4, GRASS_R * 0.85)
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
    if ob.type in {'MESH', 'CURVE'} and ob.parent is None:
        ob.parent = pivot
    elif ob.type == 'EMPTY' and ob.name == "cabeza":
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
print("=== ALTO:", round(hi.z - lo.z, 2), "TOPE:", round(hi.z, 2),
      "MAXR:", round(max_r, 2))

# chequeo analitico de clipping en el peor angulo del turntable
half_v = math.atan(18.0 / CAM_LENS)
half_h = math.atan(18.0 * 0.8 / CAM_LENS)
near = CAM_DIST - max_r
vis_w = near * math.tan(half_h)
vis_top = CAM_Z + near * math.tan(half_v)
vis_bot = CAM_Z - near * math.tan(half_v)
print("=== MARGEN ancho:", round(vis_w - max_r, 2),
      "| arriba:", round(vis_top - hi.z, 2),
      "| abajo:", round(lo.z - vis_bot, 2))

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
add_sun("rim", (math.radians(62), 0, math.radians(180)), 1.6, PAL["rim"], 18)

world = bpy.data.worlds.new("mundo")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.87, 0.88, 1.0, 1)
bg.inputs["Strength"].default_value = 0.6

# ------------------------------------------------------------------ camara FIJA (identica a la sakura)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = CAM_LENS
cam = bpy.data.objects.new("camara", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam.location = (0, -CAM_DIST, CAM_Z)
cam.rotation_euler = (math.radians(90), 0, 0)

# ------------------------------------------------------------------ render settings
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x = 800
scene.render.resolution_y = 1000
scene.eevee.taa_render_samples = SAMPLES

os.makedirs(TT_DIR, exist_ok=True)

def check_border_alpha(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = img.pixels[:]
    def a(x, y): return px[4 * (y * w + x) + 3]
    mx = 0.0
    band = 2
    for x in range(w):
        for y in (list(range(band)) + list(range(h - band, h))):
            v = a(x, y)
            if v > mx: mx = v
    for y in range(h):
        for x in (list(range(band)) + list(range(w - band, w))):
            v = a(x, y)
            if v > mx: mx = v
    bpy.data.images.remove(img)
    print("=== BORDER ALPHA MAX:", round(mx, 3), ("CLIPPING!" if mx > 0.01 else "ok"))

scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
if TEST_MODE:
    scene.render.filepath = os.path.join(OUT_DIR, f"test_{ESPECIE}_{SEED}.png")
    bpy.ops.render.render(write_still=True)
    check_border_alpha(scene.render.filepath)
    print("=== TEST RENDER:", scene.render.filepath)
else:
    # hero PNG (frame 0)
    scene.render.filepath = os.path.join(TT_DIR, "hero.png")
    bpy.ops.render.render(write_still=True)
    check_border_alpha(scene.render.filepath)
    print("=== HERO OK", round(time.time() - t0, 1), "s")
    # turntable WEBP
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.quality = 85
    for i in range(36):
        pivot.rotation_euler.z = math.radians(i * 10)
        scene.render.filepath = os.path.join(TT_DIR, f"{i:02d}.webp")
        bpy.ops.render.render(write_still=True)
    print("=== TURNTABLE OK", round(time.time() - t0, 1), "s total")
    pivot.rotation_euler.z = 0
    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.join(OUT_DIR, f"{ESPECIE}_isla.blend"))
    print("=== BLEND OK")
