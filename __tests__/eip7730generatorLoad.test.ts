import { execFileSync } from 'child_process';
import { join } from 'path';

// Only the version bump runs the generator, so a module plain Node cannot load would surface there.
it('loads the index builder under plain Node, the way the generator does', () => {
  const out = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--no-warnings',
      '--import',
      './scripts/lib/ts-imports.mjs',
      '--input-type=module',
      '-e',
      "const z = await import('./src/utils/eip7730/zip.ts');" +
        "const a = await import('./src/utils/eip7730/attestation.ts');" +
        'console.log(typeof z.processRegistryZip, typeof a.checkAttestation);',
    ],
    { cwd: join(__dirname, '..'), encoding: 'utf8' },
  );
  expect(out.trim()).toBe('function function');
}, 60000);
