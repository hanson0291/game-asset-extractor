"""Read-only Cat Quest III prefab extraction; preserves layered 2.5D sprites as GLB.
Game exports stay local and must not be committed to source control.
"""
import sys,json,struct,io,re,hashlib,collections
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'python-deps'))
import UnityPy,numpy as np
UnityPy.config.FALLBACK_UNITY_VERSION='2022.3.14f1'
ROOT=Path(r'E:/SteamLibrary/steamapps/common/CatQuest_Purribean/Cat Quest III_Data')
OUT=HERE.parents[1]/'assets/cat-quest-iii';OUT.mkdir(parents=True,exist_ok=True)
rows=json.loads((HERE/'inventory.json').read_text());cabmap={r['asset'].lower():r['file'] for r in rows}
env=UnityPy.Environment();loaded=set()
def load(file):
 if file in loaded:return
 loaded.add(file);env.load_file(str(ROOT/file))
def dependencies():
 while True:
  wanted=set()
  for a in env.assets:
   for ext in a.externals:
    p=cabmap.get(ext.path.rsplit('/',1)[-1].lower())
    if p and p not in loaded:wanted.add(p)
  if not wanted:break
  for p in wanted:load(p)
for f in ['f608ed653a2c281bacd885938e8469b1.bundle','087872ac94240528d0c2a67797662936.bundle','8fe82c12312ddd4f4c749c1f0a19701b.bundle','25702f3d5d5e0d599c5e74d19b27cecc.bundle','166728dfc6b543d626cbe9ba3d6a086a.bundle','c42b87aa465503b9b5ef4d5716b0b58e.bundle']:
 load('StreamingAssets/aa/StandaloneWindows/'+f)
dependencies();print('DEPENDENCIES',len(loaded),flush=True)
objects={(o.assets_file.name,o.path_id):o for o in env.objects}
# All distinct feline character archetypes; explicit rat models are excluded.
TARGETS=[
 ('pi-rat','Pi-rat (Player 1)','Humanoid',-3783337700463656893),
 ('player-two','Cat (Player 2)','Humanoid_P2',-1964722301240259674),
 ('kidd-cat','Kidd Cat','KiddCat',3180660528350391264),
 ('cappey','Captain Cappey','Spirit',7824080059809449820),
 ('mama-milka','Mama Milka','Mama Milka',1216050527980566575),
 ('mage-bonney','Mage Bonney','MageShop_Mage',9087574671403932031),
 ('cat-pirate-01','Cat Pirate 01','EnemyHumanoid_NPC_CatPirate_01',-3567923326187163403),
 ('cat-pirate-02','Cat Pirate 02','EnemyHumanoid_NPC_CatPirate_02',-9215197640129624841),
 ('cat-pirate-03','Cat Pirate 03','EnemyHumanoid_NPC_CatPirate_03',7142675387920252700),
 ('cat-pirate-female','Cat Pirate (Female)','EnemyHumanoid_NPC_CatPirateFemale_01',-4150354681819510979),
 ('cat-peasant-female','Cat Peasant (Female)','EnemyHumanoid_NPC_CatPeasantFemale_01',-89236934778560746),
 ('aelius','Aelius','EnemyHumanoid_NPC_Aelius',-4918878806591485147),
 ('sibling','Cat Sibling','EnemyHumanoid_NPC_Sibling',2079059087788133471),
 ('sibling-two','Cat Sibling 02','EnemyHumanoid_NPC_Sibling',2079059087788133471),
 ('sibling-three','Cat Sibling 03','EnemyHumanoid_NPC_Sibling',2079059087788133471),
 ('patchy','Patchy','EnemyHumanoid_RoguePatchy',959625702982298756),
 ('purrseidon','Purrseidon','EnemyHumanoid_NPC_Purrseidon',3670970714843492975),
 ('fishercat','Fishercat','EnemyHumanoidSeated_Fishercat',7974435264503894010),
 ('purrmaid','Purrmaid','Purrmaid',-6978733445091201683),
 ('clawford','Clawford','Ghost_NPC_Clawford',2516683904805154653),
 ('clawford-boss','Clawford (Boss)','Ghost_Boss_Clawford',5209514447725638142),
 ('gentlebro','Gentlebro (Staff)','EnemyHumanoid_Boss_GentlebroBoss',8867497943756391109),
 ('gentlebro-two','Gentlebro 02','EnemyHumanoid_Boss_GentlebroBoss',8867497943756391109),
 ('gentlebro-three','Gentlebro 03','EnemyHumanoid_Boss_GentlebroBoss',8867497943756391109),
 ('gentlebro-melee','Gentlebro (Sword)','EnemyHumanoid_Boss_GentlebroBoss_Melee',3262510344537366531),
 ('gentlebros-float','Gentlebros (Floating)','EnemyHumanoidFloat_Gentlebros',6039366645184873887),
 ('orion','Orion','Seeker_Boss02_Orion',-7156672646889116796),
 ('antares','Antares','Seeker_Boss02_Antares',4509363857594647557),
 ('mewtallica','Mewtallica Pirate','EnemyHumanoid_Mewtallica',-5029993089929084863),
 ('captain-mewtallica','Captain Mewtallica','EnemyHumanoid_Boss_Mewtallica',5568531329470982733),
 ('jaejae','JaeJae','Tavern_NPCObject_JaeJae',-3323230309149697421),
 ('norah','Norah','Tavern_NPCObject_Norah',-2985970321791667114),
 ('gamertron','Gamertron','Tavern_NPCObject_Gamertron',-5030692970093367782),
 ('tavern-cat-01','Tavern Cat 01','Tavern_NPCObject_01',-7367985818489171155),
 ('tavern-cat-02','Tavern Cat 02','Tavern_NPCObject_02',8739913198992572715),
 ('tavern-cat-03','Tavern Cat 03','Tavern_NPCObject_03',-3194489343242708283),
 ('tavern-cat-04','Tavern Cat 04','Tavern_NPCObject_04',-6372858085302635044),
 ('tavern-cat-05','Tavern Cat 05','Tavern_NPCObject_05',4556196146054642448),
 ('tavern-cat-06','Tavern Cat 06','Tavern_NPCObject_06',-2992840205501219072),
 ('tavern-cat-07','Tavern Cat 07','Tavern_NPCObject_07',2881970758340839873),
 ('tavern-cat-08','Tavern Cat 08','Tavern_NPCObject_08',3951171115606170964),
 ('tavern-cat-09','Tavern Cat 09','Tavern_NPCObject_09',7617088016950445046),
 ('tavern-cat-10','Tavern Cat 10','Tavern_NPCObject_10',1820454238107571206),
 ('aelius-tavern','Aelius (Tavern)','Tavern_NPCObject_Aelius',-7528335126267621172),
 ('concert-cat','Concert Cat (Back View)','MewtallicaStage_NPC',-692589059379286046),
 ('concert-cat-two','Concert Cat 02 (Back View)','MewtallicaStage_NPC_02',8014357141446689233),
 ('concert-cats-moshpit','Concert Cats (Mosh Pit)','MewtallicaStage_NPC_MoshPit',4552249081879801625),
 ('lonely-cave-cat','Lonely Cave Cat','QuestObject_LonelyCave_NPC_Liedown',-3712121649813982470),
 ('chimeowra','Chimeowra','Grunt_Chubby_ChimeowraBoss',-7928602841743180612),
 ('monster-researcher','Monster Researcher','Tropical_Watchtower_NPC_MonsterResearcher',8507286872135194180),
 ('watchtower-mage','Watchtower Mage','Tropical_Watchtower_NPC_PuzzleMage',-8214480114801410175),
 ('straits-cat','Straits Watchtower Cat','Tropical_Watchtower_NPC_Straits',300691121771707238),
 ('watchtower-captain','Watchtower Captain','Tropical_Watchtower_NPC_BoarBoss',-1822282740984977354),
]
# Extra feline NPCs and forms are found by actual sprite families, not by rat enemy names.
CANDIDATES=[]
for a in env.assets:
 for obj in a.objects.values():
  if obj.type.name!='AssetBundle':continue
  for path,info in obj.read().m_Container:
   if not path.endswith('.prefab'):continue
   if any(x in path.lower() for x in ['tavern_npcobject','player_spirit','/spirit.prefab','claw','mewtallica','watchtower','smithy','cat']):
    CANDIDATES.append((path,info.asset))
print('CANDIDATES',len(CANDIDATES),flush=True)
# Sprite images are decoded once, then embedded in each self-contained GLB.
image_cache={}
def image_for(s):
 key=(s.object_reader.assets_file.name,s.object_reader.path_id)
 if key not in image_cache:
  img=s.image.convert('RGBA');stream=io.BytesIO();img.save(stream,format='PNG')
  image_cache[key]=(img.size,stream.getvalue())
 return image_cache[key]
def components(go):return [p.component.deref_parse_as_object() for p in go.m_Component]
def transform(go):return next(c for c in components(go) if c.object_reader.type.name in ['Transform','RectTransform'])
def export(go,slug,name):
 sourceRoot=go
 isolated={
  'monster-researcher':'tropical_npc_watchtower_monsterresearcher',
  'watchtower-mage':'tropical_npc_watchtower_puzzlemage',
  'straits-cat':'tropical_npc_watchtower_straits',
  'watchtower-captain':'tropical_npc_watchtower_boarboss',
 }.get(slug)
 if isolated:
  def find_character(node):
   for c in components(node):
    if c.object_reader.type.name=='SpriteRenderer' and c.m_Sprite.m_PathID and c.m_Sprite.deref_parse_as_object().m_Name==isolated:return node
   for ptr in transform(node).m_Children:
    match=find_character(ptr.deref_parse_as_object().m_GameObject.deref_parse_as_object())
    if match:return match
  go=find_character(go)
  if go is None:raise RuntimeError('Missing watchtower character '+isolated)
 doc={'asset':{'version':'2.0','generator':'Local Cat Quest III layered sprite extractor'},'extensionsUsed':['KHR_materials_unlit'],'scene':0,'scenes':[{'nodes':[0]}],'nodes':[],'meshes':[],'materials':[],'textures':[],'images':[],'samplers':[{'magFilter':9729,'minFilter':9729,'wrapS':33071,'wrapT':33071}],'accessors':[],'bufferViews':[],'buffers':[{}]}
 binary=bytearray();parts=[];materials={};transforms={};warnings=[]
 runtimeActivated=slug.startswith('concert-') or slug=='lonely-cave-cat'
 overrides={
  'sibling-two':{'humanoid_npc_sibling01_headstripe':'humanoid_npc_sibling02_headstripe'},
  'sibling-three':{'humanoid_npc_sibling01_headstripe':'humanoid_npc_sibling03_headstripe'},
  'gentlebro-two':{'humanoid_boss_gentlebro_head':'humanoid_boss_gentlebro_head_02'},
  'gentlebro-three':{'humanoid_boss_gentlebro_head':'humanoid_boss_gentlebro_head_03'},
 }.get(slug,{})
 def blob(raw):
  binary.extend(b'\0'*(-len(binary)%4));idx=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(raw)});binary.extend(raw);return idx
 def acc(values,kind,ctype,dtype):
  values=np.asarray(values,dtype=dtype);idx=len(doc['accessors']);d={'bufferView':blob(values.tobytes()),'componentType':ctype,'count':len(values),'type':kind};d.update(min=values.min(axis=0).reshape(-1).tolist(),max=values.max(axis=0).reshape(-1).tolist());doc['accessors'].append(d);return idx
 def visit(go,parent=None,path='',root=False):
  cs=components(go);t=next(c for c in cs if c.object_reader.type.name in ['Transform','RectTransform'])
  # Character prefabs may be saved facing away. Prefer their front Main assembly.
  if not root:
   if not slug.startswith('concert-'):
    if go.m_Name.lower() in ['back','main_back','backsprites','backfacingsprites']:return
    if go.m_Name.lower()=='back' or go.m_Name.lower().endswith('_back'):return
   if not go.m_IsActive and go.m_Name.lower() not in ['main','front','frontsprites'] and not runtimeActivated:return
  node={'name':go.m_Name,'translation':[t.m_LocalPosition.x,t.m_LocalPosition.y,-t.m_LocalPosition.z],'rotation':[-t.m_LocalRotation.x,-t.m_LocalRotation.y,t.m_LocalRotation.z,t.m_LocalRotation.w],'scale':[t.m_LocalScale.x,t.m_LocalScale.y,t.m_LocalScale.z]}
  if root:node.update(translation=[0,0,0],rotation=[0,0,0,1])
  idx=len(doc['nodes']);doc['nodes'].append(node);transforms[path]=idx
  if parent is not None:doc['nodes'][parent].setdefault('children',[]).append(idx)
  for c in cs:
   if c.object_reader.type.name!='SpriteRenderer' or (not c.m_Enabled and not runtimeActivated) or not c.m_Sprite.m_PathID:continue
   sprite=c.m_Sprite.deref_parse_as_object();sname=sprite.m_Name
   if sname in overrides:
    replacement=next(o for o in objects.values() if o.type.name=='Sprite' and o.peek_name()==overrides[sname]);sprite=replacement.read();sname=sprite.m_Name
   if any(x in sname.lower() for x in ['shadow','reflection','vfx_','glow']) or sname.endswith('_none') or sname=='cat_none_rim':continue
   try:
    (width,height),png=image_for(sprite)
    skey=(sprite.object_reader.assets_file.name,sprite.object_reader.path_id)
    if skey not in materials:
     mat=len(doc['materials']);materials[skey]=mat;view=blob(png);doc['images'].append({'bufferView':view,'mimeType':'image/png','name':sname});doc['textures'].append({'source':len(doc['images'])-1,'sampler':0})
     doc['materials'].append({'name':sname,'pbrMetallicRoughness':{'baseColorTexture':{'index':len(doc['textures'])-1},'baseColorFactor':[1,1,1,1 if runtimeActivated else float(c.m_Color.a)],'metallicFactor':0,'roughnessFactor':1},'alphaMode':'MASK','alphaCutoff':.05,'doubleSided':True,'extensions':{'KHR_materials_unlit':{}}})
    rd=sprite.m_RD
    if sprite.m_SpriteAtlas.m_PathID:
     atlas=sprite.m_SpriteAtlas.deref_parse_as_object();rd=next(v for k,v in atlas.m_RenderDataMap if k==sprite.m_RenderDataKey)
    offset=rd.textureRectOffset;ppu=sprite.m_PixelsToUnits
    x0=(offset.x-sprite.m_Rect.width*sprite.m_Pivot.x)/ppu;y0=(offset.y-sprite.m_Rect.height*sprite.m_Pivot.y)/ppu
    x1=x0+width/ppu;y1=y0+height/ppu
    coords=np.array([[x0,y0,0],[x1,y0,0],[x1,y1,0],[x0,y1,0]])
    if c.m_FlipX:coords[:,0]*=-1
    if c.m_FlipY:coords[:,1]*=-1
    attrs={'POSITION':acc(coords,'VEC3',5126,'<f4'),'NORMAL':acc([[0,0,1]]*4,'VEC3',5126,'<f4'),'TEXCOORD_0':acc([[0,1],[1,1],[1,0],[0,0]],'VEC2',5126,'<f4')}
    mesh=len(doc['meshes']);doc['meshes'].append({'name':sname,'primitives':[{'attributes':attrs,'indices':acc([0,1,2,0,2,3],'SCALAR',5123,'<u2'),'material':materials[skey]}]})
    meshNode={'name':sname+' sprite','mesh':mesh,'translation':[0,0,int(c.m_SortingOrder)*.0008+len(parts)*.000001],'extras':{'unitySprite':sname,'sortingOrder':c.m_SortingOrder}}
    doc['nodes'][idx].setdefault('children',[]).append(len(doc['nodes']));doc['nodes'].append(meshNode)
    parts.append({'name':sname,'spriteId':sprite.object_reader.path_id,'asset':sprite.object_reader.assets_file.name,'width':width,'height':height,'path':path,'order':c.m_SortingOrder})
   except Exception as ex:
    warnings.append(sname+': '+str(ex));print('SPRITE ERROR',sname,str(ex),flush=True)
  for ptr in t.m_Children:
   child=ptr.deref_parse_as_object().m_GameObject.deref_parse_as_object();visit(child,idx,(path+'/' if path else '')+child.m_Name)
 visit(go,root=True)
 if not parts:raise RuntimeError('No active sprites exported for '+name)
 folder=OUT/slug;folder.mkdir(exist_ok=True)
 doc['extras']={'game':'Cat Quest III','character':name,'representation':'Original layered 2D sprites in 3D space','sourcePrefab':go.m_Name,'sourcePathId':str(go.object_reader.path_id)}
 doc['buffers'][0]['byteLength']=len(binary);raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*(-len(raw)%4);binary+=b'\0'*(-len(binary)%4)
 payload=struct.pack('<4sII',b'glTF',2,28+len(raw)+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
 (folder/'character.glb').write_bytes(payload)
 report={'game':'Cat Quest III','name':name,'slug':slug,'sourcePrefab':go.m_Name,'sourcePathId':str(go.object_reader.path_id),'sourceAsset':go.object_reader.assets_file.name,'representation':'2.5D layered sprite prefab','spriteOverrides':overrides,'parts':parts,'warnings':warnings,'limitations':['Original sprites, pivots, hierarchy and sorting order retained.','Game-specific rim-light/tint shader approximated with unlit alpha-masked materials; additive glows omitted.','Static prefab pose; sprite-swap animation, gameplay scripts and runtime outfit changes are not included.','No voice clips are attributed without verified speaker references.']}
 (folder/'provenance.json').write_text(json.dumps(report,indent=2));print('EXPORTED',slug,len(parts),'layers',len(payload),'bytes',flush=True)
 return {'id':'catquest-'+slug,'name':name,'gameId':'cat-quest-iii','height':1.3,'model':'./assets/cat-quest-iii/'+slug+'/character.glb','audio':None,'voiceCount':0,'languages':[],'representation':'2.5D','description':name+' from Cat Quest III. Original layered sprite artwork and prefab pose, exported as a 2.5D GLB. Native sprite animations and voice are not included.','parts':len(parts),'warnings':warnings}
entries=[]
for slug,name,prefab,pid in TARGETS:
 matches=[o for (cab,i),o in objects.items() if i==pid and o.type.name=='GameObject']
 if len(matches)!=1:raise RuntimeError('Missing or ambiguous '+prefab)
 entries.append(export(matches[0].read(),slug,name))
(OUT/'catalog.json').write_text(json.dumps({'game':'Cat Quest III','characters':entries,'excluded':['Explicit rat and rat-skeleton enemy prefabs','Duplicate scene instances'],'source':str(ROOT)},indent=2))
print('DONE',len(entries),'characters',flush=True)
