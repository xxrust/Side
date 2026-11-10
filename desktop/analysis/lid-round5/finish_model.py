  with step('coherent',name='整體輪廓',depends_on=['edges'],inputs={'edgeCandidates':'edge_data'},outputs={'model_data':'model_data','model_view':'model_view'},parameters={k:parameters[k] for k in ['poseModel','radiusModel','display']},justification=why('用同一姿態、長寬與共同半徑把四角連成一個物體；固定獨立pkg支持後才比較lid峰，不用包含結果挑輪廓。',['poseModel','radiusModel','display'],'model_data','model_view','radius_trials','candidate_trials')) as st:
   candidates=[]
   for base in alltrials:
    gg=cv2.GaussianBlur(g0,(0,0),base['sigma'])
    for ci,joint in enumerate(base['joint']):
     entry=base if ci==0 else candidate_edges(gg,box,joint,base)
     candidates.append(coherent_candidate(gg,entry,box,joint,ci,base['sigma']))
   nominal=[q for q in candidates if q['sigma']==parameters['search']['sigma']];best=max(nominal,key=lambda q:q['score'])
   mv=image.copy()
   for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:
    draw_model(mv,best['models'][tag],col)
    for k,q in best['edges'][tag].items():
     drawseg(mv,linepoints(k,q['pos'],q['slope'],box),col,q['kind']=='estimated',2)
   modeldata={'selected':best,'candidates':candidates,'scope':'DRAFT-derived development pixel model; all outputs here freshly computed from this input; no labels or IDs used for selection'}
   save_image('model_view',mv);save_image('radius_trials',plot_radii(best),section='parameters');save_image('candidate_trials',plot_candidates(candidates,best),section='boundary');save_image('details',detail_view(image,best),section='boundary');save_json('model_data',modeldata);st.set_output('model_data',modeldata)
  with step('relation',name='包含核對',depends_on=['coherent','edges'],inputs={'models':'model_data','directionalEvidence':'edge_data'},outputs={'geometry_data':'geometry_data','overlay':'overlay'},parameters={'decision':parameters['decision'],'display':parameters['display']},justification=why('單側越界沿用方向所需的獨立支持；GOOD改為品質合格的整體模型內未見越界，並保留同分候選與像素容差。這不是精密物理證明。',['decision','display'],'geometry_data','overlay','decision_trials','model_clearance')) as st:
   D=parameters['decision'];lid=selected['lid'];pkg=selected['pkg']
   bounds={k:{'nominal':selected['margins'][k],'low':min(q['margins'][k]-q['pkg'][k]['edgeIntervalPx']-q['lid'][k]['edgeIntervalPx'] for q in alltrials),'high':max(q['margins'][k]+q['pkg'][k]['edgeIntervalPx']+q['lid'][k]['edgeIntervalPx'] for q in alltrials)} for k in SIDES}
   independent=all(q['pkgAnchorValid'] for q in alltrials)
   skew=bool(independent and any(v['high']<0 and lid[k]['kind']!='estimated' for k,v in bounds.items()))
   # Compare each smoothing setting at its own best likelihood, keeping all real candidates.
   winners=[max([q for q in candidates if q['sigma']==s],key=lambda q:q['score']) for s in parameters['scan']['sigmas']]
   plausible=[]
   for win in winners:
    plausible.extend(q for q in candidates if q['sigma']==win['sigma'] and q['score']>=win['score']-D['candidateScoreDelta'] and q['quality'])
   quality=bool(independent and all(q['quality'] for q in winners))
   minFamily=min([q['familyMinimumPx'] for q in plausible],default=None)
   nominalMin=best['minClearancePx'];contained=bool(not skew and quality and nominalMin>=-D['pixelTolerancePx'] and minFamily is not None and minFamily>=-D['pixelTolerancePx'])
   # A clearly supported overhang remains decisive even if a global lid candidate is poor.
   shown=next(q for q in nominal if q['candidateIndex']==0) if skew else best
   nominalMin=shown['minClearancePx']
   finalHint='SKEW' if skew else ('GOOD' if contained else 'UNKNOWN')
   checks=[{'id':'independent_pkg_support','status':'PASS' if independent else 'FAIL','actual':{'visibleSides':selected['visiblePkgSides'],'anchors':selected['pkgAnchors']},'threshold':'independent separated pkg support in one horizontal and one vertical direction'},
    {'id':'coherent_model_quality','status':'PASS' if quality else 'FAIL','actual':[{'sigma':q['sigma'],'residualPx':q['maxMeasuredNormalResidualPx'],'dimensionOk':q['dimensionOk'],'radiusOk':q['radiusOk']} for q in winners],'threshold':parameters['poseModel']},
    {'id':'model_clearance','status':'PASS' if contained else ('FAIL' if skew else 'NOT_EVALUATED'),'actual':{'nominalPx':nominalMin,'candidateFamilyMinimumPx':minFamily,'scope':'development modeled containment only'},'threshold':{'minimumPx':-D['pixelTolerancePx'],'candidateScoreDelta':D['candidateScoreDelta']}},
    {'id':'physical_calibration','status':'NOT_EVALUATED','actual':'no independent metrology or unseen acceptance; deliberately separate from executable development classification','threshold':'human acceptance and calibrated boundary error'}]
   sweeps=[]
   for delta,tol in itertools.product(D['deltaTrials'],D['toleranceTrialsPx']):
    ps=[q for win in winners for q in candidates if q['sigma']==win['sigma'] and q['score']>=win['score']-delta and q['quality']];mn=min([q['familyMinimumPx'] for q in ps],default=None)
    sweeps.append({'scoreDelta':delta,'pixelTolerancePx':tol,'candidateFamilyMinimumPx':mn,'category':'SKEW' if skew else ('GOOD' if quality and nominalMin>=-tol and mn is not None and mn>=-tol else 'UNKNOWN')})
   data={'valid':True,'skewSupported':skew,'containedSupported':contained,'classificationHint':finalHint,'independentSupports':bool(independent),'clearance':bounds,'modelClearance':{'nominalPx':nominalMin,'candidateFamilyMinimumPx':minFamily,'minimumPoint':shown['minimumPoint']},'modelQuality':quality,'selectedModel':shown['models'],'selectedCandidate':{'sigma':shown['sigma'],'index':shown['candidateIndex'],'score':shown['score']},'directionalSource':{'selected':selected,'bounds':bounds},'candidateSummary':[{k:q[k] for k in ['candidateIndex','sigma','score','minClearancePx','familyMinimumPx','quality','dimensionOk','radiusOk','maxMeasuredNormalResidualPx']} for q in candidates],'plausibleCandidateKeys':[[q['sigma'],q['candidateIndex']] for q in plausible],'decisionTrials':sweeps,'boundaryChecks':checks,'scope':'模型內未見超容差越界，僅歪斜檢查；人類授權的開發像素模型。實測支持、估計輪廓、人類示教分開；非精密物理包含或獨立驗收。'}
   ov=image.copy();objects=[]
   for tag,col in [('lid',(20,240,20)),('pkg',(255,180,0))]:
    draw_model(ov,shown['models'][tag],col);pp=boundary(shown['models'][tag]);objects.append({'id':tag+'-model','type':'polyline','label':tag+' 單姿態共同半徑模型（推估）','geometry':{'points':[{'x':float(x),'y':float(y)} for x,y in np.vstack([pp,pp[:1]])]}})
    for k,q in shown['edges'][tag].items():
     pts=linepoints(k,q['pos'],q['slope'],box);drawseg(ov,pts,col,q['kind']=='estimated',2);objects.append({'id':tag+'-'+k,'type':'line','label':tag+' '+k+' '+q['kind'],'geometry':{'points':[{'x':a,'y':b} for a,b in pts]}})
     if q.get('points'):objects.append({'id':tag+'-'+k+'-support','type':'polyline','label':tag+' '+k+' 像素支持，非人工GT','geometry':{'points':[{'x':a,'y':b} for a,b in q['points']]}})
   texts=['GREEN lid / CYAN pkg; dashed = coherent model estimate','Solid central segments = measured pixel support; no mm claim',finalHint+' : '+('directional overhang evidence retained' if skew else 'model containment / skew inspection only'),f'nominal {nominalMin:.2f}px; plausible family min {('unavailable' if minFamily is None else format(minFamily,'.2f'))}px; tolerance {D["pixelTolerancePx"]}px']
   for j,txt in enumerate(texts):cv2.putText(ov,txt,(15,25+24*j),0,.56,(255,255,255),2)
   cv=plot_candidates(candidates,best);dv=np.full((450,800,3),255,np.uint8)
   for ri,delta in enumerate(D['deltaTrials']):
    for ci,tol in enumerate(D['toleranceTrialsPx']):
     q=next(z for z in sweeps if z['scoreDelta']==delta and z['pixelTolerancePx']==tol);c=(120,200,120) if q['category']=='GOOD' else ((130,130,230) if q['category']=='SKEW' else (190,190,190));x=170+ci*140;y=60+ri*80;cv2.rectangle(dv,(x,y),(x+110,y+55),c,-1);cv2.putText(dv,q['category'],(x+10,y+32),0,.5,(0,0,0),1)
    cv2.putText(dv,'delta '+str(delta),(15,95+ri*80),0,.55,(0,0,0),1)
   for ci,tol in enumerate(D['toleranceTrialsPx']):cv2.putText(dv,str(tol)+' px',(185+ci*140,35),0,.55,(0,0,0),1)
   cv2.putText(dv,'Same input: actual score-family / tolerance trials; not accuracy',(15,420),0,.55,(0,0,0),1)
   save_image('overlay',ov);save_image('model_clearance',cv,section='boundary');save_image('decision_trials',dv,section='parameters');save_json('geometry_data',data);save_layers('geometry',[{'id':'coherent-objects','objects':objects}]);st.set_output('geometry_data',data);st.set_output('boundaryChecks',checks);pr.set_output('geometry_data',data);pr.set_output('overlay','overlay')
result=data
