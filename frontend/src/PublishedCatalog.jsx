import { useEffect, useMemo, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import StudentExamView from './StudentExamView.jsx';
import { csrfHeaders, hasRole } from './auth.js';
import Icon from './portal/Icon.jsx';

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

export default function PublishedCatalog({ authUser, onLogin, onNavigate }) {
  const [exams, setExams] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const isStudent = hasRole(authUser, 'STUDENT');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
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
  }, [refreshKey]);

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

  const filteredExams = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    if (!normalized) return exams;
    return exams.filter((exam) => `${exam.title} ${exam.subject} ${exam.mode} ${exam.grade}`.toLocaleLowerCase('vi').includes(normalized));
  }, [exams, query]);

  return (
    <div className="catalog-page">
      <section className="catalog-hero">
        <div className="catalog-hero-copy">
          <span>Kho đề đã xuất bản</span>
          <h1>Chọn một đề và bắt đầu khi bạn sẵn sàng.</h1>
          <p>Chỉ những phiên bản đã hoàn tất quy trình duyệt mới xuất hiện tại đây. Mỗi lượt làm bài của học sinh được lưu thành một bản riêng.</p>
        </div>
        <img src="/assets/illustrations/dashboard-learner.webp" width="1536" height="1024" alt="" />
      </section>

      {loading ? <div className="catalog-state" role="status"><span className="portal-spinner" />Đang tải kho đề…</div> : error && exams.length === 0 ? (
        <div className="catalog-state catalog-state-error" role="alert"><span className="catalog-state-icon"><Icon name="info" size={26} /></span><div><strong>Chưa tải được kho đề.</strong><span>{error}</span></div><button type="button" className="portal-button portal-button-outline" onClick={() => setRefreshKey((value) => value + 1)}>Thử lại</button></div>
      ) : exams.length === 0 ? (
        <div className="catalog-state catalog-empty"><img src="/assets/illustrations/mascot-rocket.webp" width="1312" height="1199" alt="" /><div><strong>Kho đề đang được chuẩn bị.</strong><span>Trong lúc chờ đề được xuất bản, bạn có thể thử bài DEMO để làm quen với cách trả lời câu hỏi.</span></div>{onNavigate && <button type="button" className="portal-button portal-button-primary" onClick={() => onNavigate('/demo')}>Mở bài DEMO<Icon name="arrow" size={17} /></button>}</div>
      ) : <>
        <div className="catalog-toolbar"><div><h2>Đề đang có</h2><p>{exams.length} đề đã xuất bản</p></div><label className="catalog-search"><Icon name="search" size={19} /><span className="sr-only">Tìm đề</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên đề, môn hoặc lớp…" autoComplete="off" /></label></div>
        {filteredExams.length ? <div className="catalog-grid" aria-label="Danh sách đề đã xuất bản">
          {filteredExams.map((exam) => (
            <button className={`catalog-card ${selectedId === exam.id ? 'selected' : ''}`} type="button" key={exam.id} aria-pressed={selectedId === exam.id} onClick={() => setSelectedId(exam.id)}>
              <span className="catalog-card-icon"><Icon name={exam.mode === 'ASSEMBLED' ? 'layers' : 'book'} size={22} /></span>
              <span className="catalog-card-meta">{exam.subject} · Lớp {exam.grade}</span>
              <strong>{exam.title}</strong>
              <small>{exam.durationMinutes} phút · {exam.mode} · phiên bản {exam.version}</small>
              <span className="catalog-card-action">{selectedId === exam.id ? 'Đang xem' : 'Xem đề'}<Icon name="arrow" size={16} /></span>
            </button>
          ))}
        </div> : <div className="catalog-state catalog-no-results"><Icon name="search" size={26} /><strong>Không có đề khớp từ khóa.</strong><span>Thử tên môn, lớp hoặc một phần tên đề.</span></div>}
      </>}

      {error && exams.length > 0 && <p className="request-error" role="alert">{error}</p>}

      {restoring && <div className="catalog-state compact" role="status">Đang khôi phục câu trả lời đã được server xác nhận…</div>}

      {preview && !attempt && (
        <section className="attempt-launch">
          <div>
            <span className="attempt-launch-icon"><Icon name="shield" size={22} /></span>
            <h2>Sẵn sàng bắt đầu?</h2>
            <p>Khi bắt đầu, hệ thống tạo một bản đề riêng cho lượt làm bài này và giữ lại những câu đã được server xác nhận.</p>
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
    </div>
  );
}
