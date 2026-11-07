import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RichContent from './RichContent.jsx';
import { csrfHeaders } from './auth.js';

const responseError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return Object.assign(new Error(body.message || fallback), { code: body.code, details: body.details });
};

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hasAnswer = (answer) => {
  if (typeof answer === 'boolean' || typeof answer === 'number') return true;
  if (Array.isArray(answer)) return answer.some((item) => item !== null && item !== undefined);
  return String(answer || '').trim().length > 0;
};

const ChoiceQuestion = ({ question, assets, value, onChange, disabled }) => {
  const multiple = question.type === 'MULTIPLE_CHOICE';
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (optionId) => onChange(multiple
    ? (selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId])
    : optionId);

  return (
    <fieldset className="options" disabled={disabled}>
      <legend>{multiple ? 'Có thể chọn nhiều đáp án' : 'Chọn một đáp án'}</legend>
      {question.options.map((option, index) => {
        const checked = selected.includes(option.id);
        return (
          <label className={`option ${checked ? 'selected' : ''}`} key={option.id}>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={question.id}
              checked={checked}
              onChange={() => toggle(option.id)}
            />
            <span className="option-letter">{String.fromCharCode(65 + index)}</span>
            <RichContent content={option.content} assets={assets} />
          </label>
        );
      })}
    </fieldset>
  );
};

const WrittenQuestion = ({ question, value, onChange, disabled }) => {
  const essay = question.type === 'ESSAY';
  const inputMode = question.type === 'SHORT_NUMBER' ? 'decimal' : 'text';
  const placeholder = question.type === 'SHORT_NUMBER' ? 'Nhập một số' : 'Nhập câu trả lời';
  return (
    <label className="short-answer">
      <span>Câu trả lời của em</span>
      {essay ? (
        <textarea disabled={disabled} rows="7" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      ) : (
        <input disabled={disabled} inputMode={inputMode} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
};

const BooleanQuestion = ({ question, value, onChange, disabled }) => {
  const statementCount = question.responseConfig?.statementCount || 1;
  const values = statementCount === 1
    ? [typeof value === 'boolean' ? value : null]
    : (Array.isArray(value) ? value : Array(statementCount).fill(null));
  const update = (index, nextValue) => {
    if (statementCount === 1) return onChange(nextValue);
    const next = [...values];
    next[index] = nextValue;
    onChange(next);
  };

  return (
    <div className="boolean-responses">
      {values.map((current, index) => (
        <fieldset className="options boolean-row" disabled={disabled} key={index}>
          <legend>{statementCount === 1 ? 'Chọn Đúng hoặc Sai' : `Mệnh đề ${index + 1}`}</legend>
          {[{ value: true, label: 'Đúng' }, { value: false, label: 'Sai' }].map((option) => (
            <label className={`option ${current === option.value ? 'selected' : ''}`} key={option.label}>
              <input
                type="radio"
                name={`${question.id}-${index}`}
                checked={current === option.value}
                onChange={() => update(index, option.value)}
              />
              <span className="option-letter">{option.value ? 'Đ' : 'S'}</span>
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
};

const StudentQuestion = ({ question, assets, value, onChange, disabled }) => (
  <article className="question-card" id={`published-${question.id}`}>
    <div className="question-heading">
      <span className="question-number">Câu {question.order}</span>
      <span>{question.points} điểm</span>
    </div>
    <RichContent content={question.content} assets={assets} />
    {question.type === 'TRUE_FALSE' && question.options.length === 0 ? (
      <BooleanQuestion question={question} value={value} onChange={onChange} disabled={disabled} />
    ) : ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(question.type) && question.options.length > 0 ? (
      <ChoiceQuestion question={question} assets={assets} value={value} onChange={onChange} disabled={disabled} />
    ) : (
      <WrittenQuestion question={question} value={value} onChange={onChange} disabled={disabled} />
    )}
  </article>
);

const outcomeLabel = {
  CORRECT: 'Đúng',
  INCORRECT: 'Chưa đúng',
  PARTIAL: 'Đúng một phần',
  UNANSWERED: 'Chưa trả lời',
  PENDING_MANUAL: 'Chờ chấm thủ công'
};

const formatCorrectAnswer = (question, answer) => {
  if (!answer) return 'Không công khai';
  if (answer.correctOptionIds) {
    return answer.correctOptionIds.map((id) => {
      const index = question?.options.findIndex((option) => option.id === id) ?? -1;
      return index >= 0 ? String.fromCharCode(65 + index) : id;
    }).join(', ');
  }
  if (answer.correctValues) return answer.correctValues.map((value) => value ? 'Đúng' : 'Sai').join(', ');
  if (answer.numericValue !== undefined) return `${answer.numericValue} (sai số ±${answer.tolerance})`;
  if (answer.acceptedValues) return answer.acceptedValues.join(' / ');
  return 'Không công khai';
};

const ResultPanel = ({ result, questions }) => (
  <section className={`result-panel ${result.scoringState === 'PENDING' ? 'pending' : 'final'}`}>
    <div>
      <p className="eyebrow">{result.scoringState === 'FINAL' ? 'Kết quả đã chốt' : 'Đang chờ chấm tự luận'}</p>
      <h2>{result.scoringState === 'FINAL'
        ? `${result.summary.earnedPoints}/${result.summary.possiblePoints} điểm`
        : `${result.summary.autoAwardedPoints} điểm tự động · ${result.summary.pendingManualCount} câu chờ chấm`}</h2>
      <p>Scoring version: <code>{result.scoringVersion}</code>. Điểm số không phải kết luận năng lực.</p>
    </div>
    <div className="reveal-policy">
      <strong>{result.revealPolicy.correctAnswers ? 'Đáp án đã được mở' : 'Đáp án chưa được mở'}</strong>
      <span>{result.revealPolicy.reason}</span>
    </div>
    {result.questions && (
      <ol className="result-questions">
        {result.questions.map((item) => {
          const question = questions.find((candidate) => candidate.versionId === item.questionVersionId);
          return (
            <li key={item.questionVersionId}>
              <span>Câu {question?.order || '—'}</span>
              <strong>{outcomeLabel[item.outcome] || item.outcome} · {item.awardedPoints}/{item.maxPoints}</strong>
              <small>Đáp án đúng: {formatCorrectAnswer(question, item.correctAnswer)}</small>
            </li>
          );
        })}
      </ol>
    )}
  </section>
);

export default function StudentExamView({ exam, attempt, onAttemptChange }) {
  const attemptId = attempt?.id;
  const [answers, setAnswers] = useState(attempt?.responses || {});
  const [revision, setRevision] = useState(attempt?.answerRevision || 0);
  const [saveStatus, setSaveStatus] = useState(attemptId ? 'saved' : 'preview');
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const answersRef = useRef(answers);
  const revisionRef = useRef(revision);
  const dirtyRef = useRef(new Set());
  const pendingRequestRef = useRef(null);
  const savingRef = useRef(false);
  const timerRef = useRef(null);
  const saveFunctionRef = useRef(null);
  const submitKeyRef = useRef(null);
  const questions = useMemo(() => exam.sections.flatMap((section) => (
    section.groups.flatMap((group) => group.questions)
  )), [exam]);
  const closed = attempt && attempt.status !== 'IN_PROGRESS';

  const applyDraft = (next) => {
    answersRef.current = next;
    setAnswers(next);
  };

  useEffect(() => {
    const initialAnswers = attempt?.responses || {};
    applyDraft(initialAnswers);
    revisionRef.current = attempt?.answerRevision || 0;
    setRevision(revisionRef.current);
    dirtyRef.current = new Set();
    pendingRequestRef.current = null;
    setSaveStatus(attemptId ? 'saved' : 'preview');
    setSaveError('');
    setResult(null);
    submitKeyRef.current = null;
  }, [attemptId]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!attemptId || attempt.status === 'IN_PROGRESS') return undefined;
    const controller = new AbortController();
    fetch(`/api/attempts/${encodeURIComponent(attemptId)}/result`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw await responseError(response, 'Không tải được kết quả.');
        return response.json();
      })
      .then(setResult)
      .catch((error) => {
        if (error.name !== 'AbortError') setSaveError(error.message);
      });
    return () => controller.abort();
  }, [attemptId, attempt?.status]);

  const reloadAfterConflict = useCallback(async () => {
    const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}`);
    if (!response.ok) throw await responseError(response, 'Không thể đồng bộ revision mới nhất.');
    const serverAttempt = await response.json();
    revisionRef.current = serverAttempt.answerRevision;
    setRevision(serverAttempt.answerRevision);
    const local = answersRef.current;
    const merged = { ...serverAttempt.responses };
    dirtyRef.current.forEach((id) => { merged[id] = local[id]; });
    applyDraft(merged);
    onAttemptChange?.(serverAttempt);
  }, [attemptId, onAttemptChange]);

  const performSave = useCallback(async () => {
    if (!attemptId || closed || savingRef.current) return !savingRef.current;
    if (!pendingRequestRef.current) {
      const ids = [...dirtyRef.current];
      if (ids.length === 0) {
        setSaveStatus('saved');
        return true;
      }
      pendingRequestRef.current = {
        key: crypto.randomUUID(),
        ids,
        body: {
          baseRevision: revisionRef.current,
          responses: ids.map((questionVersionId) => ({
            questionVersionId,
            answer: answersRef.current[questionVersionId] ?? null
          }))
        }
      };
    }
    const pending = pendingRequestRef.current;
    savingRef.current = true;
    setSaveStatus('saving');
    setSaveError('');
    try {
      const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}/responses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': pending.key,
          ...csrfHeaders()
        },
        body: JSON.stringify(pending.body)
      });
      if (!response.ok) throw await responseError(response, 'Không thể autosave.');
      const body = await response.json();
      revisionRef.current = body.answerRevision;
      setRevision(body.answerRevision);
      const local = answersRef.current;
      pending.ids.forEach((id) => {
        const sent = pending.body.responses.find((item) => item.questionVersionId === id)?.answer ?? null;
        if (sameValue(local[id] ?? null, sent)) dirtyRef.current.delete(id);
      });
      const merged = { ...body.responses };
      dirtyRef.current.forEach((id) => { merged[id] = local[id]; });
      applyDraft(merged);
      pendingRequestRef.current = null;
      setSaveStatus(dirtyRef.current.size > 0 ? 'dirty' : 'saved');
      onAttemptChange?.({
        ...attempt,
        responses: body.responses,
        answerRevision: body.answerRevision,
        lastSavedAt: body.lastSavedAt
      });
      if (dirtyRef.current.size > 0) {
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => saveFunctionRef.current?.(), 350);
      }
      return true;
    } catch (error) {
      if (error.code === 'ATTEMPT_REVISION_CONFLICT') {
        pendingRequestRef.current = null;
        try {
          await reloadAfterConflict();
          setSaveStatus('dirty');
          setSaveError('Đã hợp nhất bản server mới hơn; đang lưu lại thay đổi của em.');
          window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => saveFunctionRef.current?.(), 350);
        } catch (reloadError) {
          setSaveStatus('error');
          setSaveError(reloadError.message);
        }
      } else {
        setSaveStatus('error');
        setSaveError(error.message);
      }
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [attempt, attemptId, closed, onAttemptChange, reloadAfterConflict]);

  useEffect(() => { saveFunctionRef.current = performSave; }, [performSave]);

  const scheduleSave = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => saveFunctionRef.current?.(), 800);
  };

  const changeAnswer = (questionVersionId, value) => {
    const next = { ...answersRef.current, [questionVersionId]: value };
    applyDraft(next);
    if (!attemptId || closed) return;
    dirtyRef.current.add(questionVersionId);
    setSaveStatus('dirty');
    setSaveError('');
    scheduleSave();
  };

  const submitAttempt = async () => {
    if (!attemptId || closed || submitting || savingRef.current) return;
    if (!window.confirm('Nộp bài ngay? Sau khi nộp, em không thể sửa câu trả lời.')) return;
    setSubmitting(true);
    setSaveError('');
    window.clearTimeout(timerRef.current);
    try {
      if (dirtyRef.current.size > 0 || pendingRequestRef.current) {
        const saved = await performSave();
        if (!saved || dirtyRef.current.size > 0 || pendingRequestRef.current) {
          throw new Error('Cần autosave thành công trước khi nộp bài.');
        }
      }
      if (!submitKeyRef.current) submitKeyRef.current = crypto.randomUUID();
      const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submitKeyRef.current,
          ...csrfHeaders()
        },
        body: JSON.stringify({ baseRevision: revisionRef.current })
      });
      if (!response.ok) throw await responseError(response, 'Không thể nộp bài.');
      const body = await response.json();
      setResult(body.result);
      setSaveStatus('submitted');
      onAttemptChange?.(body.attempt);
    } catch (error) {
      setSaveError(error.message);
      setSaveStatus(dirtyRef.current.size > 0 || pendingRequestRef.current ? 'error' : 'saved');
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = questions.filter((question) => hasAnswer(answers[question.versionId])).length;
  const statusText = {
    preview: 'Bản xem trước — chưa lưu',
    dirty: 'Có thay đổi chưa được server xác nhận',
    saving: 'Đang lưu lên server…',
    saved: `Đã lưu trên server · revision ${revision}`,
    error: 'Chưa lưu được — cần thử lại',
    submitted: 'Đã nộp bài'
  }[saveStatus];

  return (
    <section className="published-player" aria-label={`Đề ${exam.title}`}>
      <div className="player-heading">
        <div>
          <p className="eyebrow">{attemptId ? (closed ? 'Attempt đã đóng' : 'Attempt đang làm') : 'Bản xem trước an toàn'}</p>
          <h2>{exam.title}</h2>
          <p>{exam.description}</p>
        </div>
        <dl className="player-meta">
          <div><dt>Lớp</dt><dd>{exam.grade}</dd></div>
          <div><dt>Môn</dt><dd>{exam.subject}</dd></div>
          <div><dt>Thời lượng</dt><dd>{exam.durationMinutes} phút</dd></div>
        </dl>
      </div>
      <div className="player-progress">
        <span>Đã trả lời {answeredCount}/{questions.length} câu</span>
        <progress value={answeredCount} max={questions.length}>Đã làm {answeredCount} câu</progress>
        <span className={`save-indicator ${saveStatus}`} role="status">{statusText}</span>
      </div>

      {result && <ResultPanel result={result} questions={questions} />}
      {saveError && <div className="player-save-error" role="alert">
        <span>{saveError}</span>
        {!closed && saveStatus === 'error' && (pendingRequestRef.current || dirtyRef.current.size > 0) && (
          <button type="button" onClick={performSave}>Thử lưu lại</button>
        )}
      </div>}

      <div className="player-document">
        {exam.sections.map((section) => (
          <section className="exam-section" key={section.id}>
            <div className="section-heading">
              <span>{section.title}</span>
              <RichContent content={section.instruction} assets={exam.assets} />
            </div>
            {section.groups.map((group) => {
              const stimulus = exam.stimuli.find((item) => item.id === group.stimulusVersionId);
              return (
                <div className="question-group" key={group.id}>
                  {stimulus && (
                    <article className="stimulus-card">
                      <div className="stimulus-label">Dữ kiện chung · {group.questions.length} câu</div>
                      <h2>{stimulus.title}</h2>
                      <RichContent content={stimulus.content} assets={exam.assets} />
                    </article>
                  )}
                  {group.questions.map((question) => (
                    <StudentQuestion
                      key={question.id}
                      question={question}
                      assets={exam.assets}
                      value={answers[question.versionId]}
                      disabled={Boolean(closed || submitting)}
                      onChange={(value) => changeAnswer(question.versionId, value)}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="player-actions">
        <div>
          <strong>{attemptId ? `Attempt ${attemptId}` : 'Bản xem trước công khai'}</strong>
          <span>{attemptId ? 'Chỉ câu trả lời được server ACK mới được dùng khi nộp.' : 'Đăng nhập Student để autosave và nộp bài.'}</span>
        </div>
        {attemptId && !closed && (
          <button className="primary-button" type="button" onClick={submitAttempt} disabled={submitting || saveStatus === 'saving'}>
            {submitting ? 'Đang nộp bài…' : 'Nộp bài'}
          </button>
        )}
      </div>
    </section>
  );
}
