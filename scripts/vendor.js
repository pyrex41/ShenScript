// Re-vendors the kernel/ tree from the community ShenOSKernel GitHub release.
//
// NOTE: this script tracks the community ShenOSKernel release lineage.
// vendored kernel lineage. The refreshed kernel comes from Mark Tarver's
// re-upload (canonical mirror pyrex41/shen-s41.1, tag s41.2-pristine-20260711;
// upstream https://www.shenlanguage.org/Download/S41.2.zip), which expands to a
// DIFFERENT tree layout (KLambda/, Sources/, Lib/, Primitives/, Test Programs/)
// than the community ShenOSKernel-<v>.zip this script downloads, and drops
// compiler.kl/dict.kl/init.kl while adding backend.kl. It is kept for the
// community lineage; to refresh the S-lineage kernel, copy KLambda/*.kl from the
// mirror tag by hand, then regenerate SHA256SUMS and update PROVENANCE.md. See
// kernel/klambda/PROVENANCE.md.
//
// Preserves the files that are not part of the community release archive:
// klambda/compiler.kl (shen-cl build artifact), klambda/PROVENANCE.md
// and klambda/SHA256SUMS. After running, regenerate SHA256SUMS and
// update PROVENANCE.md if the release version changed.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import config from './config.js';
import { formatGrid } from './utils.js';

const { kernelVersion, kernelPath, klPath } = config;

const archiveSha256 = '32e86f58a1f6bbc111712a777a04a592c474e5cd05c2db7be0125f25ba8f8e35';
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
