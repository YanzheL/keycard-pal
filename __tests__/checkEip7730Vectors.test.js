const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { strToU8, zipSync } = require('fflate');

const SCRIPT = path.resolve(__dirname, '../scripts/check-eip7730-vectors.js');

function workFolders() {
  return fs
    .readdirSync(os.tmpdir())
    .filter(name => name.startsWith('eip7730-vectors-'));
}

describe('check-eip7730-vectors', () => {
  it('refuses an archive entry that points outside its work folder, and cleans up', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectors-zip-'));
    const zipPath = path.join(dir, 'hostile.zip');
    const escaped = path.resolve(os.tmpdir(), '..', 'x', 'testsv2', 'a.json');
    fs.writeFileSync(
      zipPath,
      zipSync({ 'root/../../../x/testsv2/a.json': strToU8('{}') }),
    );
    const before = workFolders();
    try {
      const run = spawnSync('node', [SCRIPT, '--zip', zipPath], {
        encoding: 'utf8',
      });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toMatch(/points outside the work folder/);
      expect(fs.existsSync(escaped)).toBe(false);
      expect(workFolders()).toEqual(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
