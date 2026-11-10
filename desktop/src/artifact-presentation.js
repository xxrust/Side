// Artifact names are stable IDs used by the execution contract.  The UI can
// describe where pixels live without changing that ID or pretending that a
// current-workpiece cache is a durable file.
export function artifactDisplayName(artifact){
 const name=artifact?.name||artifact?.id||'圖像';
 const memory=artifact?.storage==='process-memory'||artifact?.pixelRetention==='current-workpiece-memory';
 if(!memory)return name;
 return `${name.replace(/\.(?:png|jpe?g|webp)$/i,'')}（內存快取）`;
}
