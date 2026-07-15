import bpy, addon_utils

print("=== VERSION:", bpy.app.version_string)

# engines
try:
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
except Exception as ex:
    engines = ["err", str(ex)]
print("=== ENGINES:", engines)

# sapling addon available?
mods = [m.__name__ for m in addon_utils.modules() if 'sapling' in m.__name__.lower() or 'curve' in m.__name__.lower()]
print("=== CURVE/SAPLING MODULES:", mods)

ok = False
for name in ('add_curve_sapling', 'bl_ext.blender_org.add_curve_sapling', 'curve_tools'):
    try:
        bpy.ops.preferences.addon_enable(module=name)
        print("=== ENABLED:", name)
        ok = True
        break
    except Exception as ex:
        print("=== enable fail", name, ":", str(ex)[:200])

print("=== HAS tree_add:", hasattr(bpy.ops.curve, 'tree_add'))
if hasattr(bpy.ops.curve, 'tree_add'):
    try:
        props = bpy.ops.curve.tree_add.get_rna_type().properties
        for p in props:
            if p.identifier == 'rna_type':
                continue
            print("PARAM", p.identifier, p.type, getattr(p, 'default', None))
    except Exception as ex:
        print("=== introspect err:", ex)
