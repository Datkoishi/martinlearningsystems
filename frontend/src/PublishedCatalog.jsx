import { useEffect, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import StudentExamView from './StudentExamView.jsx';
import { csrfHeaders, hasRole } from './auth.js';

const readError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return new Error(body.message || fallback);
};

const sessionKey = (kind, userId, examId) => `eduassess:${kind}:${userId}:${examId}`;
const readSession = (key) => {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
};
const writeSession = (key, value) => {
  try { window.sessionStorage.setItem(key, value); } catch { /* Server remains the source of truth. */ }
};
const removeSession = (key) => {
  try { window.sessionStorage.removeItem(key); } catch { /* Ignore unavailable browser storage. */ }
};

export default function PublishedCatalog({ authUser, onLogin }) {
  const [exams, setExams] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const isStudent = hasRole(authUser, 'STUDENT');

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
    if (!isStudent || !selectedId || !authUser?.id) {
      setAttempt(null);
      return undefined;
    }
    const key = sessionKey('attempt', authUser.id, selectedId);
    const storedAttemptId = readSession(key);
    if (!storedAttemptId) {
      setAttempt(null);
      return undefined;
    }
    const controller = new AbortController();
    setRestoring(true);
    fetch(`/api/attempts/${encodeURIComponent(storedAttemptId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          removeSession(key);
          return null;
        }
        if (!response.ok) throw await readError(response, 'Không thể khôi phục attempt.');
        return response.json();
      })
      .then((restored) => {
        if (restored?.examVersionId === selectedId) setAttempt(restored);
        else if (restored) removeSession(key);
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => setRestoring(false));
    return () => controller.abort();
  }, [authUser?.id, isStudent, selectedId]);

  const startAttempt = async () => {
    setStarting(true);
    setError('');
    const idempotencyStorageKey = sessionKey('attempt-key', authUser.id, selectedId);
    let idempotencyKey = readSession(idempotencyStorageKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      writeSession(idempotencyStorageKey, idempotencyKey);
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
      const created = await response.json();
      writeSession(sessionKey('attempt', authUser.id, selectedId), created.id);
      setAttempt(created);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStarting(false);
    }
  };

  const updateAttempt = (nextAttempt) => {
    setAttempt((current) => current?.id === nextAttempt.id ? { ...current, ...nextAttempt } : nextAttempt);
  };

  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">Published exam catalog</p>
          <h1>Đề FIXED và ASSEMBLED đã qua approval gate.</h1>
        </div>
        <p>Catalog công khai chỉ trả projection an toàn. ASSEMBLED dùng snapshot đã publish và không chạy lại engine khi Student bắt đầu hoặc tải lại trang.</p>
      </section>

      {loading ? <div className="catalog-state" role="status">Đang tải catalog…</div> : (
        exams.length === 0 ? (
          <div className="catalog-state"><strong>Chưa có đề nào đã publish.</strong><span>Hãy hoàn tất approval và publish cho FIXED hoặc ASSEMBLED.</span></div>
        ) : (
          <div className="catalog-grid" aria-label="Danh sách đề đã publish">
            {exams.map((exam) => (
              <button className={`catalog-card ${selectedId === exam.id ? 'selected' : ''}`} type="button" key={exam.id} onClick={() => setSelectedId(exam.id)}>
                <span>{exam.mode} · {exam.subject} · Lớp {exam.grade}</span>
                <strong>{exam.title}</strong>
                <small>{exam.durationMinutes} phút · phiên bản {exam.version}</small>
              </button>
            ))}
          </div>
        )
      )}

      {error && <p className="request-error" role="alert">{error}</p>}

      {restoring && <div className="catalog-state compact" role="status">Đang khôi phục câu trả lời đã được server xác nhận…</div>}

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
      {(attempt?.snapshot || preview) && (
        <StudentExamView
          key={attempt?.id || preview.id}
          exam={attempt?.snapshot || preview}
          attempt={attempt}
          onAttemptChange={updateAttempt}
        />
      )}
    </main>
  );
}
