import { useState } from 'react';
import ReviewerPreview from './ReviewerPreview.jsx';
import AuthPanel from './AuthPanel.jsx';
import { csrfHeaders, hasRole } from './auth.js';

const StatusPill = ({ status }) => {
  const labels = {
    READY_FOR_REVIEW: 'Sẵn sàng duyệt',
    TECHNICALLY_APPROVED: 'Đã duyệt kỹ thuật',
    ACADEMICALLY_APPROVED: 'Đã duyệt học thuật',
    ACADEMICALLY_REJECTED: 'Từ chối học thuật',
    PUBLISHED: 'Đã publish',
    REJECTED: 'Đã từ chối',
    INVALID: 'Không hợp lệ'
  };
  const tone = ['TECHNICALLY_APPROVED', 'ACADEMICALLY_APPROVED', 'PUBLISHED'].includes(status)
    ? 'approved'
    : status === 'READY_FOR_REVIEW' ? 'ready' : 'invalid';
  return <span className={`import-status ${tone}`}>{labels[status] || status}</span>;
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

export default function ImportPanel({ authUser, onLogin }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const canImport = hasRole(authUser, 'CONTENT_EDITOR', 'SUPER_ADMIN');
  const canReview = hasRole(authUser, 'ACADEMIC_REVIEWER', 'SUPER_ADMIN');

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip', ...csrfHeaders() },
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

  const lookup = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    try {
      const response = await fetch(`/api/imports/${lookupId.trim()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Không tìm thấy import job.');
      setResult(payload);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (authUser === undefined) {
    return <div className="center-page"><div className="loading-state" role="status"><span className="loader" aria-hidden="true" /><p>Đang kiểm tra phiên đăng nhập…</p></div></div>;
  }
  if (!authUser) return <div className="import-page"><AuthPanel onLogin={onLogin} /></div>;
  if (!canImport && !canReview) {
    return <div className="import-page"><section className="forbidden-panel"><p className="eyebrow">403 · Không đủ quyền</p><h1>Tài khoản chưa có role nội dung</h1><p>Import Lab yêu cầu CONTENT_EDITOR hoặc ACADEMIC_REVIEWER.</p></section></div>;
  }

  return (
    <div className="import-page" id="top">
      <section className="import-hero">
        <div>
          <h1>Kiểm tra gói đề trước khi duyệt</h1>
          <p>
            Tải Exam Package V1 dạng ZIP. Hệ thống giữ nguyên tệp nguồn và kiểm tra checksum,
            MIME, rich content, hình ảnh, nhóm câu, đáp án và quyền sử dụng.
          </p>
        </div>
        <div className="pipeline" aria-label="Quy trình import hiện tại">
          <span className="active">1 · Tải ZIP</span>
          <span>2 · Kiểm tra</span>
          <span>3 · Technical review</span>
          <span>4 · Academic approval</span>
          <span>5 · Atomic publish</span>
        </div>
      </section>

      <div className="identity-bar">
        <div><span>Đang đăng nhập</span><strong>{authUser.displayName}</strong></div>
        <div><span>Roles</span><strong>{authUser.roles.join(' · ')}</strong></div>
      </div>

      <div className="import-grid">
        {canImport ? <form className="upload-card" onSubmit={submit}>
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
          <p className="import-security">Upload yêu cầu session CONTENT_EDITOR và CSRF token hợp lệ.</p>
        </form> : (
          <section className="upload-card role-card">
            <div className="upload-icon" aria-hidden="true">R</div>
            <h2>Reviewer workspace</h2>
            <p>Tài khoản này không có quyền upload. Nhập Import Job ID được Content Editor chuyển giao để mở report và preview.</p>
          </section>
        )}

        <section className="report-card" aria-live="polite">
          {canReview && (
            <form className="review-lookup" onSubmit={lookup}>
              <label htmlFor="import-job-id">Mở Import Job theo ID</label>
              <div>
                <input id="import-job-id" value={lookupId} onChange={(event) => setLookupId(event.target.value)} placeholder="xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx" required />
                <button type="submit">Mở</button>
              </div>
            </form>
          )}
          {!result && !error && (
            <div className="empty-report">
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
                <div className="clean-report">Validation đã sạch. Package vẫn cần technical review và academic approval trước publish.</div>
              )}
            </div>
          )}
        </section>
      </div>
      {canReview && ['READY_FOR_REVIEW', 'TECHNICALLY_APPROVED', 'ACADEMICALLY_APPROVED', 'ACADEMICALLY_REJECTED', 'REJECTED', 'PUBLISHED'].includes(result?.status) && (
        <ReviewerPreview
          job={result}
          authUser={authUser}
          onJobUpdate={(updatedJob) => setResult((current) => ({ ...current, ...updatedJob }))}
        />
      )}
      {!canReview && result?.status === 'READY_FOR_REVIEW' && (
        <section className="review-launch"><div><p className="eyebrow">Đã chuyển reviewer</p><h2>Package đang chờ ACADEMIC_REVIEWER</h2><p>Content Editor không được tải answer payload hoặc tự ghi quyết định.</p></div></section>
      )}
    </div>
  );
}
