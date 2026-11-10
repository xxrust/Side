import json,pathlib,math
R=pathlib.Path(__file__).parent;rows=json.load(open(R/'verified_rows.json'))
notes=[
'綠色lid上/右外沿與左/下暗縫對上人類閉合輪廓；pkg左/下外露帶獨立，pkg上/右虛線是尺寸推估。',
'修正首輪左沿誤認：左側是lid，pkg由右/下外露帶定位，上/左推估。lid下側仍未清楚分離。',
'左側最外亮沿是lid；pkg右/下有分離支持，上/左推估。lid上沿回查實際外緣，未用焊道內峰代替。',
'左/下外露帶支持pkg；右側兩層接近，上側越界明顯；右差值區間跨零。',
'左側光帶接近，lid左側未分離而標推估；下側寬焊道不可直接拆成兩物體。',
'右側x約1015梯度後是灰階肩部，lid右邊1018仍是推估；上側窄間距與圓角多峰使完整包含未知。',
'左側光帶近乎合併，lid左邊推估；下側區間跨零，上/右分離不足證明整圈包含。',
'四側存在候選暗縫，但頂部最小名義間距僅約3.5px；頂/右/下敏感區間跨零。',
'左側凹口與斷裂使兩層左邊缺乏獨立支持；由右側與尺寸補位，保留未知。',
'左/下候選貼到同一外輪廓，僅上/右支持pkg，左/下推估；不能算完整分離。',
'上/右側窄帶候選靠近，間距誤差區間跨零；完整包含未成立。',
'左邊破碎使最外等亮點凹入lid候選內，pkg左側改推估，不能用該凹口認越界。',
'左邊多處凹入，pkg左側由右/下與尺寸推估；左側區間跨零。',
'上沿窄灰階帶緊貼焊道，頂/左區間跨零；下側較清楚仍不足證明完整包含。',
'頂部中央細長光學片與焊道分離但身份未獨立確定；頂/左區間跨零。',
'下側下降後沒有穩定獨立暗縫，lid下邊以梯度外推而畫虛線；下/右區間跨零。']
for rr,n in zip(rows,notes):rr['visualObservation']=n
(R/'visual_review.json').write_text(json.dumps({'author':'agent','humanConfirmed':False,'executionId':'d03dfab1-816d-4185-ad9c-e5b73b467ccd','method':'16張逐張以get_visual_image(reference_json,run_id,artifact_id=overlay)讀真實封存像素；首張與11_15另核對原圖、標註/剖面/圓角曲線。Agent目檢不是獨立人工GT。','items':rows},ensure_ascii=False,indent=2))
data=json.load(open(R/'results/00/geometry_data.json'));box=json.load(open(R/'results/00/search_data.json'))['bbox'];edges=data['selected']
ann={'lid_left':[[213.0184501845019,364.63468634686353],[199.1635916359164,712.2656826568267]],'pkg_left':[[180.27060270602706,401.1611316113163],[186.56826568265686,753.8302583025832]],'lid_bottom':[[316.30012300123,824.3640836408366],[784.8462484624847,836.9594095940962]],'pkg_bottom':[[327.6359163591636,868.4477244772451],[787.3653136531364,865.928659286593]]}
checks=[]
for key,pts in ann.items():
 tag,k=key.split('_');q=edges[tag][k];hz=k=='bottom';mid=box[0]+box[2]/2 if hz else box[1]+box[3]/2
 diff=[q['pos']+q['slope']*((a if hz else b)-mid)-(b if hz else a) for a,b in pts]
 checks.append({'edge':key,'humanGuide':pts,'algorithmMinusGuideAtEndpointsPx':diff,'scope':'freehand guide comparison, NOT independent precision GT'})
q=edges['lid']['top'];ys=[q['pos']+q['slope']*(x-(box[0]+box[2]/2)) for x in [360,715]]
(R/'annotation_check.json').write_text(json.dumps({'source':'frozen human annotations in user turn, excluded from executable detection input','checks':checks,'lidTopAtX360And715':ys},ensure_ascii=False,indent=2));print(checks);print('lid top at x360,715',ys)
