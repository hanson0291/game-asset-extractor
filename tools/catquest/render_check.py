import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]/'assets/cat-quest-iii'
rows=json.loads((ROOT/'catalog.json').read_text())['characters']
cols=8
bpy.ops.wm.read_factory_settings(use_empty=True)
for i,row in enumerate(rows):
 old=set(bpy.context.scene.objects)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/row['id'].removeprefix('catquest-')/'character.glb'))
 imported=set(bpy.context.scene.objects)-old
 meshes=[o for o in imported if o.type=='MESH']
 bpy.context.view_layer.update()
 pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
 lo=Vector([min(p[k] for p in pts) for k in range(3)]);hi=Vector([max(p[k] for p in pts) for k in range(3)])
 scale=1.7/max(hi-lo);center=(hi+lo)/2
 holder=bpy.data.objects.new(row['name'],None);bpy.context.collection.objects.link(holder)
 for o in imported:
  if o.parent not in imported:o.parent=holder
 holder.scale=(scale,)*3;holder.location=Vector(((i%cols)*2.8,0,-(i//cols)*2.8))-center*scale
 bpy.ops.object.text_add(location=((i%cols)*2.8,-.3,-(i//cols)*2.8-1.15),rotation=(math.pi/2,0,0))
 t=bpy.context.object;t.data.body=row['name'];t.data.size=.18;t.data.align_x='CENTER'
 mat=bpy.data.materials.get('Label')
 if mat is None:
  mat=bpy.data.materials.new('Label');mat.use_nodes=True
  shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.9,.95,1,1);shader.inputs['Emission Color'].default_value=(.9,.95,1,1);shader.inputs['Emission Strength'].default_value=1
 t.data.materials.append(mat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.resolution_x=2048;scene.render.resolution_y=1536;scene.render.resolution_percentage=100
world=bpy.data.worlds.new('Studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.06,.085,.1,1);world.node_tree.nodes['Background'].inputs[1].default_value=1;scene.world=world
centerZ=-(math.ceil(len(rows)/cols)-1)*1.4-.4
bpy.ops.object.camera_add(location=(9.8,-40,centerZ));cam=bpy.context.object;cam.rotation_euler=(Vector((9.8,0,centerZ))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=max(cols*2.8+1,math.ceil(len(rows)/cols)*2.8*4/3+1);scene.camera=cam
scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'contact-sheet.png');bpy.ops.render.render(write_still=True)
print('RENDERED',len(rows),'characters')
