import cv2,numpy as np,json,pathlib
R=pathlib.Path(__file__).parent
M=json.load(open(R/'development_manifest.json'))['images']
for i in [0,5]:
 m=M[i];im=cv2.imread(str(pathlib.Path('/Users/liangshiben/Desktop')/m['source_relative_path']));g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);g=cv2.GaussianBlur(g,(0,0),1.5)
 c=max(cv2.findContours((g>65).astype('uint8'),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],key=cv2.contourArea);x,y,w,h=cv2.boundingRect(c)
 print(i,[x,y,w,h])
 # values sampled at central axis, tangent median of 21px; every 2px
 for side in ['top','bottom','left','right']:
  if side in ['top','bottom']:
   xx=x+w//2;lo=y-10 if side=='top' else y+h-90;hi=y+90 if side=='top' else y+h+10;p=np.median(g[lo:hi,xx-10:xx+11],axis=1)
  else:
   yy=y+h//2;lo=x-10 if side=='left' else x+w-90;hi=x+90 if side=='left' else x+w+10;p=np.median(g[yy-10:yy+11,lo:hi],axis=0)
  print(side,[(lo+j,round(float(v))) for j,v in enumerate(p) if j%2==0])
