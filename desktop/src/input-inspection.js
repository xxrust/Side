// Observations about the supplied pixels, before choosing preprocessing.
// These are representation facts, not a judgement of segmentation correctness.
export function inspectRgbaInput(rgba,gray=null) {
  if(gray!==null&&(!(gray instanceof Float32Array)||gray.length!==rgba.length/4))throw Error('灰階輸出尺寸不一致');
  const histogram=Array(256).fill(0);let colorPixels=0,nonOpaquePixels=0;
  for(let i=0;i<rgba.length;i+=4){
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2],color=r!==g||r!==b,intensity=r*.299+g*.587+b*.114;
    colorPixels+=Number(color);nonOpaquePixels+=Number(rgba[i+3]!==255);
    histogram[Math.round(intensity)]++;
    // For equal uint8 RGB components, Float32(weighted RGB) is exactly R.
    // Reuse this scan without changing the global achromatic classification.
    if(gray!==null)gray[i/4]=color?intensity:r;
  }
  const levels=histogram.flatMap((count,value)=>count?[value]:[]),achromatic=colorPixels===0;
  return {schema:'agentcv-input-inspection-1',source:'decoded-rgba-pixels',pixelCount:rgba.length/4,colorPixels,nonOpaquePixels,
    achromatic,grayLevels:levels,grayHistogram:histogram,grayLevelCount:levels.length,
    strictBinary:achromatic&&levels.length===2&&levels[0]===0&&levels[1]===255,
    grayConversionNeeded:!achromatic,classification:achromatic?(levels.length===2&&levels[0]===0&&levels[1]===255?'binary':'grayscale'):'color'};
}

export function inspectGrayInput(gray) {
  const histogram=Array(256).fill(0);for(const value of gray)histogram[value]++;
  const levels=histogram.flatMap((count,value)=>count?[value]:[]);
  return {source:'normalized-gray-pixels',pixelCount:gray.length,grayLevels:levels,grayHistogram:histogram,grayLevelCount:levels.length,
    strictBinary:levels.length===2&&levels[0]===0&&levels[1]===255};
}
