"""Run in Blender or headless. Exports GLBs and the Three r85 layout bridge."""
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector, noise

OUTPUT = Path(__file__).resolve().parents[1] / 'environments'
COLLECTION = 'Bunny procedural environment'


def generate(seed=42):
    OUTPUT.mkdir(exist_ok=True)
    rng = random.Random(seed)
    layouts = {}
    for kind in ('rocks', 'forest', 'course'):
        old = bpy.data.collections.get(COLLECTION)
        if old:
            for obj in list(old.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(old)
        collection = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(collection)
        specs = []

        def add(shape, x, z, y, scale, color, rotation=0):
            # Three uses Y up; Blender uses Z up.
            location = (x, -z, y)
            if shape == 'rock':
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=location)
            elif shape in ('trunk', 'crown'):
                bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=1,
                    radius2=0 if shape == 'crown' else 1, depth=2, location=location)
            else:
                bpy.ops.mesh.primitive_cube_add(size=2, location=location)
            obj = bpy.context.object
            for owner in list(obj.users_collection):
                owner.objects.unlink(obj)
            collection.objects.link(obj)
            obj.name = f'{kind}_{shape}_{len(specs):02d}'
            obj.scale = (scale[0], scale[2], scale[1])
            obj.rotation_euler.z = rotation
            material = bpy.data.materials.get(f'Environment_{color:06x}') or bpy.data.materials.new(f'Environment_{color:06x}')
            material.diffuse_color = tuple(((color >> shift) & 255)/255 for shift in (16,8,0)) + (1,)
            obj.data.materials.append(material)
            specs.append(dict(type=shape, position=[x,y,z], scale=scale, color=color, rotation=rotation))

        if kind == 'course':
            for i in range(18):
                x = math.sin(i*.65)*2.4
                z = -3-i*.62
                height = .18 + (i % 4)*.12
                add('block', x,z,height, [.52,height,.25], 0xd8a85e, math.sin(i)*.15)
        else:
            count = 0
            attempts = 0
            while count < 32 and attempts < 5000:
                attempts += 1
                x,z = rng.uniform(-11,11),rng.uniform(-11,11)
                # Keep a clear spawn circle and bound the whole layout.
                if not 3 < math.hypot(x,z) < 12:
                    continue
                if kind == 'forest' and noise.noise_vector(Vector((x*.23,z*.23,seed*.01)))[0] < .05:
                    continue
                size = rng.uniform(.35,.8)
                angle = rng.uniform(0,math.tau)
                if kind == 'rocks':
                    add('rock',x,z,size*.55,[size,size*.65,size*.8],0x82939b,angle)
                else:
                    add('trunk',x,z,size,[.13,size,.13],0x845733,angle)
                    add('crown',x,z,size*2.4,[size,size*1.5,size],0x45865c,angle)
                count += 1
        bpy.ops.object.select_all(action='DESELECT')
        for obj in collection.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(OUTPUT / f'{kind}.glb'),export_format='GLB',use_selection=True)
        layouts[kind] = specs
    (OUTPUT / 'layouts.json').write_text(json.dumps(layouts, separators=(',', ':')))
    print(f'Exported three environments to {OUTPUT}')


if __name__ == '__main__':
    generate()
