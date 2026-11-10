import { useCallback, useEffect, useRef, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import AssemblyReviewPanel from './AssemblyReviewPanel.jsx';
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
const quotaText = (value = {}) => Object.entries(value).map(([key, count]) => `${key}=${count}`).join(', ');

export default function AssemblyLab({ authUser, onLogin }) {
  const canAssemble = hasRole(authUser, 'CONTENT_EDITOR', 'SUPER_ADMIN');
  const canReview = hasRole(authUser, 'ACADEMIC_REVIEWER', 'SUPER_ADMIN');
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
  const [revisionSource, setRevisionSource] = useState(null);
  const [queue, setQueue] = useState({ items: [], total: 0, page: 1, limit: 20, nextPage: null });
  const [queueFilters, setQueueFilters] = useState({ status: '', purpose: '', query: '' });
  const [queueLoading, setQueueLoading] = useState(false);
  const pendingRef = useRef(null);

  const loadQueue = useCallback(async (page = 1) => {
    if (!canAssemble) return;
    setQueueLoading(true);
    try {
      const parameters = new URLSearchParams({ page: String(page), limit: '20' });
      if (queueFilters.status) parameters.set('status', queueFilters.status);
      if (queueFilters.purpose) parameters.set('purpose', queueFilters.purpose);
      if (queueFilters.query.trim()) parameters.set('q', queueFilters.query.trim());
      const response = await fetch(`/api/assemblies?${parameters}`);
      if (!response.ok) throw await parseError(response, 'Không tải được danh sách Blueprint.');
      setQueue(await response.json());
    } catch (requestError) {
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}`);
    } finally {
      setQueueLoading(false);
    }
  }, [canAssemble, queueFilters]);

  useEffect(() => {
    setRun(null);
    setError('');
    setRevisionSource(null);
    setQueue({ items: [], total: 0, page: 1, limit: 20, nextPage: null });
    pendingRef.current = null;
  }, [authUser?.id]);

  useEffect(() => {
    if (!canAssemble) return undefined;
    const timeout = window.setTimeout(() => { void loadQueue(1); }, 250);
    return () => window.clearTimeout(timeout);
  }, [canAssemble, loadQueue]);

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

  const openRun = async (id) => {
    setRestoring(true);
    setError('');
    try {
      const response = await fetch(`/api/assemblies/${encodeURIComponent(id)}`);
      if (!response.ok) throw await parseError(response, 'Không mở được assembly run.');
      const selected = await response.json();
      setRun(selected);
      try { window.sessionStorage.setItem(lastRunKey(authUser.id), selected.id); } catch { /* Server remains authoritative. */ }
      return selected;
    } catch (requestError) {
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}`);
      return null;
    } finally {
      setRestoring(false);
    }
  };

  const beginRevision = async (item) => {
    const selected = await openRun(item.id);
    if (!selected) return;
    const section = selected.blueprint.sections?.[0];
    if (!section || selected.blueprint.sections.length !== 1) {
      setError('UI revision hiện chỉ hỗ trợ Blueprint một section; dữ liệu gốc vẫn không bị thay đổi.');
      return;
    }
    setForm({
      title: selected.blueprint.title,
      grade: String(selected.blueprint.grade),
      subject: selected.blueprint.subject,
      curriculumVersion: selected.blueprint.curriculumVersion,
      purpose: selected.blueprint.purpose,
      durationMinutes: String(selected.blueprint.durationMinutes),
      seed: `${selected.seed}-revision-${selected.blueprintVersion + 1}`.slice(0, 128),
      count: String(section.count),
      questionTypes: quotaText(section.quotas.questionTypes),
      topics: quotaText(section.quotas.topics),
      skills: quotaText(section.quotas.skills),
      difficulties: quotaText(section.quotas.difficulties),
      minSources: String(selected.blueprint.sourceDiversity.minSources),
      maxPerSource: String(selected.blueprint.sourceDiversity.maxQuestionsPerSource),
      minPoints: String(selected.blueprint.pointRange.min),
      maxPoints: String(selected.blueprint.pointRange.max)
    });
    setRevisionSource(selected);
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
    const endpoint = revisionSource
      ? `/api/assemblies/${encodeURIComponent(revisionSource.id)}/revisions`
      : '/api/assemblies';
    const serialized = JSON.stringify(body);
    if (!pendingRef.current || pendingRef.current.serialized !== serialized || pendingRef.current.endpoint !== endpoint) {
      pendingRef.current = { serialized, endpoint, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
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
      setRevisionSource(null);
      await loadQueue(1);
      try { window.sessionStorage.setItem(lastRunKey(authUser.id), created.id); } catch { /* Server remains authoritative. */ }
    } catch (requestError) {
      const detail = requestError.details ? ` ${JSON.stringify(requestError.details)}` : '';
      setError(`${requestError.code ? `${requestError.code}: ` : ''}${requestError.message}${detail}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (authUser === undefined) return <div className="assembly-page"><div className="catalog-state">Đang xác minh phiên…</div></div>;
  if (!authUser) return <div className="assembly-page"><AuthPanel mode="content" onLogin={onLogin} /></div>;
  if (!canAssemble && !canReview) return <div className="assembly-page"><div className="catalog-state"><strong>Không có quyền assembly.</strong><span>Cần role CONTENT_EDITOR, ACADEMIC_REVIEWER hoặc SUPER_ADMIN.</span></div></div>;

  return (
    <div className="assembly-page">
      <section className="assembly-hero">
        <div>
          <h1>{canAssemble ? 'Tạo snapshot có thể tái hiện, không phá quota khi pool thiếu.' : 'Duyệt đúng frozen snapshot trước khi mở cho Student.'}</h1>
        </div>
        <p>{canAssemble
          ? 'Chỉ câu đã publish, có metadata đầy đủ và license derivative mới vào pool. Technical run cần Reviewer độc lập trước khi publish.'
          : 'Reviewer payload có answer/lời giải; quyết định bind hashes và chỉ bản approved mới xuất hiện trong catalog.'}</p>
      </section>

      {canAssemble && <div className="assembly-layout">
        <form className="assembly-form" onSubmit={assemble}>
          <div className="assembly-form-heading">
            <h2>{revisionSource ? `Revision v${revisionSource.blueprintVersion + 1}` : 'Blueprint 1.0.0'}</h2>
            {revisionSource && <button className="text-button" type="button" onClick={() => { setRevisionSource(null); pendingRef.current = null; }}>Hủy revision</button>}
          </div>
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
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Đang giải constraints…' : revisionSource ? 'Tạo immutable revision' : 'Tạo immutable snapshot'}</button>
        </form>

        <aside className="assembly-evidence">
          <p className="eyebrow">Bằng chứng run</p>
          {restoring && <p>Đang khôi phục run gần nhất…</p>}
          {!run && !restoring && <p>Chưa có run. Nếu pool không đủ, API trả lỗi có cấu trúc thay vì đổi quota.</p>}
          {run && <>
            <h2>{run.status}</h2>
            <dl>
              <div><dt>Run ID</dt><dd><code>{run.id}</code></dd></div>
              <div><dt>Blueprint</dt><dd><code>{run.blueprintId}</code><br />v{run.blueprintVersion} · {run.approvalStatus}</dd></div>
              <div><dt>Engine</dt><dd><code>{run.engineVersion}</code></dd></div>
              <div><dt>Seed</dt><dd><code>{run.seed}</code></dd></div>
              <div><dt>Selection hash</dt><dd><code>{run.selectionSha256.slice(0, 16)}…</code></dd></div>
              <div><dt>Snapshot hash</dt><dd><code>{run.snapshotSha256.slice(0, 16)}…</code></dd></div>
            </dl>
            <h3>Phân bố nguồn</h3>
            <ul>{Object.entries(run.sourceDistribution).map(([sourceId, count]) => <li key={sourceId}><code>{sourceId}</code><span>{count} câu</span></li>)}</ul>
            {['REJECTED', 'PUBLISHED'].includes(run.approvalStatus) && (
              <button className="secondary-button" type="button" onClick={() => beginRevision(run)}>Tạo revision kế tiếp</button>
            )}
          </>}
        </aside>
      </div>}

      {canAssemble && (
        <section className="assembly-queue">
          <header>
            <div><p className="eyebrow">Blueprint của tôi</p><h2>Revision và trạng thái governance</h2></div>
            <span>{queue.total} run</span>
          </header>
          <div className="assembly-queue-filters">
            <input aria-label="Tìm theo tiêu đề" placeholder="Tìm tiêu đề…" value={queueFilters.query} onChange={(event) => setQueueFilters((current) => ({ ...current, query: event.target.value }))} />
            <select aria-label="Lọc trạng thái" value={queueFilters.status} onChange={(event) => setQueueFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Mọi trạng thái</option><option>NEEDS_REVIEW</option><option>APPROVED</option><option>REJECTED</option><option>PUBLISHED</option>
            </select>
            <select aria-label="Lọc mục đích" value={queueFilters.purpose} onChange={(event) => setQueueFilters((current) => ({ ...current, purpose: event.target.value }))}>
              <option value="">Mọi mục đích</option><option>PRACTICE</option><option>MOCK_EXAM</option><option>DIAGNOSTIC</option>
            </select>
            <button className="secondary-button" type="button" onClick={() => loadQueue(1)} disabled={queueLoading}>{queueLoading ? 'Đang tải…' : 'Lọc'}</button>
          </div>
          <div className="assembly-queue-list">
            {queue.items.map((item) => (
              <article key={item.id}>
                <button type="button" onClick={() => openRun(item.id)}>
                  <span><strong>{item.title}</strong><small>Lớp {item.grade} · {item.subject} · {item.purpose}</small></span>
                  <span><b>v{item.blueprintVersion}</b><small>{item.approvalStatus}</small></span>
                </button>
                {['REJECTED', 'PUBLISHED'].includes(item.approvalStatus) && <button className="text-button" type="button" onClick={() => beginRevision(item)}>Revision</button>}
              </article>
            ))}
            {!queueLoading && queue.items.length === 0 && <p>Không có Blueprint khớp bộ lọc.</p>}
          </div>
          <footer>
            <button type="button" className="text-button" disabled={queue.page <= 1 || queueLoading} onClick={() => loadQueue(queue.page - 1)}>Trang trước</button>
            <span>Trang {queue.page}</span>
            <button type="button" className="text-button" disabled={!queue.nextPage || queueLoading} onClick={() => loadQueue(queue.nextPage)}>Trang sau</button>
          </footer>
        </section>
      )}

      {canAssemble && run?.snapshot && (
        <StudentExamView
          key={run.id}
          exam={run.snapshot}
          attempt={null}
          previewLabel="Assembly technical preview"
          previewMessage="Chỉ creator Editor/Admin xem được; snapshot này chưa publish và không thể nộp bài."
        />
      )}
      {canReview && <AssemblyReviewPanel authUser={authUser} />}
    </div>
  );
}
