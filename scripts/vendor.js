// Vendor the unmodified PR117 kernel build, then the pinned upstream benchmark
// additions at 9693dc6. Both downloads are authenticated before changing kernel/.
// Preserve port provenance; regenerate KL and full-tree verification manifests.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import config from './config.js';
import { formatGrid } from './utils.js';

const { kernelVersion, kernelPath, klPath } = config;

const archiveSha256 = '060066a8f84d9a2f7d41cb3b37b986a8d4653279752b739b5063cd648d9baacd';
const folderName  = 'ShenOSKernel-43.1-ec16a9f';
const archiveName = `${folderName}.tar.gz`;
const archiveUrl  = `https://github.com/pyrex41/shen-sources/releases/download/upstream-ec16a9f/${archiveName}`;
const preserved = ['PROVENANCE.md'];
// Upstream's only post-117 commit updates these benchmark/coverage files.
const sourceCommit = '9693dc68b7e1c9c32a91be9233530e8de521172e';
const sourceSha256 = 'f2c2e608559fc4ee8f3195dabc830aba8db7a5227e4cbce02a346aec607e6d7f';
const sourceFiles = [
  'CHANGELOG.md', 'benchmarks/arithmetic.shen', 'benchmarks/benchmarks.shen',
  'benchmarks/control-flow.shen', 'benchmarks/data.shen', 'benchmarks/equality-check.shen',
  'benchmarks/pattern-matching.shen', 'doc/benchmarks.md', 'tests/benchmark-coverage.shen'
];

const vendor = async () => {
  const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(90000) });

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

  const sourceResponse = await fetch(`https://codeload.github.com/Shen-Language/shen-sources/tar.gz/${sourceCommit}`, { signal: AbortSignal.timeout(90000) });
  if (!sourceResponse.ok) {
    throw new Error(`Source archive download failed: ${sourceResponse.status}`);
  }
  const sourceData = Buffer.from(await sourceResponse.arrayBuffer());
  if (crypto.createHash('sha256').update(sourceData).digest('hex') !== sourceSha256) {
    throw new Error('Source archive SHA-256 mismatch');
  }
  const sourceArchive = path.join(workDir, 'source.tar.gz');
  fs.writeFileSync(sourceArchive, sourceData);
  execFileSync('tar', ['-xzf', sourceArchive, '-C', workDir]);
  for (const file of sourceFiles) {
    fs.copyFileSync(path.join(workDir, `shen-sources-${sourceCommit}`, file), path.join(workDir, folderName, file));
  }

  for (const file of preserved) {
    fs.copyFileSync(`${klPath}/${file}`, path.join(workDir, folderName, 'klambda', file));
  }

  fs.rmSync(kernelPath, { recursive: true, force: true });
  fs.renameSync(path.join(workDir, folderName), kernelPath);
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const klFiles = fs.readdirSync(klPath).filter(f => f.endsWith('.kl')).sort();
  fs.writeFileSync(`${klPath}/SHA256SUMS`, klFiles.map(f => `${hash(`${klPath}/${f}`)}  ${f}\n`).join(''));
  const filesIn = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? filesIn(path.join(directory, entry.name), relative) : [relative];
  });
  const files = filesIn(kernelPath).filter(f => f !== 'SHA256SUMS').sort();
  fs.writeFileSync(`${kernelPath}/SHA256SUMS`, files.map(f => `${hash(path.join(kernelPath, f))}  ${f}\n`).join(''));
  fs.rmSync(workDir, { recursive: true, force: true });
  return formatGrid([`Shen ${kernelVersion}`, `${data.length} bytes`, `sha256 verified`]);
};

vendor().then(console.log, e => {
  console.error(e);
  process.exit(1);
});
