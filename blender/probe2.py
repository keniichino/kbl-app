import bpy

try:
    bpy.context.preferences.system.use_online_access = True
except Exception as ex:
    print("=== online pref err:", ex)

try:
    bpy.ops.extensions.repo_sync_all()
    print("=== repo sync ok")
except Exception as ex:
    print("=== repo sync err:", str(ex)[:300])

try:
    bpy.ops.extensions.package_install(repo_index=0, pkg_id='add_curve_sapling')
    print("=== install ok")
except Exception as ex:
    print("=== install err:", str(ex)[:300])

import addon_utils
try:
    bpy.ops.preferences.addon_enable(module='bl_ext.blender_org.add_curve_sapling')
    print("=== enabled")
except Exception as ex:
    print("=== enable err:", str(ex)[:300])

try:
    rna = bpy.ops.curve.tree_add.get_rna_type()
    print("=== TREE_ADD OK, params:", len(rna.properties))
except Exception as ex:
    print("=== tree_add err:", str(ex)[:200])
