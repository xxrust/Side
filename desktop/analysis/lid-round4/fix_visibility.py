import pathlib,json
R=pathlib.Path(__file__).parent;p=R/'model.py';s=p.read_text();(R/'model_first_regression.py').write_text(s)
a=s.index('    # pkg independent left+bottom');b=s.index('    pp=polygon',a)
s=s[:a]+'''    # Determine independently visible pkg sides from separated exterior bands.
    gaps={k:(lid[k]['pos']-ext[k]['pos'])*(1 if k in ['top','left'] else -1) for k in SIDES}
    visible={k:gaps[k]>parameters['quality']['minIndependentSeparationPx'] for k in SIDES}
    # One horizontal and one vertical exterior constrain pkg pose; retain absent sides as estimates.
    hs=[k for k in ['top','bottom'] if visible[k]];vs=[k for k in ['left','right'] if visible[k]]
    ah=max(hs,key=lambda k:gaps[k]) if hs else 'bottom';av=max(vs,key=lambda k:gaps[k]) if vs else 'left'
    a=(ext[ah]['slope']-ext[av]['slope'])/2;ww=parameters['pkgPrior']['width'];hh=parameters['pkgPrior']['height'];pkg={}
    for k in SIDES:
     if visible[k]:pkg[k]=dict(ext[k],kind='measured',method='separate exposed pkg to background, independently from lid rim',edgeIntervalPx=3.)
    for k in ['top','bottom']:
     if k not in pkg:pkg[k]={'pos':ext[ah]['pos']+(0 if k==ah else (hh if k=='bottom' else -hh)),'slope':a,'kind':'estimated','method':'pkg '+ah+' plus good-image height prior','edgeIntervalPx':11.,'points':[]}
    for k in ['left','right']:
     if k not in pkg:pkg[k]={'pos':ext[av]['pos']+(0 if k==av else (ww if k=='right' else -ww)),'slope':-a,'kind':'estimated','method':'pkg '+av+' plus good-image width prior','edgeIntervalPx':11.,'points':[]}
    # When an exterior is outside the pkg reconstructed from independent exposed bands,
    # it cannot be that pkg edge under the saved dimensional hypothesis. Recheck lid proximity.
    for k in SIDES:
     outside=(ext[k]['pos']-pkg[k]['pos'])*(1 if k in ['top','left'] else -1)
     if hs and vs and outside < -parameters['pkgPrior']['heightTolerance'] and abs(ext[k]['pos']-lid[k]['pos'])<12:
      lid[k]=dict(ext[k],kind='measured',method='outer metal edge; pkg excluded by independent visible sides and size prior',edgeIntervalPx=3.)
''' +s[b:]
s=s.replace("'candidateLines':rows}","'candidateLines':rows,'visiblePkgSides':[k for k in SIDES if visible[k]],'pkgAnchorValid':bool(hs and vs),'pkgAnchors':[ah,av]}")
s=s.replace("independent=all((lid[k]['pos']-pkg[k]['pos'])*(1 if k=='left' else -1)>4 for k in ['left','bottom'])","independent=all(q['pkgAnchorValid'] for q in alltrials)")
s=s.replace("'threshold':'>4px on left and bottom, material assignment reviewed'", "'threshold':'>4px separate pkg band on >=1 horizontal and >=1 vertical side; no shared silhouette counted twice'")
s=s.replace("'actual':{k:abs(lid[k]['pos']-pkg[k]['pos']) for k in ['left','bottom']}","'actual':{'visibleSides':selected['visiblePkgSides'],'anchors':selected['pkgAnchors']}")
s=s.replace('pkg左下邊','pkg可見相鄰邊').replace('pkg左下','pkg獨立外露邊')
p.write_text(s)
sc=json.load(open(R/'scheme.json'));sc['operatorGraph']['nodes'][0]['code']=s
sc['operatorGraph']['nodes'][0]['parameters']['quality']['maxLidExteriorRecheckPx']=12
sc['operatorGraph']['nodes'][0]['justification']['tool']['reason']='分別追蹤lid輪廓與pkg外露帶；pkg至少一橫邊及一豎邊有獨立支持才以良品尺寸推估其他邊。不固定假設左側必然外露，第二、三張以右/下外露帶定位pkg。單側超出只用實測lid邊段加有證據的pkg推估。'
for q in sc['operatorGraph']['nodes'][0]['justification']['parameters']:
 if q['name']=='pkgPrior':q['reason']='11_15外露邊約708x550px；依本件獨立分離的相鄰pkg邊定位，遮擋側由尺寸先驗補出。第一輪固定左/下在第二、三張把lid左沿誤當pkg，已保留失敗；改以本件可見側決定。±8px是開發敏感範圍非校準保證。'
(R/'scheme.json').write_text(json.dumps(sc,ensure_ascii=False,indent=2));(R/'parameters.json').write_text(json.dumps(sc['operatorGraph']['nodes'][0]['parameters'],ensure_ascii=False,indent=2))
