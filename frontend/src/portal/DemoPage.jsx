import { useEffect, useMemo, useState } from 'react';
import RichContent from '../RichContent.jsx';
import Icon from './Icon.jsx';

function DemoQuestion({ question, assets, value, onChange }) {
  const multiple = question.type === 'MULTIPLE_CHOICE';
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (id) => onChange(multiple ? (selected.includes(id) ? selected.filter((current) => current !== id) : [...selected, id]) : id);
  return <article className="portal-demo-question" id={question.id}><div className="portal-demo-question-top"><span>Câu {question.order}</span><small>{question.points} điểm</small></div><RichContent content={question.content} assets={assets} />
    {question.type === 'SHORT_NUMBER' ? <label className="portal-demo-number">Câu trả lời của em<input inputMode="decimal" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="Nhập một số" /></label> : <fieldset className="portal-demo-options"><legend>{multiple ? 'Có thể chọn nhiều đáp án' : 'Chọn một đáp án'}</legend>{question.options.map((option, index) => <label key={option.id} className={selected.includes(option.id) ? 'selected' : ''}><input type={multiple ? 'checkbox' : 'radio'} name={question.id} checked={selected.includes(option.id)} onChange={() => toggle(option.id)} /><span>{String.fromCharCode(65 + index)}</span><RichContent content={option.content} assets={assets} /></label>)}</fieldset>}
  </article>;
}

export default function DemoPage({ navigate }) {
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/exams/demo-fixed', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Không tải được bài DEMO.');
      return response.json();
    }).then(setExam).catch((requestError) => { if (requestError.name !== 'AbortError') setError(requestError.message); });
    return () => controller.abort();
  }, []);
  const questions = useMemo(() => exam?.sections.flatMap((section) => section.groups.flatMap((group) => group.questions)) || [], [exam]);
  const answered = questions.filter((question) => { const answer = answers[question.id]; return Array.isArray(answer) ? answer.length > 0 : String(answer || '').trim().length > 0; }).length;
  return <main className="portal-demo-page"><div className="portal-demo-intro"><div><span className="portal-kicker">Bài DEMO kỹ thuật</span><h1>{exam?.title || 'Khám phá bài luyện tập'}</h1><p>Bố cục đề, hình, công thức và dữ kiện chung được trình bày như học sinh sẽ nhìn thấy. Câu trả lời tại trang DEMO chỉ nằm trong phiên trình duyệt này.</p></div><button className="portal-button portal-button-outline" type="button" onClick={() => navigate('/workspace/catalog')}>Xem kho đề thật<Icon name="arrow" size={17} /></button></div>
    {error && <div className="portal-panel-state is-error" role="alert">{error}</div>}
    {!exam && !error && <div className="portal-panel-state" role="status"><span className="portal-spinner" /> Đang chuẩn bị đề…</div>}
    {exam && <div className="portal-demo-layout"><aside className="portal-demo-aside"><div className="portal-demo-sticky"><span className="portal-kicker">Tiến độ DEMO</span><strong>{answered}/{questions.length} câu</strong><progress value={answered} max={questions.length} /><div className="portal-demo-jump">{questions.map((question) => <a href={`#${question.id}`} key={question.id} className={answers[question.id] ? 'answered' : ''} aria-label={`Đến câu ${question.order}`}>{question.order}</a>)}</div><button className="portal-button portal-button-primary" type="button" onClick={() => setNotice(`Đã giữ ${answered}/${questions.length} câu trong phiên trình duyệt DEMO.`)}>Ghi nhận tiến độ</button><p>Đáp án và lời giải không nằm trong dữ liệu hiển thị cho học sinh.</p>{notice && <p className="portal-demo-notice" role="status">{notice}</p>}</div></aside><div className="portal-demo-sections">{exam.sections.map((section) => <section key={section.id}><header><h2>{section.title}</h2><RichContent content={section.instruction} assets={exam.assets} /></header>{section.groups.map((group) => { const stimulus = exam.stimuli.find((item) => item.id === group.stimulusVersionId); return <div key={group.id}>{stimulus && <article className="portal-demo-stimulus"><span>Dữ kiện chung · {group.questions.length} câu</span><h3>{stimulus.title}</h3><RichContent content={stimulus.content} assets={exam.assets} /></article>}{group.questions.map((question) => <DemoQuestion key={question.id} question={question} assets={exam.assets} value={answers[question.id]} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} />)}</div>; })}</section>)}<p className="portal-demo-footer">Bài này chỉ minh họa giao diện rich content. Để làm bài có lưu và chấm điểm phía server, hãy vào kho đề đã xuất bản.</p></div></div>}
  </main>;
}
