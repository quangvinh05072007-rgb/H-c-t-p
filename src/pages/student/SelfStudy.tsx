import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react';
import { get, post } from '../../api';
import { ErrorBox, go, Loading, useApp, useAsync } from '../../ui/kit';
import {
  getStudyStatusMeta,
  readLastStudiedTopic,
  saveLastStudiedTopic,
  StudyStatusIcon,
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

  return (
    <div className="selfstudy-shell su-page">
      {/* Đầu trang gọn: tiêu đề, tiến độ, một nút học tiếp */}
      <header className="su-head">
        <div style={{ minWidth: 0 }}>
          <h1>Tự học</h1>
          <p className="su-sub">
            {currentSubj.name} · Lớp {selectedGrade} · {stats.mastered}/{stats.total} chủ đề thành thạo
          </p>
        </div>
        {suggestedSpotlight && (
          <button type="button" className="btn primary" onClick={() => openTopicByCode(suggestedSpotlight.topic.code)}>
            {suggestedSpotlight.kind === 'recent' ? <Clock size={15} aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
            <span>
              {suggestedSpotlight.kind === 'recent' ? 'Học tiếp' : 'Nên học'}: {suggestedSpotlight.topic.name}
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </header>

      {/* Một hàng chọn môn + khối, một hàng tìm kiếm và trạng thái */}
      <div className="su-filterbar">
        <div className="su-pills" role="tablist" aria-label="Chọn môn học">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selectedSubject === s.id}
              className={`su-pill ${selectedSubject === s.id ? 'on' : ''}`}
              onClick={() => {
                setSelectedSubject(s.id);
                setPicked([]);
                setMultiPickMode(false);
                setSearchQuery('');
                setStatusFilter('all');
                setActiveTopicCode(null);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
        <span className="su-grow" />
        <div className="seg" role="group" aria-label="Chọn khối lớp">
          {[12, 11, 10].map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={selectedGrade === g}
              className={selectedGrade === g ? 'on' : ''}
              onClick={() => {
                setSelectedGrade(g);
                setPicked([]);
              }}
            >
              Lớp {g}
            </button>
          ))}
        </div>
      </div>

      <div className="su-filterbar">
        <div className="su-pills" role="group" aria-label="Lọc theo trạng thái học tập">
          {(
            [
              ['all', `Tất cả ${stats.total}`],
              ['weak', `Cần củng cố ${stats.weak}`],
              ['learning', `Đang học ${stats.learning}`],
              ['mastered', `Thành thạo ${stats.mastered}`],
              ['unattempted', `Chưa học ${stats.unattempted}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={statusFilter === key}
              className={`su-pill ${statusFilter === key ? 'on' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="su-grow" />
        <label style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, color: 'var(--ink-3)' }} />
          <input
            type="search"
            placeholder="Tìm chủ đề…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Tìm kiếm chủ đề tự học"
            style={{ paddingLeft: 30, width: 180, minHeight: 34 }}
          />
        </label>
        {selectedSubject === 'math' && (
          <button
            type="button"
            className={`btn sm ${multiPickMode ? 'primary' : ''}`}
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
            <Layers size={14} aria-hidden="true" />
            {multiPickMode ? `Đang ghép (${picked.length})` : 'Ghép nhiều chủ đề'}
          </button>
        )}
      </div>

      {filteredTopics.length === 0 ? (
        <div className="su-card su-empty">
          Không tìm thấy chủ đề phù hợp.{' '}
          <button
            type="button"
            className="su-link"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : (
        <div className="su-topic-grid" role="list" aria-label="Danh sách chủ đề tự học">
          {filteredTopics.map((topic) => {
            const m = mastery[topic.code];
            const pctVal = m ? Math.round(m.value * 100) : null;
            const statusMeta = getStudyStatusMeta(pctVal);
            const bankNode = nodeByCode[topic.code];
            const isPicked = picked.includes(topic.code);
            const isRecommended = recommendedCodes.includes(topic.code);
            const picking = multiPickMode && selectedSubject === 'math';
            const barColor =
              statusMeta.key === 'weak' ? 'var(--warn)' : statusMeta.key === 'mastered' ? 'var(--good)' : 'var(--primary)';

            return (
              <button
                key={topic.code}
                type="button"
                role="listitem"
                aria-pressed={picking ? isPicked : undefined}
                className={`su-card su-topic ${isPicked ? 'is-picked' : ''} ${isRecommended ? 'is-next' : ''}`}
                onClick={() => (picking ? toggle(topic.code) : openTopicByCode(topic.code))}
              >
                <div className="su-exam-top" style={{ alignItems: 'flex-start' }}>
                  <span className="su-topic-name">{topic.name}</span>
                  {picking ? (
                    <span className={`su-chip ${isPicked ? 'is-info' : ''}`}>
                      {isPicked ? <Check size={12} aria-hidden="true" /> : null}
                      {isPicked ? 'Đã chọn' : 'Chọn'}
                    </span>
                  ) : (
                    <span className={`ss-status-tag ${statusMeta.className}`}>
                      <StudyStatusIcon status={statusMeta.key} size={12} />
                      <span>{statusMeta.label}</span>
                    </span>
                  )}
                </div>
                <div className="su-bar">
                  <span style={{ width: `${pctVal ?? 0}%`, background: barColor }} />
                </div>
                <div className="su-topic-foot">
                  <span className="tabular-nums">
                    {pctVal !== null ? `${pctVal}% thành thạo${m?.n ? ` · ${m.n} lượt` : ''}` : 'Chưa học'}
                  </span>
                  {isRecommended ? (
                    <span className="su-chip is-info">Đề xuất</span>
                  ) : selectedSubject === 'math' && bankNode ? (
                    <span className="tabular-nums">{bankNode.questionCount} câu luyện</span>
                  ) : null}
                </div>
              </button>
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
