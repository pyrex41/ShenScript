// Re-vendors the kernel/ tree from the community ShenOSKernel GitHub release
// (Shen-Language/shen-sources), the lineage ShenScript tracks since 42.2.
// Downloads ShenOSKernel-<v>.tar.gz, checks its SHA-256 (the checksum pinned in
// shen-scheme 0.50's Makefile for 42.2), and replaces kernel/ with the archive
// contents byte-for-byte, preserving only klambda/PROVENANCE.md and
// klambda/SHA256SUMS. After running, regenerate SHA256SUMS
// (cd kernel/klambda && sha256sum *.kl > SHA256SUMS) and update PROVENANCE.md
// if the release version changed. See kernel/klambda/PROVENANCE.md.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import config from './config.js';
import { formatGrid } from './utils.js';

const { kernelVersion, kernelPath, klPath } = config;

const archiveSha256 = '1d02273003654d34ec020ae67cb214ecec410dee3350419ff807d82b652678d8';
const folderName  = `ShenOSKernel-${kernelVersion}`;
const archiveName = `${folderName}.tar.gz`;
const archiveUrl  = `https://github.com/Shen-Language/shen-sources/releases/download/shen-${kernelVersion}/${archiveName}`;
const preserved   = ['PROVENANCE.md', 'SHA256SUMS'];

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
  execFileSync('tar', ['-xzf', archivePath, '-C', workDir]);

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
