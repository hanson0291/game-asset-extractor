"""Use Blender: Start, then Blender: Run Script; breakpoint on print."""
import bpy

print(list(bpy.context.scene.objects))
