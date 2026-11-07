import crypto from 'node:crypto';
import path from 'node:path';
import yauzl from 'yauzl';

const LIMITS = {
  maxEntries: 200,
  maxEntryBytes: 10 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100
};

export class PackageReadError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'PackageReadError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const safeEntryName = (fileName) => {
  if (!fileName || fileName.includes('\0') || fileName.includes('\\')) return false;
  if (path.posix.isAbsolute(fileName) || /^[A-Za-z]:\//.test(fileName)) return false;
  const normalized = path.posix.normalize(fileName);
  return normalized === fileName && !normalized.startsWith('../') && normalized !== '..';
};

const isSymlink = (entry) => {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
};

const openZip = (buffer) => new Promise((resolve, reject) => {
  yauzl.fromBuffer(buffer, {
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true
  }, (error, zipFile) => {
    if (error) reject(new PackageReadError('INVALID_ZIP', 'Tệp tải lên không phải ZIP hợp lệ.'));
    else resolve(zipFile);
  });
});

const openEntryStream = (zipFile, entry) => new Promise((resolve, reject) => {
  zipFile.openReadStream(entry, (error, stream) => {
    if (error) reject(error);
    else resolve(stream);
  });
});

const readStreamBuffer = async (stream, expectedSize) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > LIMITS.maxEntryBytes || size > expectedSize) {
      stream.destroy();
      throw new PackageReadError('ZIP_ENTRY_TOO_LARGE', 'Một tệp trong ZIP vượt giới hạn kích thước.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
};

export const readZipEntries = async (zipBuffer) => {
  if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
    throw new PackageReadError('EMPTY_PACKAGE', 'Gói đề rỗng.');
  }

  const zipFile = await openZip(zipBuffer);
  return new Promise((resolve, reject) => {
    const files = new Map();
    let entryCount = 0;
    let totalBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { zipFile.close(); } catch { /* ZIP từ buffer không cần close. */ }
      reject(error instanceof PackageReadError ? error : new PackageReadError('INVALID_ZIP_ENTRY', 'Không thể đọc an toàn một tệp trong ZIP.'));
    };

    zipFile.on('error', fail);
    zipFile.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(files);
    });
    zipFile.on('entry', (entry) => {
      const processEntry = async () => {
        entryCount += 1;
        if (entryCount > LIMITS.maxEntries) {
          throw new PackageReadError('TOO_MANY_FILES', `ZIP vượt quá ${LIMITS.maxEntries} entries.`);
        }
        if (!safeEntryName(entry.fileName)) {
          throw new PackageReadError('UNSAFE_PATH', `Đường dẫn không an toàn trong ZIP: ${entry.fileName}`);
        }
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
          throw new PackageReadError('ENCRYPTED_ENTRY', `Không chấp nhận tệp mã hóa: ${entry.fileName}`);
        }
        if (isSymlink(entry)) {
          throw new PackageReadError('SYMLINK_ENTRY', `Không chấp nhận symbolic link: ${entry.fileName}`);
        }
        if (entry.fileName.endsWith('/')) return;
        if (files.has(entry.fileName)) {
          throw new PackageReadError('DUPLICATE_PATH', `Đường dẫn bị lặp trong ZIP: ${entry.fileName}`);
        }
        if (entry.uncompressedSize > LIMITS.maxEntryBytes) {
          throw new PackageReadError('ZIP_ENTRY_TOO_LARGE', `Tệp ${entry.fileName} vượt quá 10 MiB.`);
        }
        totalBytes += entry.uncompressedSize;
        if (totalBytes > LIMITS.maxTotalBytes) {
          throw new PackageReadError('ZIP_TOO_LARGE', 'Tổng dữ liệu giải nén vượt quá 50 MiB.');
        }
        if (entry.uncompressedSize > 0 && (
          entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > LIMITS.maxCompressionRatio
        )) {
          throw new PackageReadError('SUSPICIOUS_COMPRESSION', `Tỷ lệ nén bất thường: ${entry.fileName}`);
        }
        const stream = await openEntryStream(zipFile, entry);
        const data = await readStreamBuffer(stream, entry.uncompressedSize);
        files.set(entry.fileName, data);
      };

      processEntry().then(() => zipFile.readEntry()).catch(fail);
    });
    zipFile.readEntry();
  });
};

export const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

export const detectMimeType = (filePath, buffer) => {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.json')) return 'application/json';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  const textStart = buffer.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (lowerPath.endsWith('.svg') && /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(textStart)) return 'image/svg+xml';
  return 'application/octet-stream';
};

export const isSafeSvg = (buffer) => {
  const source = buffer.toString('utf8');
  const forbidden = /<script\b|<foreignObject\b|<!ENTITY\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i;
  return !forbidden.test(source);
};
