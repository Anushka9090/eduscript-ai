import { useState } from 'react';
import { useStore } from '../../store/index.js';
import { api } from '../../services/api.js';

export default function NotesPanel() {
  const { notes, addNotes, getRecentTranscript, isRecording } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState(0);

  async function handleGenerateNow() {
    const transcript = getRecentTranscript(10000);
    if (transcript.trim().length < 20) {
      setError('Not enough transcript yet. Keep recording.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { notes: newNote } = await api.generateNotes(transcript);
      addNotes(newNote);
      setExpandedIdx(0);
    } catch (e) {
      setError(e.message || 'Failed to generate notes');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Auto Notes</span>
        <button onClick={handleGenerateNow} style={styles.genBtn} disabled={loading}>
          {loading ? <Spinner /> : '+ Generate Now'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.body}>
        {notes.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 36 }}>📝</div>
            <p style={styles.emptyText}>
              Notes are auto-generated every ~2 minutes of lecture.<br />
              Or click "Generate Now" anytime.
            </p>
          </div>
        ) : (
          notes.map((note, i) => (
            <NoteCard
              key={i}
              note={note}
              expanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? -1 : i)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NoteCard({ note, expanded, onToggle }) {
  return (
    <div style={styles.card} className="fade-in">
      <button style={styles.cardHeader} onClick={onToggle}>
        <div style={styles.cardHeaderLeft}>
          <div style={styles.noteTitle}>{note.title}</div>
          <div style={styles.tagRow}>
            {note.topicTags?.map((t) => (
              <span key={t} style={styles.tag}>{t}</span>
            ))}
          </div>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={styles.cardBody}>
          {note.summary && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Summary</div>
              <p style={styles.sectionText}>{note.summary}</p>
            </div>
          )}

          {note.keyPoints?.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Key Points</div>
              <ul style={styles.list}>
                {note.keyPoints.map((p, i) => <li key={i} style={styles.listItem}>{p}</li>)}
              </ul>
            </div>
          )}

          {note.definitions?.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Definitions</div>
              {note.definitions.map((d, i) => (
                <div key={i} style={styles.defRow}>
                  <span style={styles.defTerm}>{d.term}</span>
                  <span style={styles.defDef}>{d.definition}</span>
                </div>
              ))}
            </div>
          )}

          {note.formulas?.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Formulas</div>
              {note.formulas.map((f, i) => (
                <code key={i} style={styles.formula}>{f}</code>
              ))}
            </div>
          )}

          {note.examples?.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Examples</div>
              <ul style={styles.list}>
                {note.examples.map((e, i) => <li key={i} style={styles.listItem}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
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
  genBtn: { background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  error: { margin: '8px 20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#fca5a5' },
  body: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center' },
  emptyText: { color: 'var(--text-muted)', fontSize: 13, maxWidth: 300, lineHeight: 1.7 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' },
  cardHeader: { width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardHeaderLeft: { display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', flex: 1 },
  noteTitle: { fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' },
  tagRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  tag: { fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(59,130,246,0.15)', color: 'var(--accent-light)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, padding: '2px 6px' },
  cardBody: { padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionLabel: { fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  sectionText: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
  list: { paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 },
  listItem: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 },
  defRow: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)' },
  defTerm: { fontSize: 12, fontWeight: 600, color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', minWidth: 100, flexShrink: 0 },
  defDef: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 },
  formula: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: 6, color: 'var(--accent-light)', marginBottom: 4 },
};
