"""Read-only local Little Kitty, Big City extraction. No game assets belong in Git."""
import sys,json,struct,zlib,re,io,wave,math,bisect
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'python-deps'))
import UnityPy,numpy as np
from UnityPy.helpers.MeshHelper import MeshHandler
ROOT=Path(r'E:/SteamLibrary/steamapps/common/LittleKittyBigCity/Little Kitty, Big City_Data')
OUT=HERE.parent/'assets/little-kitty-player';OUT.mkdir(parents=True,exist_ok=True);(OUT/'audio').mkdir(exist_ok=True)
env=UnityPy.load(str(ROOT/'sharedassets2.assets'))
objects={o.path_id:o for o in env.objects if o.assets_file.name=='sharedassets2.assets'}
r=objects[38610].read();mesh=r.m_Mesh.deref_parse_as_object();h=MeshHandler(mesh);h.process()
F=np.diag([-1.,1.,1.,1.]);doc={'asset':{'version':'2.0','generator':'Local Little Kitty extractor'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'textures':[],'images':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'accessors':[],'bufferViews':[],'buffers':[{}],'skins':[],'animations':[]};binary=bytearray()
def blob(raw):
 binary.extend(b'\0'*(-len(binary)%4));v=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(raw)});binary.extend(raw);return v
def acc(a,kind,ctype):
 a=np.ascontiguousarray(a);i=len(doc['accessors']);d={'bufferView':blob(a.tobytes()),'componentType':ctype,'count':len(a),'type':kind}
 if kind!='MAT4':d.update(min=np.min(a,axis=0).reshape(-1).tolist(),max=np.max(a,axis=0).reshape(-1).tolist())
 doc['accessors'].append(d);return i
def vec(v):return [v.x,v.y,v.z]
def trs(t):
 return {'translation':[-t.m_LocalPosition.x,t.m_LocalPosition.y,t.m_LocalPosition.z],'rotation':[t.m_LocalRotation.x,-t.m_LocalRotation.y,-t.m_LocalRotation.z,t.m_LocalRotation.w],'scale':vec(t.m_LocalScale)}
# Keep the skeleton's parent CG and every bone. Bind matrices retain original skinning.
transforms={};inverse=[];jointids=[]
for ptr,pose in zip(r.m_Bones,mesh.m_BindPose):
 t=ptr.deref_parse_as_object();bid=t.object_reader.path_id;transforms[bid]=t;jointids.append(bid)
 inverse.append(F@np.array([[getattr(pose,f'e{a}{b}') for b in range(4)] for a in range(4)])@F)
 t=t.m_Father.deref_parse_as_object()
 while t.m_GameObject.deref_parse_as_object().m_Name!='MC':
  transforms[t.object_reader.path_id]=t
  if not t.m_Father.m_PathID:break
  t=t.m_Father.deref_parse_as_object()
indices={};hashes={};rootids=[]
for bid,t in transforms.items():
 name=t.m_GameObject.deref_parse_as_object().m_Name;indices[bid]=len(doc['nodes']);doc['nodes'].append({'name':name,**trs(t),'extras':{'unityPathId':bid}})
 names=[name];parent=t.m_Father.deref_parse_as_object() if t.m_Father.m_PathID else None
 while parent and parent.m_GameObject.deref_parse_as_object().m_Name!='MC':
  names.insert(0,parent.m_GameObject.deref_parse_as_object().m_Name);parent=parent.m_Father.deref_parse_as_object() if parent.m_Father.m_PathID else None
 hashes[zlib.crc32('/'.join(names).encode())]=indices[bid]
for bid,t in transforms.items():
 if t.m_Father.m_PathID in indices:doc['nodes'][indices[t.m_Father.m_PathID]].setdefault('children',[]).append(indices[bid])
 else:rootids.append(indices[bid])
doc['scenes'][0]['nodes'].extend(rootids)
vertices=np.array(h.m_Vertices,dtype='<f4')[:,:3];vertices[:,0]*=-1
normal=np.array(h.m_Normals,dtype='<f4')[:,:3];normal[:,0]*=-1
uv=np.array(h.m_UV0,dtype='<f4')[:,:2];uv[:,1]=1-uv[:,1]
weights=np.array(h.m_BoneWeights,dtype='<f4');weights/=np.maximum(weights.sum(axis=1,keepdims=True),1e-8);joints=np.array(h.m_BoneIndices,dtype='<u2')
assert len(vertices)==len(weights) and joints.max()<len(jointids)
attrs={'POSITION':acc(vertices,'VEC3',5126),'NORMAL':acc(normal,'VEC3',5126),'TEXCOORD_0':acc(uv,'VEC2',5126),'JOINTS_0':acc(joints,'VEC4',5123),'WEIGHTS_0':acc(weights,'VEC4',5126)}
materialreport=[]
for ptr in r.m_Materials:
 m=ptr.deref_parse_as_object();tex=dict(m.m_SavedProperties.m_TexEnvs);colors=dict(m.m_SavedProperties.m_Colors);color=colors.get('_Color');factor=[color.r,color.g,color.b,color.a] if color else [1,1,1,1]
 pbr={'baseColorFactor':factor,'metallicFactor':0,'roughnessFactor':.85};texture=tex.get('_MainTex');name=None
 if texture and texture.m_Texture.m_PathID:
  image=texture.m_Texture.deref_parse_as_object();name=image.m_Name;stream=io.BytesIO();image.image.convert('RGBA').save(stream,format='PNG');doc['images'].append({'bufferView':blob(stream.getvalue()),'mimeType':'image/png','name':name});doc['textures'].append({'source':len(doc['images'])-1,'sampler':0});pbr['baseColorTexture']={'index':len(doc['textures'])-1}
 # Original eye shader uses procedural pupil/iris coloring, approximated here.
 if m.m_Name.startswith('CatEye_'):pbr['baseColorFactor']=[.33,.58,.12,1]
 doc['materials'].append({'name':m.m_Name,'pbrMetallicRoughness':pbr,'doubleSided':True});materialreport.append({'name':m.m_Name,'texture':name,'approximateShader':True})
prims=[]
for i,tri in enumerate(h.get_triangles()):
 faces=np.asarray(tri,dtype='<u4')[:,::-1];prims.append({'attributes':attrs.copy(),'indices':acc(faces.reshape(-1),'SCALAR',5125),'material':i})
doc['meshes'].append({'name':'Player cat','primitives':prims});doc['skins'].append({'joints':[indices[i] for i in jointids],'inverseBindMatrices':acc(np.array([m.flatten(order='F') for m in inverse],dtype='<f4'),'MAT4',5126)})
doc['nodes'].append({'name':'Player cat mesh','mesh':0,'skin':0});doc['scenes'][0]['nodes'].append(len(doc['nodes'])-1)
print('MODEL',len(vertices),'vertices',len(jointids),'bones',len(hashes),'animation paths',flush=True)
# Unity's streamed keys store cubic coefficients [a,b,c,value] for each scalar curve.
def streamed(data,count,times):
 raw=struct.pack('<'+'I'*len(data),*data);offset=0;curves=[[] for _ in range(count)]
 while offset<len(raw):
  t,n=struct.unpack_from('<fi',raw,offset);offset+=8
  for _ in range(n):
   k,*coeff=struct.unpack_from('<i4f',raw,offset);offset+=20
   if 0<=k<count:curves[k].append((t,coeff))
 result=np.empty((len(times),count))
 for k,keys in enumerate(curves):
  assert keys,'Missing streamed scalar';keytimes=[x[0] for x in keys]
  for row,t in enumerate(times):
   index=max(0,bisect.bisect_right(keytimes,t)-1);kt,c=keys[index];dt=max(0,t-kt) if kt>-1e30 else 0
   result[row,k]=((c[0]*dt+c[1])*dt+c[2])*dt+c[3] if all(math.isfinite(v) for v in c[:3]) else c[3]
 return result
SELECT=['Cat_Trot','Cat_Run','Cat_Idle07','Cat_Idle03','Cat_Stretch_01','Cat_Stretch_02','Cat_Meow_JustHead','Cat_Sit_To_Lie','Cat_Lie_To_Sleep','Cat_Lie_Idle_2','Cat_Jump_InPlace_Start','Cat_Jump_Forward_Land']
clipreport=[]
for obj in objects.values():
 if obj.type.name!='AnimationClip':continue
 c=obj.read_typetree()
 if c['m_Name'] not in SELECT:continue
 muscle=c['m_MuscleClip'];data=muscle['m_Clip']['data'];dense=data['m_DenseClip'];stream=data['m_StreamedClip'];constant=data['m_ConstantClip']['data'];duration=muscle['m_StopTime']-muscle['m_StartTime'];times=np.linspace(0,duration,max(2,math.ceil(duration*30)+1));values=streamed(stream['data'],stream['curveCount'],times)
 if dense['m_CurveCount']:
  d=np.array(dense['m_SampleArray']).reshape(dense['m_FrameCount'],dense['m_CurveCount']);dt=np.arange(len(d))/dense['m_SampleRate']+dense['m_BeginTime'];values=np.column_stack([values,*[np.interp(times,dt,d[:,k]) for k in range(d.shape[1])]])
 values=np.column_stack([values,np.tile(constant,(len(times),1))]);offset=0;channels=[];samplers=[];timeacc=acc(times.astype('<f4'),'SCALAR',5126);skipped=[]
 for binding in c['m_ClipBindingConstant']['genericBindings']:
  attr=binding['attribute'];width={1:3,2:4,3:3,4:3}.get(attr,1) if binding['typeID']==4 else 1
  v=values[:,offset:offset+width].copy();offset+=width
  if binding['typeID']!=4 or attr not in [1,2,3,4] or binding['path'] not in hashes:skipped.append(binding);continue
  if attr==4:
   # Unity's default Euler order is ZXY: q = qY * qX * qZ.
   x,y,z=(np.deg2rad(v)/2).T;cx,sx=np.cos(x),np.sin(x);cy,sy=np.cos(y),np.sin(y);cz,sz=np.cos(z),np.sin(z)
   v=np.column_stack([cy*sx*cz+sy*cx*sz,sy*cx*cz-cy*sx*sz,cy*cx*sz-sy*sx*cz,cy*cx*cz+sy*sx*sz]);attr=2
  if attr==1:v[:,0]*=-1
  if attr==2:
   v[:,1:3]*=-1;v/=np.maximum(np.linalg.norm(v,axis=1,keepdims=True),1e-10)
   for k in range(1,len(v)):
    if np.dot(v[k-1],v[k])<0:v[k]*=-1
  assert np.isfinite(v).all()
  target={'node':hashes[binding['path']],'path':{1:'translation',2:'rotation',3:'scale'}[attr]}
  samplers.append({'input':timeacc,'output':acc(v.astype('<f4'),'VEC4' if attr==2 else 'VEC3',5126),'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':target})
 assert offset==values.shape[1],(offset,values.shape)
 doc['animations'].append({'name':c['m_Name'],'samplers':samplers,'channels':channels,'extras':{'loop':muscle['m_LoopTime'],'sourcePathId':obj.path_id}});clipreport.append({'name':c['m_Name'],'duration':duration,'channels':len(channels),'skippedNonSkeletalBindings':len(skipped),'loop':muscle['m_LoopTime'],'pathId':obj.path_id});print('CLIP',c['m_Name'],len(channels),flush=True)
# Explicit protagonist names avoid NPC voices and unrelated environmental effects.
tracks=[];errors=[]
for obj in objects.values():
 if obj.type.name!='AudioClip':continue
 clip=obj.read()
 if not (clip.m_Name.startswith('vo_cat_protagonist_') or clip.m_Name.startswith('vo_meowbutton_')):continue
 try:
  for sample,data in clip.samples.items():
   ext=Path(sample).suffix.lower();assert ext in ['.wav','.ogg'];filename=f'{obj.path_id}-{re.sub("[^a-zA-Z0-9_-]","-",clip.m_Name)}{ext}';(OUT/'audio'/filename).write_bytes(data)
   tracks.append({'id':str(obj.path_id),'number':len(tracks)+1,'language':'sfx','title':clip.m_Name,'original_name':clip.m_Name,'duration':clip.m_Length,'file':filename,'bytes':len(data),'source_asset':'sharedassets2.assets','path_id':obj.path_id})
 except Exception as ex:errors.append({'name':clip.m_Name,'error':str(ex)})
manifest={'game':'Little Kitty, Big City','speaker':'Player cat','tracks':tracks,'languages':{'sfx':len(tracks)},'errors':errors};(OUT/'audio/manifest.json').write_text(json.dumps(manifest,indent=2))
doc['animations'].sort(key=lambda a:SELECT.index(a['name']));doc['buffers'][0]['byteLength']=len(binary);raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*(-len(raw)%4);binary+=b'\0'*(-len(binary)%4);payload=struct.pack('<4sII',b'glTF',2,28+len(raw)+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary;(OUT/'kitty.glb').write_bytes(payload)
report={'game':'Little Kitty, Big City','renderer':38610,'mesh':r.m_Mesh.m_PathID,'sourceAsset':'sharedassets2.assets','vertices':len(vertices),'bones':len(jointids),'materials':materialreport,'animations':clipreport,'audioClips':len(tracks),'audioErrors':errors,'limitations':['Custom toon/fur/eye shaders approximated with PBR materials.','Non-skeletal shader and blend-shape animation bindings are omitted.','Streamed cubic curves sampled at 30 Hz.']};(OUT/'provenance.json').write_text(json.dumps(report,indent=2));print('DONE',len(payload),'bytes',len(clipreport),'animations',len(tracks),'audio',errors,flush=True)
