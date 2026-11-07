import { useMemo, useState } from 'react';
import RichContent from './RichContent.jsx';

const ChoiceQuestion = ({ question, assets, value, onChange }) => {
  const multiple = question.type === 'MULTIPLE_CHOICE';
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (optionId) => onChange(multiple
    ? (selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId])
    : optionId);

  return (
    <fieldset className="options">
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

const WrittenQuestion = ({ question, value, onChange }) => {
  const essay = question.type === 'ESSAY';
  const inputMode = question.type === 'SHORT_NUMBER' ? 'decimal' : 'text';
  const placeholder = question.type === 'SHORT_NUMBER' ? 'Nhập một số' : 'Nhập câu trả lời';
  return (
    <label className="short-answer">
      <span>Câu trả lời của em</span>
      {essay ? (
        <textarea rows="7" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      ) : (
        <input inputMode={inputMode} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
};

const BooleanQuestion = ({ question, value, onChange }) => (
  <fieldset className="options">
    <legend>Chọn Đúng hoặc Sai</legend>
    {[{ value: true, label: 'Đúng' }, { value: false, label: 'Sai' }].map((option) => (
      <label className={`option ${value === option.value ? 'selected' : ''}`} key={option.label}>
        <input
          type="radio"
          name={question.id}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
        />
        <span className="option-letter">{option.value ? 'Đ' : 'S'}</span>
        <span>{option.label}</span>
      </label>
    ))}
  </fieldset>
);

const StudentQuestion = ({ question, assets, value, onChange }) => (
  <article className="question-card" id={`published-${question.id}`}>
    <div className="question-heading">
      <span className="question-number">Câu {question.order}</span>
      <span>{question.points} điểm</span>
    </div>
    <RichContent content={question.content} assets={assets} />
    {question.type === 'TRUE_FALSE' && question.options.length === 0 ? (
      <BooleanQuestion question={question} value={value} onChange={onChange} />
    ) : ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(question.type) && question.options.length > 0 ? (
      <ChoiceQuestion question={question} assets={assets} value={value} onChange={onChange} />
    ) : (
      <WrittenQuestion question={question} value={value} onChange={onChange} />
    )}
  </article>
);

export default function StudentExamView({ exam, attemptId }) {
  const [answers, setAnswers] = useState({});
  const questions = useMemo(() => exam.sections.flatMap((section) => (
    section.groups.flatMap((group) => group.questions)
  )), [exam]);
  const answeredCount = questions.filter((question) => {
    const answer = answers[question.id];
    if (typeof answer === 'boolean') return true;
    return Array.isArray(answer) ? answer.length > 0 : String(answer || '').trim().length > 0;
  }).length;

  return (
    <section className="published-player" aria-label={`Đề ${exam.title}`}>
      <div className="player-heading">
        <div>
          <p className="eyebrow">{attemptId ? 'Attempt đang làm' : 'Bản xem trước an toàn'}</p>
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
      </div>

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
                      value={answers[question.id]}
                      onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="player-scope-note">
        {attemptId
          ? <>Attempt <code>{attemptId}</code> đã giữ snapshot bất biến. Autosave và nộp bài sẽ được mở ở lát cắt tiếp theo.</>
          : 'Bản xem trước không chứa đáp án hoặc lời giải. Đăng nhập bằng tài khoản Student để tạo attempt.'}
      </div>
    </section>
  );
}
