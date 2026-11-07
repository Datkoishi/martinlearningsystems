import { useEffect, useRef, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import StudentExamView from './StudentExamView.jsx';
import { csrfHeaders, hasRole } from './auth.js';

const readError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return new Error(body.message || fallback);
};

export default function PublishedCatalog({ authUser, onLogin }) {
  const [exams, setExams] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKeys = useRef(new Map());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/catalog/exams', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw await readError(response, 'Không tải được catalog.');
        return response.json();
      })
      .then((body) => {
        setExams(body.exams || []);
        if (body.exams?.length) setSelectedId((current) => current || body.exams[0].id);
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    const controller = new AbortController();
    setPreview(null);
    setAttempt(null);
    setError('');
    fetch(`/api/catalog/exams/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw await readError(response, 'Không mở được đề đã publish.');
        return response.json();
      })
      .then(setPreview)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    setAttempt(null);
  }, [authUser?.id]);

  const startAttempt = async () => {
    setStarting(true);
    setError('');
    let idempotencyKey = idempotencyKeys.current.get(selectedId);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      idempotencyKeys.current.set(selectedId, idempotencyKey);
    }
    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...csrfHeaders()
        },
        body: JSON.stringify({ examVersionId: selectedId })
      });
      if (!response.ok) throw await readError(response, 'Không thể tạo attempt.');
      setAttempt(await response.json());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStarting(false);
    }
  };

  const isStudent = hasRole(authUser, 'STUDENT');

  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">Published FIXED catalog</p>
          <h1>Đề đã qua hai cổng duyệt, sẵn sàng cho học sinh.</h1>
        </div>
        <p>Catalog công khai chỉ trả projection an toàn. Khi Student bắt đầu, server đóng băng riêng snapshot hiển thị và snapshot chấm điểm.</p>
      </section>

      {loading ? <div className="catalog-state" role="status">Đang tải catalog…</div> : (
        exams.length === 0 ? (
          <div className="catalog-state"><strong>Chưa có đề FIXED nào đã publish.</strong><span>Hãy hoàn tất luồng import, technical review, academic review và publish.</span></div>
        ) : (
          <div className="catalog-grid" aria-label="Danh sách đề đã publish">
            {exams.map((exam) => (
              <button className={`catalog-card ${selectedId === exam.id ? 'selected' : ''}`} type="button" key={exam.id} onClick={() => setSelectedId(exam.id)}>
                <span>{exam.subject} · Lớp {exam.grade}</span>
                <strong>{exam.title}</strong>
                <small>{exam.durationMinutes} phút · phiên bản {exam.version}</small>
              </button>
            ))}
          </div>
        )
      )}

      {error && <p className="request-error" role="alert">{error}</p>}

      {preview && !attempt && (
        <section className="attempt-launch">
          <div>
            <p className="eyebrow">Bắt đầu an toàn</p>
            <h2>Tạo snapshot riêng cho lượt làm bài</h2>
            <p>Retry cùng khóa idempotency sẽ nhận lại đúng attempt cũ; không tạo bản ghi hoặc snapshot mới.</p>
          </div>
          {isStudent ? (
            <button className="primary-button" type="button" onClick={startAttempt} disabled={starting}>
              {starting ? 'Đang tạo attempt…' : 'Bắt đầu làm bài'}
            </button>
          ) : authUser ? (
            <p className="role-warning">Tài khoản hiện tại không có role <strong>STUDENT</strong>.</p>
          ) : authUser === undefined ? (
            <span className="login-required">Đang xác minh phiên…</span>
          ) : (
            <span className="login-required">Cần đăng nhập Student</span>
          )}
        </section>
      )}

      {authUser === null && preview && <AuthPanel mode="student" onLogin={onLogin} />}
      {(attempt?.snapshot || preview) && <StudentExamView exam={attempt?.snapshot || preview} attemptId={attempt?.id} />}
    </main>
  );
}
