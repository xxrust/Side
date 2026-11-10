import fs from 'node:fs/promises';
import path from 'node:path';

// Keep the previous bundle only while the verified replacement is installed.
// A failed rollback deliberately leaves its directory intact for recovery.
export async function installLocalBundle(prepared, destination) {
  const rollback = await fs.mkdtemp(path.join(path.dirname(destination), '.AgentCV-rollback-'));
  const previous = path.join(rollback, 'previous');
  let hadPrevious = false;
  try {
    await fs.rename(destination, previous);
    hadPrevious = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await fs.rm(rollback, {recursive: true, force: true});
      throw error;
    }
  }
  try {
    await fs.rename(prepared, destination);
  } catch (error) {
    if (hadPrevious) await fs.rename(previous, destination);
    await fs.rm(rollback, {recursive: true, force: true});
    throw error;
  }
  await fs.rm(rollback, {recursive: true, force: true});
}
