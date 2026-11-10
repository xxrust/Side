import json, time
WHY = json.loads(WHY_JSON)
def calculate(step):
    ref = cv2.cvtColor(references['template'], cv2.COLOR_BGR2GRAY)
    query = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    rows, summary = [], []
    for method in ['SIFT', 'ORB']:
        start = time.perf_counter()
        cv2.setRNGSeed(parameters['seed'])
        detector = cv2.SIFT_create(nfeatures=parameters['feature_limit']) if method == 'SIFT' else cv2.ORB_create(nfeatures=parameters['feature_limit'])
        ka, da = detector.detectAndCompute(ref, None)
        kb, db = detector.detectAndCompute(query, None)
        pairs = cv2.BFMatcher(cv2.NORM_L2 if method == 'SIFT' else cv2.NORM_HAMMING).knnMatch(da, db, k=2) if da is not None and db is not None and len(db)>1 else []
        for ratio in parameters['ratio_candidates']:
            good = [v[0] for v in pairs if len(v)==2 and v[0].distance < ratio*v[1].distance]
            rows.append({'method':method, 'ratio':ratio, 'pairs':[{'reference':list(map(float,ka[m.queryIdx].pt)),'scene':list(map(float,kb[m.trainIdx].pt))} for m in good]})
            summary.append({'method':method,'ratio':ratio,'matches':len(good),'referenceFeatures':len(ka),'sceneFeatures':len(kb),'elapsedMs':(time.perf_counter()-start)*1000})
    graph=np.full((460,940,3),25,np.uint8)
    cv2.putText(graph,'ACTUAL candidate pairs: geometry is NOT yet verified',(20,35),cv2.FONT_HERSHEY_SIMPLEX,.65,(235,235,235),1,cv2.LINE_AA)
    maximum=max([r['matches'] for r in summary]+[1])
    for i,row in enumerate(summary):
        y=80+i*43; width=int(540*row['matches']/maximum)
        cv2.putText(graph,row['method']+' ratio '+str(row['ratio']),(20,y),cv2.FONT_HERSHEY_SIMPLEX,.5,(225,225,225),1,cv2.LINE_AA)
        cv2.rectangle(graph,(250,y-16),(250+width,y+4),(120,210,160),-1)
        cv2.putText(graph,str(row['matches']),(265+width,y),cv2.FONT_HERSHEY_SIMPLEX,.5,(235,235,235),1,cv2.LINE_AA)
    value={'candidates':rows,'summary':summary,'referenceImageId':reference_records['template']['id'],'sceneImageId':image_records[0]['id']}
    save_json('correspondences',value,section='tool')
    save_image('feature-comparison',graph,section='parameters')
    return found(value)
r=invoke('candidate-correspondences',calculate,name='Compare real SIFT / ORB descriptor candidates',parameters=parameters,justification=WHY)
result={'valid':r.valid,'candidateCount':len(r.value['candidates'])}
