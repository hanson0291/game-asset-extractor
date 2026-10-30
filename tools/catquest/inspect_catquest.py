import sys,json,collections
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'python-deps'))
import UnityPy
UnityPy.config.FALLBACK_UNITY_VERSION='2022.3.14f1'
ROOT=Path(r'E:/SteamLibrary/steamapps/common/CatQuest_Purribean/Cat Quest III_Data')
OUT=Path(__file__).parent
files=list(ROOT.glob('*.assets'))+list((ROOT/'StreamingAssets/aa').rglob('*.bundle'))
rows=[]
for p in files:
 print('SCAN',p.name,p.stat().st_size,flush=True)
 try:
  env=UnityPy.load(str(p))
  for o in env.objects:
   if o.type.name not in ['GameObject','Mesh','AnimationClip','AnimatorController','Avatar','AudioClip','SkinnedMeshRenderer','Sprite','Texture2D','Material','MonoScript']:continue
   try:
    d=o.read();name=getattr(d,'m_Name','')
    if o.type.name=='SkinnedMeshRenderer':name=d.m_GameObject.deref_parse_as_object().m_Name
    rows.append({'file':str(p.relative_to(ROOT)),'asset':o.assets_file.name,'id':o.path_id,'type':o.type.name,'name':name})
   except Exception as e: print('ERR',o.path_id,str(e)[:100],flush=True)
 except Exception as e:print('FILE ERROR',str(e),flush=True)
(OUT/'inventory.json').write_text(json.dumps(rows,indent=2))
print('COUNTS',dict(collections.Counter(r['type'] for r in rows)),flush=True)
for kind in ['Mesh','SkinnedMeshRenderer','Avatar','AnimatorController']:
 matches=[r for r in rows if r['type']==kind];print(kind,len(matches),json.dumps(matches)[:20000],flush=True)
