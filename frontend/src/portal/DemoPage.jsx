import { useEffect, useState } from 'react';
import StudentExamView from '../StudentExamView.jsx';
import Icon from './Icon.jsx';

export default function DemoPage({ navigate }) {
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/exams/demo-fixed', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Không tải được bài DEMO.');
      return response.json();
    }).then(setExam).catch((requestError) => { if (requestError.name !== 'AbortError') setError(requestError.message); });
    return () => controller.abort();
  }, []);
  return <main className="portal-demo-page"><div className="portal-demo-intro"><div><span className="portal-kicker">Bài DEMO kỹ thuật</span><h1>{exam?.title || 'Khám phá bài luyện tập'}</h1><p>Bố cục đề, hình, công thức và dữ kiện chung được trình bày như học sinh sẽ nhìn thấy. Câu trả lời tại trang DEMO chỉ nằm trong phiên trình duyệt này.</p></div><button className="portal-button portal-button-outline" type="button" onClick={() => navigate('/workspace/catalog')}>Xem kho đề thật<Icon name="arrow" size={17} /></button></div>
    {error && <div className="portal-panel-state is-error" role="alert">{error}</div>}
    {!exam && !error && <div className="portal-panel-state" role="status"><span className="portal-spinner" /> Đang chuẩn bị đề…</div>}
    {exam && <StudentExamView exam={exam} attempt={null} previewLabel="Bài DEMO kỹ thuật" previewMessage="Câu trả lời chỉ được giữ trong phiên trình duyệt này. Đăng nhập Student và mở kho đề để lưu trên server." />}
  </main>;
}
