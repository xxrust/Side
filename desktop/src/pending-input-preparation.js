import {validImageAssetRef} from './dataset-image-store.js';
const leases=new WeakMap();
const identity=record=>JSON.stringify([record.id,record.width,record.height,record.sha256,record.contentSha256,record.dataURL,record.assetRef]);
// A scoped capability permits request construction from prior verified metadata,
// never pixel access or result adoption. Native archival needs a separate ack.
export function beginPendingInputPreparation(project,ids){
 const records=ids.map(id=>project.imageRecord(id));
 if(!records.length||records.some(r=>!r||r.dataURL||!validImageAssetRef(r.assetRef)||!Number.isSafeInteger(r.width)||!Number.isSafeInteger(r.height)||r.width<=0||r.height<=0||r.width*r.height>64_000_000||!/^[a-f0-9]{64}$/.test(r.sha256||'')||r.contentSha256&&r.contentSha256!==r.assetRef.sha256))return null;
 const token=Object.freeze({}),saved={project,data:project.data,epoch:project.epoch,records:new Map(records.map(r=>[r.id,{record:r,key:identity(r)}]))};leases.set(token,saved);
 return {token,release:()=>leases.delete(token)};
}
export function pendingInputAllows(project,token,record){
 const lease=token&&leases.get(token),saved=lease?.records.get(record.id);
 return !!saved&&lease.project===project&&lease.data===project.data&&lease.epoch===project.epoch&&saved.record===record&&saved.key===identity(record);
}
