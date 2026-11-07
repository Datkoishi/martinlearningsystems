import fs from 'node:fs/promises';
import path from 'node:path';
import { readZipEntries } from './package-reader.js';

export class LocalImportStorage {
  constructor(rootPath) {
    this.rootPath = path.resolve(rootPath);
  }

  resolveJobPath(jobId) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(jobId)) throw new Error('Import job id không hợp lệ.');
    const jobPath = path.resolve(this.rootPath, jobId);
    if (!jobPath.startsWith(`${this.rootPath}${path.sep}`)) throw new Error('Import storage path không an toàn.');
    return jobPath;
  }

  async storeOriginal(jobId, buffer) {
    const jobPath = this.resolveJobPath(jobId);
    await fs.mkdir(jobPath, { recursive: true, mode: 0o700 });
    const filePath = path.join(jobPath, 'source.zip');
    await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
    return path.relative(this.rootPath, filePath).split(path.sep).join('/');
  }

  async storeReport(jobId, report) {
    const jobPath = this.resolveJobPath(jobId);
    await fs.mkdir(jobPath, { recursive: true, mode: 0o700 });
    const filePath = path.join(jobPath, 'validation-report.json');
    await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return path.relative(this.rootPath, filePath).split(path.sep).join('/');
  }

  async readOriginal(jobId) {
    const filePath = path.join(this.resolveJobPath(jobId), 'source.zip');
    return fs.readFile(filePath);
  }

  async readArchiveEntry(storageKey) {
    const separator = String(storageKey).indexOf('#');
    if (separator <= 0) throw new Error('Published asset storage key không hợp lệ.');
    const sourceKey = storageKey.slice(0, separator);
    const entryPath = storageKey.slice(separator + 1);
    const match = sourceKey.match(/^([a-f0-9-]{36})\/source\.zip$/);
    if (!match || !entryPath) throw new Error('Published asset storage key không hợp lệ.');
    const files = await readZipEntries(await this.readOriginal(match[1]));
    return files.get(entryPath) || null;
  }
}
