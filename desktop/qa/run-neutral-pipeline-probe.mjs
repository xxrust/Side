import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createPipelinePlan, runPipeline } from '../src/pipeline-runtime.js';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('../../qa/node_modules/@napi-rs/canvas');
const here = path.dirname(fileURLToPath(import.meta.url));
const packet = path.resolve(process.argv[2] || path.join(here, '../../reviews/2026-10-25-blind-operation/operator-packets/T01'));
const output = path.resolve(process.argv[3] || path.join(here, 'pipeline-neutral-probe.json'));
const task = JSON.parse(await fs.readFile(path.join(packet, 'task.json'), 'utf8'));
const expectedTeeth = task.normalSpecification?.nominalTeeth;
if (!Number.isInteger(expectedTeeth)) throw Error('This gear replay requires a nominal tooth count explicitly supplied in the neutral task.');
if (!Array.isArray(task.inputs) || !task.inputs.length) throw Error('The neutral task has no input list.');
const plan = createPipelinePlan({ task: 'gear', parameters: { expectedTeeth }, rules: [] });
const results = [], summaries = [];
for (const input of task.inputs) {
  const sourcePath = path.resolve(packet, input.file), relative = path.relative(packet, sourcePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Input must remain inside its neutral packet.');
  const bytes = await fs.readFile(sourcePath), image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, image.width, image.height).data;
  const result = await runPipeline({ width: image.width, height: image.height, rgba, sha256: createHash('sha256').update(bytes).digest('hex') }, plan,
    { inputIdentity: { imageId: input.file, imageName: input.file } });
  const feature = result.nodes.find(node => node.id === 'features');
  const evidence = result.artifacts.find(artifact => artifact.id === 'features:feature-evidence')?.data;
  summaries.push({
    filename: input.file, width: image.width, height: image.height, status: result.status,
    featureStatus: feature?.outputSummary.featureStatus ?? null, reason: feature?.outputSummary.reason ?? feature?.error?.message ?? null,
    visibleTeeth: result.measurements.visibleTeeth ?? null, missingTeeth: result.measurements.missingTeeth ?? null,
    eccentricityPx: result.measurements.eccentricityPx ?? null, workpieceCenter: result.measurements.workpieceCenter ?? null,
    holeCenter: result.measurements.holeCenter ?? null, peakCount: evidence?.peaks.length ?? null,
    parameterCounts: evidence?.parameterComparisons.map(comparison => comparison.count) ?? [],
    centerMethod: evidence?.centerEstimation.selectedMethod ?? null, pitchVariation: evidence?.periodicity?.pitchVariation ?? null,
    missingSectors: evidence?.missingSectors ?? [], rootModel: evidence?.rootModel ?? null,
    classification: result.classification, durationMs: result.durationMs
  });
  results.push(result);
}
const report = {
  source: `${task.caseId} operator packet task and unlabelled neutral images only; nominal tooth count comes from its supplied specification. No evaluator answers or labels are used.`,
  accessNote: 'During implementation review, one broad path search incidentally emitted evaluator filenames and repeated task text. No evaluator answer keys, expected labels or scores were opened or used. This replay reads only the neutral packet listed above.',
  evidenceScope: 'Replay of the built-in pixel pipeline. This file alone does not demonstrate desktop UI operation, independent accuracy or acceptance.',
  generatedAt: new Date().toISOString(), packet, plan, summaries, results
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, summaries }, null, 2));
