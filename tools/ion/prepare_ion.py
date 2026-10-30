"""Build dedicated Ion vehicle GLBs from the verified local Titan/pilot export.
Preserves all seven paired clips; re-anchors shared root motion to a parked mech.
"""
import json,struct,copy,io,hashlib,math
from pathlib import Path
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent;APP=HERE.parents[1]
SOURCE=APP/'assets/titanfall2-ion-titan/ion-titan-embark.glb';OUT=SOURCE.parent
TEXTURES=Path(r'C:/Users/enzo_/Downloads/LegionPlus/exported_files/materials')
raw=SOURCE.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
views=[binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in doc['bufferViews']]
report={'source':str(SOURCE),'sourceSHA256':hashlib.sha256(raw).hexdigest(),'textureSources':[],'animations':[a['name'] for a in doc['animations']]}
def append_view(data):
 idx=len(views);views.append(data);doc['bufferViews'].append({'buffer':0,'byteLength':len(data)});return idx
def accessor_values(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];data=views[a['bufferView']]
 return np.ndarray((a['count'],width),dtype='<f4',buffer=data,offset=a.get('byteOffset',0),strides=(v.get('byteStride',width*4),4)).copy()
def replace_values(index,values):
 a=doc['accessors'][index];a['bufferView']=append_view(np.asarray(values,dtype='<f4').tobytes());a.pop('byteOffset',None);a['min']=values.min(axis=0).tolist();a['max']=values.max(axis=0).tolist()
# Both roots share the same translation reference. Preserve their relative motion,
# while removing the scripted repositioning of the entire Titan during embark.
for clip in doc['animations']:
 titan=next((c for c in clip['channels'] if c['target']=={'node':180,'path':'translation'}),None)
 pilot=next((c for c in clip['channels'] if c['target']=={'node':255,'path':'translation'}),None)
 if titan and pilot:
  ts=clip['samplers'][titan['sampler']];ps=clip['samplers'][pilot['sampler']]
  tt=accessor_values(ts['input'])[:,0];pt=accessor_values(ps['input'])[:,0];tv=accessor_values(ts['output']);pv=accessor_values(ps['output'])
  pv-=np.column_stack([np.interp(pt,tt,tv[:,axis]) for axis in range(3)])
  replace_values(ps['output'],pv);replace_values(ts['output'],np.zeros_like(tv))
for i,role,name in [(179,'titan-mesh','IonTitan'),(180,'titan-root','Ion_Root'),(254,'pilot-mesh','Cooper_Pilot'),(255,'pilot-root','Cooper_Root'),(184,'pilot-hips','Cooper_Hips')]:
 doc['nodes'][i]['name']=name;doc['nodes'][i].setdefault('extras',{})['ionRole']=role
# Preserve original paint and cockpit details; reconstruct the missing normal Z
# channel in Respawn's two-channel normal maps and convert gloss to roughness.
def read_map(family,suffix,limit=2048):
 p=TEXTURES/family/(family+'_'+suffix+'.png');im=Image.open(p).convert('RGBA');im.thumbnail((limit,limit),Image.Resampling.LANCZOS)
 report['textureSources'].append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'exportSize':im.size});return im
sampler=len(doc.setdefault('samplers',[]));doc['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497})
def add_texture(image,name,lossless=False):
 stream=io.BytesIO()
 if lossless:image.save(stream,format='PNG',compress_level=5);mime='image/png'
 else:image.convert('RGB').save(stream,format='JPEG',quality=94,subsampling=0);mime='image/jpeg'
 doc['images'].append({'name':name,'bufferView':append_view(stream.getvalue()),'mimeType':mime});doc['textures'].append({'source':len(doc['images'])-1,'sampler':sampler});return {'index':len(doc['textures'])-1}
def material(family):
 col=read_map(family,'col');normal=np.asarray(read_map(family,'nml'),dtype=np.float32)/255
 x=normal[:,:,0]*2-1;y=-(normal[:,:,1]*2-1);z=np.sqrt(np.maximum(0,1-x*x-y*y));normal=np.stack([(x+1)*.5,(y+1)*.5,(z+1)*.5],axis=-1)
 gls=np.asarray(read_map(family,'gls').convert('L'),dtype=np.float32)/255;spc=np.asarray(read_map(family,'spc').convert('L'),dtype=np.float32)/255
 ao=np.asarray(read_map(family,'ao').convert('L'),dtype=np.float32)/255
 packed=np.stack([ao,np.clip(1-gls,.22,.95),np.clip((spc-.04)/.6,.05,.85)],axis=-1)
 illum=np.asarray(read_map(family,'ilm').convert('RGB'),dtype=np.float32)/255
 emissive=Image.fromarray(np.uint8(np.clip(illum,0,1)*255))
 return {'pbrMetallicRoughness':{'baseColorTexture':add_texture(col,family+' albedo'),'baseColorFactor':[1,1,1,1],'metallicFactor':1,'roughnessFactor':1,'metallicRoughnessTexture':add_texture(Image.fromarray(np.uint8(packed*255)),family+' ORM')},'normalTexture':add_texture(Image.fromarray(np.uint8(normal*255)),family+' reconstructed normal',True),'occlusionTexture':{'index':len(doc['textures'])-2,'strength':.5},'emissiveTexture':add_texture(emissive,family+' lights'),'emissiveFactor':[.45,.45,.45],'doubleSided':False}
body=material('t_m_ion_warpaint_skin02');cockpit=material('t_cockpit_atlas_01')
for i in [0,1]:doc['materials'][i]={'name':doc['materials'][i]['name'],**copy.deepcopy(body)}
doc['materials'][2]={'name':'t_cockpit_atlas_01',**cockpit}
# Restore the nose-art opacity mask, rather than rendering a grey decal rectangle.
col=read_map('t_m_ion_nose_art_v12','col',1024);col.putalpha(read_map('t_m_ion_nose_art_v12','opa',1024).convert('L'))
doc['materials'][3]={'name':'t_m_ion_nose_art_v12','pbrMetallicRoughness':{'baseColorTexture':add_texture(col,'Ion nose-art decal',True),'metallicFactor':.05,'roughnessFactor':.7},'alphaMode':'BLEND','doubleSided':True}
doc['asset']['generator']='Local Ion vehicle export; original Titanfall 2 geometry and paired animation'
doc['extras']={'game':'Titanfall 2','vehicle':'Ion Titan','entryClips':5,'exitClips':2,'rootMotion':'Shared Titan translation removed from both animated roots; relative source motion preserved.'}
# Use the real closed-cockpit standing pose as the vehicle's default, rather
# than exposing the source model's bind pose and detached bodygroup positions.
parked=next(a for a in doc['animations'] if a['name']=='Disembark - stand')
for channel in parked['channels']:
 sampler=parked['samplers'][channel['sampler']]
 doc['nodes'][channel['target']['node']][channel['target']['path']]=accessor_values(sampler['output'])[-1].tolist()
# Compact all reachable nodes, material resources and accessors. No external files.
def write_glb(d,path):
 d=copy.deepcopy(d);seen=set()
 def visit(i):
  if i in seen:return
  seen.add(i)
  for child in d['nodes'][i].get('children',[]):visit(child)
 for scene in d['scenes']:
  for i in scene['nodes']:visit(i)
 nodeids=sorted(seen);node_map={old:new for new,old in enumerate(nodeids)}
 for scene in d['scenes']:scene['nodes']=[node_map[i] for i in scene['nodes']]
 nodes=[d['nodes'][i] for i in nodeids]
 for n in nodes:
  if 'children' in n:n['children']=[node_map[i] for i in n['children']]
 for clip in d.get('animations',[]):
  channels=[c for c in clip['channels'] if c['target']['node'] in seen];samplers=sorted({c['sampler'] for c in channels});mapping={old:new for new,old in enumerate(samplers)}
  clip['samplers']=[clip['samplers'][i] for i in samplers]
  for c in channels:c['sampler']=mapping[c['sampler']];c['target']['node']=node_map[c['target']['node']]
  clip['channels']=channels
 d['animations']=[c for c in d.get('animations',[]) if c['channels']]
 def select(key,ids):
  ids=sorted(ids);mapping={old:new for new,old in enumerate(ids)};d[key]=[d[key][i] for i in ids];return mapping
 meshmap=select('meshes',{n['mesh'] for n in nodes if 'mesh' in n});skinmap=select('skins',{n['skin'] for n in nodes if 'skin' in n})
 for n in nodes:
  if 'mesh' in n:n['mesh']=meshmap[n['mesh']]
  if 'skin' in n:n['skin']=skinmap[n['skin']]
 for skin in d['skins']:
  skin['joints']=[node_map[i] for i in skin['joints']]
  if 'skeleton' in skin:skin['skeleton']=node_map[skin['skeleton']]
 d['nodes']=nodes
 primitives=[p for m in d['meshes'] for p in m['primitives']]
 matmap=select('materials',{p['material'] for p in primitives if 'material' in p})
 for p in primitives:
  if 'material' in p:p['material']=matmap[p['material']]
 texrefs=[]
 for mat in d['materials']:
  for container in [mat,mat.get('pbrMetallicRoughness',{})]:
   texrefs += [v for k,v in container.items() if k.endswith('Texture') and isinstance(v,dict) and 'index' in v]
 texmap=select('textures',{r['index'] for r in texrefs})
 for r in texrefs:r['index']=texmap[r['index']]
 imagemap=select('images',{t['source'] for t in d['textures']})
 for t in d['textures']:t['source']=imagemap[t['source']]
 used=set()
 for p in primitives:
  used.update(p['attributes'].values())
  if 'indices' in p:used.add(p['indices'])
 for s in d['skins']:
  if 'inverseBindMatrices' in s:used.add(s['inverseBindMatrices'])
 for a in d['animations']:
  for s in a['samplers']:used.update([s['input'],s['output']])
 amap=select('accessors',used)
 for p in primitives:
  p['attributes']={k:amap[v] for k,v in p['attributes'].items()}
  if 'indices' in p:p['indices']=amap[p['indices']]
 for s in d['skins']:
  if 'inverseBindMatrices' in s:s['inverseBindMatrices']=amap[s['inverseBindMatrices']]
 for a in d['animations']:
  for s in a['samplers']:s['input']=amap[s['input']];s['output']=amap[s['output']]
 used={a['bufferView'] for a in d['accessors']}|{i['bufferView'] for i in d['images']};vmap={old:new for new,old in enumerate(sorted(used))};newviews=[];payload=bytearray()
 for old in sorted(used):
  payload.extend(b'\0'*(-len(payload)%4));view=copy.deepcopy(d['bufferViews'][old]);view.update(buffer=0,byteOffset=len(payload),byteLength=len(views[old]));newviews.append(view);payload.extend(views[old])
 for a in d['accessors']:a['bufferView']=vmap[a['bufferView']]
 for image in d['images']:image['bufferView']=vmap[image['bufferView']]
 d['bufferViews']=newviews;d['buffers']=[{'byteLength':len(payload)}];text=json.dumps(d,separators=(',',':')).encode();text+=b' '*(-len(text)%4);payload+=b'\0'*(-len(payload)%4)
 out=struct.pack('<4sII',b'glTF',2,28+len(text)+len(payload))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(payload),0x004e4942)+payload;path.write_bytes(out)
 print('WROTE',path.name,len(out),'bytes',len(d['images']),'textures',flush=True)
 return {'file':path.name,'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),'triangles':sum(d['accessors'][p['indices']]['count']//3 for m in d['meshes'] for p in m['primitives']),'animations':[a['name'] for a in d['animations']]}
report['paired']=write_glb(doc,OUT/'ion-vehicle-paired.glb')
vehicle=copy.deepcopy(doc);vehicle['scenes'][0]['nodes']=[180,179];report['vehicle']=write_glb(vehicle,OUT/'ion-vehicle.glb')
report['limitations']=['Specular/gloss converted to approximate glTF metallic/roughness.','Original Source/Respawn shaders approximated with PBR materials.','Textures resized to 2048px; nose-art opacity preserved at 1024px.']
(OUT/'vehicle-provenance.json').write_text(json.dumps(report,indent=2))
