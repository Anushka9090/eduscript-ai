import { useRef, useEffect, useState } from 'react';
import { useStore } from '../../store/index.js';
import { exportSRT, exportJSON, downloadFile } from '../../utils/export.js';

const SPEAKER_COLORS = {
  SPEAKER_01: '#60a5fa',
  SPEAKER_02: '#34d399',
  SPEAKER_03: '#f59e0b',
  SPEAKER_04: '#c084fc',
  SPEAKER_05: '#fb7185',
};

function ConfidenceDot({ confidence }) {
  const color = confidence >= 0.9 ? '#10b981' : confidence >= 0.7 ? '#f59e0b' : '#ef4444';
  return (
    <span title={`${Math.round(confidence * 100)}% confidence`} style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: color, marginRight: 3, verticalAlign: 'middle', flexShrink: 0,
    }} />
  );
}

export default function TranscriptPanel() {
  const { words, isRecording, sessionId, notes, interimText } = useStore();
  const bottomRef = useRef(null);
  const [browserMode, setBrowserMode] = useState('');

  useEffect(() => {
    // Detect browser mode for display
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setBrowserMode(SR ? 'Web Speech API' : 'Gemini Fallback (15s chunks)');
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [words.length, interimText]);

  // Group consecutive words by speaker
  const segments = [];
  let cur = null;
  for (const w of words) {
    if (!cur || cur.speaker !== w.speaker) { cur = { speaker: w.speaker, words: [w] }; segments.push(cur); }
    else cur.words.push(w);
  }

  function handleExportSRT() {
    downloadFile(exportSRT(words), `eduscript-${sessionId || 'session'}.srt`, 'text/plain');
  }
  function handleExportJSON() {
    downloadFile(exportJSON(words, notes, sessionId), `eduscript-${sessionId || 'session'}.json`, 'application/json');
  }

  const uniqueSpeakers = [...new Set(words.map(w => w.speaker))];

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.title}>Live Transcript</span>
          {isRecording && (
            <span style={S.liveChip}><span style={S.liveDot} />LIVE</span>
          )}
          <span style={S.meta}>{words.length} words</span>
          {uniqueSpeakers.length > 1 && (
            <span style={S.meta}>{uniqueSpeakers.length} speakers</span>
          )}
        </div>
        <div style={S.headerRight}>
          {browserMode && (
            <span style={S.modeBadge} title="Transcription engine">
              {browserMode === 'Web Speech API' ? '🟢' : '🟡'} {browserMode}
            </span>
          )}
          <button onClick={handleExportSRT} style={S.exportBtn} disabled={!words.length}>↓ SRT</button>
          <button onClick={handleExportJSON} style={S.exportBtn} disabled={!words.length}>↓ JSON</button>
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>
        {words.length === 0 && !interimText ? (
          <div style={S.empty}>
            <div style={{ fontSize: 40 }}>🎙</div>
            <p style={S.emptyText}>
              {isRecording
                ? 'Listening… speech appears here in real time.'
                : 'Press Record to start capturing lecture audio.'}
            </p>
            {isRecording && browserMode && (
              <span style={S.engineNote}>Using: {browserMode}</span>
            )}
          </div>
        ) : (
          <>
            {segments.map((seg, i) => (
              <div key={i} style={S.segment} className="fade-in">
                <div style={S.speakerRow}>
                  <span style={{ ...S.speakerLabel, color: SPEAKER_COLORS[seg.speaker] || '#94a3b8', borderColor: SPEAKER_COLORS[seg.speaker] || '#94a3b8' }}>
                    {seg.speaker}
                  </span>
                  <span style={S.timestamp}>{fmtMs(seg.words[0]?.startMs)}</span>
                </div>
                <p style={S.segText}>
                  {seg.words.map(w => (
                    <span key={w.id} style={S.wordWrap} title={`${fmtMs(w.startMs)} · ${Math.round(w.confidence * 100)}%`}>
                      <ConfidenceDot confidence={w.confidence} />{w.word}{' '}
                    </span>
                  ))}
                </p>
              </div>
            ))}

            {/* Interim text (grey, italic — not yet committed) */}
            {interimText && (
              <div style={S.interim} className="fade-in">
                <span style={S.interimLabel}>…</span>
                <span style={S.interimText}>{interimText}</span>
              </div>
            )}

            {isRecording && <span style={S.cursor} />}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function fmtMs(ms) {
  if (ms == null) return '';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const S = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', gap: 8 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' },
  liveChip: { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#ef4444', letterSpacing: '0.08em' },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.2s ease-in-out infinite' },
  meta: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  modeBadge: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 4, border: '1px solid var(--border)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  exportBtn: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)', padding: '4px 10px', cursor: 'pointer' },
  body: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  segment: { display: 'flex', flexDirection: 'column', gap: 4 },
  speakerRow: { display: 'flex', alignItems: 'center', gap: 8 },
  speakerLabel: { fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', border: '1px solid', borderRadius: 4, padding: '1px 6px' },
  timestamp: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  segText: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75 },
  wordWrap: { display: 'inline' },
  interim: { display: 'flex', gap: 6, alignItems: 'baseline', opacity: 0.6 },
  interimLabel: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  interimText: { fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.6 },
  cursor: { display: 'inline-block', width: 2, height: 15, background: 'var(--accent)', borderRadius: 1, animation: 'blink 1s step-end infinite', verticalAlign: 'middle' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center' },
  emptyText: { color: 'var(--text-muted)', fontSize: 14, maxWidth: 300, lineHeight: 1.6 },
  engineNote: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 },
};
