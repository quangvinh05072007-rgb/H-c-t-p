import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Layers,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, fmtDateTime, go, Loading, useApp, useAsync } from '../../ui/kit';
import {
  getStudyStatusMeta,
  readLastStudiedTopic,
  saveLastStudiedTopic,
  StudyStatusIcon,
  TopicGlyph,
} from '../../ui/selfstudy/TopicStudyHelpers';
import { StudyTopic, TopicStudyWorkspace } from './TopicStudyWorkspace';

const SUBJECTS = [
  { id: 'math', name: 'Toán học' },
  { id: 'physics', name: 'Vật lí' },
  { id: 'chemistry', name: 'Hóa học' },
  { id: 'biology', name: 'Sinh học' },
  { id: 'english', name: 'Tiếng Anh' },
  { id: 'history', name: 'Lịch sử' },
];

const DOMAINS: Record<'algebra' | 'geometry' | 'statistics', string> = {
  algebra: 'Đại số & Giải tích',
  geometry: 'Hình học & Đo lường',
  statistics: 'Xác suất & Thống kê',
};

function getTopicDomain(code: string): 'algebra' | 'geometry' | 'statistics' {
  if (['T10.HTL', 'T10.VECTO', 'T10.TOADOOXY', 'T11.SONGSONG', 'T11.VUONGGOC', 'T12.VECTOKG', 'T12.OXYZ'].includes(code)) {
    return 'geometry';
  }
  if (['T10.THONGKE', 'T10.TOHOP', 'T11.GHEPNHOM', 'T11.XACSUAT', 'T12.PHANTAN', 'T12.XSDK'].includes(code)) {
    return 'statistics';
  }
  return 'algebra';
}

type KnowledgeNodeSummary = {
  code: string;
  questionCount: number;
  mastery: number | null;
  status: string;
  lastAt: number | null;
};

export function SelfStudy() {
  const { meta, user, toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => get<any>('/api/student/home'), []);
  const { data: kMap } = useAsync(
    () =>
      user.role === 'student'
        ? get<{ nodes: KnowledgeNodeSummary[] }>('/api/student/knowledge-map').catch(() => null)
        : Promise.resolve(null),
    [user.role],
  );

  const [selectedSubject, setSelectedSubject] = useState('math');
  const [selectedGrade, setSelectedGrade] = useState<number>(user.class?.grade ?? 12);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'weak' | 'learning' | 'mastered' | 'unattempted'>('all');
  const [multiPickMode, setMultiPickMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [count, setCount] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [activeTopicCode, setActiveTopicCode] = useState<string | null>(null);
  const [lastStudied, setLastStudied] = useState(() => readLastStudiedTopic(user.id));

  const otherTopicsBySubject: Record<string, StudyTopic[]> = useMemo(
    () => ({
      physics: [
        { code: 'LY12.KHI', grade: 12, name: 'Vật lí nhiệt và Khí lí tưởng' },
        { code: 'LY12.TU', grade: 12, name: 'Từ trường và Cảm ứng điện từ' },
        { code: 'LY12.HATNHAN', grade: 12, name: 'Vật lí hạt nhân và Năng lượng' },
        { code: 'LY11.DAODONG', grade: 11, name: 'Dao động điều hòa và Sóng cơ' },
        { code: 'LY11.DIENTRUONG', grade: 11, name: 'Điện trường và Dòng điện không đổi' },
        { code: 'LY10.DONGHOC', grade: 10, name: 'Động học và Động lực học chất điểm' },
        { code: 'LY10.NANGLUONG', grade: 10, name: 'Năng lượng, Công và Công suất' },
      ],
      chemistry: [
        { code: 'HOA12.ESTER', grade: 12, name: 'Este – Lipit và Chất giặt rửa' },
        { code: 'HOA12.CARBO', grade: 12, name: 'Cacbohiđrat (Glucose, Saccarozo, Tinh bột)' },
        { code: 'HOA12.AMIN', grade: 12, name: 'Amin, Amino Axit và Protein' },
        { code: 'HOA12.PIN', grade: 12, name: 'Pin điện và Điện phân' },
        { code: 'HOA11.CANDANG', grade: 11, name: 'Cân bằng hóa học và Sự điện li' },
        { code: 'HOA11.NITRO', grade: 11, name: 'Nitơ và Hợp chất của Nitơ' },
        { code: 'HOA10.NT', grade: 10, name: 'Cấu tạo nguyên tử và Bảng tuần hoàn' },
        { code: 'HOA10.OXH', grade: 10, name: 'Phản ứng Oxi hóa – Khử' },
      ],
      biology: [
        { code: 'SINH12.ADN', grade: 12, name: 'Cơ chế di truyền và Biến dị phân tử' },
        { code: 'SINH12.QLLK', grade: 12, name: 'Quy luật di truyền và Liên kết gen' },
        { code: 'SINH12.SINHTHAI', grade: 12, name: 'Hệ sinh thái và Sinh quyển' },
        { code: 'SINH11.CHUYENHOA', grade: 11, name: 'Chuyển hóa vật chất và Năng lượng ở sinh vật' },
        { code: 'SINH10.TEBAO', grade: 10, name: 'Sinh học tế bào và Vi sinh vật' },
      ],
      english: [
        { code: 'ENG12.TENSES', grade: 12, name: 'Ngữ pháp nâng cao: Đảo ngữ & Câu điều kiện' },
        { code: 'ENG12.READING', grade: 12, name: 'Kỹ năng đọc hiểu & Tìm ý chính bài đọc' },
        { code: 'ENG11.PHRASAL', grade: 11, name: 'Cụm động từ (Phrasal Verbs) & Thành ngữ' },
        { code: 'ENG10.VOCAB', grade: 10, name: 'Từ vựng cốt lõi & Ngữ âm (Trọng âm, Nguyên âm)' },
      ],
      history: [
        { code: 'SU12.VN45_75', grade: 12, name: 'Lịch sử Việt Nam giai đoạn 1945 – 1975' },
        { code: 'SU12.DOIMOI', grade: 12, name: 'Việt Nam thời kỳ Đổi mới và Hội nhập' },
        { code: 'SU11.TGHIENDAI', grade: 11, name: 'Lịch sử thế giới hiện đại giữa hai cuộc chiến tranh' },
        { code: 'SU10.VANMINH', grade: 10, name: 'Các nền văn minh cổ đại và trung đại' },
      ],
    }),
    [],
  );

  const mastery = useMemo(() => {
    return Object.fromEntries((data?.mastery ?? []).map((m: any) => [m.topic, m]));
  }, [data]);

  const nodeByCode = useMemo(() => {
    return Object.fromEntries((kMap?.nodes ?? []).map((n) => [n.code, n]));
  }, [kMap]);

  const rawTopics = useMemo<StudyTopic[]>(() => {
    return selectedSubject === 'math'
      ? (meta?.topics ?? []).filter((t: any) => t.grade === selectedGrade)
      : (otherTopicsBySubject[selectedSubject] || []).filter((t) => t.grade === selectedGrade);
  }, [selectedSubject, selectedGrade, meta, otherTopicsBySubject]);

  const allSubjectTopics = useMemo<StudyTopic[]>(() => {
    return selectedSubject === 'math'
      ? meta?.topics ?? []
      : otherTopicsBySubject[selectedSubject] || [];
  }, [selectedSubject, meta, otherTopicsBySubject]);

  const recommendedCodes = useMemo(() => {
    const recs: string[] = [];
    for (const r of data?.recommendations ?? []) {
      if (typeof r?.topic === 'string') recs.push(r.topic);
    }
    return recs;
  }, [data]);

  const stats = useMemo(() => {
    let mastered = 0;
    let learning = 0;
    let weak = 0;
    let unattempted = 0;
    for (const t of rawTopics) {
      const m = mastery[t.code];
      const val = m?.value ?? null;
      if (val === null) unattempted++;
      else if (val >= 0.75) mastered++;
      else if (val >= 0.5) learning++;
      else weak++;
    }
    const completionRatio = rawTopics.length > 0 ? mastered / rawTopics.length : 0;
    return { total: rawTopics.length, mastered, learning, weak, unattempted, completionRatio };
  }, [rawTopics, mastery]);

  // Sắp xếp ưu tiên: Đang học / Cần củng cố & chủ đề được đề xuất lên trước, giữ thứ tự chương trình trong cùng nhóm
  const filteredTopics = useMemo(() => {
    const orderIdx = new Map(rawTopics.map((t, i) => [t.code, i]));
    const filtered = rawTopics.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.code.toLowerCase().includes(q)) return false;
      }

      if (statusFilter !== 'all') {
        const m = mastery[t.code];
        const val = m?.value ?? null;
        if (statusFilter === 'unattempted') return val === null;
        if (statusFilter === 'weak') return val !== null && val < 0.5;
        if (statusFilter === 'learning') return val !== null && val >= 0.5 && val < 0.75;
        if (statusFilter === 'mastered') return val !== null && val >= 0.75;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const ma = mastery[a.code]?.value ?? null;
      const mb = mastery[b.code]?.value ?? null;
      const pa = getStudyStatusMeta(ma === null ? null : Math.round(ma * 100)).priority;
      const pb = getStudyStatusMeta(mb === null ? null : Math.round(mb * 100)).priority;
      if (pa !== pb) return pa - pb;
      const ra = recommendedCodes.includes(a.code) ? 0 : 1;
      const rb = recommendedCodes.includes(b.code) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return (orderIdx.get(a.code) ?? 0) - (orderIdx.get(b.code) ?? 0);
    });
  }, [rawTopics, searchQuery, statusFilter, mastery, recommendedCodes]);

  const suggestedSpotlight = useMemo(() => {
    if (lastStudied && allSubjectTopics.some((t) => t.code === lastStudied.code)) {
      const t = allSubjectTopics.find((x) => x.code === lastStudied.code)!;
      return { kind: 'recent' as const, topic: t, meta: lastStudied };
    }
    const recTopic = rawTopics.find((t) => recommendedCodes.includes(t.code));
    if (recTopic) {
      return { kind: 'recommended' as const, topic: recTopic };
    }
    const priorityTopic = filteredTopics.find((t) => {
      const val = mastery[t.code]?.value ?? null;
      return val !== null && val < 0.75;
    });
    if (priorityTopic) {
      return { kind: 'priority' as const, topic: priorityTopic };
    }
    return null;
  }, [lastStudied, allSubjectTopics, rawTopics, recommendedCodes, filteredTopics, mastery]);

  useEffect(() => {
    if (picked.length > 0 && selectedSubject === 'math') {
      setMultiPickMode(true);
    }
  }, [picked.length, selectedSubject]);

  if (loading) return <Loading text="Đang tải không gian tự học…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const toggle = (code: string) => {
    setPicked((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const startPractice = async (topicCodes: string[], customCount?: number) => {
    if (!topicCodes.length) {
      toast('Vui lòng chọn ít nhất một chủ đề.');
      return;
    }
    setBusy(true);
    try {
      const a = await post<any>('/api/practice/start', {
        mode: 'topic',
        topics: topicCodes,
        count: customCount ?? count,
      });
      go(`/thi/${a.id}`);
    } catch (err: any) {
      toast(err.message || 'Không thể bắt đầu luyện tập chủ đề này.');
      setBusy(false);
    }
  };

  const openTopicByCode = (code: string) => {
    const mathTopic = (meta?.topics ?? []).find((t) => t.code === code);
    const subjTarget = allSubjectTopics.find((t) => t.code === code) || mathTopic;
    if (subjTarget) {
      const nextSubject = mathTopic && selectedSubject !== 'math' ? 'math' : selectedSubject;
      if (nextSubject !== selectedSubject) {
        setSelectedSubject(nextSubject);
      }
      setSelectedGrade(subjTarget.grade);
      setActiveTopicCode(subjTarget.code);
      const record = {
        code: subjTarget.code,
        name: subjTarget.name,
        subjectId: nextSubject,
        grade: subjTarget.grade,
        openedAt: Date.now(),
      };
      saveLastStudiedTopic(user.id, record);
      setLastStudied(record);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const currentSubj = SUBJECTS.find((s) => s.id === selectedSubject) ?? SUBJECTS[0];

  // Giao diện chi tiết bài học khi chọn 1 chủ đề
  const activeTopic = activeTopicCode ? allSubjectTopics.find((t) => t.code === activeTopicCode) : null;
  if (activeTopic) {
    const seqList = filteredTopics.some((t) => t.code === activeTopic.code) ? filteredTopics : rawTopics;
    const activeIdx = Math.max(0, seqList.findIndex((t) => t.code === activeTopic.code));
    const domain = selectedSubject === 'math' ? getTopicDomain(activeTopic.code) : 'algebra';
    const domainLabel = selectedSubject === 'math' ? DOMAINS[domain] : currentSubj.name;

    return (
      <TopicStudyWorkspace
        topic={activeTopic}
        subjectId={selectedSubject}
        subjectName={currentSubj.name}
        domainLabel={domainLabel}
        topicIndex={activeIdx}
        totalTopics={seqList.length}
        masteryEntry={mastery[activeTopic.code]}
        isPicked={picked.includes(activeTopic.code)}
        pickedCount={picked.length}
        busy={busy}
        onBack={() => setActiveTopicCode(null)}
        onPrevTopic={activeIdx > 0 ? () => openTopicByCode(seqList[activeIdx - 1].code) : undefined}
        onNextTopic={activeIdx < seqList.length - 1 ? () => openTopicByCode(seqList[activeIdx + 1].code) : undefined}
        onSelectTopicCode={openTopicByCode}
        onTogglePick={toggle}
        onStartPractice={(codes, c) => startPractice(codes, c)}
        onStartPickedPractice={(c) => startPractice(picked, c)}
        onEvidenceUpdated={reload}
      />
    );
  }

  const completionPct = Math.round(stats.completionRatio * 100);

  return (
    <div className="selfstudy-shell">
      {/* 1. Khu vực đầu trang: Không gian tự học */}
      <section className="ss-hero-panel" aria-label="Tổng quan không gian tự học">
        <div>
          <div className="ss-hero-kicker">
            <BookOpen size={16} aria-hidden="true" />
            <span>{currentSubj.name}</span>
            <span aria-hidden="true">·</span>
            <span>Lớp {selectedGrade}</span>
            {user.class?.name && (
              <>
                <span aria-hidden="true">·</span>
                <span>Lớp đang học: {user.class.name}</span>
              </>
            )}
          </div>
          <h1 className="ss-hero-title">Không gian tự học</h1>
          <p className="ss-hero-subtitle">
            Ôn vững kiến thức nền tảng, luyện phản xạ từng chuyên đề và củng cố đúng phần còn yếu mỗi ngày.
          </p>
        </div>

        <div className="ss-hero-metrics">
          <div>
            <div className="ss-progress-summary-head">
              <span>Tiến độ hoàn thành Lớp {selectedGrade}</span>
              <strong className="tabular-nums">
                {stats.mastered}/{stats.total} chủ đề thành thạo ({completionPct}%)
              </strong>
            </div>
            <div className="ss-progress-track" style={{ marginTop: 8 }}>
              <div className="ss-progress-fill" style={{ width: `${completionPct}%` }} />
            </div>
          </div>

          <div className="ss-kpi-strip" role="group" aria-label="Lọc nhanh theo trạng thái">
            <button
              type="button"
              className={`ss-kpi-tile ${statusFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              <span className="ss-kpi-value tabular-nums">{stats.total}</span>
              <span className="ss-kpi-label">Tổng chủ đề</span>
            </button>
            <button
              type="button"
              className={`ss-kpi-tile ${statusFilter === 'mastered' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'mastered' ? 'all' : 'mastered')}
            >
              <span className="ss-kpi-value tabular-nums">{stats.mastered}</span>
              <span className="ss-kpi-label">Đã thành thạo</span>
            </button>
            <button
              type="button"
              className={`ss-kpi-tile ${statusFilter === 'learning' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'learning' ? 'all' : 'learning')}
            >
              <span className="ss-kpi-value tabular-nums">{stats.learning}</span>
              <span className="ss-kpi-label">Đang học</span>
            </button>
            <button
              type="button"
              className={`ss-kpi-tile ${statusFilter === 'weak' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'weak' ? 'all' : 'weak')}
            >
              <span className="ss-kpi-value tabular-nums">{stats.weak}</span>
              <span className="ss-kpi-label">Cần củng cố</span>
            </button>
          </div>
        </div>
      </section>

      {/* Vị trí học gần nhất hoặc chủ đề ưu tiên */}
      {suggestedSpotlight && (
        <section className="ss-continue-banner" aria-label="Gợi ý học tiếp">
          <div className="ss-continue-info">
            <div className="ss-continue-icon" aria-hidden="true">
              {suggestedSpotlight.kind === 'recent' ? <Clock size={20} /> : <Sparkles size={20} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="ss-continue-meta">
                {suggestedSpotlight.kind === 'recent'
                  ? `Học gần nhất · ${fmtDateTime(suggestedSpotlight.meta.openedAt)}`
                  : suggestedSpotlight.kind === 'recommended'
                  ? 'Chủ đề đề xuất tiếp theo'
                  : 'Ưu tiên củng cố'}
              </div>
              <div className="ss-continue-title">{suggestedSpotlight.topic.name}</div>
            </div>
          </div>
          <button
            type="button"
            className="ss-btn ss-btn-primary ss-btn-sm"
            onClick={() => openTopicByCode(suggestedSpotlight.topic.code)}
          >
            <span>{suggestedSpotlight.kind === 'recent' ? 'Học tiếp bài này' : 'Mở chủ đề'}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>
      )}

      {/* 2. Thanh điều hướng bộ lọc thống nhất */}
      <section className="ss-toolbar-card" aria-label="Bộ lọc chủ đề tự học">
        <div className="ss-subject-tablist" role="tablist" aria-label="Chọn môn học">
          {SUBJECTS.map((s) => {
            const active = selectedSubject === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`ss-subject-tab ${active ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedSubject(s.id);
                  setPicked([]);
                  setMultiPickMode(false);
                  setSearchQuery('');
                  setStatusFilter('all');
                  setActiveTopicCode(null);
                }}
              >
                <TopicGlyph subjectId={s.id} size={16} />
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>

        <div className="ss-controls-row">
          <div className="ss-grade-segmented" role="group" aria-label="Chọn khối lớp">
            {[12, 11, 10].map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={selectedGrade === g}
                className={`ss-grade-btn ${selectedGrade === g ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedGrade(g);
                  setPicked([]);
                }}
              >
                Lớp {g}
              </button>
            ))}
          </div>

          <div className="ss-controls-right">
            <div className="ss-search-box">
              <span className="ss-search-leading" aria-hidden="true">
                <Search size={16} />
              </span>
              <input
                type="search"
                className="ss-search-input"
                placeholder="Tìm tên chủ đề…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Tìm kiếm chủ đề tự học"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="ss-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              className="ss-select-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              aria-label="Lọc theo trạng thái học tập"
            >
              <option value="all">Tất cả trạng thái ({stats.total})</option>
              <option value="weak">Cần củng cố ({stats.weak})</option>
              <option value="learning">Đang học ({stats.learning})</option>
              <option value="mastered">Đã thành thạo ({stats.mastered})</option>
              <option value="unattempted">Chưa học ({stats.unattempted})</option>
            </select>

            {selectedSubject === 'math' && (
              <button
                type="button"
                className={`ss-btn ss-btn-sm ${multiPickMode ? 'ss-btn-accent' : ''}`}
                aria-pressed={multiPickMode}
                onClick={() => {
                  if (multiPickMode) {
                    setMultiPickMode(false);
                    setPicked([]);
                  } else {
                    setMultiPickMode(true);
                  }
                }}
              >
                <Layers size={15} aria-hidden="true" />
                <span>{multiPickMode ? `Đang ghép (${picked.length})` : 'Ghép nhiều chủ đề'}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 3. Lưới thẻ chủ đề 2 cột hiện đại */}
      {filteredTopics.length === 0 ? (
        <div className="ss-empty-card">
          <BookOpen size={30} color="var(--ss-muted)" aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: 18 }}>Không tìm thấy chủ đề phù hợp</h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ss-muted)' }}>
            Thử đổi từ khóa tìm kiếm hoặc chọn lại trạng thái, khối lớp khác.
          </p>
          <button
            type="button"
            className="ss-btn ss-btn-sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>
      ) : (
        <div className="ss-topics-grid" role="list" aria-label="Danh sách chủ đề tự học">
          {filteredTopics.map((topic) => {
            const m = mastery[topic.code];
            const pctVal = m ? Math.round(m.value * 100) : null;
            const statusMeta = getStudyStatusMeta(pctVal);
            const domain = selectedSubject === 'math' ? getTopicDomain(topic.code) : 'algebra';
            const domainLabel = selectedSubject === 'math' ? DOMAINS[domain] : currentSubj.name;
            const bankNode = nodeByCode[topic.code];
            const isPicked = picked.includes(topic.code);
            const isRecommended = recommendedCodes.includes(topic.code);

            const handleCardAction = () => {
              if (multiPickMode && selectedSubject === 'math') {
                toggle(topic.code);
              } else {
                openTopicByCode(topic.code);
              }
            };

            return (
              <article
                key={topic.code}
                role="listitem"
                tabIndex={0}
                className={`ss-topic-card ${isPicked ? 'is-picked' : ''}`}
                onClick={handleCardAction}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardAction();
                  }
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="ss-card-top">
                    <div className="ss-card-identity">
                      <div
                        className={`ss-topic-icon-box ${
                          statusMeta.key === 'weak'
                            ? 'is-weak'
                            : statusMeta.key === 'mastered'
                            ? 'is-mastered'
                            : ''
                        }`}
                      >
                        <TopicGlyph subjectId={selectedSubject} domain={domain} size={20} />
                      </div>
                      <div className="ss-card-title-wrap">
                        <h3 className="ss-card-title">{topic.name}</h3>
                        <div className="ss-card-meta">
                          <span>{domainLabel}</span>
                          {selectedSubject === 'math' && bankNode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{bankNode.questionCount} câu hỏi có sẵn</span>
                            </>
                          )}
                          {isRecommended && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span style={{ color: 'var(--ss-primary)', fontWeight: 600 }}>Đề xuất tiếp theo</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <span className={`ss-status-tag ${statusMeta.className}`}>
                      <StudyStatusIcon status={statusMeta.key} size={13} />
                      <span>{statusMeta.label}</span>
                    </span>
                  </div>

                  <div className="ss-card-progress">
                    <div className="ss-card-progress-row">
                      <span>{pctVal !== null ? 'Mức độ thành thạo' : 'Tiến độ luyện tập'}</span>
                      <strong className="tabular-nums">
                        {pctVal !== null
                          ? `${pctVal}%${m?.n ? ` · ${m.n} lượt làm` : ''}`
                          : 'Chưa bắt đầu'}
                      </strong>
                    </div>
                    <div className="ss-progress-track">
                      <div
                        className={`ss-progress-fill ${
                          statusMeta.key === 'weak'
                            ? 'is-warn'
                            : statusMeta.key === 'learning'
                            ? 'is-accent'
                            : ''
                        }`}
                        style={{ width: `${pctVal ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="ss-card-footer">
                  <span className="ss-card-note">
                    {m?.last ? `Ôn gần nhất ${fmtDateTime(m.last)}` : `Chương trình Lớp ${topic.grade}`}
                  </span>

                  {multiPickMode && selectedSubject === 'math' ? (
                    <span className="ss-pick-indicator">
                      {isPicked ? <Check size={16} aria-hidden="true" /> : null}
                      <span>{isPicked ? 'Đã chọn vào đợt luyện' : 'Nhấn để chọn ghép'}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`ss-btn ss-btn-sm ${
                        statusMeta.key === 'mastered' ? '' : 'ss-btn-primary'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openTopicByCode(topic.code);
                      }}
                    >
                      <span>{statusMeta.actionLabel}</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 4. Thanh luyện tập kết hợp nhiều chủ đề */}
      {picked.length > 0 && selectedSubject === 'math' && (
        <aside className="ss-floating-dock" role="region" aria-label="Thanh luyện tập kết hợp">
          <div className="ss-dock-info">
            <strong className="tabular-nums">Đã chọn {picked.length} chủ đề</strong>
            <span>Tạo nhanh đề luyện tập tổng hợp các chuyên đề đã chọn</span>
          </div>

          <div className="ss-dock-actions">
            <div className="ss-count-segmented" role="group" aria-label="Chọn số câu hỏi">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`ss-count-btn tabular-nums ${count === n ? 'is-active' : ''}`}
                  onClick={() => setCount(n)}
                >
                  {n} câu
                </button>
              ))}
            </div>

            <button
              type="button"
              className="ss-btn ss-btn-sm"
              onClick={() => {
                setPicked([]);
                setMultiPickMode(false);
              }}
            >
              Bỏ chọn
            </button>

            <button
              type="button"
              className="ss-btn ss-btn-primary ss-btn-sm"
              disabled={busy}
              onClick={() => startPractice(picked)}
            >
              {busy ? 'Đang tạo đề…' : `Luyện ngay (${count} câu)`}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
