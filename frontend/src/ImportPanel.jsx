import { useState } from 'react';

const StatusPill = ({ status }) => {
  const label = status === 'READY_FOR_REVIEW' ? 'Sẵn sàng duyệt' : status === 'INVALID' ? 'Không hợp lệ' : status;
  return <span className={`import-status ${status === 'READY_FOR_REVIEW' ? 'ready' : 'invalid'}`}>{label}</span>;
};

const IssueList = ({ title, issues, tone }) => {
  if (!issues?.length) return null;
  return (
    <section className={`issue-section ${tone}`}>
      <h3>{title} <span>{issues.length}</span></h3>
      <ol>
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.path}-${index}`}>
            <code>{issue.path}</code>
            <strong>{issue.code}</strong>
            <p>{issue.message}</p>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default function ImportPanel() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: file
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Không thể tải gói đề.');
      setResult(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="import-page" id="top">
      <section className="import-hero">
        <div>
          <p className="eyebrow">Content Editor · Import Lab</p>
          <h1>Kiểm tra gói đề trước khi duyệt</h1>
          <p>
            Tải Exam Package V1 dạng ZIP. Hệ thống giữ nguyên tệp nguồn và kiểm tra checksum,
            MIME, rich content, hình ảnh, nhóm câu, đáp án và quyền sử dụng.
          </p>
        </div>
        <div className="pipeline" aria-label="Quy trình import hiện tại">
          <span className="active">1 · Tải ZIP</span>
          <span>2 · Kiểm tra</span>
          <span>3 · Chờ reviewer</span>
          <span className="disabled">4 · Publish khóa</span>
        </div>
      </section>

      <div className="import-grid">
        <form className="upload-card" onSubmit={submit}>
          <div className="upload-icon" aria-hidden="true">ZIP</div>
          <h2>Chọn Exam Package</h2>
          <p>Tối đa 25 MiB · không nhận file mã hóa, symlink hoặc đường dẫn không an toàn.</p>
          <label className="file-picker">
            <span>{file ? file.name : 'Chọn tệp .zip'}</span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setResult(null);
                setError('');
              }}
            />
          </label>
          {file && <div className="file-meta">{(file.size / 1024).toFixed(1)} KiB · {file.type || 'application/zip'}</div>}
          <button className="primary-button" type="submit" disabled={!file || uploading}>
            {uploading ? 'Đang kiểm tra…' : 'Tải lên và kiểm tra'}
          </button>
          <p className="import-security">Import API mặc định tắt ở production cho đến khi RBAC được triển khai.</p>
        </form>

        <section className="report-card" aria-live="polite">
          {!result && !error && (
            <div className="empty-report">
              <span>01</span>
              <h2>Chưa có báo cáo</h2>
              <p>Kết quả sẽ chỉ mô tả dữ liệu kỹ thuật. Gói hợp lệ vẫn phải qua reviewer học thuật.</p>
            </div>
          )}
          {error && (
            <div className="request-error" role="alert">
              <strong>Không thể xử lý gói đề</strong>
              <p>{error}</p>
            </div>
          )}
          {result && (
            <div className="validation-report">
              <div className="report-heading">
                <div>
                  <p className="eyebrow">Validation report</p>
                  <h2>{result.packageId}</h2>
                </div>
                <StatusPill status={result.status} />
              </div>
              {result.duplicate && <p className="duplicate-note">Gói trùng checksum — trả lại import job đã có, không tạo bản sao.</p>}
              <dl className="report-summary">
                <div><dt>Files</dt><dd>{result.report.summary.files}</dd></div>
                <div><dt>Câu hỏi</dt><dd>{result.report.summary.questions}</dd></div>
                <div><dt>Stimuli</dt><dd>{result.report.summary.stimuli}</dd></div>
                <div><dt>Groups</dt><dd>{result.report.summary.groups}</dd></div>
              </dl>
              <div className="job-id"><span>Import job</span><code>{result.id}</code></div>
              <IssueList title="Lỗi cần sửa" issues={result.report.errors} tone="errors" />
              <IssueList title="Cảnh báo cần xem" issues={result.report.warnings} tone="warnings" />
              {result.status === 'READY_FOR_REVIEW' && !result.report.warnings.length && (
                <div className="clean-report">Đã qua kiểm tra kỹ thuật. Publish vẫn bị khóa cho đến khi reviewer phê duyệt.</div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
