// Online one-vs-rest confusion counts over explicitly labelled, attempted units.
// Faults and cancellations reduce coverage; they never become normal NG hits.
const ratio=(n,d)=>d>0?n/d:null;
export function createClassificationMetrics(categories){return {labelled:0,matched:0,mismatched:0,faults:0,unlabelled:0,labelledFaults:0,unavailable:0,completedCases:0,coverage:{labelled:0,completed:0,unavailable:0,ratio:null,scope:'Attempted units with human-confirmed expected categories; unattempted pending units are not in this denominator.'},unavailableExpectedByCategory:Object.fromEntries(categories.map(c=>[c.id,0])),perCategory:Object.fromEntries(categories.map(c=>[c.id,{TP:0,FP:0,FN:0,TN:0,expectedPositive:0,completedExpectedPositive:0,unavailableExpected:0,precision:null,recall:null,falsePositiveRate:null,endToEndDetectionRate:null}])),metricsScope:'precision/recall/falsePositiveRate use completed, valid classifications with human-confirmed expected categories only; FAULT/CANCELLED/unavailable classifications are excluded from the confusion matrix. endToEndDetectionRate uses attempted expected-positive units including unavailable outcomes. Neither is independent industrial accuracy or acceptance.'};}
export function updateClassificationMetrics(metrics,record){
 const regression=record.regression;
 if(regression.status==='UNLABELLED'){metrics.unlabelled++;return;}
 const expected=new Set(regression.expected||[]),predicted=new Set(record.result.categoryIds||[]);
 const completed=record.execution.status==='COMPLETED'&&record.result.valid===true&&['MATCH','MISMATCH'].includes(regression.status);
 metrics.labelled++;
 if(regression.status==='MATCH')metrics.matched++;
 if(regression.status==='MISMATCH')metrics.mismatched++;
 if(record.execution.status==='FAULT'){metrics.faults++;metrics.labelledFaults++;}
 if(completed)metrics.completedCases++;else metrics.unavailable++;
 for(const [id,row]of Object.entries(metrics.perCategory)){
  const positive=expected.has(id),detected=predicted.has(id);
  if(positive)row.expectedPositive++;
  if(!completed){if(positive){row.unavailableExpected++;metrics.unavailableExpectedByCategory[id]++;}continue;}
  if(positive)row.completedExpectedPositive++;
  row[positive?(detected?'TP':'FN'):(detected?'FP':'TN')]++;
 }
 // Counts only while running. Ratios are derived once at terminal emission.
 metrics.coverage.labelled=metrics.labelled;metrics.coverage.completed=metrics.completedCases;metrics.coverage.unavailable=metrics.unavailable;
}
export function finalizeClassificationMetrics(metrics){
 metrics.coverage.ratio=ratio(metrics.completedCases,metrics.labelled);
 for(const row of Object.values(metrics.perCategory)){
  row.precision=ratio(row.TP,row.TP+row.FP);
  row.recall=ratio(row.TP,row.TP+row.FN);
  row.falsePositiveRate=ratio(row.FP,row.FP+row.TN);
  row.endToEndDetectionRate=ratio(row.TP,row.completedExpectedPositive+row.unavailableExpected);
 }
 return metrics;
}
