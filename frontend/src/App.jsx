import { useState } from 'react';
import { useStore } from './store/index.js';
import { useTranscription } from './hooks/useTranscription.js';
import TranscriptPanel from './components/transcription/TranscriptPanel.jsx';
import NotesPanel from './components/notes/NotesPanel.jsx';
import QuizPanel from './components/quiz/QuizPanel.jsx';
import ChatPanel from './components/chat/ChatPanel.jsx';
import ReteachPanel from './components/reteach/ReteachPanel.jsx';
import TokenBudget from './components/dashboard/TokenBudget.jsx';
import DebugBar from './components/dashboard/DebugBar.jsx';

const PANELS = [
  { id: 'transcript', label: '🎙 Transcript', short: 'Live' },
  { id: 'notes', label: '📝 Notes', short: 'Notes' },
  { id: 'quiz', label: '❓ Quiz', short: 'Quiz' },
  { id: 'chat', label: '💬 Chat', short: 'Chat' },
  { id: 'reteach', label: '🔁 Re-Teach', short: 'Learn' },
];

export default function App() {
  const {
    activePanel, setActivePanel,
    isRecording, isConnected,
    words, quizQueue, chatHistory,
    resetSession, recordingError, setRecordingError, browserMode,
  } = useStore();

  const { startRecording, stopRecording } = useTranscription();
  // recordingError comes from store so it survives panel switches
  const [starting, setStarting] = useState(false);

  async function handleToggleRecording() {
    if (isRecording) { stopRecording(); return; }
    setRecordingError('');
    setStarting(true);
    try {
      await startRecording();
    } catch (err) {
      setRecordingError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow access and try again.'
          : 'Could not access microphone: ' + err.message
      );
    } finally {
      setStarting(false);
    }
  }

  // Badge counts for tabs
  const badges = {
    quiz: quizQueue.length,
    chat: 0,
  };

  return (
    <div style={styles.root}>
      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header style={styles.topBar}>
        <div style={styles.brand}>
          <span style={styles.brandName}>EduScript</span>
          <span style={styles.brandTag}>AI</span>
          <span style={styles.teamTag}>by CtrlAltDefeat</span>
        </div>

        <div style={styles.statusRow}>
        <TokenBudget />
          {isRecording && (
            <div style={styles.connStatus}>
              <span style={{ ...styles.connDot, background: isConnected ? '#10b981' : '#f59e0b' }} />
              <span style={styles.connText}>{isConnected ? 'Connected' : 'Reconnecting...'}</span>
            </div>
          )}
          <span style={styles.wordBadge}>{words.length} words</span>
        </div>

        <button
          onClick={handleToggleRecording}
          style={{ ...styles.recBtn, ...(isRecording ? styles.recBtnActive : {}) }}
          disabled={starting}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {starting ? <MiniSpinner /> : isRecording ? '⏹ Stop' : '⏺ Record'}
        </button>
      </header>

      {/* ── Mic Error ───────────────────────────────────────────── */}
      {recordingError && (
        <div style={styles.micError}>
          ⚠️ {recordingError}
          <button style={styles.micErrorDismiss} onClick={() => setRecordingError('')}>✕</button>
        </div>
      )}

      {/* ── Nav Tabs ────────────────────────────────────────────── */}
      <nav style={styles.nav} role="tablist" aria-label="App panels">
        {PANELS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={activePanel === p.id}
            style={{ ...styles.navTab, ...(activePanel === p.id ? styles.navTabActive : {}) }}
            onClick={() => setActivePanel(p.id)}
          >
            <span style={styles.navLabel}>{p.label}</span>
            <span style={styles.navShort}>{p.short}</span>
            {badges[p.id] > 0 && (
              <span style={styles.navBadge}>{badges[p.id]}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Panel Content ───────────────────────────────────────── */}
      <main style={styles.main} role="tabpanel">
        {activePanel === 'transcript' && <TranscriptPanel />}
        {activePanel === 'notes' && <NotesPanel />}
        {activePanel === 'quiz' && <QuizPanel />}
        {activePanel === 'chat' && <ChatPanel />}
        {activePanel === 'reteach' && <ReteachPanel />}
      </main>

      {/* ── Footer reset ────────────────────────────────────────── */}
      <DebugBar />

      {words.length > 0 && !isRecording && (
        <div style={styles.footer}>
          <button style={styles.resetBtn} onClick={() => { if (confirm('Clear session data?')) resetSession(); }}>
            Clear Session
          </button>
        </div>
      )}
    </div>
  );
}

function MiniSpinner() {
  return (
    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg-base)' },

  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 12 },
  brand: { display: 'flex', alignItems: 'center', gap: 6 },
  brandName: { fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  brandTag: { background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' },
  teamTag: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },

  statusRow: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  connStatus: { display: 'flex', alignItems: 'center', gap: 5 },
  connDot: { width: 7, height: 7, borderRadius: '50%' },
  connText: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  wordBadge: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },

  recBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, padding: '7px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s', whiteSpace: 'nowrap' },
  recBtnActive: { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' },

  micError: { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', padding: '10px 20px', fontSize: 12, color: '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  micErrorDismiss: { background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 14, padding: 0 },

  nav: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, overflowX: 'auto' },
  navTab: { flex: 1, background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, padding: '10px 8px', cursor: 'pointer', transition: 'all 0.15s', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 70, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' },
  navTabActive: { borderBottomColor: 'var(--accent)', color: 'var(--accent-light)', background: 'rgba(59,130,246,0.06)' },
  navLabel: { display: 'none' },
  navShort: { display: 'block' },
  navBadge: { background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, fontFamily: 'var(--font-mono)' },

  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  footer: { padding: '8px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-surface)', flexShrink: 0 },
  resetBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '4px 12px', cursor: 'pointer' },
};

// Show full labels on wider screens
const mediaStyle = document.createElement('style');
mediaStyle.textContent = `@media(min-width:500px){.nav-label-full{display:block!important}.nav-label-short{display:none!important}}`;
document.head.appendChild(mediaStyle);
