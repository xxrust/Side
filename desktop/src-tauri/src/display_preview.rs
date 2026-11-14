//! Optional display-only derivative. Original BMP bytes and artifact dimensions stay authoritative.
fn u32_at(bytes:&[u8],at:usize)->usize{u32::from_le_bytes(bytes[at..at+4].try_into().unwrap()) as usize}
fn axis(source:usize,target:usize)->Vec<(usize,usize,u32)>{
 (0..target).map(|i|{let x=((i as f64+0.5)*source as f64/target as f64-0.5).clamp(0.,(source-1) as f64);let lo=x.floor() as usize;(lo,(lo+1).min(source-1),((x-lo as f64)*256.).round() as u32)}).collect()
}
pub fn resize(bytes:&[u8],limit:usize)->Result<Option<(Vec<u8>,usize,usize)>,String>{
 let invalid=||"顯示預覽 BMP 格式無效".to_string();
 if !(1..=4096).contains(&limit)||bytes.len()<54||bytes.len()>24*1024*1024||&bytes[..2]!=b"BM"||u32_at(bytes,2)!=bytes.len()||u32_at(bytes,14)!=40||bytes[26..28]!=1u16.to_le_bytes()||u32_at(bytes,30)!=0{return Err(invalid());}
 let width=u32_at(bytes,18);let height=u32_at(bytes,22);let bits=u16::from_le_bytes(bytes[28..30].try_into().unwrap());
 if width==0||height==0||width>65536||height>65536||!matches!(bits,8|24){return Err(invalid());}
 let channels=usize::from(bits/8);let offset=54+if channels==1{1024}else{0};let stride=(width*channels+3)&!3;
 if u32_at(bytes,10)!=offset||offset+stride*height!=bytes.len(){return Err(invalid());}
 if channels==1&&(0..256).any(|i|bytes[54+4*i..54+4*i+3]!=[i as u8;3]){return Err(invalid());}
 if width.max(height)<=limit{return Ok(None);}
 let scale=limit as f64/width.max(height) as f64;let w=((width as f64*scale).round() as usize).max(1);let h=((height as f64*scale).round() as usize).max(1);
 let out_stride=(w*channels+3)&!3;let size=offset+out_stride*h;let mut out=vec![0;size];out[..offset].copy_from_slice(&bytes[..offset]);
 for (at,value) in [(2,size),(18,w),(22,h),(34,out_stride*h)]{out[at..at+4].copy_from_slice(&(value as u32).to_le_bytes());}
 let xs=axis(width,w);let ys=axis(height,h);
 for (y,&(y0,y1,wy)) in ys.iter().enumerate(){for (x,&(x0,x1,wx)) in xs.iter().enumerate(){for c in 0..channels{
  let sample=|sx,sy|bytes[offset+(height-1-sy)*stride+sx*channels+c] as u32;
  let a=sample(x0,y0)*(256-wx)+sample(x1,y0)*wx;let b=sample(x0,y1)*(256-wx)+sample(x1,y1)*wx;
  out[offset+(h-1-y)*out_stride+x*channels+c]=((a*(256-wy)+b*wy+32768)>>16) as u8;
 }}}
 Ok(Some((out,w,h)))
}
#[cfg(test)]
mod tests{
 use super::*;
 fn bmp(w:usize,h:usize,c:usize)->Vec<u8>{let offset=54+if c==1{1024}else{0};let size=offset+((w*c+3)&!3)*h;let mut b=vec![0;size];b[..2].copy_from_slice(b"BM");for(at,v)in[(2,size),(10,offset),(14,40),(18,w),(22,h)]{b[at..at+4].copy_from_slice(&(v as u32).to_le_bytes());}b[26]=1;b[28]=(c*8) as u8;if c==1{for i in 0..256{b[54+4*i..54+4*i+3].fill(i as u8);}}b}
 #[test]fn color_center_and_original_immutable(){let mut b=bmp(2,2,3);b[54..60].copy_from_slice(&[0,20,40,100,120,140]);b[62..68].copy_from_slice(&[100,120,140,200,220,240]);let before=b.clone();let(p,w,h)=resize(&b,1).unwrap().unwrap();assert_eq!((w,h),(1,1));assert_eq!(&p[54..57],&[100,120,140]);assert_eq!(b,before);assert_eq!(u32_at(&p,2),p.len());}
 #[test]fn gray_palette_padding_and_aspect(){let mut b=bmp(5,3,1);b[1078..].fill(72);let(p,w,h)=resize(&b,3).unwrap().unwrap();assert_eq!((w,h),(3,2));assert_eq!(&p[54..1078],&b[54..1078]);for row in p[1078..].chunks(4){assert_eq!(row,&[72,72,72,0]);}assert!(resize(&b,5).unwrap().is_none());}
 #[test]fn malformed_and_unbounded_inputs_rejected(){let b=bmp(2,2,3);for end in 0..b.len(){assert!(resize(&b[..end],1).is_err());}for at in [10,14,18,22,26,28,30]{let mut bad=b.clone();bad[at..at+4].fill(255);assert!(resize(&bad,1).is_err(),"offset {at}");}assert!(resize(&b,0).is_err());assert!(resize(&b,4097).is_err());let mut gray=bmp(2,2,1);gray[54]=1;assert!(resize(&gray,1).is_err());}
}
