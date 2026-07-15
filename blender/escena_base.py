# Escena base "dreamy" — fondo para la app KBL (sin árbol)
# Correr: blender --background --python escena_base.py
import bpy
import math

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# --- Motor y salida ---
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    if eng in engines:
        scene.render.engine = eng
        break
print('ENGINE:', scene.render.engine)
scene.render.resolution_x = 1170
scene.render.resolution_y = 2000
scene.view_settings.view_transform = 'Standard'  # colores fieles, sin el desaturado de AgX
scene.render.filepath = r'G:\Mi unidad\KBL APP Personal\blender\render_poc.png'
scene.render.image_settings.file_format = 'PNG'

# --- Cielo: telón de fondo con gradiente (más confiable que el mundo en EEVEE) ---
world = bpy.data.worlds.new('Cielo')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.85, 1)

bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 130, 55))
telon = bpy.context.object
telon.name = 'Telon'
telon.rotation_euler = (math.radians(90), 0, 0)
telon.scale = (420, 160, 1)
mat_cielo = bpy.data.materials.new('CieloMat')
mat_cielo.use_nodes = True
ct = mat_cielo.node_tree
ct.nodes.clear()
out = ct.nodes.new('ShaderNodeOutputMaterial')
emi = ct.nodes.new('ShaderNodeEmission')
coord = ct.nodes.new('ShaderNodeTexCoord')
sep = ct.nodes.new('ShaderNodeSeparateXYZ')
ramp = ct.nodes.new('ShaderNodeValToRGB')
ct.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
ct.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
ct.links.new(ramp.outputs['Color'], emi.inputs['Color'])
ct.links.new(emi.outputs['Emission'], out.inputs['Surface'])
r = ramp.color_ramp
r.elements[0].position = 0.0
r.elements[0].color = (1.0, 0.86, 0.76, 1)    # horizonte durazno
mid = r.elements.new(0.42)
mid.color = (0.78, 0.70, 0.92, 1)             # lavanda
r.elements[1].position = 1.0
r.elements[1].color = (0.38, 0.54, 0.90, 1)   # azul arriba
emi.inputs['Strength'].default_value = 1.0
telon.data.materials.append(mat_cielo)


def material(nombre, color, rough=0.9, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if emission is not None:
        for key in ('Emission Color', 'Emission'):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*emission, 1)
                break
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


def colina(nombre, size, loc, seed, strength, color, rough=0.95):
    bpy.ops.mesh.primitive_plane_add(size=size, location=loc)
    obj = bpy.context.object
    obj.name = nombre
    sub = obj.modifiers.new('Sub', 'SUBSURF')
    sub.subdivision_type = 'SIMPLE'
    sub.levels = 6
    sub.render_levels = 7
    tex = bpy.data.textures.new(nombre + 'Noise', 'CLOUDS')
    tex.noise_scale = size * 0.18
    disp = obj.modifiers.new('Disp', 'DISPLACE')
    disp.texture = tex
    disp.strength = strength
    disp.texture_coords = 'GLOBAL'
    obj.data.materials.append(material(nombre + 'Mat', color, rough))
    bpy.ops.object.shade_smooth()
    return obj

# --- Terreno: pradera cercana + colinas lejanas con bruma de color ---
colina('Pradera', 80, (0, 15, -0.4), 1, 2.2, (0.20, 0.52, 0.25))
colina('ColinasLejos', 120, (0, 70, -1.5), 7, 7.0, (0.35, 0.48, 0.55))

# --- Luna gigante detrás de las colinas ---
bpy.ops.mesh.primitive_uv_sphere_add(radius=16, location=(0, 85, 10), segments=64, ring_count=32)
luna = bpy.context.object
luna.name = 'Luna'
# Cráteres: la emisión ignora normales, así que el detalle va en el COLOR
mat_luna = bpy.data.materials.new('LunaMat')
mat_luna.use_nodes = True
lt = mat_luna.node_tree
lt.nodes.clear()
lout = lt.nodes.new('ShaderNodeOutputMaterial')
lemi = lt.nodes.new('ShaderNodeEmission')
lnoise = lt.nodes.new('ShaderNodeTexNoise')
lnoise.inputs['Scale'].default_value = 5.5
lnoise.inputs['Detail'].default_value = 8.0
lramp = lt.nodes.new('ShaderNodeValToRGB')
lr = lramp.color_ramp
lr.elements[0].position = 0.35
lr.elements[0].color = (0.78, 0.79, 0.84, 1)  # mares grises
lr.elements[1].position = 0.75
lr.elements[1].color = (0.97, 0.96, 0.93, 1)  # zonas claras
lt.links.new(lnoise.outputs['Fac'], lramp.inputs['Fac'])
lt.links.new(lramp.outputs['Color'], lemi.inputs['Color'])
lt.links.new(lemi.outputs['Emission'], lout.inputs['Surface'])
lemi.inputs['Strength'].default_value = 1.35
luna.data.materials.append(mat_luna)
bpy.ops.object.shade_smooth()

# --- Luces ---
sun_data = bpy.data.lights.new('Sol', 'SUN')
sun_data.energy = 3.0
sun_data.color = (1.0, 0.9, 0.78)
sun = bpy.data.objects.new('Sol', sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(55), 0, math.radians(-35))

fill_data = bpy.data.lights.new('Relleno', 'AREA')
fill_data.energy = 400
fill_data.size = 30
fill_data.color = (0.75, 0.78, 1.0)
fill = bpy.data.objects.new('Relleno', fill_data)
scene.collection.objects.link(fill)
fill.location = (0, -20, 15)
fill.rotation_euler = (math.radians(60), 0, 0)

# --- Cámara (vertical, baja, mirando al horizonte) ---
cam_data = bpy.data.cameras.new('Cam')
cam_data.lens = 45
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -16, 3.2)
cam.rotation_euler = (math.radians(92), 0, 0)  # apenas mirando arriba: menos pradera, más cielo/luna
scene.camera = cam

bpy.ops.render.render(write_still=True)
print('RENDER-OK')
