// Vendor the unmodified community ShenOSKernel 43.2 release (Shen-Language/shen-sources,
// tag shen-43.2). The download is authenticated before changing kernel/.
// Preserve port provenance; regenerate KL and full-tree verification manifests.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import config from './config.js';
import { formatGrid } from './utils.js';

const { kernelVersion, kernelPath, klPath } = config;

const archiveSha256 = '23c71508f0de24785e1f127ea4fab440081904d81c463090bc642ee840417f32';
const folderName  = 'ShenOSKernel-43.2';
const archiveName = `${folderName}.tar.gz`;
const archiveUrl  = `https://github.com/Shen-Language/shen-sources/releases/download/shen-43.2/${archiveName}`;
const preserved = ['PROVENANCE.md'];

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
