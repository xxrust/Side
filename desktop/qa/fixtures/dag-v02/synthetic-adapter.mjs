// Deterministic executor contract fixture. Does not inspect pixels or certify a part.
const run=async()=>({status:'succeeded',metrics:{confidence:.8},evidence:'synthetic-fixture',conformance:'unknown'});
export default {Locate:run,Offset:run,Defect:run};
