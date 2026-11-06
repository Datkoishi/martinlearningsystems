import { useEffect, useMemo, useState } from 'react';
import RichContent from './RichContent.jsx';

const LoadingState = ({ message }) => (
  <div className="loading-state" role="status">
    <span className="loader" aria-hidden="true" />
    <p>{message}</p>
  </div>
);

const Question = ({ question, assets, value, onChange }) => {
  const isMultiple = question.type === 'MULTIPLE_CHOICE';
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggleOption = (optionId) => {
    if (!isMultiple) return onChange(optionId);
    onChange(selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]);
  };

  return (
    <article className="question-card" id={question.id}>
      <div className="question-heading">
        <span className="question-number">Câu {question.order}</span>
        <span>{question.points} điểm</span>
      </div>
      <RichContent content={question.content} assets={assets} />

      {question.type === 'SHORT_NUMBER' ? (
        <label className="short-answer">
          <span>Câu trả lời của em</span>
          <input
            inputMode="decimal"
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Nhập một số"
          />
        </label>
      ) : (
        <fieldset className="options">
          <legend>{isMultiple ? 'Có thể chọn nhiều đáp án' : 'Chọn một đáp án'}</legend>
          {question.options.map((option, index) => {
            const checked = selected.includes(option.id);
            return (
              <label className={`option ${checked ? 'selected' : ''}`} key={option.id}>
                <input
                  type={isMultiple ? 'checkbox' : 'radio'}
                  name={question.id}
                  checked={checked}
                  onChange={() => toggleOption(option.id)}
                />
                <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                <RichContent content={option.content} assets={assets} />
              </label>
            );
          })}
        </fieldset>
      )}
    </article>
  );
};

export default function App() {
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/exams/demo-fixed', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Không tải được đề minh họa.');
        return response.json();
      })
      .then(setExam)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });
    return () => controller.abort();
  }, []);

  const allQuestions = useMemo(() => exam?.sections.flatMap((section) => (
    section.groups.flatMap((group) => group.questions)
  )) || [], [exam]);
  const answeredCount = allQuestions.filter((question) => {
    const answer = answers[question.id];
    return Array.isArray(answer) ? answer.length > 0 : String(answer || '').trim().length > 0;
  }).length;

  const saveDraft = () => {
    setNotice(`Đã giữ ${answeredCount}/${allQuestions.length} câu trong phiên trình duyệt DEMO.`);
    window.setTimeout(() => setNotice(''), 3200);
  };

  if (error) {
    return (
      <main className="center-page">
        <section className="error-panel">
          <p className="eyebrow">Không thể mở bài</p>
          <h1>Kết nối API chưa sẵn sàng</h1>
          <p>{error} Hãy khởi động backend tại cổng 3000 rồi tải lại trang.</p>
        </section>
      </main>
    );
  }

  if (!exam) return <main className="center-page"><LoadingState message="Đang chuẩn bị đề DEMO…" /></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="EduAssess — đầu trang">
          <span className="brand-mark">E</span>
          <span><strong>EduAssess</strong><small>Martin Learning Systems</small></span>
        </a>
        <div className="demo-badge">BẢN DEMO KỸ THUẬT</div>
      </header>

      <main className="exam-layout" id="top">
        <aside className="exam-sidebar">
          <div className="sidebar-sticky">
            <p className="eyebrow">Bài luyện tập</p>
            <h1>{exam.title}</h1>
            <p className="exam-description">{exam.description}</p>
            <dl className="exam-meta">
              <div><dt>Lớp</dt><dd>{exam.grade}</dd></div>
              <div><dt>Môn</dt><dd>{exam.subject}</dd></div>
              <div><dt>Thời lượng</dt><dd>{exam.durationMinutes} phút</dd></div>
              <div><dt>Chế độ</dt><dd>Giữ nguyên</dd></div>
            </dl>

            <div className="progress-block">
              <div><span>Tiến độ</span><strong>{answeredCount}/{allQuestions.length}</strong></div>
              <progress value={answeredCount} max={allQuestions.length}>Đã làm {answeredCount} câu</progress>
            </div>

            <nav className="question-nav" aria-label="Điều hướng câu hỏi">
              {allQuestions.map((question) => (
                <a className={answers[question.id] ? 'answered' : ''} href={`#${question.id}`} key={question.id}>
                  {question.order}
                </a>
              ))}
            </nav>

            <button className="primary-button" type="button" onClick={saveDraft}>Lưu bản nháp DEMO</button>
            <p className="privacy-note">Đáp án và lời giải không có trong payload dành cho học sinh.</p>
          </div>
        </aside>

        <div className="exam-content">
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
                      <Question
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
          <footer className="exam-footer">
            <strong>Đây là dữ liệu DEMO.</strong> Chức năng nộp bài, chấm điểm và autosave phía server sẽ được triển khai ở vertical slice tiếp theo.
          </footer>
        </div>
      </main>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
