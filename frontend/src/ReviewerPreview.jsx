import { useState } from 'react';
import RichContent from './RichContent.jsx';
import { csrfHeaders } from './auth.js';

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

export default function ReviewerPreview({ job, authUser, onJobUpdate }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('Đã đối chiếu cấu trúc, rich content, asset và answer key trong gói này.');
  const [submitting, setSubmitting] = useState(false);
  const [publication, setPublication] = useState(null);

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

  const submitDecision = async (scope, decision) => {
    setSubmitting(true);
    setError('');
    try {
      const endpoint = scope === 'ACADEMIC' ? 'academic-reviews' : 'reviews';
      const response = await fetch(`/api/imports/${job.id}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders()
        },
        body: JSON.stringify({ decision, reason })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể ghi quyết định review.');
      setPayload((current) => ({ ...current, job: body.job, reviews: [...current.reviews, body.review] }));
      onJobUpdate(body.job);
      if (scope === 'TECHNICAL' && decision === 'APPROVE') {
        setReason('Đã kiểm tra tính chính xác học thuật, độ phù hợp lớp/môn, đáp án, lời giải và quyền công bố.');
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const publish = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/imports/${job.id}/publish`, {
        method: 'POST',
        headers: csrfHeaders()
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể publish package.');
      setPublication(body.publication);
      setPayload((current) => ({ ...current, job: body.job }));
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
          <p>Preview sẽ đọc lại ZIP đã lưu. Answer key chỉ được tải trong session Reviewer đã xác thực.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPreview} disabled={loading}>
          {loading ? 'Đang dựng preview…' : 'Mở reviewer preview'}
        </button>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </section>
    );
  }

  const { preview } = payload;
  const currentStatus = payload.job?.status || job.status;
  const visiblePublication = publication || payload.publication;
  const technicalReview = payload.reviews.find((review) => review.scope === 'TECHNICAL');
  const academicReview = payload.reviews.find((review) => review.scope === 'ACADEMIC');
  const activeScope = currentStatus === 'READY_FOR_REVIEW'
    ? 'TECHNICAL'
    : currentStatus === 'TECHNICALLY_APPROVED' ? 'ACADEMIC' : null;
  const terminalReview = currentStatus === 'REJECTED'
    ? technicalReview
    : currentStatus === 'ACADEMICALLY_REJECTED' ? academicReview : null;
  const lockLabel = currentStatus === 'PUBLISHED'
    ? 'PUBLISHED · BẤT BIẾN'
    : currentStatus === 'ACADEMICALLY_APPROVED' ? 'SẴN SÀNG PUBLISH' : 'PUBLISH ĐANG KHÓA';
  return (
    <section className="review-workspace">
      <header className="review-toolbar">
        <div>
          <p className="eyebrow">Technical reviewer preview</p>
          <h2>{preview.exam.title}</h2>
        </div>
        <span className="review-lock">{lockLabel}</span>
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
          <h2>{activeScope === 'ACADEMIC' ? 'Academic approval' : activeScope === 'TECHNICAL' ? 'Technical review' : 'Publish gate'}</h2>
          <p>Technical review, academic approval và publish là ba bước tách biệt, đều bind với package/report đã duyệt.</p>
        </div>
        {currentStatus === 'PUBLISHED' || visiblePublication ? (
          <div className="decision-recorded">
            <strong>Đã publish nguyên tử</strong>
            <span>{visiblePublication?.examVersionId || 'ExamVersion đã được ghi nhận'}</span>
            <p>Nội dung version đã publish là bất biến. Mọi chỉnh sửa phải đi qua package/version mới.</p>
          </div>
        ) : currentStatus === 'ACADEMICALLY_APPROVED' ? (
          <div className="publish-panel">
            <strong>Đủ hai approval gate</strong>
            <p>Backend sẽ đọc lại source ZIP, kiểm tra hash/report và ghi source, license, asset, question, stimulus, group cùng ExamVersion trong một transaction.</p>
            {preview.exam.purpose === 'FORMAL_ASSESSMENT' ? (
              <div className="formal-lock">FORMAL_ASSESSMENT vẫn bị khóa cho đến khi có formal approval policy.</div>
            ) : (
              <button type="button" className="approve-button" disabled={submitting} onClick={publish}>
                {submitting ? 'Đang publish…' : 'Publish version bất biến'}
              </button>
            )}
          </div>
        ) : terminalReview ? (
          <div className="decision-recorded rejected-record">
            <strong>Package đã bị từ chối</strong>
            <span>{terminalReview.scope} · {terminalReview.decision}</span>
            <p>{terminalReview.reason}</p>
          </div>
        ) : activeScope ? (
          <div className="decision-form">
            <div className="reviewer-identity"><span>Reviewer xác thực</span><strong>{authUser.displayName}</strong><code>{authUser.id}</code></div>
            <label>
              <span>{activeScope === 'ACADEMIC' ? 'Kết luận học thuật và bằng chứng đã kiểm tra' : 'Lý do và bằng chứng kỹ thuật đã kiểm tra'}</span>
              <textarea rows="4" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="decision-actions">
              <button type="button" className="reject-button" disabled={submitting} onClick={() => submitDecision(activeScope, 'REJECT')}>Từ chối {activeScope === 'ACADEMIC' ? 'học thuật' : 'kỹ thuật'}</button>
              <button type="button" className="approve-button" disabled={submitting} onClick={() => submitDecision(activeScope, 'APPROVE')}>Chấp thuận {activeScope === 'ACADEMIC' ? 'học thuật' : 'kỹ thuật'}</button>
            </div>
          </div>
        ) : (
          <div className="decision-recorded"><strong>Không có thao tác khả dụng</strong><span>{currentStatus}</span></div>
        )}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </section>
    </section>
  );
}
