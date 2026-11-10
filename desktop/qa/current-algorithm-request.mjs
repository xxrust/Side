// Shared request binding for actual-runtime QA. The caller reads the real
// get_algorithm_context; this helper adds only the mandatory provenance stamp.
// It never creates evidence/results or relaxes validation in the host.
import {sourceFingerprint} from '../src/purpose-compiler.js';
export function bindCurrentAlgorithmRequest(request,context){
 if(!context?.source||!request?.justification)throw Error('Read the actual algorithm context and author a justification before binding QA request metadata.');
 request.mode??='draft';
 request.source=context.source;
 request.justification={...request.justification,meta:{sourceFingerprint:context.sourceFingerprint||sourceFingerprint(context.source)}};
 return request;
}
