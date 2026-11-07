import { useEffect, useRef, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import StudentExamView from './StudentExamView.jsx';
import { csrfHeaders, hasRole } from './auth.js';

const parseError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return Object.assign(new Error(body.message || fallback), { code: body.code, details: body.details });
};

const quotaMap = (input) => Object.fromEntries(String(input).split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
  const [key, count] = item.split('=').map((part) => part.trim());
  if (!key || !/^\d+$/.test(count || '')) throw new Error(`Quota "${item}" phải có dạng KEY=COUNT.`);
  return [key, Number(count)];
}));

const lastRunKey = (userId) => `eduassess:assembly:last:${userId}`;

export default function AssemblyLab({ authUser, onLogin }) {
  const canAssemble = hasRole(authUser, 'CONTENT_EDITOR', 'SUPER_ADMIN');
  const [form, setForm] = useState({
    title: '[DEMO] Đề luyện tập assembled',
    grade: '5',
    subject: 'Toán',
    curriculumVersion: 'vn-2018',
    purpose: 'PRACTICE',
    durationMinutes: '30',
    seed: 'assembly-demo-001',
    count: '3',
    questionTypes: 'SINGLE_CHOICE=3',
    topics: 'geometry=3',
    skills: 'reasoning=3',
    difficulties: 'MEDIUM=3',
    minSources: '2',
    maxPerSource: '2',
    minPoints: '3',
    maxPoints: '6'
  });
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const pendingRef = useRef(null);

  useEffect(() => {
    setRun(null);
    setError('');
    pendingRef.current = null;
  }, [authUser?.id]);

  useEffect(() => {
    if (!canAssemble || !authUser?.id) return undefined;
    let id;
    try { id = window.sessionStorage.getItem(lastRunKey(authUser.id)); } catch { return undefined; }
    if (!id) return undefined;
    const controller = new AbortController();
    setRestoring(true);
    fetch(`/api/assemblies/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          try { window.sessionStorage.removeItem(lastRunKey(authUser.id)); } catch { /* Ignore unavailable storage. */ }
          return null;
        }
        if (!response.ok) throw await parseError(response, 'Không khôi phục được assembly run.');
        return response.json();
      })
      .then((body) => { if (body) setRun(body); })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => setRestoring(false));
    return () => controller.abort();
  }, [authUser?.id, canAssemble]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    pendingRef.current = null;
  };

  const assemble = async (event) => {
    event.preventDefault();
    setError('');
    let body;
    try {
      body = {
        seed: form.seed.trim(),
        blueprint: {
          schemaVersion: '1.0.0',
          title: form.title.trim(),
          description: 'Snapshot kỹ thuật từ approved, licensed question pool.',
          grade: Number(form.grade),
          subject: form.subject.trim(),
          curriculumVersion: form.curriculumVersion.trim(),
          purpose: form.purpose,
          durationMinutes: Number(form.durationMinutes),
          sourceDiversity: {
            minSources: Number(form.minSources),
            maxQuestionsPerSource: Number(form.maxPerSource)
          },
          pointRange: { min: Number(form.minPoints), max: Number(form.maxPoints) },
          acceptedOriginTypes: ['AI_GENERATED', 'OFFICIAL_IMPORTED', 'HUMAN_AUTHORED', 'PARTNER_PROVIDED'],
          sections: [{
            id: 'section-assembled-1',
            title: 'Phần I — Câu hỏi được chọn theo blueprint',
            count: Number(form.count),
            quotas: {
              questionTypes: quotaMap(form.questionTypes),
              topics: quotaMap(form.topics),
              skills: quotaMap(form.skills),
              difficulties: quotaMap(form.difficulties)
            }
          }]
        }
      };
    } catch (parseFailure) {
      setError(parseFailure.message);
      return;
    }
    const serialized = JSON.stringify(body);
    if (!pendingRef.current || pendingRef.current.serialized !== serialized) {
      pendingRef.current = { serialized, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/assemblies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': pendingRef.current.key,
          ...csrfHeaders()
        },
        body: serialized
      });
      if (!response.ok) throw await parseError(response, 'Không thể tạo assembly snapshot.');
      const created = await response.json();
      setRun(created);
      try { window.sessionStorage.setItem(lastRunKey(authUser.id), created.id); } catch { /* Server remains authoritative. */ }
    } catch (requestError) {
      const detail = requestError.details ? ` ${JSON.stringify(requestError.details)}` : '';
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}${detail}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (authUser === undefined) return <main className="assembly-page"><div className="catalog-state">Đang xác minh phiên…</div></main>;
  if (!authUser) return <main className="assembly-page"><AuthPanel mode="content" onLogin={onLogin} /></main>;
  if (!canAssemble) return <main className="assembly-page"><div className="catalog-state"><strong>Không có quyền assembly.</strong><span>Cần role CONTENT_EDITOR hoặc SUPER_ADMIN.</span></div></main>;

  return (
    <main className="assembly-page">
      <section className="assembly-hero">
        <div>
          <p className="eyebrow">Deterministic Assembly Lab</p>
          <h1>Tạo một snapshot có thể tái hiện, không phá quota khi pool thiếu.</h1>
        </div>
        <p>Chỉ câu đã publish, có metadata đầy đủ và license cho derivative assembly mới vào pool. Kết quả này là preview kỹ thuật, chưa được đưa vào catalog Student.</p>
      </section>

      <div className="assembly-layout">
        <form className="assembly-form" onSubmit={assemble}>
          <h2>Blueprint 1.0.0</h2>
          <label><span>Tiêu đề</span><input value={form.title} onChange={update('title')} /></label>
          <div className="assembly-form-row">
            <label><span>Lớp</span><input type="number" min="1" max="12" value={form.grade} onChange={update('grade')} /></label>
            <label><span>Môn</span><input value={form.subject} onChange={update('subject')} /></label>
          </div>
          <div className="assembly-form-row">
            <label><span>Chương trình</span><input value={form.curriculumVersion} onChange={update('curriculumVersion')} /></label>
            <label><span>Mục đích</span><select value={form.purpose} onChange={update('purpose')}><option>PRACTICE</option><option>MOCK_EXAM</option><option>DIAGNOSTIC</option></select></label>
          </div>
          <div className="assembly-form-row triple">
            <label><span>Số câu</span><input type="number" min="1" value={form.count} onChange={update('count')} /></label>
            <label><span>Phút</span><input type="number" min="1" value={form.durationMinutes} onChange={update('durationMinutes')} /></label>
            <label><span>Seed</span><input value={form.seed} onChange={update('seed')} /></label>
          </div>
          <fieldset className="quota-fields">
            <legend>Quota — định dạng KEY=COUNT, phân cách bằng dấu phẩy</legend>
            <label><span>Loại câu</span><input value={form.questionTypes} onChange={update('questionTypes')} /></label>
            <label><span>Chủ đề</span><input value={form.topics} onChange={update('topics')} /></label>
            <label><span>Kỹ năng</span><input value={form.skills} onChange={update('skills')} /></label>
            <label><span>Độ khó</span><input value={form.difficulties} onChange={update('difficulties')} /></label>
          </fieldset>
          <div className="assembly-form-row triple">
            <label><span>Nguồn tối thiểu</span><input type="number" min="2" value={form.minSources} onChange={update('minSources')} /></label>
            <label><span>Tối đa / nguồn</span><input type="number" min="1" value={form.maxPerSource} onChange={update('maxPerSource')} /></label>
            <label><span>Điểm min–max</span><span className="range-inputs"><input type="number" min="0" step="0.25" value={form.minPoints} onChange={update('minPoints')} /><input type="number" min="0" step="0.25" value={form.maxPoints} onChange={update('maxPoints')} /></span></label>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Đang giải constraints…' : 'Tạo immutable snapshot'}</button>
        </form>

        <aside className="assembly-evidence">
          <p className="eyebrow">Bằng chứng run</p>
          {restoring && <p>Đang khôi phục run gần nhất…</p>}
          {!run && !restoring && <p>Chưa có run. Nếu pool không đủ, API trả lỗi có cấu trúc thay vì đổi quota.</p>}
          {run && <>
            <h2>{run.status}</h2>
            <dl>
              <div><dt>Engine</dt><dd><code>{run.engineVersion}</code></dd></div>
              <div><dt>Seed</dt><dd><code>{run.seed}</code></dd></div>
              <div><dt>Selection hash</dt><dd><code>{run.selectionSha256.slice(0, 16)}…</code></dd></div>
              <div><dt>Snapshot hash</dt><dd><code>{run.snapshotSha256.slice(0, 16)}…</code></dd></div>
            </dl>
            <h3>Phân bố nguồn</h3>
            <ul>{Object.entries(run.sourceDistribution).map(([sourceId, count]) => <li key={sourceId}><code>{sourceId}</code><span>{count} câu</span></li>)}</ul>
          </>}
        </aside>
      </div>

      {run?.snapshot && (
        <StudentExamView
          key={run.id}
          exam={run.snapshot}
          attempt={null}
          previewLabel="Assembly technical preview"
          previewMessage="Chỉ creator Editor/Admin xem được; snapshot này chưa publish và không thể nộp bài."
        />
      )}
    </main>
  );
}
