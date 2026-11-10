import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGear, analyzeAnnulus, analyzeHoles } from '../src/shape-features.js';

const TAU = Math.PI * 2;
const angularDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// Independent raster fixtures: draw solid material, flood all background components,
// and take pixel adjacency boundaries. No feature-engine geometry is reused here.
function raster(predicate, width = 420, height = 420) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask[y * width + x] = predicate(x, y) ? 1 : 0;
  const visited = new Uint8Array(mask.length), exterior = new Uint8Array(mask.length), holes = [];
  const adjacent = i => {
    const x = i % width, y = Math.floor(i / width), out = [];
    if (x) out.push(i - 1); if (x + 1 < width) out.push(i + 1);
    if (y) out.push(i - width); if (y + 1 < height) out.push(i + width);
    return out;
  };
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] || visited[start]) continue;
    const pixels = [start]; visited[start] = 1;
    let edge = false, sx = 0, sy = 0;
    for (let head = 0; head < pixels.length; head++) {
      const i = pixels[head], x = i % width, y = Math.floor(i / width);
      sx += x; sy += y;
      edge ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      for (const j of adjacent(i)) if (!mask[j] && !visited[j]) { visited[j] = 1; pixels.push(j); }
    }
    if (edge) pixels.forEach(i => { exterior[i] = 1; });
    else holes.push({ id: `hole-${holes.length + 1}`, area: pixels.length, centroid: { x: sx / pixels.length, y: sy / pixels.length }, boundary: pixels.filter(i => adjacent(i).some(j => mask[j])).map(i => ({ x: i % width, y: Math.floor(i / width) })) });
  }
  const outerContour = [], foreground = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    foreground.push(i);
    if (adjacent(i).some(j => exterior[j])) outerContour.push({ x: i % width, y: Math.floor(i / width) });
  }
  return { width, height, mask, outerContour, holes, exteriorBackground: { mask: exterior, width, height }, centroid: { x: foreground.reduce((s, i) => s + i % width, 0) / foreground.length, y: foreground.reduce((s, i) => s + Math.floor(i / width), 0) / foreground.length } };
}
function gear({ teeth = 12, rotation = 0, missing = [], holeOffset = 0, interference = false, root = 134, tip = 153 } = {}) {
  return raster((x, y) => {
    const dx = x - 210, dy = y - 210, angle = Math.atan2(dy, dx) - rotation;
    const wave = (1 + Math.cos(angle * teeth)) / 2;
    let radius = root + (tip - root) * wave;
    if (missing.some(i => Math.abs(angularDifference(angle, i / teeth * TAU)) < Math.PI / teeth)) radius = root;
    const body = Math.hypot(dx, dy) <= radius;
    const burr = interference && x >= 205 && x <= 222 && y >= 38 && y <= 105;
    return (body || burr) && !inCircle(x, y, 210 + holeOffset, 210, 27);
  });
}
function flatToothGear({ teeth, rotation, missing = [] }) {
  const axes = Array.from({ length: teeth }, (_, i) => ({ i, c: Math.cos(rotation + i / teeth * TAU), s: Math.sin(rotation + i / teeth * TAU) }));
  return raster((x, y) => {
    const dx = x - 210, dy = y - 210;
    const disk = Math.hypot(dx, dy) <= 134;
    // Union of an analytic disk and independent straight-sided trapezoids.
    // This fixture has a flat tooth face rather than the engine's radial model.
    const tooth = axes.some(({ i, c, s }) => {
      if (missing.includes(i)) return false;
      const along = dx * c + dy * s, across = -dx * s + dy * c;
      return along >= 128 && along <= 153 && Math.abs(across) <= 11 - (along - 128) / 25 * 3;
    });
    return (disk || tooth) && !inCircle(x, y, 210, 210, 27);
  });
}
const near = (actual, expected, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);

test('annulus uses independent circles and reports measured center offset, including a concentric control', () => {
  for (const offset of [0, 9, 21]) {
    const region = raster((x, y) => inCircle(x, y, 205, 208, 145) && !inCircle(x, y, 205 + offset, 208, 55));
    const result = analyzeAnnulus(region);
    assert.equal(result.status, 'MEASURED', result.reason);
    near(result.measurements.outerDiameter, 290, 2);
    near(result.measurements.innerDiameter, 110, 2);
    near(result.measurements.centerDistance, offset, 0.25);
    assert.ok(result.evidence.outerQuality.accepted);
    assert.ok(result.measurements.outerCircle.angularCoverageDeg > 355);
    assert.equal(result.parameters.maxRelativeResidual.source, 'engineering_default');
    assert.ok(result.measurements.outerCircle.residuals.length > 500);
    assert.match(result.limitations.join(' '), /not ISO/);
  }
});

test('annulus rejects elliptical boundaries, multiple holes, and clipped parts while retaining measured diagnostics', () => {
  const ellipse = raster((x, y) => ((x - 210) / 150) ** 2 + ((y - 210) / 105) ** 2 <= 1 && !inCircle(x, y, 210, 210, 35));
  const badOuter = analyzeAnnulus(ellipse);
  assert.equal(badOuter.status, 'UNKNOWN');
  assert.equal(badOuter.evidence.outerQuality.accepted, false);
  assert.ok(badOuter.measurements.outerCircle.rmsResidual > 10);
  const ovalHole = raster((x, y) => inCircle(x, y, 210, 210, 150) && !(((x - 210) / 60) ** 2 + ((y - 210) / 24) ** 2 <= 1));
  assert.equal(analyzeAnnulus(ovalHole).status, 'UNKNOWN');
  const multi = raster((x, y) => inCircle(x, y, 210, 210, 150) && !inCircle(x, y, 160, 210, 25) && !inCircle(x, y, 260, 210, 25));
  assert.equal(analyzeAnnulus(multi).status, 'UNKNOWN');
  assert.equal(analyzeAnnulus(multi).measurements.closedHoleCount, 2);
  const clipped = raster((x, y) => inCircle(x, y, 35, 210, 100) && !inCircle(x, y, 35, 210, 25));
  clipped.touchesBorder = true;
  assert.equal(analyzeAnnulus(clipped).status, 'UNKNOWN');
});

test('visible gear counts follow pixels across independent tooth counts and rotations without nominal input', () => {
  for (const teeth of [8, 13, 21]) for (const rotation of [0.13, 0.61]) {
    const result = analyzeGear(gear({ teeth, rotation }));
    assert.equal(result.status, 'MEASURED', JSON.stringify({ teeth, rotation, reason: result.reason, comparisons: result.evidence.parameterComparisons }));
    assert.equal(result.measurements.visibleTeeth, teeth);
    assert.equal(result.measurements.missingTeeth, null);
    assert.equal(result.parameters.expectedTeeth.source, 'not_supplied');
    assert.equal(result.evidence.peaks.length, teeth);
    assert.ok(result.evidence.radialCurve.some(p => p.interpolated));
    assert.ok(result.evidence.peaks.every(p => regionPoint(p.point)));
  }
});

test('parameter comparison retains each already-computed curve and distinguishes the baseline from an optimum claim',()=>{
 const result=analyzeGear(gear({teeth:13,rotation:.37}));
 const comparisons=result.evidence.parameterComparisons,baseline=comparisons.find(c=>c.baseline);
 assert.equal(comparisons.length,5);assert.equal(comparisons.filter(c=>c.baseline).length,1);
 assert.deepEqual(baseline.curve,result.evidence.radialCurve.map(p=>({angleRad:p.angleRad,radiusPx:p.smoothedRadiusPx})));
 for(const candidate of comparisons){assert.equal(candidate.curve.length,result.evidence.radialCurve.length);assert.ok(candidate.curve.every(p=>Number.isFinite(p.angleRad)&&Number.isFinite(p.radiusPx)));assert.equal(candidate.optimal,undefined);}
 assert.ok(comparisons.some(c=>c.curve.some((p,i)=>p.radiusPx!==baseline.curve[i].radiusPx)));
});
function regionPoint(p) { return Number.isFinite(p?.x) && Number.isFinite(p?.y); }

test('missing-tooth inference requires a nominal count and localizes enlarged observed peak gaps', () => {
  const region = gear({ teeth: 16, rotation: 0.24, missing: [2, 8, 9] });
  const observed = analyzeGear(region);
  assert.equal(observed.status, 'MEASURED', JSON.stringify({ reason: observed.reason, periodicity: observed.evidence.periodicity, comparisons: observed.evidence.parameterComparisons }));
  assert.equal(observed.measurements.visibleTeeth, 13);
  assert.equal(observed.measurements.missingTeeth, null);
  const specified = analyzeGear(region, { expectedTeeth: 16 });
  assert.equal(specified.status, 'MEASURED', specified.reason);
  assert.equal(specified.measurements.visibleTeeth, observed.measurements.visibleTeeth);
  assert.equal(specified.measurements.missingTeeth, 3);
  assert.equal(specified.evidence.missingSectors.reduce((sum, s) => sum + s.missingCandidates, 0), 3);
  assert.equal(specified.parameters.expectedTeeth.source, 'user_specification');
  const disagreement = analyzeGear(gear({ teeth: 12 }), { expectedTeeth: 10 });
  assert.equal(disagreement.measurements.visibleTeeth, 12, 'nominal input must not tune peak detection');
  assert.equal(disagreement.measurements.excessTeeth, 2);
});

test('gear center and circular bore center expose measurable eccentricity in pixels', () => {
  const result = analyzeGear(gear({ teeth: 15, rotation: 0.37, holeOffset: 12 }));
  assert.equal(result.status, 'MEASURED', result.reason);
  near(result.measurements.workpieceCenter.x, 210, 0.5);
  near(result.measurements.holeCenter.x, 222, 0.25);
  near(result.measurements.eccentricityPx, 12, 0.6);
  const selection=result.evidence.holeCenterSelection;
  assert.equal(selection.adopted,true);assert.equal(selection.candidateCount,1);assert.equal(selection.quality.accepted,true);
  assert.equal(selection.parameters.maxRelativeResidual.source,'engineering_default');
  const selected=result.evidence.holeCenterCandidates.find(c=>c.id===selection.candidateId);
  assert.deepEqual(selected.circle.center,result.measurements.holeCenter);
  const estimation=result.evidence.centerEstimation,adopted=estimation.candidates.filter(c=>c.adopted);
  if(adopted.length)assert.deepEqual(adopted.at(-1).center,result.measurements.workpieceCenter);
  for(const candidate of estimation.candidates){
   assert.equal(typeof candidate.capTruncated,'boolean');assert.equal(typeof candidate.adopted,'boolean');
   near(candidate.shiftFromInitialPx,Math.hypot(candidate.center.x-estimation.initialOuterBoundaryCenter.x,candidate.center.y-estimation.initialOuterBoundaryCenter.y),1e-12);
   if(candidate.adopted)assert.equal(candidate.nextProfileValid,true);
  }
});

test('flat tooth caps give measured pitch and missing sectors across rotations, missing indices and adjacent losses', () => {
  for (const teeth of [12, 17]) for (const rotation of [0.07, 0.49]) for (const missing of [[0], [Math.floor(teeth / 3)], [3, 4]]) {
    const region = flatToothGear({ teeth, rotation, missing }), result = analyzeGear(region, { expectedTeeth: teeth });
    assert.equal(result.status, 'MEASURED', JSON.stringify({ teeth, rotation, missing, reason: result.reason, periodicity: result.evidence.periodicity }));
    assert.equal(result.measurements.visibleTeeth, teeth - missing.length);
    assert.equal(result.measurements.missingTeeth, missing.length);
    assert.equal(result.evidence.missingSectors.reduce((sum, s) => sum + s.missingCandidates, 0), missing.length);
    assert.ok(result.measurements.pitchVariation < 0.04);
    near(result.measurements.workpieceCenter.x, 210, 0.7);
    near(result.measurements.workpieceCenter.y, 210, 0.7);
    const predicted = result.evidence.missingSectors.flatMap(s => s.expectedAnglesRad);
    for (const i of missing) assert.ok(predicted.some(angle => Math.abs(angularDifference(angle, rotation + i / teeth * TAU)) < 0.05), 'Missing sector must map to the removed trapezoid, including wrap-around.');
    assert.ok(result.evidence.peaks.every(p => p.capEndIndex > p.capStartIndex && p.maximumIndex !== undefined));
    assert.ok(result.evidence.centerEstimation.candidates.every(c => c.accepted === false || c.supportPoints.length >= 6));
  }
});

test('observed angular pitch and predicted missing markers share original-image geometry and remain explicit diagnostics', () => {
  const result = analyzeGear(flatToothGear({ teeth: 17, rotation: 0.49, missing: [3, 4] }), { expectedTeeth: 17 });
  assert.equal(result.status, 'MEASURED', result.reason);
  const { peaks, peakGaps, missingSectors, tipCircleFit } = result.evidence;
  assert.equal(peakGaps.length, result.measurements.visibleTeeth);
  near(peakGaps.reduce((sum, gap) => sum + gap.gapRad, 0), TAU, 1e-10);
  near(peakGaps.reduce((sum, gap) => sum + gap.gapDeg, 0), 360, 1e-10);
  peakGaps.forEach((gap, i) => {
    const from = peaks[i], to = peaks[(i + 1) % peaks.length];
    assert.equal(gap.fromPeakId, from.id); assert.equal(gap.toPeakId, to.id);
    assert.deepEqual(gap.fromPoint, from.point); assert.deepEqual(gap.toPoint, to.point);
    assert.equal(gap.fromAngleRad, from.angleRad); assert.equal(gap.toAngleRad, to.angleRad);
    near(gap.gapRad, (to.angleRad - from.angleRad + TAU) % TAU, 1e-10);
    assert.ok(gap.gapRad > 0); assert.equal(gap.direction, 'clockwise');
  });
  const markers = missingSectors.flatMap(s => s.expectedMarkers);
  assert.equal(markers.length, result.measurements.missingTeeth);
  for (const sector of missingSectors) {
    assert.equal(sector.expectedMarkers.length, sector.expectedAnglesRad.length);
    sector.expectedMarkers.forEach((marker, i) => {
      assert.equal(marker.measured, false);
      assert.match(marker.source, /^geometric prediction from /);
      assert.equal(marker.angleRad, sector.expectedAnglesRad[i]);
      assert.equal(marker.radiusPx, tipCircleFit.radius);
      near(marker.point.x, result.measurements.workpieceCenter.x + marker.radiusPx * Math.cos(marker.angleRad), 1e-10);
      near(marker.point.y, result.measurements.workpieceCenter.y + marker.radiusPx * Math.sin(marker.angleRad), 1e-10);
    });
  }
  const unknown = analyzeGear(gear({ teeth: 12, rotation: 0.13, interference: true }), { expectedTeeth: 12 });
  assert.equal(unknown.status, 'UNKNOWN');
  assert.equal(unknown.evidence.peakGaps.length, unknown.evidence.peaks.length);
  assert.ok(unknown.evidence.peakGaps.every(gap => regionPoint(gap.fromPoint) && regionPoint(gap.toPoint)));
});

test('smooth circles and contaminated gear outlines do not receive an unsupported count', () => {
  const circle = raster((x, y) => inCircle(x, y, 210, 210, 145));
  assert.equal(analyzeGear(circle).status, 'UNKNOWN');
  const contaminated = analyzeGear(gear({ teeth: 12, rotation: 0.13, interference: true }));
  assert.equal(contaminated.status, 'UNKNOWN', JSON.stringify({ reason: contaminated.reason, periodicity: contaminated.evidence.periodicity, comparisons: contaminated.evidence.parameterComparisons }));
  assert.ok(contaminated.evidence.radialCurve.length > 0);
  const overSmoothed = analyzeGear(gear({ teeth: 21 }), { smoothingWindow: 61 });
  assert.equal(overSmoothed.status, 'UNKNOWN', overSmoothed.reason);
});

test('convex corners and deep radial stars do not substitute for a supported gear profile', () => {
  const square = raster((x, y) => Math.abs(x - 210) <= 100 && Math.abs(y - 210) <= 100);
  const hexagon = raster((x, y) => Array.from({ length: 6 }, (_, i) => (x - 210) * Math.cos(i / 6 * TAU) + (y - 210) * Math.sin(i / 6 * TAU)).every(d => d <= 125));
  for (const region of [square, hexagon]) {
    const result = analyzeGear(region);
    assert.equal(result.status, 'UNKNOWN', JSON.stringify({ reason: result.reason, rootModel: result.evidence.rootModel }));
  }
  const deepStar = analyzeGear(gear({ teeth: 10, root: 45, tip: 153 }));
  assert.equal(deepStar.status, 'UNKNOWN', deepStar.reason);
  assert.ok(deepStar.evidence.rootModel.radialModulationRatio > deepStar.parameters.maxRadialModulationRatio.value);
});

test('hole topology distinguishes observed closed holes, solid missing sites, and an exterior-connected opening', () => {
  const positions = [{ id: 'left', x: 125, y: 190, radius: 18 }, { id: 'middle', x: 210, y: 190, radius: 18 }, { id: 'right', x: 295, y: 190, radius: 18 }];
  const region = raster((x, y) => {
    const body = x >= 65 && x <= 355 && y >= 90 && y <= 320;
    const closed = inCircle(x, y, 125, 190, 18);
    const opened = inCircle(x, y, 295, 190, 18) || (x >= 291 && x <= 299 && y >= 90 && y < 190);
    return body && !closed && !opened;
  });
  const result = analyzeHoles(region, { expectedPositions: positions, positionTolerancePx: 2 });
  assert.equal(result.status, 'MEASURED', result.reason);
  assert.equal(result.measurements.closedHoleCount, 1);
  assert.equal(result.measurements.matchedHoleCount, 1);
  assert.equal(result.measurements.missingHoleCount, 1);
  assert.equal(result.measurements.openHoleCount, 1);
  assert.deepEqual(result.evidence.expectedPositionComparisons.map(p => p.status), ['CLOSED', 'MISSING', 'OPEN_TO_EXTERIOR']);
  assert.equal(result.evidence.expectedPositionComparisons[0].holeId, region.holes[0].id);
  const noExternalCache = { ...region, exteriorBackground: undefined };
  assert.deepEqual(analyzeHoles(noExternalCache, { expectedPositions: positions }).evidence.expectedPositionComparisons.map(p => p.status), ['CLOSED', 'MISSING', 'OPEN_TO_EXTERIOR']);
});

test('zero holes is a measured observation and missing-hole claims need supplied positions', () => {
  const solid = raster((x, y) => x >= 80 && x <= 340 && y >= 90 && y <= 320);
  const observed = analyzeHoles(solid);
  assert.equal(observed.status, 'MEASURED');
  assert.equal(observed.measurements.closedHoleCount, 0);
  assert.equal(observed.measurements.missingHoleCount, undefined);
  const expected = analyzeHoles(solid, { expectedPositions: [{ x: 210, y: 210, radius: 20 }] });
  assert.equal(expected.measurements.missingHoleCount, 1);
  const outside = analyzeHoles(solid, { expectedPositions: [{ x: 20, y: 20, radius: 20 }] });
  assert.equal(outside.status, 'UNKNOWN');
  assert.equal(outside.measurements.openHoleCount, 0, 'ordinary exterior background is not an open hole');
});

test('unresolved hole matching, invalid specifications, empty masks and JSON diagnostics are explicit', () => {
  const region = raster((x, y) => inCircle(x, y, 210, 210, 140) && !inCircle(x, y, 210, 210, 30));
  assert.equal(analyzeHoles(region, { expectedPositions: [{ x: 220, y: 210, radius: 30 }], positionTolerancePx: 2 }).status, 'UNKNOWN');
  assert.equal(analyzeGear(region, { expectedTeeth: '12' }).status, 'UNKNOWN');
  assert.equal(analyzeAnnulus(region, { maxRelativeResidual: -1 }).status, 'UNKNOWN');
  assert.equal(analyzeHoles(region, { expectedPositions: [{ x: 210, y: 210, radius: -1 }] }).status, 'UNKNOWN');
  const empty = { width: 10, height: 10, mask: new Uint8Array(100), holes: [], outerContour: [] };
  for (const analyze of [analyzeGear, analyzeAnnulus, analyzeHoles]) {
    assert.equal(analyze(empty).status, 'UNKNOWN');
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(analyze(region))));
  }
});
