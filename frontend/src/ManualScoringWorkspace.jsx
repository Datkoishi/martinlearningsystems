import { useCallback, useEffect, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import RichContent from './RichContent.jsx';
import { csrfHeaders } from './auth.js';

const responseError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return new Error(body.message || fallback);
};

const hasRole = (user, role) => user?.roles?.includes(role);

export default function ManualScoringWorkspace({ authUser, onLogin }) {
  const canGrade = hasRole(authUser, 'MANUAL_GRADER') || hasRole(authUser, 'SUPER_ADMIN');
  const canAssign = hasRole(authUser, 'SUPER_ADMIN');
  const [status, setStatus] = useState('OPEN');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [grades, setGrades] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignment, setAssignment] = useState({
    attemptId: '', graderUserId: '', assignmentType: 'INITIAL', reason: ''
  });

  const loadQueue = useCallback(async () => {
    if (!canGrade) return;
    setError('');
    try {
      const response = await fetch(`/api/manual-scoring/assignments?status=${status}`);
      if (!response.ok) throw await responseError(response, 'Không tải được hàng chờ chấm.');
      const body = await response.json();
      setItems(body.items || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [canGrade, status]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const openAssignment = async (id) => {
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/manual-scoring/assignments/${encodeURIComponent(id)}`);
      if (!response.ok) throw await responseError(response, 'Không tải được assignment.');
      const body = await response.json();
      setSelected(body);
      setGrades(Object.fromEntries(body.questions.map((item) => [item.question.versionId, {
        awardedPoints: item.previousAwardedPoints ?? '',
        feedback: item.previousFeedback || ''
      }])));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const createAssignment = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/manual-scoring/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(assignment)
      });
      if (!response.ok) throw await responseError(response, 'Không thể tạo assignment.');
      const body = await response.json();
      setNotice(`Đã phân công ${body.assignmentType} cho score revision ${body.sourceScoreRevision}.`);
      setAssignment((current) => ({ ...current, attemptId: '', reason: '' }));
      await loadQueue();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const submitGrades = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = selected.questions.map((item) => ({
        questionVersionId: item.question.versionId,
        awardedPoints: Number(grades[item.question.versionId]?.awardedPoints),
        feedback: grades[item.question.versionId]?.feedback || ''
      }));
      const response = await fetch(`/api/manual-scoring/assignments/${encodeURIComponent(selected.id)}/grades`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          ...csrfHeaders()
        },
        body: JSON.stringify({ grades: payload })
      });
      if (!response.ok) throw await responseError(response, 'Không thể chốt điểm tự luận.');
      const body = await response.json();
      setNotice(`Đã tạo score revision ${body.scoreRevision}: ${body.totals.earnedPoints}/${body.totals.possiblePoints} điểm.`);
      setSelected(null);
      await loadQueue();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!authUser) return <div className="grading-page"><AuthPanel mode="grading" onLogin={onLogin} /></div>;
  if (!canGrade && !canAssign) {
    return <div className="grading-page"><section className="error-panel"><p className="eyebrow">Không có quyền</p><h1>Cần role Manual Grader</h1><p>Backend kiểm tra assignment và role cho từng request.</p></section></div>;
  }

  return (
    <div className="grading-page">
      <section className="grading-hero">
        <div><h1>Chấm tự luận có assignment và revision bất biến.</h1></div>
        <p>Grader chỉ thấy attempt được giao. Mỗi lần chấm hoặc chấm lại tạo score revision mới; rubric không được đưa vào payload Student.</p>
      </section>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="grading-notice" role="status">{notice}</p>}

      {canAssign && (
        <form className="grading-assignment-form" onSubmit={createAssignment}>
          <header><div><p className="eyebrow">Super Admin</p><h2>Phân công theo attempt</h2></div><span>Explicit scope</span></header>
          <label><span>Attempt UUID</span><input value={assignment.attemptId} onChange={(event) => setAssignment({ ...assignment, attemptId: event.target.value })} required /></label>
          <label><span>Manual Grader user UUID</span><input value={assignment.graderUserId} onChange={(event) => setAssignment({ ...assignment, graderUserId: event.target.value })} required /></label>
          <label><span>Loại</span><select value={assignment.assignmentType} onChange={(event) => setAssignment({ ...assignment, assignmentType: event.target.value })}><option value="INITIAL">Chấm lần đầu</option><option value="REGRADE">Chấm lại</option></select></label>
          <label className="grading-reason"><span>Lý do</span><textarea rows="3" minLength="10" maxLength="1000" value={assignment.reason} onChange={(event) => setAssignment({ ...assignment, reason: event.target.value })} required /></label>
          <button className="primary-button" disabled={busy}>Tạo assignment</button>
        </form>
      )}

      <section className="grading-queue">
        <header>
          <div><p className="eyebrow">Assignment của tôi</p><h2>Hàng chờ chấm</h2></div>
          <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="OPEN">Đang mở</option><option value="COMPLETED">Đã hoàn thành</option></select>
        </header>
        <div className="grading-queue-list">
          {items.length === 0 && <p>Không có assignment ở trạng thái này.</p>}
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => openAssignment(item.id)}>
              <span><strong>{item.examTitle || 'Attempt được giao'}</strong><small>{item.assignmentType} · revision {item.sourceScoreRevision}</small></span>
              <code>{item.id}</code>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <form className="grading-editor" onSubmit={submitGrades}>
          <header>
            <div><p className="eyebrow">{selected.assignmentType}</p><h2>{selected.exam.title}</h2><p>{selected.reason}</p></div>
            <button className="text-button" type="button" onClick={() => setSelected(null)}>Đóng</button>
          </header>
          <div className="grading-score-strip"><span>Source revision <strong>{selected.sourceScore.revision}</strong></span><span>Điểm tự động <strong>{selected.sourceScore.totals.autoAwardedPoints}</strong></span><span>Câu tự luận <strong>{selected.questions.length}</strong></span></div>
          {selected.questions.map((item) => (
            <article className="grading-question" key={item.question.versionId}>
              <div className="question-heading"><span className="question-number">Câu {item.question.order || 'tự luận'}</span><span>{item.maxPoints} điểm</span></div>
              <RichContent content={item.question.content} assets={selected.exam.assets} />
              <section><h3>Bài làm</h3><p className="grading-response">{item.submittedAnswer}</p></section>
              <details><summary>Rubric đã duyệt</summary><pre>{JSON.stringify(item.rubric, null, 2)}</pre></details>
              <div className="grading-fields">
                <label><span>Điểm (0–{item.maxPoints})</span><input type="number" min="0" max={item.maxPoints} step="0.01" value={grades[item.question.versionId]?.awardedPoints ?? ''} onChange={(event) => setGrades({ ...grades, [item.question.versionId]: { ...grades[item.question.versionId], awardedPoints: event.target.value } })} required /></label>
                <label><span>Nhận xét cho học sinh</span><textarea rows="4" minLength="3" maxLength="2000" value={grades[item.question.versionId]?.feedback || ''} onChange={(event) => setGrades({ ...grades, [item.question.versionId]: { ...grades[item.question.versionId], feedback: event.target.value } })} required /></label>
              </div>
            </article>
          ))}
          {selected.status === 'OPEN' && <button className="primary-button" disabled={busy}>Chốt score revision mới</button>}
        </form>
      )}
    </div>
  );
}
