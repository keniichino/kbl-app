# Especies de la app (arbolito / roble / flor / sakura) sobre isla flotante low poly
# Mismo estandar que arbol_isla.py (sakura). Camara e isla FIJAS para que el
# selector de la app no salte de escala entre especies.
#
# Uso:
#   blender.exe --background --python especies_isla.py -- --especie arbolito --test
#   blender.exe --background --python especies_isla.py -- --especie roble
#   blender.exe --background --python especies_isla.py -- --especie flor --seed 7
#   blender.exe --background --python especies_isla.py -- --especie sakura
import bpy, math, random, sys, time, os
from mathutils import Vector

# ------------------------------------------------------------------ args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ESPECIE = "arbolito"
if "--especie" in argv:
    ESPECIE = argv[argv.index("--especie") + 1]
assert ESPECIE in ("arbolito", "roble", "flor", "sakura", "bonsai"), ESPECIE
SEEDS_DEF = {"arbolito": 21, "roble": 31, "flor": 41, "sakura": 11, "bonsai": 51}
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
    "sakura":   dict(light=srgb2lin("ffc9e4"), mid=srgb2lin("f272b6"),
                     deep=srgb2lin("ad3d7f"), bark=srgb2lin("3a2820"),
                     rim=(1.0, 0.62, 0.82)),
    "bonsai":   dict(light=srgb2lin("7fa88f"), mid=srgb2lin("335c48"),
                     deep=srgb2lin("15281f"), bark=srgb2lin("4d4235"),
                     rim=(0.72, 0.92, 0.86)),
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

def ramp3_mat(name, deep, mid, light, soften=0.5, pos_mid=0.42, pos_light=0.80,
              discreto=False):
    """Material con variacion por objeto: deep->mid->light via Object Info Random."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    info = nt.nodes.new("ShaderNodeObjectInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    if discreto:
        ramp.color_ramp.interpolation = 'CONSTANT'
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
RAMP_CFG = {  # soften, pos_mid, pos_light, discreto
    "arbolito": (0.62, 0.42, 0.80, False),
    "roble":    (0.90, 0.30, 0.85, True),   # tri-tono franco, sin pastel
    "flor":     (0.80, 0.38, 0.88, False),
    "sakura":   (0.42, 0.40, 0.78, False),  # mismo ramp que make_blossom original
    "bonsai":   (0.88, 0.30, 0.80, True),   # verde bosque musgoso, discreto (sin pastel)
}[ESPECIE]
MAT_COPA    = ramp3_mat("copa", PAL["deep"], PAL["mid"], PAL["light"],
                        soften=RAMP_CFG[0], pos_mid=RAMP_CFG[1],
                        pos_light=RAMP_CFG[2], discreto=RAMP_CFG[3])
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
MAT_HOJA_CAIDA = simple_mat("hoja_caida",
                            tuple(0.6 * d + 0.4 * m for d, m in
                                  zip(PAL["deep"], PAL["mid"])), 0.85)

# ------------------------------------------------------------------ sombra de contacto (AO manual para objetos apoyados)
MAT_SOMBRA = bpy.data.materials.new("sombra_contacto")
MAT_SOMBRA.use_nodes = True
_sb = MAT_SOMBRA.node_tree.nodes["Principled BSDF"]
_sb.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1)
_sb.inputs["Roughness"].default_value = 1.0
if "Alpha" in _sb.inputs:
    _sb.inputs["Alpha"].default_value = 0.30
MAT_SOMBRA.blend_method = 'BLEND'
MAT_SOMBRA.surface_render_method = 'BLENDED'
MAT_SOMBRA.show_transparent_back = False
MAT_SOMBRA.use_transparent_shadow = True

def add_ground_shadow(loc, radius):
    """Disco chato semitransparente para dar sensacion de apoyo (contact shadow)."""
    bpy.ops.mesh.primitive_circle_add(vertices=12, radius=radius, fill_type='NGON',
                                      location=(loc.x, loc.y, 0.0015))
    ob = bpy.context.active_object
    ob.name = "sombra"
    ob.data.materials.append(MAT_SOMBRA)
    return ob

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

def add_cluster(center, radius, squash=(0.7, 1.0), mat=None, disp_scale=1.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=radius,
                                          location=center)
    ob = bpy.context.active_object
    ob.name = "racimo"
    ob.scale = (random.uniform(0.76, 1.34),
                random.uniform(0.76, 1.34),
                random.uniform(*squash))
    ob.rotation_euler = (random.uniform(0, 6.28), random.uniform(0, 6.28),
                         random.uniform(0, 6.28))
    mod = ob.modifiers.new("disp", 'DISPLACE')
    mod.texture = tex
    mod.strength = radius * 0.38 * disp_scale
    mod2 = ob.modifiers.new("disp_fino", 'DISPLACE')
    mod2.texture = tex_fine
    mod2.strength = radius * 0.10 * disp_scale
    ob.data.materials.append(mat if mat is not None else MAT_COPA)
    bpy.ops.object.shade_smooth()
    clusters.append((Vector(center), radius))
    return ob

def add_pad(center, radius, tilt=0.0, mat=None):
    """Almohadilla de follaje aplanada y escalonada (rasgo distintivo del bonsai
    podado): 2 anillos de racimos chatos + nucleo, sin una bocha dominante, para
    que el conjunto lea como un disco continuo y no como una pelota apachurrada."""
    add_cluster(center, radius * 0.34, squash=(0.16, 0.22), mat=mat, disp_scale=0.5)
    rings = [(radius * 0.40, 6, radius * 0.28), (radius * 0.70, 8, radius * 0.22)]
    for rr0, n, rad in rings:
        for k in range(n):
            ang = k * (2 * math.pi / n) + random.uniform(-0.15, 0.15)
            rr = rr0 * random.uniform(0.9, 1.08)
            z = math.sin(ang + tilt) * radius * 0.10 + random.uniform(-0.02, 0.02)
            c = center + Vector((math.cos(ang) * rr, math.sin(ang) * rr, z))
            add_cluster(c, rad * random.uniform(0.85, 1.1), squash=(0.16, 0.24),
                       mat=mat, disp_scale=0.5)

# ------------------------------------------------------------------ hojita / petalo suelto (quad kite chico)
def make_quad_mesh(name, w, l, lift, mat):
    me = bpy.data.meshes.new(name)
    # winding invertido a proposito (0,3,2,1) para que la normal quede +Z: al
    # quedar apoyada casi plana sobre el pasto necesita mostrar la cara de
    # arriba correctamente iluminada (si no, se ve casi negra a contraluz).
    me.from_pydata([(-w, 0, 0), (0, l * 0.6, lift), (w, 0, 0), (0, -l * 0.4, lift)],
                   [], [(0, 3, 2, 1)])
    me.materials.append(mat)
    return me

def scatter_quad(me, loc, smin=0.8, smax=1.5, grounded=False):
    """grounded=True: lo apoya sobre el pasto (rotacion casi plana + sombra de
    contacto) en vez de dejarlo flotando a media altura."""
    ob = bpy.data.objects.new(me.name, me)
    s = random.uniform(smin, smax)
    if grounded:
        ob.location = (loc.x, loc.y, random.uniform(0.13, 0.19))
        ob.rotation_euler = (random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3),
                             random.uniform(0, 6.28))
    else:
        ob.location = loc
        ob.rotation_euler = (random.uniform(0, 6.28), random.uniform(0, 6.28),
                             random.uniform(0, 6.28))
    ob.scale = (s, s, s)
    scene.collection.objects.link(ob)
    if grounded:
        add_ground_shadow(Vector((loc.x, loc.y, 0)), radius=max(0.05, s * 0.11))
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
    # hojitas verdes: unas cayendo a media altura, otras ya apoyadas en el pasto
    hoja_me = make_quad_mesh("hojita", 0.045, 0.10, 0.012, MAT_HOJA)
    for _ in range(2):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.35, 1.0)
        z = random.uniform(0.35, 1.3)
        scatter_quad(hoja_me, Vector((math.cos(ang) * rr,
                                      math.sin(ang) * rr, z)), 0.9, 1.3)
    for _ in range(3):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.4, 2.1)
        scatter_quad(hoja_me, Vector((math.cos(ang) * rr,
                                      math.sin(ang) * rr, 0)), 0.9, 1.3,
                    grounded=True)

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
    # spread en Y llevado casi a la par de X (antes *0.8) para que el lobulo
    # no se vea flaco de perfil (rotacion 90/270 del turntable)
    for lobe, n, spread in ((lobeA, 26, 0.62), (lobeB, 18, 0.55)):
        for _ in range(n):
            c = lobe + Vector((random.gauss(0, spread),
                               random.gauss(0, spread * 0.98),
                               random.gauss(0, spread * 0.62)))
            c.x = max(-1.85, min(1.85, c.x))
            c.y = max(-1.72, min(1.72, c.y))
            c.z = max(2.1, min(3.90, c.z))
            add_cluster(c, random.uniform(0.40, 0.60))
    # puente entre lobulos (mas bajo, para que se lean los dos lobulos)
    for _ in range(6):
        t = random.uniform(0.3, 0.7)
        c = lobeA.lerp(lobeB, t) + Vector((0, random.uniform(-0.42, 0.42),
                                           random.uniform(-0.25, 0.15)))
        add_cluster(c, random.uniform(0.40, 0.52))
    for _ in range(5):
        c = Vector((random.uniform(-1.3, 1.3), random.uniform(-0.95, 0.95),
                    random.uniform(1.95, 2.35)))
        add_cluster(c, random.uniform(0.36, 0.48))
    # hojas caidas: color otonal (mezcla deep/mid), unas flotando, otras apoyadas
    hoja_me = make_quad_mesh("hoja_roble", 0.05, 0.11, 0.012, MAT_HOJA_CAIDA)
    for _ in range(4):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.4, 1.4)
        z = random.uniform(0.4, 1.6)
        scatter_quad(hoja_me, Vector((math.cos(ang) * rr,
                                      math.sin(ang) * rr, z)), 0.9, 1.35)
    for _ in range(5):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.4, 2.15)
        scatter_quad(hoja_me, Vector((math.cos(ang) * rr,
                                      math.sin(ang) * rr, 0)), 0.9, 1.35,
                    grounded=True)

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
    # colores explicitos por petalo (mayoria mid, toques light y un deep)
    mat_p_light = simple_mat("petalo_light", PAL["light"], 0.85)
    mat_p_mid   = simple_mat("petalo_mid", PAL["mid"], 0.85)
    mat_p_deep  = simple_mat("petalo_deep",
                             tuple(0.55 * d + 0.45 * m for d, m in
                                   zip(PAL["deep"], PAL["mid"])), 0.85)
    orden = [mat_p_mid, mat_p_light, mat_p_mid, mat_p_light,
             mat_p_mid, mat_p_deep, mat_p_mid, mat_p_light]
    meshes_pet = []
    for mat in (mat_p_mid, mat_p_light, mat_p_deep):
        me = pet_me.copy()
        me.materials.append(mat)
        meshes_pet.append(me)
    lut = {mat_p_mid: meshes_pet[0], mat_p_light: meshes_pet[1],
           mat_p_deep: meshes_pet[2]}
    for k in range(8):
        ob = bpy.data.objects.new("petalo", lut[orden[k]])
        ob.parent = head
        ob.rotation_euler = (random.uniform(-0.09, 0.09),
                             random.uniform(-0.16, 0.02),  # leve alzado, mas variado
                             k * (math.pi / 4) + math.pi / 8
                             + random.uniform(-0.09, 0.09))
        s = random.uniform(0.88, 1.14)
        ob.scale = (s, s, s * random.uniform(0.94, 1.06))
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

    # petalos sueltos: algunos cayendo a media altura, otros ya en el pasto
    pet_small = make_quad_mesh("petalo_suelto", 0.05, 0.12, 0.015, MAT_PET_SUELTO)
    for _ in range(3):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.35, 1.5)
        z = random.uniform(0.3, 1.7)
        scatter_quad(pet_small, Vector((math.cos(ang) * rr,
                                        math.sin(ang) * rr, z)), 0.9, 1.4)
    for _ in range(4):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.4, 2.2)
        scatter_quad(pet_small, Vector((math.cos(ang) * rr,
                                        math.sin(ang) * rr, 0)), 0.9, 1.4,
                    grounded=True)

def build_sakura():
    """Sakura dreamy: port 1:1 del arbol de arbol_isla.py (seed 11).
    Replica la MISMA secuencia de llamadas random que el original para
    reproducir la geometria aprobada; solo cambian isla y pipeline."""
    TREE_H, TRUNK_R = 4.0, 0.15
    cu, _ = new_tree_curve("tronco", MAT_BARK)
    tips = []
    # tronco (level 0 original: jitter 0.28*0.5, up 0.22)
    spawn0, (top, topd) = grow(cu, Vector((0, 0, 0)), Vector((0.12, -0.05, 1)),
                               0.92, TRUNK_R, TRUNK_R * 0.55,
                               jitter=0.14, up=0.22)
    # 4 ramas principales (level 1)
    base_ang = random.uniform(0, math.pi * 2)
    level1_ends = []
    for k in range(4):
        ang = base_ang + k * (2 * math.pi / 4) + random.uniform(-0.4, 0.4)
        tilt = random.uniform(0.65, 1.1)
        d = Vector((math.cos(ang) * math.sin(tilt),
                    math.sin(ang) * math.sin(tilt), math.cos(tilt)))
        src = top if k < 3 else spawn0[len(spawn0) // 2][0]
        r_here = TRUNK_R * 0.55 if k < 3 else spawn0[len(spawn0) // 2][2]
        sp, end = grow(cu, src, d, TREE_H * 0.42, r_here * 0.8, r_here * 0.32,
                       jitter=0.28, up=0.10)
        level1_ends.append((sp, end))
    # sub-ramas (level 2, alimentan tips)
    for sp, end in level1_ends:
        picks = random.sample(sp, min(2, len(sp)))
        srcs = [(p, d, r) for (p, d, r) in picks]
        srcs.append((end[0], end[1], TRUNK_R * 0.18))
        for (p, d, r) in srcs:
            dd = (d + Vector((random.uniform(-0.8, 0.8),
                              random.uniform(-0.8, 0.8),
                              random.uniform(0.05, 0.5)))).normalized()
            grow(cu, p, dd, TREE_H * 0.22, max(r * 0.6, 0.02), 0.012,
                 jitter=0.28, up=0.10, tips=tips)
    # copa: racimos chicos sobre ramas medias + grandes en puntas + nube extra
    cluster_centers = []
    for sp, end in level1_ends:
        for (p, d, r) in sp[-2:]:
            c = p + Vector((random.uniform(-0.1, 0.1),
                            random.uniform(-0.1, 0.1),
                            random.uniform(0.02, 0.15)))
            add_cluster(c, random.uniform(0.24, 0.34))
    for (p, d) in tips:
        c = p + d * random.uniform(0.05, 0.2)
        add_cluster(c, random.uniform(0.32, 0.52))
        cluster_centers.append(c)
    centroid = sum(cluster_centers, Vector()) / len(cluster_centers)
    centroid.z += 0.15
    for _ in range(48):
        a = random.choice(cluster_centers)
        t = random.uniform(0.15, 0.75)
        c = a.lerp(centroid, t) + Vector((random.uniform(-0.6, 0.6),
                                          random.uniform(-0.6, 0.6),
                                          random.uniform(-0.5, 0.45)))
        add_cluster(c, random.uniform(0.32 * 0.9, 0.52 * 1.15))
    low_tips = sorted(cluster_centers, key=lambda v: v.z)[:5]
    for a in low_tips:
        c = a + Vector((random.uniform(-0.25, 0.25),
                        random.uniform(-0.25, 0.25),
                        random.uniform(-0.55, -0.2)))
        add_cluster(c, random.uniform(0.32 * 0.8, 0.32 * 1.1))
    canopy_r = max(math.hypot(c.x, c.y) + r for c, r in clusters)
    canopy_lo = min(c.z - r for c, r in clusters)
    # petalos instanciados (130 sobre copa + 36 cayendo = 166)
    mat_pet = simple_mat("petalo_sakura",
                         tuple(0.6 * l + 0.4 for l in PAL["light"]), 0.7)
    pet_me = bpy.data.meshes.new("petalo")
    pet_me.from_pydata(
        [(-0.035, 0, 0), (0, 0.024, 0.007), (0.035, 0, 0), (0, -0.024, 0.007)],
        [], [(0, 1, 2, 3)])
    pet_me.materials.append(mat_pet)
    for _ in range(130):
        c, r = random.choice(clusters)
        d = Vector((random.gauss(0, 1), random.gauss(0, 1),
                    abs(random.gauss(0, 0.9)))).normalized()
        scatter_quad(pet_me, c + d * r * random.uniform(1.0, 1.12))
    for _ in range(20):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.25, canopy_r * 0.7)
        z = random.uniform(0.35, canopy_lo + 0.4)
        scatter_quad(pet_me, Vector((math.cos(ang) * rr,
                                     math.sin(ang) * rr, z)))
    for _ in range(16):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.3, canopy_r * 0.92)
        scatter_quad(pet_me, Vector((math.cos(ang) * rr,
                                     math.sin(ang) * rr, 0)), grounded=True)

BONSAI_SCALE = 1.95   # escala del arbol (tronco+ramas+almohadillas) para llenar
                      # el cuadro igual que las otras especies; la decoracion de
                      # piso (musgo/hojas caidas/piedra zen) queda sin escalar
                      # para no salirse del radio de la isla.

def build_bonsai():
    """Bonsai japones: tronco retorcido en S marcada (grueso en la base,
    corteza rugosa via displace), copas en 5 almohadillas planas y escalonadas
    a distintas alturas/angulos (no una copa esferica), paleta verde bosque
    musgoso con un puñado de hojas de acento otonal quemado."""
    _antes = set(scene.objects)

    cu, trunk_ob = new_tree_curve("tronco", MAT_BARK)
    cu.bevel_resolution = 8    # mas resolucion que el default (5): la corteza
    cu.resolution_u = 16       # rugosa via displace necesita mas geometria para leerse
    # curva en S bien marcada: grueso en la base, se afina y serpentea al subir
    trunk_pts = [
        (Vector((0.00,  0.00, 0.00)), 0.34),
        (Vector((0.20,  0.05, 0.22)), 0.29),
        (Vector((0.44, -0.07, 0.50)), 0.225),
        (Vector((0.18, -0.20, 0.82)), 0.175),
        (Vector((-0.30, -0.06, 1.10)), 0.135),
        (Vector((-0.42,  0.12, 1.38)), 0.100),
        (Vector((-0.10,  0.14, 1.62)), 0.078),
        (Vector((0.18,  0.02, 1.86)), 0.058),
    ]
    add_spline(cu, trunk_pts)

    MAT_ACCENT = simple_mat("bonsai_acento", srgb2lin("b3451f"), 0.85)

    def branch_to(anchor, direction, length, r0, up1=-0.02, up2=0.48):
        """Rama corta que primero cae/se abre (estilo podado) y despues
        levanta la punta -> silueta clasica que sostiene la almohadilla."""
        d = Vector(direction).normalized()
        _, (mid, midd) = grow(cu, anchor, d, length * 0.55, r0, r0 * 0.55,
                              jitter=0.12, up=up1)
        _, (tip, tipd) = grow(cu, mid, midd, length * 0.45, r0 * 0.55, r0 * 0.28,
                              jitter=0.12, up=up2)
        return tip

    anchors = [
        (trunk_pts[2][0], ( 0.85,  0.30, -0.05), 0.45, 0.075),
        (trunk_pts[3][0], (-0.72, -0.26,  0.05), 0.43, 0.062),
        (trunk_pts[5][0], ( 0.48, -0.62,  0.10), 0.38, 0.050),
        (trunk_pts[6][0], (-0.55,  0.46,  0.20), 0.32, 0.040),
    ]
    # IMPORTANTE: todas las ramas (grow -> cu.splines.new) tienen que crearse
    # ANTES de convertir el tronco a mesh; si no, quedan en un datablock huerfano
    # y no se ven (bug detectado en la 1ra iteracion: las ramas no aparecian).
    pad_centers = [branch_to(a, d, l, r) for a, d, l, r in anchors]
    pad_centers.append(trunk_pts[-1][0] + Vector((0.08, -0.02, 0.16)))  # apice

    # corteza vieja/rugosa: displace sobre el tronco+ramas ya completos (no solo
    # en la copa). Displace no aplica a objetos CURVE -> se convierte a MESH.
    bpy.context.view_layer.objects.active = trunk_ob
    trunk_ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    trunk_ob = bpy.context.view_layer.objects.active
    tex_bark = bpy.data.textures.new("bark_rough", 'STUCCI')
    tex_bark.noise_scale = 0.16
    tex_bark.turbulence = 6.0
    mod = trunk_ob.modifiers.new("bark_disp", 'DISPLACE')
    mod.texture = tex_bark
    mod.strength = 0.075
    mod.mid_level = 0.5
    tex_bark2 = bpy.data.textures.new("bark_fino", 'CLOUDS')
    tex_bark2.noise_scale = 0.06
    mod3 = trunk_ob.modifiers.new("bark_disp_fino", 'DISPLACE')
    mod3.texture = tex_bark2
    mod3.strength = 0.025
    bpy.ops.object.shade_smooth()
    trunk_ob.select_set(False)

    pad_radii = [0.60, 0.54, 0.47, 0.40, 0.33]  # decrecen hacia el apice
    for i, (c, r) in enumerate(zip(pad_centers, pad_radii)):
        add_pad(c, r, tilt=i * 1.1)

    # acento otonal: puñado sutil de hojas quemadas cerca del borde de una
    # almohadilla intermedia (chico, no debe dominar la lectura verde-musgo)
    acc_pad, acc_r = pad_centers[2], pad_radii[2]
    for _ in range(6):
        ang = random.uniform(0, 6.28)
        rr = acc_r * random.uniform(0.75, 1.05)
        c = acc_pad + Vector((math.cos(ang) * rr, math.sin(ang) * rr,
                              random.uniform(0.02, 0.10)))
        add_cluster(c, random.uniform(0.035, 0.055), squash=(0.5, 0.7),
                   mat=MAT_ACCENT)

    # todo lo de arriba (tronco+ramas+almohadillas+acento) se agrupa en un root
    # que se escala como conjunto para llenar el cuadro (el bonsai es mas bajo
    # y ancho por naturaleza, pero necesita la misma presencia visual).
    canopy_root = bpy.data.objects.new("bonsai_canopy_root", None)
    scene.collection.objects.link(canopy_root)
    for ob in list(scene.objects):
        if ob not in _antes and ob is not canopy_root and ob.parent is None:
            ob.parent = canopy_root
    canopy_root.scale = (BONSAI_SCALE,) * 3
    _antes = set(scene.objects)   # lo de aca abajo NO se escala (decoracion de piso)

    # hojas otonales sueltas: unas cayendo, otras ya en el pasto (mantillo)
    hoja_me = make_quad_mesh("hoja_bonsai", 0.045, 0.10, 0.012, MAT_ACCENT)
    for _ in range(2):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.4, 1.4)
        z = random.uniform(0.4, 1.8)
        scatter_quad(hoja_me, Vector((math.cos(ang) * rr,
                                      math.sin(ang) * rr, z)), 0.8, 1.2)
    for _ in range(3):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.4, 2.1)
        scatter_quad(hoja_me, Vector((math.cos(ang) * rr,
                                      math.sin(ang) * rr, 0)), 0.8, 1.2,
                    grounded=True)

    # musgo al pie del tronco: tufts chatos y oscuros directo sobre el pasto
    for _ in range(7):
        ang = random.uniform(0, 6.28)
        rr = random.uniform(0.30, 1.15)
        c = Vector((math.cos(ang) * rr, math.sin(ang) * rr,
                   random.uniform(0.015, 0.035)))
        add_cluster(c, random.uniform(0.10, 0.18), squash=(0.16, 0.24))

    # piedra zen chata junto a la base (ademas de las piedras genericas de la isla)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.16,
        location=(0.46, 0.34, 0.05))
    zen = bpy.context.active_object
    zen.name = "piedra_zen"
    zen.scale = (1.35, 1.1, 0.34)
    zen.rotation_euler = (0, 0, random.uniform(0, 3))
    zen.data.materials.append(MAT_PIEDRA)
    add_ground_shadow(Vector((0.46, 0.34, 0)), 0.26)


{"arbolito": build_arbolito, "roble": build_roble, "flor": build_flor,
 "sakura": build_sakura, "bonsai": build_bonsai}[ESPECIE]()

# sombra de contacto donde el tronco/tallo toca el pasto
TRUNK_SHADOW_R = {"arbolito": 0.30, "roble": 0.55, "flor": 0.22, "sakura": 0.34,
                  "bonsai": 0.60}[ESPECIE]
add_ground_shadow(Vector((0, 0, 0)), TRUNK_SHADOW_R)

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

# cono invertido de verdad: anillo ancho arriba (pegado al pasto), punta abajo
# (el de la sakura estaba al reves: apice arriba oculto y anillo abajo -> masa
#  tipo pedestal sin punta; aca queda la isla flotante clasica, mas chata)
bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0, radius2=GRASS_R * 0.94,
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
        # apice inferior: punta definida, sin jitter lateral, estirada abajo
        v.co.z = -CONE_D / 2 - APEX_EXTRA
    else:                                # anillo superior: no tocar z
        v.co.x *= 1 + random.uniform(-0.06, 0.06)
        v.co.y *= 1 + random.uniform(-0.06, 0.06)

for _ in range(24):
    ang = random.uniform(0, 6.28)
    rr = random.uniform(GRASS_R * 0.25, GRASS_R * 0.9)
    r = random.uniform(0.028, 0.05)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r,
        location=(math.cos(ang) * rr, math.sin(ang) * rr, r * 0.6))
    fl = bpy.context.active_object
    fl.name = "flor_isla"
    fl.data.materials.append(MAT_FLOR_B if random.random() < 0.5 else MAT_FLOR_R)
    add_ground_shadow(Vector((fl.location.x, fl.location.y, 0)), r * 1.3)
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
    add_ground_shadow(Vector((st.location.x, st.location.y, 0)), r * 1.5)

# ------------------------------------------------------------------ pivot
pivot = bpy.data.objects.new("pivot", None)
scene.collection.objects.link(pivot)
for ob in list(scene.objects):
    if ob.type in {'MESH', 'CURVE'} and ob.parent is None:
        ob.parent = pivot
    elif ob.type == 'EMPTY' and ob.name in ("cabeza", "bonsai_canopy_root"):
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

# AO real (EEVEE Next "fast GI" en modo solo-oclusion) para que los racimos de
# la copa y las florcitas/hojas apoyadas dejen de verse flotando
scene.eevee.use_fast_gi = True
scene.eevee.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
scene.eevee.fast_gi_distance = 0.09
scene.eevee.fast_gi_quality = 1.0
scene.eevee.fast_gi_ray_count = 16
scene.eevee.use_raytracing = True
scene.eevee.ray_tracing_options.resolution_scale = '1'

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
