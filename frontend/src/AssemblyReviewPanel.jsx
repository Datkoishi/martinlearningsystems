import { useState } from 'react';
import RichContent from './RichContent.jsx';
import { csrfHeaders } from './auth.js';

const readError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return Object.assign(new Error(body.message || fallback), { code: body.code });
};

const AnswerSummary = ({ answerKey }) => {
  if (answerKey?.correctOptionIds) return <>Đáp án: {answerKey.correctOptionIds.join(', ')}</>;
  if (answerKey?.correctValues) return <>Đúng/sai: {answerKey.correctValues.map((value) => value ? 'Đúng' : 'Sai').join(' · ')}</>;
  if (Number.isFinite(answerKey?.numericValue)) return <>Đáp án: {answerKey.numericValue} · sai số ±{answerKey.tolerance}</>;
  if (answerKey?.acceptedValues) return <>Chấp nhận: {answerKey.acceptedValues.join(' · ')}</>;
  if (answerKey?.rubric) return <>Tự luận · {answerKey.rubric.criteria?.length || 0} tiêu chí</>;
  return <>Answer key không hợp lệ</>;
};

const ReviewQuestion = ({ question, assets }) => {
  const correctIds = new Set(question.answerKey?.correctOptionIds || []);
  return (
    <article className="review-question">
      <div className="question-heading">
        <span className="question-number">Câu {question.order}</span>
        <span>{question.points} điểm · {question.type}</span>
      </div>
      <RichContent content={question.content} assets={assets} />
      {question.options?.length > 0 && (
        <div className="review-options">
          {question.options.map((option, index) => (
            <div className={correctIds.has(option.id) ? 'correct' : ''} key={option.id}>
              <span>{String.fromCharCode(65 + index)}</span>
              <RichContent content={option.content} assets={assets} />
              {correctIds.has(option.id) && <strong>Đáp án đúng</strong>}
            </div>
          ))}
        </div>
      )}
      <div className="answer-summary"><AnswerSummary answerKey={question.answerKey} /></div>
      {question.explanation && (
        <details className="explanation">
          <summary>Xem lời giải đã duyệt</summary>
          <RichContent content={question.explanation} assets={assets} />
        </details>
      )}
    </article>
  );
};

export default function AssemblyReviewPanel({ authUser }) {
  const [runId, setRunId] = useState('');
  const [payload, setPayload] = useState(null);
  const [reason, setReason] = useState('Đã kiểm tra blueprint, quota, nguồn, stimulus, đáp án và snapshot assembled.');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    setPayload(null);
    try {
      const response = await fetch(`/api/assemblies/${encodeURIComponent(runId.trim())}/reviewer-preview`);
      if (!response.ok) throw await readError(response, 'Không mở được assembly reviewer preview.');
      setPayload(await response.json());
    } catch (requestError) {
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const decide = async (decision) => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/assemblies/${encodeURIComponent(payload.id)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ decision, reason })
      });
      if (!response.ok) throw await readError(response, 'Không ghi được quyết định assembly.');
      setPayload(await response.json());
    } catch (requestError) {
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const publish = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/assemblies/${encodeURIComponent(payload.id)}/publish`, {
        method: 'POST',
        headers: csrfHeaders()
      });
      if (!response.ok) throw await readError(response, 'Không publish được assembly snapshot.');
      const body = await response.json();
      setPayload(body.run);
    } catch (requestError) {
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="assembly-review">
      <header className="assembly-review-header">
        <div>
          <p className="eyebrow">Academic approval · ASSEMBLED</p>
          <h2>Duyệt đúng snapshot đã được engine đóng băng.</h2>
          <p>Reviewer payload có answer key/lời giải và chỉ tải sau xác thực. Quyết định bind selection + snapshot hash, không chạy lại assembly.</p>
        </div>
        <div className="assembly-run-lookup">
          <label><span>Assembly run ID</span><input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="UUID do Editor cung cấp" /></label>
          <button className="secondary-button" type="button" onClick={load} disabled={loading || !runId.trim()}>{loading ? 'Đang tải…' : 'Mở snapshot'}</button>
        </div>
      </header>

      {error && <p className="inline-error" role="alert">{error}</p>}

      {payload && (
        <>
          <div className="review-context">
            <div><span>Blueprint version</span><strong>v{payload.blueprintVersion}</strong></div>
            <div><span>Trạng thái</span><strong>{payload.approvalStatus}</strong></div>
            <div><span>Creator</span><strong><code>{payload.creatorUserId}</code></strong></div>
            <div><span>Reviewer</span><strong>{authUser.displayName}</strong></div>
          </div>
          <div className="assembly-hash-strip">
            <span>selection <code>{payload.selectionSha256}</code></span>
            <span>snapshot <code>{payload.snapshotSha256}</code></span>
          </div>

          <div className="review-document">
            {payload.preview.sections.map((section) => (
              <section key={section.id}>
                <div className="review-section-title">
                  <h3>{section.title}</h3>
                  <RichContent content={section.instruction} assets={payload.preview.assets} />
                </div>
                {section.groups.map((group) => {
                  const stimulus = payload.preview.stimuli.find((item) => item.id === group.stimulusVersionId);
                  return (
                    <div className="review-group" key={group.id}>
                      {stimulus && (
                        <article className="stimulus-card">
                          <div className="stimulus-label">Stimulus · {group.selectionPolicy}</div>
                          <h2>{stimulus.title}</h2>
                          <RichContent content={stimulus.content} assets={payload.preview.assets} />
                        </article>
                      )}
                      {group.questions.map((question) => <ReviewQuestion key={question.id} question={question} assets={payload.preview.assets} />)}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>

          <section className="review-decision">
            <div>
              <p className="eyebrow">Quyết định bất biến</p>
              <h2>{payload.approvalStatus === 'PUBLISHED' ? 'Đã publish' : 'Approval gate'}</h2>
              <p>Creator không được tự duyệt. Reject hoặc approve đều là quyết định cuối cho blueprint version này.</p>
            </div>
            {payload.approvalStatus === 'NEEDS_REVIEW' ? (
              <div className="decision-form">
                <label><span>Lý do và bằng chứng đã kiểm tra</span><textarea rows="4" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
                <div className="decision-actions">
                  <button className="reject-button" type="button" disabled={submitting} onClick={() => decide('REJECT')}>Từ chối</button>
                  <button className="approve-button" type="button" disabled={submitting} onClick={() => decide('APPROVE')}>Chấp thuận</button>
                </div>
              </div>
            ) : payload.approvalStatus === 'APPROVED' ? (
              <div className="publish-panel">
                <strong>Snapshot đã được duyệt</strong>
                <p>Publish tạo ExamVersion ASSEMBLED và projection catalog bất biến; Student attempt lấy đúng snapshot này.</p>
                <button className="approve-button" type="button" disabled={submitting} onClick={publish}>{submitting ? 'Đang publish…' : 'Publish vào catalog'}</button>
              </div>
            ) : (
              <div className={`decision-recorded ${payload.approvalStatus === 'REJECTED' ? 'rejected-record' : ''}`}>
                <strong>{payload.approvalStatus}</strong>
                {payload.review && <p>{payload.review.reason}</p>}
                {payload.publication && <span>ExamVersion: <code>{payload.publication.examVersionId}</code></span>}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
