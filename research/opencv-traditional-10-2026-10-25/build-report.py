"""Build this research artifact only. Does not import or change AgentCV code."""
from pathlib import Path
import json, math, html, base64, mimetypes, hashlib

ROOT = Path(__file__).resolve().parent
CASES = json.loads((ROOT / 'cases.json').read_text())
for folder in ['synthetic', 'schematics', 'qa']:
    (ROOT / folder).mkdir(exist_ok=True)

def svg(body, w=512, h=512, bg='#05090d'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>'

def gear(cx=256, cy=256, root=127, tip=152, missing=None):
    pts = []
    for i in range(16):
        for q, radius in [(-.5, root),(-.36, root),(-.2, tip),(.2, tip),(.36, root)]:
            r = root if i == missing else radius
            a = (i+q)*2*math.pi/16
            pts.append([cx+r*math.cos(a),cy+r*math.sin(a)])
    return pts

def polygon(ps, fill='white', stroke='none', width=2):
    return '<polygon points="'+' '.join(f'{x:.4f},{y:.4f}' for x,y in ps)+f'" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'

annotations = {'schema':'agentcv-research-design-truth-1', 'units':'design px, not mm', 'status':'Synthetic input design; no CV algorithms executed', 'notes':['Gear is a trapezoid-tooth toy silhouette, not an involute manufacturing model.','Rasterisation changes boundary pixels; vector design truth is not optical measurement truth.','NG refers only to the declared toy design rules. No production tolerances are inferred.'], 'images':[]}
def synthetic(name, body, truth, w=512, h=512, bg='#05090d'):
    (ROOT/'synthetic'/f'{name}.svg').write_text(svg(body,w,h,bg))
    annotations['images'].append({'file':f'synthetic/{name}.png','vector':f'synthetic/{name}.svg','width':w,'height':h,'truthSource':'generated_design','design':truth})

for name, missing, bore in [('gear-ok',None,(256,256)),('gear-missing',3,(256,256)),('gear-eccentric',None,(268,256))]:
    ps=gear(missing=missing)
    synthetic(name,polygon(ps)+f'<circle cx="{bore[0]}" cy="{bore[1]}" r="48" fill="#05090d"/>',{'nominalTeeth':16,'visibleDesignedTeeth':15 if missing is not None else 16,'missingToothIndex':missing,'outerPolygon':ps,'center':[256,256],'boreCenter':bore,'boreRadius':48,'class':'OK' if name=='gear-ok' else 'NG','reason':{'gear-ok':'complete and concentric toy design','gear-missing':'designed tooth 3 absent','gear-eccentric':'bore center offset by 12 design px'}[name]})

for name,x in [('washer-ok',256),('washer-eccentric',272)]:
    synthetic(name,f'<circle cx="256" cy="256" r="156" fill="white"/><circle cx="{x}" cy="256" r="78" fill="#05090d"/>',{'outerCenter':[256,256],'outerRadius':156,'innerCenter':[x,256],'innerRadius':78,'centerOffsetPx':x-256,'class':'OK' if x==256 else 'NG','rule':'toy design requires concentric circles'})

holes=[[150,256],[256,256],[362,256]]
for name in ['panel-ok','panel-missing','panel-open']:
    current=holes if name!='panel-missing' else [holes[0],holes[2]]
    body='<rect x="75" y="145" width="362" height="222" rx="16" fill="white"/>'
    body+=''.join(f'<circle cx="{x}" cy="{y}" r="25" fill="#05090d"/>' for x,y in current)
    if name=='panel-open':body+='<rect x="337" y="140" width="50" height="118" fill="#05090d"/>'
    synthetic(name,body,{'nominalHoles':[{'id':f'H{i+1}','center':p,'radius':25} for i,p in enumerate(holes)],'closedHoleCount':3 if name=='panel-ok' else 2,'missingHoleId':'H2' if name=='panel-missing' else None,'openToExteriorId':'H3' if name=='panel-open' else None,'class':'OK' if name=='panel-ok' else 'NG','rule':'toy design requires three closed holes'})

for name in ['traces-ok','traces-break','traces-bridge']:
    body=''.join(f'<rect x="90" y="{y-8}" width="332" height="16" rx="3" fill="white"/><circle cx="90" cy="{y}" r="17" fill="white"/><circle cx="422" cy="{y}" r="17" fill="white"/>' for y in [145,219,293,367])
    if name=='traces-break':body+='<rect x="250" y="207" width="14" height="25" fill="#05090d"/>'
    if name=='traces-bridge':body+='<rect x="285" y="211" width="14" height="90" fill="white"/>'
    synthetic(name,body,{'lineIds':['L1','L2','L3','L4'],'expectedIndependentNets':4,'class':'OK' if name=='traces-ok' else 'NG','defectType':{'traces-ok':None,'traces-break':'open_circuit','traces-bridge':'bridge'}[name],'defectRegion':{'traces-ok':None,'traces-break':[250,211,14,16],'traces-bridge':[285,227,14,58]}[name]})

def printing(defect=False):
    body='<rect x="70" y="80" width="365" height="355" rx="12" fill="#f2f1e9"/>'
    body+='<rect x="100" y="110" width="95" height="95" fill="#193f4d"/><rect x="220" y="110" width="180" height="18" fill="#193f4d"/><rect x="220" y="146" width="130" height="13" fill="#193f4d"/>'
    body+=''.join(f'<rect x="{100+i*16}" y="250" width="{5+(i%3)*2}" height="100" fill="#193f4d"/>' for i in range(19))
    body+='<circle cx="365" cy="390" r="18" fill="#193f4d"/>'
    if defect:body+='<rect x="220" y="270" width="35" height="35" fill="#f2f1e9"/>'
    return body
for name,shift,defect in [('print-reference',False,False),('print-shift',True,False),('print-defect',True,True)]:
    content=printing(defect)
    if shift:content='<g transform="translate(8 -5)">'+content+'</g>'
    synthetic(name,content,{'reference':'synthetic/print-reference.png','referenceToImageTranslation':[8,-5] if shift else [0,0],'class':'NG' if defect else 'OK','defectRegionInReference':[220,270,35,35] if defect else None,'defectRegionInImage':[228,265,35,35] if defect else None},bg='#c5c8c5')
synthetic('print-defect-mask','<rect x="236" y="265" width="9" height="35" fill="white"/><rect x="252" y="265" width="5" height="35" fill="white"/>',{'kind':'annotation, not a test image','region':[228,265,35,35],'convention':'white denotes removed designed ink only, in test-image coordinates; rectangle region is the containing edit window','designedRemovedInkAreaPx':490},bg='black')
(ROOT/'annotations.json').write_text(json.dumps(annotations,ensure_ascii=False,indent=2)+'\n')

# Report diagrams are explicitly marked as plans. They are never CV outputs.
BG='#f3f2ec'; CARD='#ffffff'; INK='#19343b'; MUTED='#637774'; GREEN='#167a60'; RED='#b75443'; BLUE='#376f96'
def t(x,y,s,size=18,color=INK,extra=''):
    return f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" {extra}>{html.escape(str(s))}</text>'
def box(x,y,w,h,fill=CARD,stroke='#d5ddd6',r=14):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" rx="{r}"/>'
def ln(x,y,a,b,col=GREEN,dash=''):
    return f'<path d="M{x} {y}L{a} {b}" stroke="{col}" stroke-width="2" fill="none" {dash}/>'
def wrap(x,y,s,width=25,size=17,color=INK):
    rows=[];row='';n=0
    for c in s:
        v=.55 if ord(c)<128 else 1
        if n+v>width:rows.append(row);row='';n=0
        row+=c;n+=v
    if row:rows.append(row)
    return ''.join(t(x,y+i*(size+8),s,size,color) for i,s in enumerate(rows))
def report_svg(body,title):
    return svg(f'<g font-family="Heiti TC,PingFang TC,sans-serif">{t(25,34,title,21)}{t(25,60,"流程示意 · 尚未執行算法 · 無實測分數",13,MUTED)}{body}</g>',960,520,BG)

def shape(slug):
    if slug=='gear':
        p=gear(215,219,100,123,3)
        return polygon(p,'#deebe2',GREEN)+f'<circle cx="215" cy="219" r="38" fill="white" stroke="{GREEN}" stroke-width="2"/>'+ln(175,219,255,219)+ln(215,179,215,259)+t(125,373,'真實齒谷要保留；凸包會填平',15,MUTED)
    if slug=='washer':
        return f'<circle cx="215" cy="219" r="124" fill="#deebe2" stroke="{GREEN}" stroke-width="2"/><circle cx="233" cy="219" r="62" fill="white" stroke="{RED}" stroke-width="2"/>'+ln(205,219,243,219,RED)+t(118,373,'圓候選 → 支持點 → 內外配對',15,MUTED)
    if slug=='holes':
        return box(62,128,323,180,'#deebe2',GREEN)+''.join(f'<circle cx="{x}" cy="218" r="25" fill="white" stroke="{BLUE}" stroke-width="2"/>{t(x,269,"H"+str(i+1),15,BLUE,"text-anchor=\"middle\"")}' for i,x in enumerate([127,224,321]))+t(97,373,'孔是外輪廓的子區域',15,MUTED)
    if slug=='orientation':
        out=''
        for i,(x,y,a) in enumerate([(145,157,-22),(265,232,24),(142,305,-15)]):
            out+=f'<g transform="translate({x} {y}) rotate({a})"><rect x="-74" y="-16" width="148" height="32" fill="#deebe2" stroke="{GREEN}" rx="8"/>'+ln(-85,0,85,0,BLUE)+'</g>'
        return out+t(75,373,'逐件主軸；方向是 mod 180°',15,MUTED)
    if slug=='touching':
        return ''.join(f'<circle cx="{x}" cy="{y}" r="70" fill="{col}" fill-opacity=".85" stroke="{GREEN}" stroke-width="2"/>' for x,y,col in [(164,205,'#beddd0'),(270,205,'#d6e7b9'),(216,294,'#b8d4e5')])+''.join(f'<circle cx="{x}" cy="{y}" r="5" fill="{RED}"/>' for x,y in [(164,205),(270,205),(216,294)])+t(79,389,'接觸的外形 ≠ 已知的件數',15,MUTED)
    if slug=='continuity':
        out=''
        for i,y in enumerate([153,217,281]):
            out+=ln(76,y,361,y,BLUE)+f'<circle cx="76" cy="{y}" r="8" fill="{GREEN}"/><circle cx="361" cy="{y}" r="8" fill="{GREEN}"/>'
        return out+box(201,205,17,24,BG,BG,0)+ln(274,217,274,281,RED)+t(90,373,'原遮罩保留斷口與短接',15,MUTED)
    if slug=='color':
        out=''
        for i,col in enumerate(['#cc5a4a','#e1b843','#4f8b99','#cc5a4a','#7b70a6','#e1b843']):
            x=120+i%3*99;y=170+i//3*107
            out+=f'<circle cx="{x}" cy="{y}" r="31" fill="{col}"/>'+t(x,y+6,i+1,17,'white','text-anchor="middle"')
        return out+t(88,373,'逐件判色，避免全圖比例誤導',15,MUTED)
    if slug=='pose':
        return polygon([[72,135],[294,107],[366,302],[94,328]],'#deebe2',GREEN)+''.join(ln(100+i*42,160,319-i*22,273,BLUE) for i in range(5))+t(79,373,'匹配支持 → 平面模型 → 四角',15,MUTED)
    if slug=='difference':
        return box(73,115,287,215,'#deebe2',GREEN)+''.join(ln(100,153+i*37,330,153+i*37,BLUE) for i in range(4))+box(201,175,35,31,'#f0d6ce',RED,0)+t(81,373,'先核對位移，再比較缺陷像素',15,MUTED)
    return box(85,102,260,260,CARD,GREEN)+''.join(box(x,y,60,60,'#28464c','#28464c',2)+box(x+13,y+13,34,34,'white','white',0)+box(x+22,y+22,16,16,'#28464c','#28464c',0) for x,y in [(110,127),(260,127),(110,277)])+''.join(box(220+(i%4)*21,210+(i//4)*21,13,13,'#28464c','#28464c',0) for i in [0,2,3,4,5,7,8,10,11,12,13,15])+t(79,390,'示意標記；不是可解碼 QR',15,MUTED)

for c in CASES:
    slug=c['slug']
    body=box(20,82,395,328)+shape(slug)
    body+=box(438,82,501,328)
    body+=t(460,119,'要回答',15,MUTED)+wrap(460,151,c['question'],25,20)
    body+=t(460,229,'輸出必須能回到原圖',15,GREEN)
    for i,o in enumerate(c['outputs']):body+=t(460,266+i*40,f'0{i+1}  '+o,17)
    for i,(name,api) in enumerate(c['flow']):
        x=21+i*188
        body+=box(x,433,171,66)+t(x+11,457,name,13)+wrap(x+11,477,api,15,9,MUTED)
        if i<4:body+=t(x+174,474,'→',16,GREEN)
    (ROOT/'schematics'/f'{slug}-flow.svg').write_text(report_svg(body,c['id']+' · '+c['name']))
    body=''
    for i,(title,desc) in enumerate(c['evidence']):
        x=21+i%2*469;y=83+i//2*203
        body+=box(x,y,449,185)+t(x+17,y+32,f'0{i+1}  '+title,19,GREEN)
        if i==0:
            body+=box(x+18,y+48,104,103,'#deebe2',GREEN)+ln(x+34,y+67,x+109,y+129,BLUE)+ln(x+34,y+129,x+109,y+67,BLUE)
        elif i==1:
            for k in range(5):body+=box(x+18+k%3*34,y+55+k//3*41,27,31,['#beddd0','#d6e7b9','#b8d4e5'][k%3],'none',4)
        elif i==2:
            body+=ln(x+27,y+145,x+124,y+145,MUTED)+ln(x+27,y+145,x+27,y+62,MUTED)+t(x+40,y+102,'待實測',14,MUTED)
        else:
            for k in range(3):body+=box(x+18,y+59+k*30,108,23,'#edf0e9','none',3)+t(x+26,y+76+k*30,['輸入指紋','參數與版本','全部候選'][k],11,MUTED)
        body+=wrap(x+143,y+74,desc,15,17)
    (ROOT/'schematics'/f'{slug}-evidence.svg').write_text(report_svg(body,c['name']+' · 必須保留的圖像證據'))
    body=box(22,84,420,362)+t(43,119,'比較網格示意',19,GREEN)+t(43,148,'第三參數另分頁；每格都要保留結果',13,MUTED)
    for i in range(3):
        for j in range(3):
            x=72+j*112;y=181+i*72
            body+=box(x,y,98,57,'#edf0e9','#cdd9d0',8)+t(x+49,y+34,'待實算',14,MUTED,'text-anchor="middle"')
    body+=t(43,428,'這輪沒有執行比較，沒有虛構勝出者。',14,MUTED)
    for i,s in enumerate(['完整跑完候選組合','比較真值誤差與漏檢／誤報','檢查線位、數量或分類是否跳變','交代取捨，然後鎖定參數','到未參與調參的樣本上驗收']):
        body+=box(468,86+i*73,469,60)+t(487,123+i*73,str(i+1)+'  '+s,17,GREEN if i==4 else INK)
    body+=t(24,490,'右側列的是試驗候選與來源；所有門檻仍需依樣品、成像和規格確認。',15,MUTED)
    (ROOT/'schematics'/f'{slug}-parameters.svg').write_text(report_svg(body,c['name']+' · 參數比較規劃'))

main=json.loads((ROOT/'sources/opencv-branch.json').read_text())['commit']['sha']
extra=json.loads((ROOT/'sources/extra-extra-branch.json').read_text())['commit']['sha']
manifest=[]
for p in sorted((ROOT/'sources').glob('asset-manifest-*.json')):
    manifest += [x for x in json.loads(p.read_text()) if x.get('status')=='downloaded']
for x in manifest:
    local=ROOT/x.get('folder','assets')/x['name']
    if local.is_file():
        assert hashlib.sha256(local.read_bytes()).hexdigest()==x['sha256']
    x['local']=str(local.relative_to(ROOT))
(ROOT/'sources/verified-assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

# PNG rasterisation is a separate artifact step; --final is run afterwards.
if __name__=='__main__' and '--final' in __import__('sys').argv:
    assets={}
    used={p for c in CASES for _,p,_ in c['images']}
    used.update(v['local'] for v in manifest if v['local'].endswith(('.png','.jpg')))
    used.update(f'schematics/{c["slug"]}-{s}.svg' for c in CASES for s in ['flow','evidence','parameters'])
    for p in sorted(used):
        raw=(ROOT/p).read_bytes();mime=mimetypes.guess_type(p)[0] or 'application/octet-stream'
        assets[p]=f'data:{mime};base64,'+base64.b64encode(raw).decode()
    for item in annotations['images']:
        item['sha256']=hashlib.sha256((ROOT/item['file']).read_bytes()).hexdigest()
    (ROOT/'annotations.json').write_text(json.dumps(annotations,ensure_ascii=False,indent=2)+'\n')
    annotation_index={v['file']:i for i,v in enumerate(annotations['images'])}
    asset_index={v['local']:v for v in manifest}
    qr_answers=json.loads((ROOT/'assets/extra-dataset_config.json').read_text())['test_images']
    reference_outputs={'assets/doc-pca_output.png','assets/doc-water_thresh.jpg','assets/doc-water_dt.jpg','assets/doc-water_marker.jpg','assets/doc-water_result.jpg','assets/doc-homography_findobj.jpg'}
    diagrams={'assets/doc-hierarchy.png','assets/doc-tree_hierarchy.png'}
    test_manifest={'schema':'agentcv-research-test-collection-1','state':'collected-not-executed','productionAcceptanceReady':False,'units':'px unless independently calibrated','splitRule':'Keep derivatives, shared image hashes and related QR patterns in the same source group. Group real specimens and capture sessions once that metadata is available.','cases':[]}
    for c in CASES:
        files=[]
        for title,file,note in c['images']:
            role='candidate-input'
            if file in reference_outputs:role='upstream-example-output-not-test-input'
            elif file in diagrams:role='upstream-teaching-diagram-not-production-input'
            elif file.endswith('-mask.png'):role='annotation-mask-not-test-input'
            elif file in ['assets/box.png','synthetic/print-reference.png']:role='reference-image'
            answer=None;source_group=None
            if file in annotation_index:
                i=annotation_index[file];design=annotations['images'][i]['design']
                answer={'source':'generated-design','reference':f'annotations.json#/images/{i}','scope':'synthetic pipeline only','toyQualityClass':design.get('class')}
                source_group='synthetic/'+c['slug']
            elif c['slug']=='qr':
                q=next((q for q in qr_answers if file=='assets/qr-'+q['image_name']),None)
                if q:answer={'source':'upstream-test-config','payload':q['info'],'corners':list(map(list,zip(q['x'],q['y']))),'reference':'assets/extra-dataset_config.json','qualityClass':None}
                source_group='opencv-extra/qr/version_1_same_pattern'
            entry=asset_index.get(file)
            sha=hashlib.sha256((ROOT/file).read_bytes()).hexdigest()
            files.append({'file':file,'role':role,'description':title,'note':note,'sha256':sha,'upstream':entry['url'] if entry else None,'sourceGroup':source_group or 'sha256/'+sha,'specimenId':None,'cameraCalibrationStatus':'not-provided','referenceAnswer':answer,'runStatus':'not-executed'})
        test_manifest['cases'].append({'caseId':c['id'],'name':c['name'],'origin':c['origin'],'files':files,'requiresBeforeAcceptance':c['missing'],'metricsToMeasure':c['metrics'],'productionAcceptanceReady':False})
    (ROOT/'test-manifest.json').write_text(json.dumps(test_manifest,ensure_ascii=False,indent=2)+'\n')
    source={'date':'2026-10-25','mainSha':main,'extraSha':extra,'docsVersion':'4.13.0','assetCount':len([x for x in manifest if x['local'].endswith(('.png','.jpg'))]),'syntheticCount':len(annotations['images']),'productVersionUnchanged':'0.9.8','state':'Research collection only; no AgentCV algorithm changes or runs'}
    def safe_json(v):return json.dumps(v,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
    template=(ROOT/'report-template.html').read_text()
    for k,v in {'CASES':CASES,'ASSETS':assets,'SOURCE':source,'ANNOTATIONS':annotations,'MANIFEST':manifest,'TESTS':test_manifest}.items():template=template.replace('__'+k+'__',safe_json(v))
    (ROOT/'index.html').write_text(template)
    print(json.dumps({'cases':len(CASES),'embeddedAssets':len(assets),'htmlBytes':(ROOT/'index.html').stat().st_size,**source},ensure_ascii=False))
