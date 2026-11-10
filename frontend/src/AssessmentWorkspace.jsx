import { useEffect, useRef, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import { csrfHeaders, hasRole } from './auth.js';

const readError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return Object.assign(new Error(body.message || fallback), { code: body.code, details: body.details });
};

const demoFramework = {
  schemaVersion: '1.0.0',
  title: '[DEMO] Khung bằng chứng Toán 5',
  description: 'Fixture kỹ thuật cần Reviewer phê duyệt; không phải kết luận năng lực chính thức.',
  grade: 5,
  subject: 'Toán',
  frameworkPurpose: 'CURRICULUM_LEARNING',
  sourceExamPurpose: 'PRACTICE',
  scoringQuality: { allowedScoringVersions: ['eduassess-scoring-v1'] },
  minimums: { completedAttempts: 2, evidenceItems: 4 },
  reassessment: { additionalEvidenceItems: 2 },
  indicators: [{
    id: 'reasoning',
    title: 'Lập luận toán học',
    evidence: {
      skillKeys: ['reasoning'],
      topicKeys: [],
      minimumItems: 4,
      requiredDifficulties: ['EASY', 'MEDIUM'],
      requiredQuestionTypes: ['SINGLE_CHOICE', 'SHORT_NUMBER']
    },
    levels: [
      { level: 'NEEDS_REINFORCEMENT', minimumRatio: 0 },
      { level: 'DEVELOPING', minimumRatio: 0.4 },
      { level: 'ACHIEVED', minimumRatio: 0.7 },
      { level: 'EXCEEDED', minimumRatio: 0.9 }
    ],
    guidance: {
      insufficientEvidence: 'Hoàn thành thêm câu lập luận ở đủ loại nhiệm vụ.',
      byLevel: {
        NEEDS_REINFORCEMENT: 'Ôn lại dữ kiện và các bước lập luận cơ bản.',
        DEVELOPING: 'Luyện thêm bài có nhiều bước suy luận.',
        ACHIEVED: 'Duy trì luyện tập và giải thích rõ từng bước.',
        EXCEEDED: 'Thử bài mở rộng và so sánh nhiều cách giải.'
      }
    }
  }]
};

const missingLabel = (item) => ({
  MINIMUM_ATTEMPTS: `Cần ${item.required} lượt hoàn tất, hiện có ${item.actual}`,
  MINIMUM_EVIDENCE: `Cần ${item.required} bằng chứng, hiện có ${item.actual}`,
  MINIMUM_ITEMS: `Indicator cần ${item.required} bằng chứng, hiện có ${item.actual}`,
  DIFFICULTY_COVERAGE: `Thiếu độ khó: ${item.missing?.join(', ')}`,
  TASK_TYPE_COVERAGE: `Thiếu loại câu: ${item.missing?.join(', ')}`,
  SCORING_QUALITY: `Có ${item.invalidItems} bằng chứng không đạt scoring quality/version đã duyệt`
}[item.code] || item.code);

const FrameworkSummary = ({ framework }) => (
  <div className="assessment-framework-summary">
    <div><span>Mục đích</span><strong>{framework.frameworkPurpose}</strong></div>
    <div><span>Nguồn evidence</span><strong>{framework.sourceExamPurpose}</strong></div>
    <div><span>Lớp / môn</span><strong>{framework.grade} · {framework.subject}</strong></div>
    <div><span>Indicators</span><strong>{framework.indicators?.length || 0}</strong></div>
  </div>
);

const AssessmentResult = ({ result }) => result && (
  <section className={`assessment-result ${result.state === 'INSUFFICIENT_EVIDENCE' ? 'insufficient' : ''}`}>
    <header>
      <div>
        <p className="eyebrow">Evidence interpretation</p>
        <h2>{result.interpretation.message}</h2>
      </div>
      <span>{result.state}</span>
    </header>
    <p className="assessment-limitation">{result.interpretation.limitation}</p>
    <dl className="assessment-evidence-totals">
      <div><dt>Lượt hoàn tất</dt><dd>{result.interpretation.evidenceSummary.completedAttemptCount}/{result.interpretation.evidenceSummary.requiredAttempts}</dd></div>
      <div><dt>Bằng chứng phù hợp</dt><dd>{result.interpretation.evidenceSummary.mappedEvidenceItems}/{result.interpretation.evidenceSummary.requiredEvidenceItems}</dd></div>
    </dl>
    <div className="assessment-indicators">
      {result.interpretation.indicators.map((indicator) => (
        <article key={indicator.id}>
          <div className="assessment-indicator-heading">
            <div><small>{indicator.id}</small><h3>{indicator.title}</h3></div>
            <strong>{indicator.level?.label || 'Chưa đủ bằng chứng'}</strong>
          </div>
          <p>{indicator.guidance}</p>
          <span>{indicator.evidence.itemCount} evidence item · {indicator.evidence.awardedPoints}/{indicator.evidence.possiblePoints} điểm bằng chứng</span>
          {!indicator.coverage.sufficient && (
            <ul>{indicator.coverage.missing.map((item, index) => <li key={`${item.code}-${index}`}>{missingLabel(item)}</li>)}</ul>
          )}
        </article>
      ))}
    </div>
    {result.interpretation.reassessment && <p className="assessment-retest">{result.interpretation.reassessment.message}</p>}
  </section>
);

export default function AssessmentWorkspace({ authUser, onLogin }) {
  const isStudent = hasRole(authUser, 'STUDENT');
  const canAuthor = hasRole(authUser, 'ASSESSMENT_SPECIALIST', 'SUPER_ADMIN');
  const canReview = hasRole(authUser, 'ACADEMIC_REVIEWER', 'SUPER_ADMIN');
  const [stableKey, setStableKey] = useState('demo.math.5.curriculum');
  const [frameworkText, setFrameworkText] = useState(JSON.stringify(demoFramework, null, 2));
  const [created, setCreated] = useState(null);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewPayload, setReviewPayload] = useState(null);
  const [reviewReason, setReviewReason] = useState('Đã kiểm tra mapping, coverage, difficulty, task type và interpretation rules.');
  const [available, setAvailable] = useState([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const authorKeyRef = useRef(null);
  const assessmentKeyRef = useRef(null);

  const loadReviewQueue = async () => {
    if (!canReview) return;
    const response = await fetch('/api/assessment-frameworks/review-queue');
    if (!response.ok) throw await readError(response, 'Không tải được framework review queue.');
    setReviewQueue((await response.json()).items || []);
  };

  useEffect(() => {
    if (!canReview) return;
    loadReviewQueue().catch((requestError) => setError(requestError.message));
  }, [authUser?.id, canReview]);

  useEffect(() => {
    if (!isStudent) return;
    const controller = new AbortController();
    fetch('/api/assessment-frameworks/available', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw await readError(response, 'Không tải được framework đã duyệt.');
        return response.json();
      })
      .then((body) => {
        setAvailable(body.items || []);
        setSelectedFrameworkId((current) => current || body.items?.[0]?.id || '');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });
    return () => controller.abort();
  }, [authUser?.id, isStudent]);

  useEffect(() => {
    if (!isStudent || !selectedFrameworkId) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/assessments/latest?frameworkVersionId=${encodeURIComponent(selectedFrameworkId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw await readError(response, 'Không khôi phục được assessment gần nhất.');
        return response.json();
      })
      .then(setResult)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });
    return () => controller.abort();
  }, [isStudent, selectedFrameworkId]);

  const createFramework = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const framework = JSON.parse(frameworkText);
      if (!authorKeyRef.current) authorKeyRef.current = crypto.randomUUID();
      const response = await fetch('/api/assessment-frameworks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': authorKeyRef.current,
          ...csrfHeaders()
        },
        body: JSON.stringify({ stableKey: stableKey.trim(), framework })
      });
      if (!response.ok) throw await readError(response, 'Không tạo được framework.');
      setCreated(await response.json());
      authorKeyRef.current = null;
    } catch (requestError) {
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openReview = async (id) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/assessment-frameworks/${encodeURIComponent(id)}/reviewer-preview`);
      if (!response.ok) throw await readError(response, 'Không mở được framework preview.');
      setReviewPayload(await response.json());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const review = async (decision) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/assessment-frameworks/${encodeURIComponent(reviewPayload.id)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ decision, reason: reviewReason })
      });
      if (!response.ok) throw await readError(response, 'Không ghi được quyết định framework.');
      setReviewPayload(await response.json());
      await loadReviewQueue();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      if (!assessmentKeyRef.current) assessmentKeyRef.current = crypto.randomUUID();
      const response = await fetch('/api/assessments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': assessmentKeyRef.current,
          ...csrfHeaders()
        },
        body: JSON.stringify({ frameworkVersionId: selectedFrameworkId })
      });
      if (!response.ok) throw await readError(response, 'Không tạo được assessment result.');
      setResult(await response.json());
      assessmentKeyRef.current = null;
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  if (authUser === undefined) return <div className="assessment-page"><div className="catalog-state">Đang xác minh phiên…</div></div>;
  if (!authUser) return <div className="assessment-page"><AuthPanel mode="assessment" onLogin={onLogin} /></div>;

  return (
    <div className="assessment-page">
      <section className="assessment-hero">
        <div><h1>Chỉ phân mức khi framework đã duyệt và bằng chứng đủ coverage.</h1></div>
        <p>Scoring chỉ cung cấp bằng chứng. Engine không biến tỷ lệ điểm thành “phần trăm năng lực”; thiếu attempt, difficulty hoặc task type sẽ trả “Chưa đủ bằng chứng”.</p>
      </section>

      {error && <p className="request-error" role="alert">{error}</p>}

      {canAuthor && (
        <form className="assessment-author" onSubmit={createFramework}>
          <header><div><p className="eyebrow">Assessment Specialist</p><h2>Framework config versioned</h2></div><span>ACADEMIC APPROVAL REQUIRED</span></header>
          <label><span>Stable key</span><input value={stableKey} onChange={(event) => { setStableKey(event.target.value); authorKeyRef.current = null; }} /></label>
          <label><span>Config JSON</span><textarea rows="24" value={frameworkText} onChange={(event) => { setFrameworkText(event.target.value); authorKeyRef.current = null; }} spellCheck="false" /></label>
          <button className="primary-button" type="submit" disabled={loading}>Gửi framework sang review</button>
          {created && <p className="assessment-created">Framework <code>{created.id}</code> · {created.approvalStatus}</p>}
        </form>
      )}

      {canReview && (
        <section className="assessment-review-workspace">
          <header><div><p className="eyebrow">Independent review</p><h2>Framework chờ duyệt</h2></div><span>{reviewQueue.length} item</span></header>
          <div className="assessment-review-layout">
            <div className="assessment-review-queue">
              {reviewQueue.map((item) => (
                <button type="button" key={item.id} onClick={() => openReview(item.id)}>
                  <strong>{item.title}</strong><span>Lớp {item.grade} · {item.subject}</span><small>{item.creator.displayName}</small>
                </button>
              ))}
              {reviewQueue.length === 0 && <p>Không có framework chờ duyệt độc lập.</p>}
            </div>
            {reviewPayload && (
              <article className="assessment-review-preview">
                <h3>{reviewPayload.config.title}</h3>
                <p>{reviewPayload.config.description}</p>
                <FrameworkSummary framework={reviewPayload.config} />
                {reviewPayload.config.indicators.map((indicator) => (
                  <details key={indicator.id}><summary>{indicator.title}</summary><pre>{JSON.stringify(indicator, null, 2)}</pre></details>
                ))}
                {reviewPayload.approvalStatus === 'NEEDS_REVIEW' && <>
                  <label><span>Lý do review</span><textarea rows="4" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></label>
                  <div className="decision-actions"><button className="reject-button" type="button" onClick={() => review('REJECT')} disabled={loading}>Từ chối</button><button className="approve-button" type="button" onClick={() => review('APPROVE')} disabled={loading}>Phê duyệt rule</button></div>
                </>}
              </article>
            )}
          </div>
        </section>
      )}

      {isStudent && (
        <section className="assessment-student">
          <header><div><p className="eyebrow">Báo cáo của tôi</p><h2>Đánh giá từ score revision FINAL</h2></div></header>
          {available.length === 0 ? <p>Chưa có framework nào đã được phê duyệt.</p> : <>
            <div className="assessment-framework-picker">
              <select value={selectedFrameworkId} onChange={(event) => { setSelectedFrameworkId(event.target.value); assessmentKeyRef.current = null; }}>
                {available.map((item) => <option value={item.id} key={item.id}>{item.title} · Lớp {item.grade} · {item.subject}</option>)}
              </select>
              <button className="secondary-button" type="button" onClick={generate} disabled={loading || !selectedFrameworkId}>{loading ? 'Đang tổng hợp…' : 'Đánh giá lại từ bằng chứng hiện có'}</button>
            </div>
            <AssessmentResult result={result} />
          </>}
        </section>
      )}

      {!isStudent && !canAuthor && !canReview && <div className="catalog-state"><strong>Chưa có quyền assessment phù hợp.</strong><span>Teacher cross-student vẫn khóa cho tới khi có tenant/class scope.</span></div>}
    </div>
  );
}
