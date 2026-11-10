export const DEFAULT_FOREGROUND_PARAMETERS=Object.freeze({thresholdMode:'otsu',threshold:null,sampleMode:'auto',sampleStep:null,polarity:'both'});
export function foregroundParameters(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('前景分析參數格式錯誤');
 for(const key of Object.keys(input))if(!Object.hasOwn(DEFAULT_FOREGROUND_PARAMETERS,key))throw Error('不支援的前景參數：'+key);
 const p={...DEFAULT_FOREGROUND_PARAMETERS,...input};
 if(!['otsu','manual'].includes(p.thresholdMode)||!['auto','manual'].includes(p.sampleMode)||!['both','bright','dark'].includes(p.polarity))throw Error('不支援的前景分析模式');
 if(p.thresholdMode==='manual'&&(!Number.isInteger(p.threshold)||p.threshold<0||p.threshold>255))throw Error('手動閾值必須是 0–255 的整數');
 if(p.sampleMode==='manual'&&(!Number.isInteger(p.sampleStep)||p.sampleStep<1||p.sampleStep>64))throw Error('採樣間隔必須是 1–64 px 的整數');
 return {thresholdMode:p.thresholdMode,threshold:p.thresholdMode==='manual'?p.threshold:null,sampleMode:p.sampleMode,sampleStep:p.sampleMode==='manual'?p.sampleStep:null,polarity:p.polarity};
}
