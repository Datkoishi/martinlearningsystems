import fs from 'node:fs/promises';
import path from 'node:path';

export class LocalImportStorage {
  constructor(rootPath) {
    this.rootPath = path.resolve(rootPath);
  }

  resolveJobPath(jobId) {
    if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error('Import job id không hợp lệ.');
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
}
