import { useState } from 'react';
import { useStore } from '../../store/index.js';
import { api } from '../../services/api.js';

export default function ReteachPanel() {
  const { getWeakTopics, getRecentTranscript, recordQuizAnswer } = useStore();
  const weakTopics = getWeakTopics();

  const [selectedTopic, setSelectedTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkAnswer, setCheckAnswer] = useState(null);
  const [checkRevealed, setCheckRevealed] = useState(false);

  async function handleGenerate(topicArg) {
    const t = (topicArg || customTopic || '').trim();
    if (!t) {
      setError('Please enter a topic name before generating a lesson.');
      return;
    }
    setError('');
    setLesson(null);
    setCheckAnswer(null);
    setCheckRevealed(false);
    setLoading(true);
    try {
      const ctx = getRecentTranscript(8000);
      const res = await api.reteach(t, ctx);
      if (!res?.lesson) throw new Error('No lesson data returned. Please try again.');
      setLesson(res.lesson);
      setSelectedTopic(t);
    } catch (e) {
      // Show the exact error from backend, not a generic message
      setError(e.message || 'Failed to generate lesson. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCheck(idx) {
    if (checkRevealed) return;
    setCheckAnswer(idx);
    setCheckRevealed(true);
    const correct = idx === lesson.checkQuestion.correctIndex;
    recordQuizAnswer(`reteach_${Date.now()}`, selectedTopic, correct);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Re-Teaching</span>
        <span style={styles.subtitle}>Personalized micro-lessons on your weak spots</span>
      </div>

      <div style={styles.body}>
        {/* Weak topic chips */}
        {weakTopics.length > 0 && (
          <div style={styles.weakSection}>
            <div style={styles.sectionLabel}>Your Weak Topics — tap to re-learn</div>
            <div style={styles.chipRow}>
              {weakTopics.slice(0, 6).map((t) => {
                const pct = Math.round(t.score * 100);
                return (
                  <button
                    key={t.topic}
                    style={styles.weakChip}
                    onClick={() => handleGenerate(t.topic)}
                    disabled={loading}
                  >
                    <span style={styles.chipTopic}>{t.topic}</span>
                    <span style={{ ...styles.chipPct, color: pct < 50 ? '#ef4444' : '#f59e0b' }}>
                      {pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom topic input */}
        <div style={styles.customRow}>
          <input
            style={styles.customInput}
            placeholder="Or type any topic to re-learn..."
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            maxLength={200}
            aria-label="Custom topic to reteach"
          />
          <button
            style={styles.goBtn}
            onClick={() => handleGenerate()}
            disabled={!customTopic.trim() || loading}
          >
            {loading ? <Spinner /> : 'Learn →'}
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Lesson card */}
        {lesson && (
          <div style={styles.lessonCard} className="fade-in">
            <div style={styles.lessonHeader}>
              <span style={styles.lessonTopic}>{lesson.topic}</span>
            </div>

            <div style={styles.coreIdea}>
              <span style={styles.coreLabel}>Core Idea</span>
              <p style={styles.coreText}>{lesson.coreIdea}</p>
            </div>

            <div style={styles.lessonSection}>
              <div style={styles.lessonSectionLabel}>📖 Explanation</div>
              <p style={styles.lessonText}>{lesson.explanation}</p>
            </div>

            <div style={styles.lessonSection}>
              <div style={styles.lessonSectionLabel}>💡 Analogy</div>
              <p style={styles.analogyText}>{lesson.analogy}</p>
            </div>

            <div style={styles.lessonSection}>
              <div style={styles.lessonSectionLabel}>🔢 Example</div>
              <p style={styles.lessonText}>{lesson.example}</p>
            </div>

            {lesson.commonMistakes?.length > 0 && (
              <div style={styles.lessonSection}>
                <div style={styles.lessonSectionLabel}>⚠️ Common Mistakes</div>
                <ul style={styles.mistakeList}>
                  {lesson.commonMistakes.map((m, i) => (
                    <li key={i} style={styles.mistakeItem}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {lesson.keyTerms?.length > 0 && (
              <div style={styles.lessonSection}>
                <div style={styles.lessonSectionLabel}>📚 Key Terms</div>
                <div style={styles.termGrid}>
                  {lesson.keyTerms.map((kt, i) => (
                    <div key={i} style={styles.termCard}>
                      <div style={styles.termName}>{kt.term}</div>
                      <div style={styles.termMeaning}>{kt.meaning}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Check question */}
            {lesson.checkQuestion && (
              <div style={styles.checkSection}>
                <div style={styles.lessonSectionLabel}>✅ Check Your Understanding</div>
                <p style={styles.checkQ}>{lesson.checkQuestion.question}</p>
                <div style={styles.checkOptions}>
                  {lesson.checkQuestion.options.map((opt, i) => {
                    let s = styles.checkOpt;
                    if (checkRevealed) {
                      if (i === lesson.checkQuestion.correctIndex) s = { ...s, ...styles.checkCorrect };
                      else if (i === checkAnswer && i !== lesson.checkQuestion.correctIndex) s = { ...s, ...styles.checkWrong };
                      else s = { ...s, opacity: 0.4 };
                    } else if (checkAnswer === i) {
                      s = { ...s, ...styles.checkSelected };
                    }
                    return (
                      <button key={i} style={s} onClick={() => handleCheck(i)} disabled={checkRevealed}>
                        <span style={styles.optLetter}>{String.fromCharCode(65 + i)}</span>
                        <span>{opt.replace(/^[A-D]\.\s*/, '')}</span>
                      </button>
                    );
                  })}
                </div>
                {checkRevealed && (
                  <div style={styles.checkExplain} className="fade-in">
                    <strong>{checkAnswer === lesson.checkQuestion.correctIndex ? '🎉 Correct!' : '📌 Remember:'}</strong>{' '}
                    {lesson.checkQuestion.explanation}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {weakTopics.length === 0 && !lesson && !loading && (
          <div style={styles.empty}>
            <div style={{ fontSize: 36 }}>🔁</div>
            <p style={styles.emptyText}>
              Complete some quizzes first to identify your weak topics,<br />
              or type any topic above to get a micro-lesson.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: { padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  title: { fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', display: 'block' },
  subtitle: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 2 },
  body: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 },
  weakSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  weakChip: { background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s' },
  chipTopic: { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 },
  chipPct: { fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 },
  customRow: { display: 'flex', gap: 8 },
  customInput: { flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: '9px 14px', fontFamily: 'var(--font-sans)', outline: 'none' },
  goBtn: { background: 'var(--accent-green)', border: 'none', borderRadius: 8, color: '#000', fontSize: 12, fontWeight: 700, padding: '9px 16px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fca5a5' },
  lessonCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  lessonHeader: { padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'rgba(59,130,246,0.07)' },
  lessonTopic: { fontSize: 14, fontWeight: 700, color: 'var(--accent-light)' },
  coreIdea: { margin: '16px 18px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '12px 14px' },
  coreLabel: { fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-green)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 5 },
  coreText: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.55 },
  lessonSection: { padding: '12px 18px', borderTop: '1px solid var(--border)' },
  lessonSectionLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7 },
  lessonText: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 },
  analogyText: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontStyle: 'italic' },
  mistakeList: { paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 },
  mistakeItem: { fontSize: 12, color: '#fca5a5', lineHeight: 1.5 },
  termGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  termCard: { background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 10px' },
  termName: { fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-light)', marginBottom: 3 },
  termMeaning: { fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 },
  checkSection: { padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 },
  checkQ: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.5 },
  checkOptions: { display: 'flex', flexDirection: 'column', gap: 6 },
  checkOpt: { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', transition: 'all 0.15s', width: '100%' },
  checkCorrect: { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.4)', color: '#6ee7b7' },
  checkWrong: { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' },
  checkSelected: { background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.4)' },
  optLetter: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', minWidth: 14 },
  checkExplain: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '10px 12px' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40, textAlign: 'center' },
  emptyText: { color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 },
};
