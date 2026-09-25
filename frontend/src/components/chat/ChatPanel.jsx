import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../../store/index.js';
import { api } from '../../services/api.js';

export default function ChatPanel() {
  const { chatHistory, addChatMessage, getRecentTranscript } = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory.length, loading]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;

    setInput('');
    setError('');
    addChatMessage('user', q);
    setLoading(true);

    try {
      const transcript = getRecentTranscript(15000);
      const history = chatHistory.slice(-8).map((m) => ({ role: m.role, text: m.text }));

      const res = await api.chat(q, transcript, history);
      const answer = res.answer?.trim();
      if (!answer) throw new Error('Received empty response. Please try again.');
      addChatMessage('model', answer);
    } catch (e) {
      setError(e.message || 'Failed to get answer. Please try again.');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const SUGGESTED = [
    'Summarize what was just explained',
    'What is the main concept of this lecture?',
    'Explain this in simpler terms',
    'Give me an example of this',
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Doubt Resolver</span>
        <span style={styles.subtitle}>Answers grounded in your lecture</span>
      </div>

      <div style={styles.body}>
        {chatHistory.length === 0 && (
          <div style={styles.welcome} className="fade-in">
            <div style={{ fontSize: 36, marginBottom: 8 }}>💡</div>
            <p style={styles.welcomeText}>Ask anything about your lecture. I'll answer using the transcript first.</p>
            <div style={styles.suggestions}>
              {SUGGESTED.map((s) => (
                <button key={s} style={styles.suggBtn} onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <div key={i} style={{ ...styles.bubble, ...(msg.role === 'user' ? styles.userBubble : styles.aiBubble) }} className="fade-in">
            {msg.role === 'model' ? (
              <div className="markdown-body">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ) : (
              <p style={styles.userText}>{msg.text}</p>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.bubble, ...styles.aiBubble }} className="fade-in">
            <ThinkingDots />
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputRow}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a doubt about the lecture..."
          style={styles.textarea}
          rows={2}
          maxLength={1000}
          disabled={loading}
          aria-label="Type your question"
        />
        <button
          onClick={handleSend}
          style={{ ...styles.sendBtn, opacity: (!input.trim() || loading) ? 0.4 : 1 }}
          disabled={!input.trim() || loading}
          aria-label="Send question"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 0' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: { padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  title: { fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', display: 'block' },
  subtitle: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 2 },
  body: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 },
  welcome: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0', gap: 8 },
  welcomeText: { color: 'var(--text-muted)', fontSize: 13, maxWidth: 280, lineHeight: 1.6 },
  suggestions: { display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 8 },
  suggBtn: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, padding: '9px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' },
  bubble: { padding: '12px 16px', borderRadius: 12, maxWidth: '92%', lineHeight: 1.6 },
  userBubble: { background: 'var(--accent)', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { background: 'var(--bg-card)', border: '1px solid var(--border)', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  userText: { fontSize: 13, color: '#fff', lineHeight: 1.55 },
  error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fca5a5' },
  inputRow: { padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 },
  textarea: { flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, padding: '10px 14px', resize: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5, outline: 'none' },
  sendBtn: { background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', width: 40, height: 40, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'opacity 0.15s' },
};
