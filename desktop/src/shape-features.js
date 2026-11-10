// Pixel-derived shape measurements. Coordinates and lengths remain in image pixels.
// A nominal tooth count or expected hole position is used only as a specification.
const TAU = Math.PI * 2;
const SOURCE = { engineering: 'engineering_default', data: 'computed_from_pixels', user: 'user_specification' };
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = xs => xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);
const modulo = (n, d) => (n % d + d) % d;
const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const param = (value, source, description) => ({ value, source, description });
const samples = (points, maximum = 4096) => {
  const stride = Math.max(1, Math.ceil(points.length / maximum));
  return points.filter((_, i) => i % stride === 0).map(p => ({ x: p.x, y: p.y }));
};
function result(status, reason, measurements = {}, evidence = {}, parameters = {}, limitations = []) {
  return { status, reason, measurements, evidence, parameters, limitations: ['Lengths are in px; no physical calibration or acceptance tolerance was supplied.', ...limitations] };
}
function inputProblem(region, contour = false) {
  if (!region || !Number.isInteger(region.width) || !Number.isInteger(region.height) || region.width < 1 || region.height < 1) return 'Invalid raster dimensions.';
  if (!region.mask || region.mask.length !== region.width * region.height) return 'The full-size component mask is required.';
  if (!region.mask.some(v => v !== 0)) return 'The component mask is empty.';
  if (contour && (!Array.isArray(region.outerContour) || region.outerContour.length < 12 || region.outerContour.some(p => !finitePoint(p)))) return 'A real outer boundary with at least 12 finite support points is required.';
  if (!Array.isArray(region.holes) || region.holes.some(h => !Number.isFinite(h.area) || h.area <= 0 || !finitePoint(h.centroid) || !Array.isArray(h.boundary) || h.boundary.some(p => !finitePoint(p)))) return 'Closed holes, positive pixel areas and their boundary support are required.';
  return null;
}
function clipped(region) {
  return region.touchesBorder === true || region.outerContour?.some(p => p.x <= 0 || p.y <= 0 || p.x >= region.width - 1 || p.y >= region.height - 1);
}
function solve3(matrix, vector) {
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let i = col + 1; i < 3; i++) if (Math.abs(a[i][col]) > Math.abs(a[pivot][col])) pivot = i;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    if (Math.abs(a[col][col]) < 1e-10) return null;
    const div = a[col][col];
    for (let j = col; j < 4; j++) a[col][j] /= div;
    for (let i = 0; i < 3; i++) if (i !== col) {
      const factor = a[i][col];
      for (let j = col; j < 4; j++) a[i][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[3]);
}
function leastSquares(rows, values) {
  const m = Array.from({ length: 3 }, () => [0, 0, 0]), v = [0, 0, 0];
  rows.forEach((row, i) => {
    for (let a = 0; a < 3; a++) {
      v[a] += row[a] * values[i];
      for (let b = 0; b < 3; b++) m[a][b] += row[a] * row[b];
    }
  });
  return solve3(m, v);
}

/** Geometric least squares on real boundary support, never a bounding box diameter. */
function fitCircle(boundary) {
  const points = samples(boundary);
  if (points.length < 6) return null;
  const origin = { x: mean(points.map(p => p.x)), y: mean(points.map(p => p.y)) };
  const local = points.map(p => ({ x: p.x - origin.x, y: p.y - origin.y }));
  const initial = leastSquares(local.map(p => [p.x, p.y, 1]), local.map(p => -(p.x * p.x + p.y * p.y)));
  if (!initial) return null;
  let cx = -initial[0] / 2, cy = -initial[1] / 2;
  let radius = Math.sqrt(Math.max(0, cx * cx + cy * cy - initial[2]));
  if (!(radius > 0)) return null;
  let iterations = 0;
  for (; iterations < 30; iterations++) {
    const rows = [], errors = [];
    for (const p of local) {
      const dx = cx - p.x, dy = cy - p.y, r = Math.hypot(dx, dy);
      if (r < 1e-8) continue;
      rows.push([dx / r, dy / r, -1]); errors.push(-(r - radius));
    }
    const delta = leastSquares(rows, errors);
    if (!delta) return null;
    cx += delta[0]; cy += delta[1]; radius += delta[2];
    if (![cx, cy, radius].every(Number.isFinite) || radius <= 0) return null;
    if (Math.hypot(...delta) < 1e-7) break;
  }
  const center = { x: cx + origin.x, y: cy + origin.y };
  const residuals = points.map(p => distance(p, center) - radius);
  const angles = points.map(p => modulo(Math.atan2(p.y - center.y, p.x - center.x), TAU)).sort((a, b) => a - b);
  let largestGap = 0;
  for (let i = 0; i < angles.length; i++) largestGap = Math.max(largestGap, modulo(angles[(i + 1) % angles.length] - angles[i], TAU));
  const rmsResidual = Math.sqrt(mean(residuals.map(r => r * r)));
  return {
    center, radius, diameter: radius * 2, unit: 'px', rmsResidual,
    relativeRmsResidual: rmsResidual / radius,
    maxAbsResidual: Math.max(...residuals.map(Math.abs)),
    radialPeakToValley: Math.max(...residuals) - Math.min(...residuals),
    angularCoverageDeg: (TAU - largestGap) * 180 / Math.PI,
    supportCount: points.length, inputSupportCount: boundary.length, iterations,
    supportPoints: points, residuals: points.map((p, i) => ({ ...p, radialResidual: residuals[i] })),
    method: 'Algebraic initialization followed by geometric radial least squares.'
  };
}
function circleParameters(params) {
  const values = { maxRelativeResidual: params.maxRelativeResidual ?? 0.025, maxResidualPx: params.maxResidualPx ?? 1, minAngularCoverageDeg: params.minAngularCoverageDeg ?? 300 };
  if (!(values.maxRelativeResidual > 0 && values.maxRelativeResidual < 0.5) || !(values.maxResidualPx > 0) || !(values.minAngularCoverageDeg > 0 && values.minAngularCoverageDeg <= 360)) return null;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, param(value, params[key] == null ? SOURCE.engineering : SOURCE.user,
    key === 'maxRelativeResidual' ? 'Maximum radial RMS / fitted radius; a fit quality gate, not a part tolerance.' : key === 'maxResidualPx' ? 'Raster RMS allowance in pixels; a fit quality gate, not a part tolerance.' : 'Required angular support around fitted center.') ]));
}
function circleQuality(circle, parameters) {
  if (!circle) return { accepted: false, reason: 'The boundary does not support a finite circle fit.' };
  const allowance = Math.max(parameters.maxResidualPx.value, circle.radius * parameters.maxRelativeResidual.value);
  const accepted = circle.radius >= 4 && circle.supportCount >= 24 && circle.angularCoverageDeg >= parameters.minAngularCoverageDeg.value && circle.rmsResidual <= allowance && circle.maxAbsResidual <= allowance * 3;
  return { accepted, rmsAllowancePx: allowance, maxAbsAllowancePx: allowance * 3, reason: accepted ? 'Boundary support meets the stated fit quality gates.' : 'Radius, boundary support, angular coverage or radial residual fails a fit quality gate.' };
}

export function analyzeAnnulus(region, params = {}) {
  const problem = inputProblem(region, true);
  if (problem) return result('UNKNOWN', problem);
  const parameters = circleParameters(params);
  if (!parameters) return result('UNKNOWN', 'Invalid circle fit quality parameters.');
  const outer = fitCircle(region.outerContour);
  const holes = region.holes.map(h => ({ id: h.id, circle: fitCircle(h.boundary) }));
  const outerQuality = circleQuality(outer, parameters), inner = holes.length === 1 ? holes[0].circle : null;
  const innerQuality = circleQuality(inner, parameters);
  const measurements = { unit: 'px', closedHoleCount: holes.length, outerCircle: outer, innerCircle: inner };
  if (outer && inner) {
    measurements.centerDistance = distance(outer.center, inner.center);
    measurements.outerDiameter = outer.diameter;
    measurements.innerDiameter = inner.diameter;
    measurements.centerOffset = { x: inner.center.x - outer.center.x, y: inner.center.y - outer.center.y };
  }
  const evidence = { outerContour: samples(region.outerContour), holes, outerQuality, innerQuality };
  const limitations = ['Circle fits use segmented boundary pixels and inherit segmentation error.', 'Radial peak-to-valley and RMS describe this 2D boundary; they are not ISO roundness inspection or a tolerance acceptance decision.'];
  if (clipped(region)) return result('UNKNOWN', 'The component touches the image edge; a complete annulus is not established.', measurements, evidence, parameters, limitations);
  if (holes.length !== 1) return result('UNKNOWN', 'An annulus requires exactly one enclosed hole.', measurements, evidence, parameters, limitations);
  if (!outerQuality.accepted || !innerQuality.accepted) return result('UNKNOWN', 'The outer or inner boundary is not sufficiently circular under the stated fit quality gates.', measurements, evidence, parameters, limitations);
  if (distance(outer.center, inner.center) + inner.radius >= outer.radius) return result('UNKNOWN', 'The fitted inner circle is not fully inside the fitted outer circle.', measurements, evidence, parameters, limitations);
  return result('MEASURED', 'Outer and inner circles were fitted independently to observed boundary pixels.', measurements, evidence, parameters, limitations);
}

function radialProfile(points, center, count) {
  const bins = new Array(count).fill(null), support = new Array(count).fill(null);
  for (const p of points) {
    const angle = modulo(Math.atan2(p.y - center.y, p.x - center.x), TAU);
    const i = Math.floor(angle / TAU * count) % count, r = distance(p, center);
    if (bins[i] === null || r > bins[i]) { bins[i] = r; support[i] = { x: p.x, y: p.y }; }
  }
  const observed = bins.map((r, i) => r === null ? -1 : i).filter(i => i >= 0);
  if (observed.length < 12) return null;
  const radii = [...bins];
  let largestUnobservedRun = 0;
  for (let k = 0; k < observed.length; k++) {
    const a = observed[k], gap = modulo(observed[(k + 1) % observed.length] - a, count);
    largestUnobservedRun = Math.max(largestUnobservedRun, gap - 1);
    for (let j = 1; j < gap; j++) radii[(a + j) % count] = bins[a] + (bins[(a + gap) % count] - bins[a]) * j / gap;
  }
  return { radii, observedRadii: bins, support, observedFraction: observed.length / count, largestUnobservedAngleDeg: largestUnobservedRun / count * 360 };
}
function smoothCircular(values, window) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let value = 0, weight = 0;
    for (let j = -half; j <= half; j++) {
      const w = half + 1 - Math.abs(j);
      value += values[modulo(i + j, values.length)] * w; weight += w;
    }
    return value / weight;
  });
}
const odd = n => Math.max(3, Math.round(n / 2) * 2 + 1);
function spectrum(values, maxFrequency) {
  const n = values.length, baseline = mean(values), out = [];
  for (let frequency = 3; frequency <= maxFrequency; frequency++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      re += (values[i] - baseline) * Math.cos(TAU * frequency * i / n);
      im += (values[i] - baseline) * Math.sin(TAU * frequency * i / n);
    }
    out.push({ frequency, amplitudePx: 2 * Math.hypot(re, im) / n });
  }
  return out.sort((a, b) => b.amplitudePx - a.amplitudePx);
}
function peakCandidates(values, prominence, minimumDistance) {
  const n = values.length, candidates = [];
  for (let i = 0; i < n; i++) {
    if (!(values[i] >= values[modulo(i - 1, n)] && values[i] > values[(i + 1) % n])) continue;
    let left = values[i], right = values[i],leftBaseIndex=i,rightBaseIndex=i;
    // Local prominence looks to each neighboring root, within one estimated pitch.
    const reach = Math.min(Math.floor(n / 3), Math.ceil(minimumDistance * 2));
    for (let d = 1; d <= reach; d++) {
      const at=modulo(i-d,n),radius=values[at];
      if(radius<left){left=radius;leftBaseIndex=at;}
      if (radius > values[i]) break;
    }
    for (let d = 1; d <= reach; d++) {
      const at=(i+d)%n,radius=values[at];
      if(radius<right){right=radius;rightBaseIndex=at;}
      if (radius > values[i]) break;
    }
    const value = values[i] - Math.max(left, right);
    if (value >= prominence) candidates.push({ index: i, radius: values[i], prominencePx: value,
      leftBaseIndex,rightBaseIndex,leftBaseRadiusPx:left,rightBaseRadiusPx:right,
      prominenceReferenceRadiusPx:Math.max(left,right),prominenceReachBins:reach });
  }
  const kept = [];
  for (const candidate of candidates.sort((a, b) => b.prominencePx - a.prominencePx || b.radius - a.radius)) {
    if (kept.every(p => Math.min(modulo(p.index - candidate.index, n), modulo(candidate.index - p.index, n)) >= minimumDistance)) kept.push(candidate);
  }
  return kept.sort((a, b) => a.index - b.index);
}
function supportNear(profile, index) {
  const n = profile.radii.length;
  index = modulo(Math.round(index), n);
  for (let d = 0; d < n / 2; d++) for (const i of [modulo(index - d, n), modulo(index + d, n)]) if (profile.support[i]) return profile.support[i];
  return null;
}
function centeredPeaks(values, prominence, minimumDistance, capDrop) {
  const n = values.length;
  return peakCandidates(values, prominence, minimumDistance).map(peak => {
    // A flat tooth face has two slightly higher radial corners. The midpoint
    // of its connected high-radius cap is a repeatable tooth representative;
    // choosing the largest raster sample alone can jump between the corners.
    const threshold = peak.radius - Math.min(capDrop, peak.prominencePx * 0.5);
    const reach = Math.max(2, Math.floor(minimumDistance * 0.9));
    const span = direction => {
      let d = 1;
      for (; d < reach; d++) if (values[modulo(peak.index + d * direction, n)] < threshold) break;
      const before = values[modulo(peak.index + (d - 1) * direction, n)];
      const after = values[modulo(peak.index + d * direction, n)];
      const fraction = before === after ? 0 : Math.max(0, Math.min(1, (before - threshold) / (before - after)));
      return { length: d - 1 + fraction, truncated: d === reach && after >= threshold };
    };
    const left = span(-1), right = span(1);
    const index = modulo(peak.index + (right.length - left.length) / 2, n), lo = Math.floor(index), fraction = index - lo;
    return { ...peak, maximumIndex: peak.index, maximumRadiusPx: peak.radius, index,
      radius: values[lo] * (1 - fraction) + values[(lo + 1) % n] * fraction,
      capStartIndex: peak.index - left.length, capEndIndex: peak.index + right.length,
      capThresholdRadiusPx: threshold, capTruncated: left.truncated || right.truncated };
  }).sort((a, b) => a.index - b.index);
}
function gearSignal(points, center, count, radius, params) {
  const profile = radialProfile(points, center, count);
  if (!profile) return null;
  const spectralCandidates = spectrum(smoothCircular(profile.radii, 3), Math.min(120, Math.floor(count / 10), Math.floor(radius / 2)));
  const dominant = spectralCandidates[0], pitchSamples = count / (dominant?.frequency || 1);
  const dynamicRange = quantile(profile.radii, 0.95) - quantile(profile.radii, 0.05);
  const window = params.smoothingWindow ?? odd(pitchSamples * 0.12);
  const prominence = params.minProminence ?? Math.max(1.1, dynamicRange * 0.23);
  const minimumDistance = params.minPeakDistance ?? Math.max(3, pitchSamples * 0.48);
  const capDrop = Math.max(1, dynamicRange * 0.08);
  const valid = Number.isInteger(window) && window >= 3 && window <= count / 6 && window % 2 === 1 && prominence > 0 && minimumDistance > 0 && minimumDistance < count / 3;
  const smoothed = valid ? smoothCircular(profile.radii, window) : [];
  const peaks = valid ? centeredPeaks(smoothed, prominence, minimumDistance, capDrop) : [];
  return { profile, spectralCandidates, dominant, dynamicRange, window, prominence, minimumDistance, capDrop, valid, smoothed, peaks };
}

// Diagnostic interventions: one variable changes, the observed center and all
// other signal parameters stay fixed. No trial is silently adopted as optimum.
function gearParameterSweep(signal,center,region,parameters) {
  const {profile,dominant,dynamicRange,capDrop}=signal,count=profile.radii.length;
  const baseline={smoothingWindow:signal.window,minProminence:signal.prominence,minPeakDistance:signal.minimumDistance};
  const maxWindow=Math.floor(count/6)%2?Math.floor(count/6):Math.floor(count/6)-1;
  const values={smoothingWindow:[3,5,7,11,17,25,41,61,101,maxWindow,baseline.smoothingWindow],minProminence:[.03,.1,.25,.5,1,1.5,2,3,5].map(f=>baseline.minProminence*f),minPeakDistance:[1,...[.1,.25,.5,.75,1,1.5,2,3].map(f=>baseline.minPeakDistance*f)]};
  const axes=Object.entries(values).map(([parameterName,rawValues])=>{
    const candidates=[...new Set(rawValues)].filter(v=>Number.isFinite(v)&&v>0&&(parameterName!=='smoothingWindow'||v>=3&&v<=maxWindow&&v%2===1)&&(parameterName!=='minPeakDistance'||v<count/3)).sort((a,b)=>a-b).map(value=>{
      const p={...baseline,[parameterName]:value},curve=smoothCircular(profile.radii,p.smoothingWindow),peaks=centeredPeaks(curve,p.minProminence,p.minPeakDistance,capDrop),gates=[];
      const gate=(id,actual,operator,threshold,passed)=>gates.push({id,actual,operator,threshold,passed:Boolean(passed)});
      const gaps=peaks.map((peak,i)=>modulo(peaks[(i+1)%peaks.length].index-peak.index,count)/count*TAU),pitch=TAU/(dominant?.frequency||1),ordinary=gaps.filter(g=>g>pitch*.5&&g<pitch*1.5),pitchVariation=ordinary.length>1?Math.sqrt(mean(ordinary.map(g=>(g-mean(ordinary))**2)))/mean(ordinary):1;
      const roots=peaks.map((peak,i)=>{const next=peaks[(i+1)%peaks.length],at=modulo(peak.index+modulo(next.index-peak.index,count)/2,count),lo=Math.floor(at),f=at-lo,r=curve[lo]*(1-f)+curve[(lo+1)%count]*f,rp=distance(supportNear(profile,peak.index),center),rq=distance(supportNear(profile,next.index),center);return {ordinary:gaps[i]>pitch*.5&&gaps[i]<pitch*1.5,inward:2*rp*rq/(rp+rq)*Math.cos(gaps[i]/2)-r}}),normalRoots=roots.filter(r=>r.ordinary),supportedRootFraction=normalRoots.filter(r=>r.inward>=parameters.minRootConcavityPx.value).length/Math.max(1,normalRoots.length);
      const fit=peaks.length>=6?fitCircle(peaks.map(p=>supportNear(profile,p.index))):null,height=quantile(curve,.95)-quantile(curve,.05),allowance=Math.max(1,height*.15);
      const local=[{w:p.smoothingWindow,p:p.minProminence,d:p.minPeakDistance},{w:odd(p.smoothingWindow*.75),p:p.minProminence*.8,d:p.minPeakDistance*.9},{w:odd(p.smoothingWindow*1.35),p:p.minProminence*1.2,d:p.minPeakDistance*1.1},{w:p.smoothingWindow,p:p.minProminence*1.2,d:p.minPeakDistance*.9},{w:p.smoothingWindow,p:p.minProminence*.8,d:p.minPeakDistance*1.1}].map(v=>centeredPeaks(smoothCircular(profile.radii,v.w),v.p,v.d,capDrop).length);
      gate('complete_boundary',clipped(region),'==',false,!clipped(region));
      gate('angular_support',profile.largestUnobservedAngleDeg,'<=',parameters.maxUnsupportedAngleDeg.value,profile.largestUnobservedAngleDeg<=parameters.maxUnsupportedAngleDeg.value);
      gate('minimum_peaks',peaks.length,'>=',4,peaks.length>=4);
      gate('radial_signal',dynamicRange,'>=',2.5,dynamicRange>=2.5);
      gate('periodic_amplitude',dominant?.amplitudePx??0,'>=',Math.max(.8,dynamicRange*.12),(dominant?.amplitudePx??0)>=Math.max(.8,dynamicRange*.12));
      gate('local_count_agreement',local.filter(n=>n===peaks.length).length,'==',5,local.every(n=>n===peaks.length));
      if(peaks.length>=6){gate('tip_rms',fit?.rmsResidual??null,'<=',allowance,fit&&fit.rmsResidual<=allowance);gate('tip_max_residual',fit?.maxAbsResidual??null,'<=',allowance*3,fit&&fit.maxAbsResidual<=allowance*3)}
      gate('pitch_variation',pitchVariation,'<=',parameters.maxPitchVariation.value,pitchVariation<=parameters.maxPitchVariation.value);
      gate('ordinary_gap_support',ordinary.length,'>=',peaks.length*.6,ordinary.length>=peaks.length*.6);
      gate('root_support',supportedRootFraction,'>=',parameters.minSupportedRootFraction.value,supportedRootFraction>=parameters.minSupportedRootFraction.value);
      const modulation=dynamicRange/Math.max(1,quantile(profile.radii,.95));gate('radial_modulation',modulation,'<=',parameters.maxRadialModulationRatio.value,modulation<=parameters.maxRadialModulationRatio.value);
      const failed=gates.filter(g=>!g.passed);
      return {value,baseline:value===baseline[parameterName],parameters:p,count:peaks.length,status:failed.length?'REJECTED':'SUPPORTED',gates,reason:failed.map(g=>g.id).join(', ')||'All evaluated fixed-center signal-model gates pass.',localComparisonCounts:local,
        curve:curve.map((radiusPx,index)=>({angleRad:(index+.5)/count*TAU,radiusPx})),peaks:peaks.map((peak,index)=>({...peak,id:`peak-${index+1}`,angleRad:modulo((peak.index+.5)/count*TAU,TAU),point:supportNear(profile,peak.index)}))};
    });
    return {parameterName,fixedParameters:Object.fromEntries(Object.entries(baseline).filter(([key])=>key!==parameterName)),candidates};
  });
  return {schema:'agentcv-gear-sweep-1',center:{...center},fixedCenter:true,baseline,axes,selectionApplied:false,optimizationPerformed:false,scope:'Single-axis diagnostic interventions on the same observed contour and adopted center. Evaluates signal-model gates, not full-pipeline or manufacturing acceptance. Unsampled values and other images are untested.'};
}

export function analyzeGear(region, params = {}) {
  const problem = inputProblem(region, true);
  if (problem) return result('UNKNOWN', problem);
  if (params.expectedTeeth != null && (!Number.isInteger(params.expectedTeeth) || params.expectedTeeth < 3 || params.expectedTeeth > 1000)) return result('UNKNOWN', 'expectedTeeth must be a user-supplied integer from 3 to 1000.');
  const centerFit = fitCircle(region.outerContour);
  if (!centerFit) return result('UNKNOWN', 'Outer boundary does not support a workpiece center estimate.');
  const count = params.sampleCount ?? Math.min(1440, Math.max(360, Math.ceil(TAU * centerFit.radius)));
  if (!Number.isInteger(count) || count < 120 || count > 4096) return result('UNKNOWN', 'sampleCount must be an integer from 120 to 4096.');
  let workpieceCenter = centerFit.center;
  let signal = gearSignal(region.outerContour, workpieceCenter, count, centerFit.radius, params);
  if (!signal) return result('UNKNOWN', 'Insufficient angular boundary support.');
  const centerEstimation = { initialOuterBoundaryCenter: centerFit.center, selectedMethod: 'outer_boundary_geometric_fit', candidates: [] };
  // Missing material can bias the all-boundary center. Independent observed
  // tooth-tip support may refine it, only after residual and coverage checks.
  // Neither the bore center nor expectedTeeth participates in this selection.
  for (let iteration = 0; iteration < 2 && signal.valid && signal.peaks.length >= 6; iteration++) {
    const tipFit = fitCircle(signal.peaks.map(p => supportNear(signal.profile, p.index)));
    const allowance = Math.max(1, signal.dynamicRange * 0.15);
    const shift = tipFit ? distance(workpieceCenter, tipFit.center) : null;
    const accepted = Boolean(tipFit && tipFit.rmsResidual <= allowance && tipFit.maxAbsResidual <= allowance * 3 && tipFit.angularCoverageDeg >= 240 && distance(centerFit.center, tipFit.center) <= centerFit.radius * 0.1 && !signal.peaks.some(p => p.capTruncated));
    centerEstimation.candidates.push({ iteration, center: tipFit?.center ?? null, rmsResidual: tipFit?.rmsResidual ?? null,
      maxAbsResidual: tipFit?.maxAbsResidual ?? null, angularCoverageDeg: tipFit?.angularCoverageDeg ?? null,
      shiftPx: shift, shiftFromInitialPx:tipFit?distance(centerFit.center,tipFit.center):null,maximumShiftFromInitialPx:centerFit.radius*.1,
      capTruncated:signal.peaks.some(p=>p.capTruncated),capTruncatedCount:signal.peaks.filter(p=>p.capTruncated).length,
      rmsAllowancePx: allowance,maxAbsAllowancePx:allowance*3,minimumCoverageDeg:240,accepted,adopted:false,nextProfileValid:null,supportPoints: tipFit?.supportPoints ?? [],circle:tipFit });
    if (!accepted) break;
    const next = gearSignal(region.outerContour, tipFit.center, count, centerFit.radius, params);
    centerEstimation.candidates.at(-1).nextProfileValid=Boolean(next?.valid);
    if (!next?.valid) break;
    centerEstimation.candidates.at(-1).adopted=true;
    workpieceCenter = tipFit.center; signal = next;
    centerEstimation.selectedMethod = 'observed_tip_cap_circle_fit';
    if (shift < 0.01) break;
  }
  const { profile, spectralCandidates, dominant, dynamicRange, window, prominence, minimumDistance, capDrop, smoothed, peaks } = signal;
  const parameters = {
    sampleCount: param(count, params.sampleCount == null ? SOURCE.data : SOURCE.user, 'Angular bins derived from fitted radius, bounded to 360–1440 by default.'),
    workpieceCenter: param(workpieceCenter, SOURCE.data, centerEstimation.selectedMethod === 'observed_tip_cap_circle_fit' ? 'Center refined from actual tooth-cap support after circle residual and angular coverage checks; no nominal or bore center used.' : 'Geometric circle center of real outer boundary; a center estimate for radial analysis.'),
    countAgreementRequired: param(true, SOURCE.engineering, 'All five tested peak parameter settings must return the selected count; this is an observation, not a stability guarantee.'),
    maxPitchVariation: param(0.18, SOURCE.engineering, 'Maximum coefficient of variation of ordinary observed peak gaps.'),
    maxUnsupportedAngleDeg: param(10, SOURCE.engineering, 'Largest unsupported angular sector allowed for an interpretable radial profile.'),
    minRootConcavityPx: param(1.5, SOURCE.engineering, 'A tooth root must lie at least this far inside the chord between adjacent observed tooth caps; convex polygon corners do not establish teeth.'),
    minSupportedRootFraction: param(0.7, SOURCE.engineering, 'Required fraction of ordinary tooth gaps with observed inward roots.'),
    maxRadialModulationRatio: param(0.35, SOURCE.engineering, 'Supported gear model limits radial 5–95% modulation to 35% of tip radius; deeper stars and spokes remain outside this model.'),
    expectedTeeth: param(params.expectedTeeth ?? null, params.expectedTeeth == null ? 'not_supplied' : SOURCE.user, 'Nominal count is used only for missing-tooth comparison, never to select observed peaks.')
  };
  const measurements = { unit: 'px', workpieceCenter, visibleTeeth: null, missingTeeth: null };
  const evidence = {
    outerContour: samples(region.outerContour), centerFit, centerEstimation,
    coordinateConvention: { origin: 'upper_left', x: 'right', y: 'down', angle: 'Radians, clockwise from image +x around the selected workpiece center; sector end angles may exceed 2π at wrap-around.' },
    radialCurve: profile.radii.map((radius, i) => ({ angleRad: (i + 0.5) / count * TAU, radiusPx: radius, observedRadiusPx: profile.observedRadii[i], interpolated: profile.observedRadii[i] === null })),
    angularSupport: { observedFraction: profile.observedFraction, largestUnobservedAngleDeg: profile.largestUnobservedAngleDeg },
    spectralCandidates: spectralCandidates.slice(0, 12), parameterComparisons: [], peaks: [], peakGaps: [], missingSectors: []
  };
  const limitations = ['Visible teeth are prominent radial peaks of the real segmented outer boundary; hidden undercuts and 3D geometry are not measured.', 'Parameter agreement describes only the tested neighborhood on this raster and is not a stability guarantee.', 'Workpiece center is estimated from outer-boundary or observed tooth-cap support; missing material and nonuniform segmentation can bias it.'];
  const finish = (status, reason) => result(status, reason, measurements, evidence, parameters, limitations);
  if (!dominant || dominant.frequency < 4) return finish('UNKNOWN', 'No resolvable gear-like radial repetition was found.');
  if (!signal.valid) return finish('UNKNOWN', 'Invalid peak smoothing, prominence or distance parameters.');
  parameters.smoothingWindow = param(window, params.smoothingWindow == null ? SOURCE.data : SOURCE.user, 'Odd triangular smoothing window, derived from the strongest measured radial repetition.');
  parameters.minProminence = param(prominence, params.minProminence == null ? SOURCE.data : SOURCE.user, 'Minimum peak prominence in pixels; default uses the radial 5–95% range and a raster floor.');
  parameters.minPeakDistance = param(minimumDistance, params.minPeakDistance == null ? SOURCE.data : SOURCE.user, 'Minimum angular-bin separation; default is 0.48 of the measured repetition period.');
  parameters.tipCapDropPx = param(capDrop, SOURCE.data, 'Connected radial cap midpoint represents each tooth; cap drop is 8% of radial range with a 1 px raster floor, capped at half local prominence.');
  const variants = [
    { window, prominence, distance: minimumDistance },
    { window: odd(window * 0.75), prominence: prominence * 0.8, distance: minimumDistance * 0.9 },
    { window: odd(window * 1.35), prominence: prominence * 1.2, distance: minimumDistance * 1.1 },
    { window, prominence: prominence * 1.2, distance: minimumDistance * 0.9 },
    { window, prominence: prominence * 0.8, distance: minimumDistance * 1.1 }
  ];
  for (const v of variants) {
    const curve = smoothCircular(profile.radii, v.window), peaks = centeredPeaks(curve, v.prominence, v.distance, capDrop);
    evidence.parameterComparisons.push({ smoothingWindow: v.window, minProminencePx: v.prominence, minPeakDistanceBins: v.distance, count: peaks.length, peakIndices: peaks.map(p => p.index),baseline:evidence.parameterComparisons.length===0,curve:curve.map((radiusPx,index)=>({angleRad:(index+.5)/count*TAU,radiusPx})) });
  }
  evidence.radialCurve.forEach((point, i) => { point.smoothedRadiusPx = smoothed[i]; });
  if(params.diagnosticSweep!==false)evidence.parameterSweep=gearParameterSweep(signal,workpieceCenter,region,parameters);
  evidence.peaks = peaks.map((p, i) => ({ ...p, id: `peak-${i + 1}`, angleRad: modulo((p.index + 0.5) / count * TAU, TAU), point: supportNear(profile, p.index) }));
  const gaps = peaks.map((p, i) => modulo(peaks[(i + 1) % peaks.length].index - p.index, count) / count * TAU);
  evidence.peakGaps = evidence.peaks.map((p, i) => {
    const next = evidence.peaks[(i + 1) % evidence.peaks.length];
    return { fromPeakId: p.id, toPeakId: next.id, fromPeakIndex: i, toPeakIndex: (i + 1) % evidence.peaks.length,
      fromAngleRad: p.angleRad, toAngleRad: next.angleRad, gapRad: gaps[i], gapDeg: gaps[i] * 180 / Math.PI,
      fromPoint: { ...p.point }, toPoint: { ...next.point }, center: { ...workpieceCenter }, direction: 'clockwise',
      source: 'Positive angular difference between adjacent observed radial tooth-cap peaks; points are original-image boundary support.' };
  });
  const nominalObservedPitch = TAU / dominant.frequency;
  const normalGaps = gaps.filter(g => g < nominalObservedPitch * 1.5 && g > nominalObservedPitch * 0.5);
  const pitchVariation = normalGaps.length > 1 ? Math.sqrt(mean(normalGaps.map(g => (g - mean(normalGaps)) ** 2))) / mean(normalGaps) : 1;
  evidence.periodicity = { dominantFrequency: dominant.frequency, amplitudePx: dominant.amplitudePx, radialRangePx: dynamicRange, normalGapCount: normalGaps.length, pitchVariation };
  measurements.visibleTeeth = peaks.length;
  measurements.pitchVariation = pitchVariation;
  measurements.radialToothHeight = quantile(smoothed, 0.95) - quantile(smoothed, 0.05);
  evidence.toothRootSupport = peaks.map((p, i) => {
    const next = peaks[(i + 1) % peaks.length], gapBins = modulo(next.index - p.index, count);
    const at = modulo(p.index + gapBins / 2, count), lo = Math.floor(at), fraction = at - lo;
    const observedRadiusPx = smoothed[lo] * (1 - fraction) + smoothed[(lo + 1) % count] * fraction;
    const rp = distance(evidence.peaks[i].point, workpieceCenter), rq = distance(evidence.peaks[(i + 1) % peaks.length].point, workpieceCenter);
    const chordRadiusPx = 2 * rp * rq / (rp + rq) * Math.cos(gaps[i] / 2);
    return { fromPeakIndex: i, toPeakIndex: (i + 1) % peaks.length, angleRad: modulo((at + 0.5) / count * TAU, TAU),
      observedRadiusPx, chordRadiusPx, inwardDepthPx: chordRadiusPx - observedRadiusPx,
      ordinaryGap: gaps[i] < nominalObservedPitch * 1.5 && gaps[i] > nominalObservedPitch * 0.5,
      projectionPoint:{x:workpieceCenter.x+observedRadiusPx*Math.cos((at+.5)/count*TAU),y:workpieceCenter.y+observedRadiusPx*Math.sin((at+.5)/count*TAU)},
      nearestSupportPoint:supportNear(profile,at),interpolated:profile.observedRadii[lo]===null||profile.observedRadii[(lo+1)%count]===null,minConcavityPx:parameters.minRootConcavityPx.value,
      gateId:'gear.root_support' };
  });
  const ordinaryRoots = evidence.toothRootSupport.filter(r => r.ordinaryGap);
  evidence.rootModel = { supportedRootFraction: ordinaryRoots.filter(r => r.inwardDepthPx >= parameters.minRootConcavityPx.value).length / Math.max(1, ordinaryRoots.length),
    radialModulationRatio: dynamicRange / Math.max(1, quantile(profile.radii, 0.95)) };
  const holeFits = region.holes.map(h => ({ id: h.id, circle: fitCircle(h.boundary) }));
  evidence.holeCenterCandidates = holeFits;
  const cp = circleParameters({});
  const holeQuality=holeFits.length===1?circleQuality(holeFits[0].circle,cp):null;
  evidence.holeCenterSelection={candidateCount:holeFits.length,candidateId:holeFits.length===1?holeFits[0].id:null,parameters:cp,quality:holeQuality,adopted:holeFits.length===1&&holeQuality.accepted,policy:'Use the sole enclosed-hole circle only after fixed fit-quality gates. Bore center does not choose the workpiece center.'};
  if (holeFits.length === 1 && holeQuality.accepted) {
    measurements.holeCenter = holeFits[0].circle.center;
    measurements.eccentricityPx = distance(workpieceCenter, holeFits[0].circle.center);
    measurements.centerOffset = { x: holeFits[0].circle.center.x - workpieceCenter.x, y: holeFits[0].circle.center.y - workpieceCenter.y };
  }
  if (evidence.peaks.length >= 6) {
    evidence.tipCircleFit = fitCircle(evidence.peaks.map(p => p.point));
    // Count agreement alone can conceal a burr that replaces an ordinary tooth
    // peak. Test actual tip support against a common circle, independently of
    // the nominal tooth count. Missing teeth do not add fabricated tip points.
    const fit = evidence.tipCircleFit;
    const rmsAllowancePx = Math.max(1, measurements.radialToothHeight * 0.15);
    parameters.tipRmsAllowancePx = param(rmsAllowancePx, SOURCE.data, 'Tip-circle RMS quality gate: 15% of measured radial modulation, with a 1 px raster floor; not a manufacturing tolerance.');
    evidence.tipConsistency = { rmsAllowancePx, maxAbsAllowancePx: rmsAllowancePx * 3,
      accepted: Boolean(fit && fit.rmsResidual <= rmsAllowancePx && fit.maxAbsResidual <= rmsAllowancePx * 3) };
  }
  if (clipped(region)) return finish('UNKNOWN', 'The boundary touches the image edge; complete visible-tooth counting is not established.');
  if (profile.largestUnobservedAngleDeg > parameters.maxUnsupportedAngleDeg.value) return finish('UNKNOWN', 'The outer boundary has an unsupported angular sector.');
  if (peaks.length < 4 || dynamicRange < 2.5 || dominant.amplitudePx < Math.max(0.8, dynamicRange * 0.12)) return finish('UNKNOWN', 'Radial modulation is too weak or has too few supported peaks for a tooth count.');
  if (evidence.parameterComparisons.some(v => v.count !== peaks.length)) return finish('UNKNOWN', 'Peak count changes within the tested smoothing and prominence neighborhood.');
  if (evidence.tipConsistency && !evidence.tipConsistency.accepted) return finish('UNKNOWN', 'Observed tooth tips do not support a consistent circular rim; contamination or nonuniform tooth geometry remains unresolved.');
  if (pitchVariation > parameters.maxPitchVariation.value || normalGaps.length < peaks.length * 0.6) return finish('UNKNOWN', 'Peak spacing is too irregular for an interpretable gear tooth count.');
  if (evidence.rootModel.supportedRootFraction < parameters.minSupportedRootFraction.value || evidence.rootModel.radialModulationRatio > parameters.maxRadialModulationRatio.value) return finish('UNKNOWN', 'The observed root concavity or radial tooth depth falls outside the stated gear profile model.');
  if (params.expectedTeeth != null) {
    measurements.missingTeeth = Math.max(0, params.expectedTeeth - peaks.length);
    measurements.excessTeeth = Math.max(0, peaks.length - params.expectedTeeth);
    const expectedPitch = TAU / params.expectedTeeth;
    for (let i = 0; i < peaks.length; i++) {
      const missing = Math.max(0, Math.round(gaps[i] / expectedPitch) - 1);
      if (!missing) continue;
      const start = modulo((peaks[i].index + 0.5) / count * TAU, TAU);
      const expectedAnglesRad = Array.from({ length: missing }, (_, j) => modulo(start + gaps[i] * (j + 1) / (missing + 1), TAU));
      const radiusPx = evidence.tipCircleFit?.radius;
      const expectedMarkers = Number.isFinite(radiusPx) && radiusPx > 0 ? expectedAnglesRad.map(angleRad => ({
        angleRad, point: { x: workpieceCenter.x + radiusPx * Math.cos(angleRad), y: workpieceCenter.y + radiusPx * Math.sin(angleRad) },
        radiusPx, center: { ...workpieceCenter }, radiusSource: 'observed_tooth_cap_circle_fit', measured: false,
        source: 'geometric prediction from the adopted workpiece center, fitted tooth-cap radius and nominal-pitch candidate angle allocated within the observed neighboring-peak gap; not a measured defect center or precise defect region.'
      })) : [];
      evidence.missingSectors.push({ startAngleRad: start, endAngleRad: start + gaps[i], missingCandidates: missing,
        fromPeakId: evidence.peaks[i].id, toPeakId: evidence.peaks[(i + 1) % peaks.length].id,
        expectedAnglesRad, expectedMarkers,
        ...(!expectedMarkers.length ? { expectedMarkerReason: 'No fitted tooth-cap radius is available; no original-image geometric projection was produced.' } : {}),
        source: 'Observed peak gap compared with user-supplied nominal angular pitch.' });
    }
    evidence.expectedCountComparison = { expected: params.expectedTeeth, observed: peaks.length, gapInferredMissing: evidence.missingSectors.reduce((sum, s) => sum + s.missingCandidates, 0) };
    if (measurements.missingTeeth && evidence.expectedCountComparison.gapInferredMissing !== measurements.missingTeeth) return finish('UNKNOWN', 'Observed count differs from the specification, but missing-sector geometry does not explain the difference.');
  }
  return finish('MEASURED', params.expectedTeeth == null ? 'Visible radial tooth peaks were measured; missing-tooth count requires a user-supplied nominal count.' : 'Visible radial tooth peaks were measured and compared with the user-supplied nominal count.');
}

function exteriorMask(region) {
  const provided = region.exteriorBackground;
  if (provided?.mask?.length === region.mask.length && provided.width === region.width && provided.height === region.height) return provided.mask;
  const { width, height, mask } = region, exterior = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  let head = 0, tail = 0;
  const add = i => { if (!mask[i] && !exterior[i]) { exterior[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width, y = Math.floor(i / width);
    if (x > 0) add(i - 1); if (x + 1 < width) add(i + 1);
    if (y > 0) add(i - width); if (y + 1 < height) add(i + width);
  }
  return exterior;
}
function pixelAt(region, x, y, array = region.mask) {
  // Image coordinates address pixel cells [x,x+1), not rounded pixel centers.
  const ix = Math.floor(x), iy = Math.floor(y);
  return ix < 0 || iy < 0 || ix >= region.width || iy >= region.height ? null : array[iy * region.width + ix] !== 0;
}
function expectedSite(region, p, exterior, tolerance) {
  const foreground = pixelAt(region, p.x, p.y), outside = pixelAt(region, p.x, p.y, exterior);
  if (foreground === null) return { status: 'UNKNOWN', reason: 'Expected position lies outside the image.' };
  const radius = p.radius;
  if (radius != null && !(Number.isFinite(radius) && radius > 0)) return { status: 'UNKNOWN', reason: 'Expected hole radius must be positive pixels.' };
  if (foreground) {
    const r = Math.max(1, Math.min(radius == null ? tolerance : radius * 0.5, 30));
    const local = Array.from({ length: 16 }, (_, i) => pixelAt(region, p.x + Math.cos(i / 16 * TAU) * r, p.y + Math.sin(i / 16 * TAU) * r));
    const support = local.filter(Boolean).length / local.length;
    return support >= 0.875 ? { status: 'MISSING', reason: 'Solid foreground occupies the expected hole center and its local interior.', foregroundSupport: support } : { status: 'UNKNOWN', reason: 'The expected position intersects a material edge.', foregroundSupport: support };
  }
  if (!outside) return { status: 'UNKNOWN', reason: 'Enclosed background exists here but no closed-hole centroid matched the specified tolerance.' };
  if (radius == null) return { status: 'UNKNOWN', reason: 'This background is connected to the exterior; an expected radius is needed to distinguish an opening from a point outside the part.' };
  const ring = Array.from({ length: 72 }, (_, i) => ({ x: p.x + Math.cos(i / 72 * TAU) * radius * 1.4, y: p.y + Math.sin(i / 72 * TAU) * radius * 1.4 }));
  const foregroundSupport = ring.filter(q => pixelAt(region, q.x, q.y)).length / ring.length;
  return foregroundSupport >= 0.55 ? { status: 'OPEN_TO_EXTERIOR', reason: 'Expected hole center is in exterior-connected background, with material around most of its expected rim.', foregroundSupport, supportRing: ring } : { status: 'UNKNOWN', reason: 'Exterior-connected background has insufficient surrounding material to establish an open hole.', foregroundSupport, supportRing: ring };
}

export function analyzeHoles(region, params = {}) {
  const problem = inputProblem(region);
  if (problem) return result('UNKNOWN', problem);
  const tolerance = params.positionTolerancePx ?? 3, minArea = params.minHoleArea ?? 0;
  if (!(Number.isFinite(tolerance) && tolerance > 0) || !(Number.isFinite(minArea) && minArea >= 0)) return result('UNKNOWN', 'Hole position tolerance and minimum area must be finite and valid.');
  if (params.expectedPositions != null && (!Array.isArray(params.expectedPositions) || params.expectedPositions.some(p => !finitePoint(p) || p.radius != null && !(Number.isFinite(p.radius) && p.radius > 0)))) return result('UNKNOWN', 'expectedPositions must contain original-image x/y positions and optional positive radius in px.');
  const parameters = {
    positionTolerancePx: param(tolerance, params.positionTolerancePx == null ? SOURCE.engineering : SOURCE.user, 'Maximum centroid distance for matching user-provided positions; no registration is inferred.'),
    minHoleArea: param(minArea, params.minHoleArea == null ? SOURCE.engineering : SOURCE.user, 'Minimum enclosed background area; default includes every segmented hole.'),
    expectedPositions: param(params.expectedPositions ?? null, params.expectedPositions == null ? 'not_supplied' : SOURCE.user, 'Expected image-coordinate positions are user specifications, not detected centers.'),
    connectivity: param(4, SOURCE.engineering, 'Exterior-connected background uses four-neighbor raster connectivity.')
  };
  const holes = region.holes.filter(h => h.area >= minArea).map((h, i) => ({ id: h.id ?? `hole-${i + 1}`, area: h.area, center: { ...h.centroid }, boundary: samples(h.boundary), centerSource: 'Centroid of enclosed background pixels.', circle: fitCircle(h.boundary) }));
  const measurements = { unit: 'px', closedHoleCount: holes.length, holes: holes.map(({ id, area, center, centerSource }) => ({ id, area, center, centerSource })) };
  const evidence = { holes, ignoredHoles: region.holes.filter(h => h.area < minArea).map(h => ({ id: h.id, area: h.area })), expectedPositionComparisons: [] };
  const limitations = ['Hole topology is derived from the segmented mask; threshold changes can open or close narrow connections.', 'Without expected positions, an absent hole or an opening into the exterior has no uniquely observable nominal location.'];
  if (params.expectedPositions) {
    const exterior = exteriorMask(region), used = new Set(), assignments = new Map(), pairs = [];
    params.expectedPositions.forEach((p, i) => holes.forEach((h, j) => {
      const d = distance(p, h.center);
      if (d <= tolerance) pairs.push({ i, j, distance: d });
    }));
    // Global nearest-first, one-to-one matching, with ambiguous candidates exposed below.
    for (const pair of pairs.sort((a, b) => a.distance - b.distance)) if (!assignments.has(pair.i) && !used.has(pair.j)) { assignments.set(pair.i, pair); used.add(pair.j); }
    evidence.expectedPositionComparisons = params.expectedPositions.map((p, i) => {
      const match = assignments.get(i), candidates = pairs.filter(q => q.i === i).map(q => ({ holeId: holes[q.j].id, distancePx: q.distance }));
      if (match) return { expectedId: p.id ?? `expected-${i + 1}`, expected: { ...p }, status: 'CLOSED', holeId: holes[match.j].id, measuredCenter: holes[match.j].center, distancePx: match.distance, candidates };
      return { expectedId: p.id ?? `expected-${i + 1}`, expected: { ...p }, ...expectedSite(region, p, exterior, tolerance), candidates };
    });
    measurements.missingHoleCount = evidence.expectedPositionComparisons.filter(p => p.status === 'MISSING').length;
    measurements.openHoleCount = evidence.expectedPositionComparisons.filter(p => p.status === 'OPEN_TO_EXTERIOR').length;
    measurements.matchedHoleCount = evidence.expectedPositionComparisons.filter(p => p.status === 'CLOSED').length;
    measurements.unmatchedClosedHoleCount = holes.length - used.size;
  }
  if (clipped(region)) return result('UNKNOWN', 'Component reaches the image edge; only the enclosed holes in the observed mask are counted.', measurements, evidence, parameters, limitations);
  if (evidence.expectedPositionComparisons.some(p => p.status === 'UNKNOWN')) return result('UNKNOWN', 'Some expected positions cannot be resolved as a closed, missing or exterior-connected hole.', measurements, evidence, parameters, limitations);
  return result('MEASURED', params.expectedPositions ? 'Enclosed holes were counted and compared with the supplied image-coordinate positions.' : 'Enclosed holes were counted from the component mask; no nominal missing-hole claim is made.', measurements, evidence, parameters, limitations);
}
