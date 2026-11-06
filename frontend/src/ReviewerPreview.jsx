import { useState } from 'react';
import RichContent from './RichContent.jsx';

const AnswerSummary = ({ question }) => {
  const key = question.answerKey || {};
  if (key.correctOptionIds) return <span>Đáp án: {key.correctOptionIds.join(', ')}</span>;
  if (Number.isFinite(key.numericValue)) return <span>Đáp án: {key.numericValue} · sai số ±{key.tolerance}</span>;
  if (key.acceptedValues) return <span>Chấp nhận: {key.acceptedValues.join(' · ')}</span>;
  if (key.correctValues) return <span>Đúng/sai: {key.correctValues.map((value) => value ? 'Đúng' : 'Sai').join(' · ')}</span>;
  if (key.rubric) return <span>Tự luận · {key.rubric.criteria?.length || 0} tiêu chí rubric</span>;
  return <span>Chưa nhận diện được answer key</span>;
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
      <div className="answer-summary"><AnswerSummary question={question} /></div>
      {question.explanation && (
        <details className="explanation">
          <summary>Xem lời giải trong package</summary>
          <RichContent content={question.explanation} assets={assets} />
        </details>
      )}
    </article>
  );
};

export default function ReviewerPreview({ job, onJobUpdate }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewerId, setReviewerId] = useState('reviewer-demo-01');
  const [reason, setReason] = useState('Đã đối chiếu cấu trúc, rich content, asset và answer key trong gói này.');
  const [submitting, setSubmitting] = useState(false);
  const [decisionResult, setDecisionResult] = useState(null);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/imports/${job.id}/preview`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể mở reviewer preview.');
      setPayload(body);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const submitDecision = async (decision) => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/imports/${job.id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-reviewer-id': reviewerId
        },
        body: JSON.stringify({ decision, reason })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể ghi quyết định review.');
      setDecisionResult(body.review);
      onJobUpdate(body.job);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!payload) {
    return (
      <section className="review-launch">
        <div>
          <p className="eyebrow">Bước tiếp theo · Reviewer</p>
          <h2>Xem bằng renderer thật trước khi quyết định</h2>
          <p>Preview sẽ đọc lại ZIP đã lưu. Answer key chỉ được tải trong khu vực reviewer development.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPreview} disabled={loading}>
          {loading ? 'Đang dựng preview…' : 'Mở reviewer preview'}
        </button>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </section>
    );
  }

  const { preview } = payload;
  const alreadyReviewed = decisionResult || payload.reviews.length > 0 || job.status !== 'READY_FOR_REVIEW';
  return (
    <section className="review-workspace">
      <header className="review-toolbar">
        <div>
          <p className="eyebrow">Technical reviewer preview</p>
          <h2>{preview.exam.title}</h2>
        </div>
        <span className="review-lock">PUBLISH ĐANG KHÓA</span>
      </header>

      <div className="review-context">
        <div><span>Nguồn</span><strong>{preview.source.name}</strong></div>
        <div><span>Origin</span><strong>{preview.source.originType}</strong></div>
        <div><span>Đề</span><strong>{preview.exam.mode} · {preview.exam.purpose}</strong></div>
        <div><span>Phạm vi</span><strong>Lớp {preview.exam.grade} · {preview.exam.subject}</strong></div>
      </div>

      <div className="rights-strip">
        <span className={preview.rights.publishFixed ? 'allowed' : ''}>FIXED</span>
        <span className={preview.rights.extractReuse ? 'allowed' : ''}>EXTRACT</span>
        <span className={preview.rights.derivativeAssembly ? 'allowed' : ''}>ASSEMBLY</span>
      </div>

      <div className="review-document">
        {preview.exam.sections.map((section) => (
          <section key={section.id}>
            <div className="review-section-title">
              <h3>{section.title}</h3>
              <RichContent content={section.instruction} assets={preview.assets} />
            </div>
            {section.groups.map((group) => (
              <div className="review-group" key={group.id}>
                {group.stimulus && (
                  <article className="stimulus-card">
                    <div className="stimulus-label">Stimulus nguồn · {group.selectionPolicy}</div>
                    <h2>{group.stimulus.title}</h2>
                    <RichContent content={group.stimulus.content} assets={preview.assets} />
                  </article>
                )}
                {group.questions.map((question) => <ReviewQuestion key={question.id} question={question} assets={preview.assets} />)}
              </div>
            ))}
          </section>
        ))}
      </div>

      <section className="review-decision">
        <div>
          <p className="eyebrow">Quyết định bất biến</p>
          <h2>Technical review</h2>
          <p>Đây không phải phê duyệt học thuật và không publish nội dung.</p>
        </div>
        {alreadyReviewed ? (
          <div className="decision-recorded">
            <strong>Đã ghi quyết định</strong>
            <span>{decisionResult?.decision || payload.reviews[0]?.decision || job.status}</span>
            <p>Muốn sửa nội dung, hãy tạo package mới thay vì ghi đè audit record.</p>
          </div>
        ) : (
          <div className="decision-form">
            <label>
              <span>Reviewer development ID</span>
              <input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} />
            </label>
            <label>
              <span>Lý do và bằng chứng đã kiểm tra</span>
              <textarea rows="4" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="decision-actions">
              <button type="button" className="reject-button" disabled={submitting} onClick={() => submitDecision('REJECT')}>Từ chối kỹ thuật</button>
              <button type="button" className="approve-button" disabled={submitting} onClick={() => submitDecision('APPROVE')}>Chấp thuận kỹ thuật</button>
            </div>
          </div>
        )}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </section>
    </section>
  );
}
