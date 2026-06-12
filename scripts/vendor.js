// Re-vendors the kernel/ tree from the official ShenOSKernel release.
// Preserves the files that are not part of the release archive:
// klambda/compiler.kl (shen-cl build artifact), klambda/PROVENANCE.md
// and klambda/SHA256SUMS. After running, regenerate SHA256SUMS and
// update PROVENANCE.md if the release version changed.

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { execFileSync } = require('child_process');
const { kernelVersion, kernelPath, klPath } = require('./config.js');
const { formatGrid } = require('./utils.js');

const archiveSha256 = '49f1b85d02348d9b3ebc461570c5c56cc066270ab81e35d5257625fb9d17fe82';
const folderName  = `ShenOSKernel-${kernelVersion}`;
const archiveName = `${folderName}.zip`;
const archiveUrl  = `https://github.com/Shen-Language/shen-sources/releases/download/shen-${kernelVersion}/${archiveName}`;
const preserved   = ['compiler.kl', 'PROVENANCE.md', 'SHA256SUMS'];

const vendor = async () => {
  const response = await fetch(archiveUrl);

  if (!response.ok) {
    throw new Error(`Failed to download ${archiveUrl}: ${response.status}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const actualSha = crypto.createHash('sha256').update(data).digest('hex');

  if (actualSha !== archiveSha256) {
    throw new Error(`Archive SHA-256 mismatch:\n  expected ${archiveSha256}\n  actual   ${actualSha}`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shen-vendor-'));
  const archivePath = path.join(workDir, archiveName);
  fs.writeFileSync(archivePath, data);
  execFileSync('unzip', ['-q', archivePath, '-d', workDir]);

  for (const file of preserved) {
    fs.copyFileSync(`${klPath}/${file}`, path.join(workDir, folderName, 'klambda', file));
  }

  fs.rmSync(kernelPath, { recursive: true, force: true });
  fs.renameSync(path.join(workDir, folderName), kernelPath);
  fs.rmSync(workDir, { recursive: true, force: true });
  return formatGrid([`Shen ${kernelVersion}`, `${data.length} bytes`, `sha256 verified`]);
};

vendor().then(console.log, e => {
  console.error(e);
  process.exit(1);
});
