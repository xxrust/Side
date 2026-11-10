// Transient previews belong to an image and target, never to the active tab.
// They are intentionally outside serialized project data and are not adoption.
export class ForegroundCandidateCache{
 constructor(){this.epoch=null;this.entries=new Map()}
 syncEpoch(epoch){if(this.epoch===epoch)return false;this.epoch=epoch;this.entries.clear();return true}
 key(binding){return JSON.stringify([binding.epoch,binding.imageId,binding.inputSha256,binding.width,binding.height,binding.targetId,binding.parameters])}
 get(binding){if(!binding||binding.epoch!==this.epoch)return null;const entry=this.entries.get(this.key(binding));return entry&&entry.binding.raster===binding.raster?entry:null}
 put(binding,preview){this.syncEpoch(binding.epoch);const entry={...preview,binding};this.entries.set(this.key(binding),entry);return entry}
}
