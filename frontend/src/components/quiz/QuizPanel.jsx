import { useState } from 'react';
import { useStore } from '../../store/index.js';
import { api } from '../../services/api.js';

export default function QuizPanel() {
  const { quizQueue, removeQuizQuestion, recordQuizAnswer, topicScores, getRecentTranscript } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [answered, setAnswered] = useState({}); // { [id]: selectedIndex }
  const [revealed, setRevealed] = useState({}); // { [id]: true }

  const currentQ = quizQueue[0] || null;

  async function handleGenerateNow() {
    const transcript = getRecentTranscript(8000);
    if (transcript.trim().length < 30) {
      setError('Need more transcript content. Keep recording.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const asked = Object.keys(answered);
      const { questions } = await api.generateQuiz(transcript, '', asked);
      useStore.getState().addQuizQuestions(questions);
    } catch (e) {
      setError(e.message || 'Failed to generate quiz');
    } finally {
      setLoading(false);
    }
  }

  function handleAnswer(q, selectedIdx) {
    if (answered[q.id] !== undefined) return;
    setAnswered((prev) => ({ ...prev, [q.id]: selectedIdx }));
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    const correct = selectedIdx === q.correctIndex;
    recordQuizAnswer(q.id, q.topicTag, correct);
  }

  function handleNext() {
    if (currentQ) removeQuizQuestion(currentQ.id);
  }

  // Topic score summary
  const topics = Object.entries(topicScores)
    .map(([topic, { correct, total }]) => ({ topic, score: total > 0 ? correct / total : 0, total }))
    .sort((a, b) => a.score - b.score);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Real-Time Quiz</span>
        <div style={styles.headerRight}>
          <span style={styles.queueCount}>{quizQueue.length} pending</span>
          <button onClick={handleGenerateNow} style={styles.genBtn} disabled={loading}>
            {loading ? <Spinner /> : '+ Generate'}
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.body}>
        {/* Active question */}
        {currentQ ? (
          <QuizCard
            q={currentQ}
            selected={answered[currentQ.id]}
            revealed={!!revealed[currentQ.id]}
            onAnswer={(idx) => handleAnswer(currentQ, idx)}
            onNext={handleNext}
            remaining={quizQueue.length}
          />
        ) : (
          <div style={styles.noQ}>
            <div style={{ fontSize: 32 }}>✅</div>
            <p style={styles.noQText}>
              {Object.keys(topicScores).length > 0
                ? 'All caught up! More questions will appear as the lecture continues.'
                : 'Quiz questions will appear here automatically during the lecture.'}
            </p>
          </div>
        )}

        {/* Topic score heatmap */}
        {topics.length > 0 && (
          <div style={styles.heatSection}>
            <div style={styles.heatLabel}>Topic Performance</div>
            <div style={styles.heatGrid}>
              {topics.map((t) => (
                <TopicBar key={t.topic} topic={t.topic} score={t.score} total={t.total} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizCard({ q, selected, revealed, onAnswer, onNext, remaining }) {
  const diffColor = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };

  return (
    <div style={styles.card} className="fade-in">
      <div style={styles.cardMeta}>
        <span style={styles.topicBadge}>{q.topicTag}</span>
        <span style={{ ...styles.diffBadge, color: diffColor[q.difficulty] || '#94a3b8' }}>
          {q.difficulty}
        </span>
        {remaining > 1 && (
          <span style={styles.queueBadge}>+{remaining - 1} more</span>
        )}
      </div>

      <p style={styles.question}>{q.question}</p>

      <div style={styles.options}>
        {q.options.map((opt, i) => {
          let optStyle = styles.option;
          if (revealed) {
            if (i === q.correctIndex) optStyle = { ...optStyle, ...styles.optionCorrect };
            else if (i === selected && selected !== q.correctIndex) optStyle = { ...optStyle, ...styles.optionWrong };
            else optStyle = { ...optStyle, opacity: 0.5 };
          } else if (selected === i) {
            optStyle = { ...optStyle, ...styles.optionSelected };
          }
          return (
            <button key={i} style={optStyle} onClick={() => onAnswer(i)} disabled={revealed}>
              <span style={styles.optLetter}>{String.fromCharCode(65 + i)}</span>
              <span style={styles.optText}>{opt.replace(/^[A-D]\.\s*/, '')}</span>
            </button>
          );
        })}
      </div>

      {revealed && (
        <div style={styles.explanation} className="fade-in">
          <div style={styles.explanationHeader}>
            {selected === q.correctIndex ? '✅ Correct!' : '❌ Incorrect'}
          </div>
          <p style={styles.explanationText}>{q.explanation}</p>
          <button onClick={onNext} style={styles.nextBtn}>Next Question →</button>
        </div>
      )}
    </div>
  );
}

function TopicBar({ topic, score, total }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={styles.topicBar}>
      <div style={styles.topicBarHeader}>
        <span style={styles.topicName}>{topic}</span>
        <span style={{ ...styles.topicPct, color }}>{pct}%</span>
      </div>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={styles.topicSample}>{total} question{total !== 1 ? 's' : ''}</span>
    </div>
  );
}

function Spinner() {
  return <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  title: { fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  queueCount: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  genBtn: { background: 'var(--accent-amber)', border: 'none', borderRadius: 7, color: '#000', fontSize: 12, fontWeight: 700, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  error: { margin: '8px 20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#fca5a5' },
  body: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 },
  noQ: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 32, textAlign: 'center' },
  noQText: { color: 'var(--text-muted)', fontSize: 13, maxWidth: 280, lineHeight: 1.6 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18 },
  cardMeta: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  topicBadge: { fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(59,130,246,0.15)', color: 'var(--accent-light)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, padding: '2px 7px' },
  diffBadge: { fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em' },
  queueBadge: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' },
  question: { fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 16 },
  options: { display: 'flex', flexDirection: 'column', gap: 8 },
  option: { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', transition: 'all 0.15s', width: '100%' },
  optionSelected: { background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.4)' },
  optionCorrect: { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.4)' },
  optionWrong: { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' },
  optLetter: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 16 },
  optText: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 },
  explanation: { marginTop: 14, padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' },
  explanationHeader: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 },
  explanationText: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 12 },
  nextBtn: { background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '7px 16px', cursor: 'pointer' },
  heatSection: { display: 'flex', flexDirection: 'column', gap: 10 },
  heatLabel: { fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  heatGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  topicBar: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 },
  topicBarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  topicName: { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' },
  topicPct: { fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)' },
  barTrack: { height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, transition: 'width 0.4s ease' },
  topicSample: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
};
