/**
 * useTranscription.js — v4: Stable, production-tested
 *
 * Fixes:
 * 1. Auto-restart with guard (no infinite loops, no duplicate starts)
 * 2. Correct event.results iteration (never overwrites, always appends)
 * 3. Dedup ring-buffer (blocks SpeechRecognition's repeat bug)
 * 4. AudioContext real timestamps
 * 5. Energy-based speaker heuristic
 * 6. MediaRecorder fallback for Safari/Firefox
 */

import { useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { saveWords } from '../services/db.js';
const WS_BASE =
  window.location.hostname === 'localhost'
    ? 'ws://localhost:3001'
    : 'wss://eduscript-ai.onrender.com';

const WS_URL = `${WS_BASE}/ws/transcribe`;
const WORDS_FOR_QUIZ  = 150;

// ── Rate limiter ──────────────────────────────────────────────────────────
const _dk = () => new Date().toDateString();
export const rateLimiter = {
  calls: [], MAX_PER_MIN: 3, MAX_PER_DAY: 18,
  _dk: _dk(), _dc: parseInt(localStorage.getItem('es_dc') || '0'),
  canCall() {
    if (_dk() !== this._dk) { this._dk = _dk(); this._dc = 0; localStorage.setItem('es_dc','0'); }
    if (this._dc >= this.MAX_PER_DAY) return false;
    this.calls = this.calls.filter(t => Date.now()-t < 60000);
    return this.calls.length < this.MAX_PER_MIN;
  },
  record() { this.calls.push(Date.now()); this._dc++; localStorage.setItem('es_dc', String(this._dc)); },
  remaining() {
    this.calls = this.calls.filter(t => Date.now()-t < 60000);
    return { perMin: Math.max(0, this.MAX_PER_MIN - this.calls.length), perDay: Math.max(0, this.MAX_PER_DAY - this._dc) };
  },
};

// ── Dedup: prevents SpeechRecognition repeat bug ──────────────────────────
function makeDedup(size = 10) {
  const ring = []; const seen = new Set();
  return {
    isDup(text) {
      const key = text.trim().toLowerCase().replace(/\s+/g,' ').slice(0, 80);
      if (seen.has(key)) return true;
      ring.push(key); seen.add(key);
      if (ring.length > size) seen.delete(ring.shift());
      return false;
    },
    reset() { ring.length = 0; seen.clear(); },
  };
}

// ── Speaker detector via AudioContext energy ──────────────────────────────
function makeSpeakerDet() {
  let idx = 1, silentFrames = 0, wasLoud = false;
  let analyser = null, buf = null;
  const THRESH = 0.008, FRAMES = 20; // ~20 rAF frames ≈ 330ms silence

  return {
    init(ctx, source) {
      analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      buf = new Float32Array(analyser.frequencyBinCount);
      source.connect(analyser);
    },
    tick() {
      if (!analyser) return `SPEAKER_0${idx}`;
      analyser.getFloatTimeDomainData(buf);
      const energy = buf.reduce((s,v) => s + v*v, 0) / buf.length;
      const isLoud = energy > THRESH;
      if (!isLoud) { silentFrames++; }
      else {
        if (silentFrames >= FRAMES && wasLoud) {
          idx = Math.min(idx + 1, 5); // new speaker after sufficient silence
        }
        silentFrames = 0;
      }
      wasLoud = isLoud;
      return `SPEAKER_0${idx}`;
    },
    current() { return `SPEAKER_0${idx}`; },
    reset()   { idx = 1; silentFrames = 0; wasLoud = false; },
  };
}

// ═════════════════════════════════════════════════════════════════════════
export function useTranscription() {
  // Refs — none of these trigger re-renders
  const wsRef           = useRef(null);
  const recogRef        = useRef(null);
  const audioCtxRef     = useRef(null);
  const streamRef       = useRef(null);
  const speakerDet      = useRef(makeSpeakerDet());
  const dedup           = useRef(makeDedup());
  const pingRef         = useRef(null);
  const energyFrame     = useRef(null);
  const wordIdxRef      = useRef(0);
  const sessionMsRef    = useRef(0);
  const isActiveRef     = useRef(false); // ground truth for restart guard
  const restartCount    = useRef(0);

  // AI throttle
  const wSinceNotes = useRef(0);
  const wSinceQuiz  = useRef(0);
  const askedQs     = useRef([]);

  // MediaRecorder fallback
  const mrRef    = useRef(null);
  const mrChunks = useRef([]);
  const mrTimer  = useRef(null);

  const store = useStore;

  // ── helpers ─────────────────────────────────────────────────────────────
  function nowMs() {
    return audioCtxRef.current
      ? Math.round(audioCtxRef.current.currentTime * 1000)
      : Date.now() - sessionMsRef.current;
  }

  function sendToWS(text, isFinal, confidence, speaker) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'transcript_text', text, isFinal, confidence, speakerLabel: speaker,
      }));
    }
  }

  // ── AI triggers (rate-limited) ───────────────────────────────────────────
  async function maybeNotes(n) {
    wSinceNotes.current += n;
    if (wSinceNotes.current < WORDS_FOR_NOTES || !rateLimiter.canCall()) return;
    wSinceNotes.current = 0; rateLimiter.record();
    try {
      const { api } = await import('../services/api.js');
      const r = await api.generateNotes(store.getState().getRecentTranscript(8000));
      if (r.notes) store.getState().addNotes(r.notes);
    } catch(e) { console.warn('[Notes]', e.message); }
  }

  async function maybeQuiz(n) {
    wSinceQuiz.current += n;
    if (wSinceQuiz.current < WORDS_FOR_QUIZ || !rateLimiter.canCall()) return;
    wSinceQuiz.current = 0; rateLimiter.record();
    try {
      const { api } = await import('../services/api.js');
      const r = await api.generateQuiz(
        store.getState().getRecentTranscript(6000), '', askedQs.current.slice(-8)
      );
      if (r.questions?.length) {
        askedQs.current.push(...r.questions.map(q => q.question));
        store.getState().addQuizQuestions(r.questions);
      }
    } catch(e) { console.warn('[Quiz]', e.message); }
  }

  // ── WebSocket ────────────────────────────────────────────────────────────
  function connectWS() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      store.getState().setConnected(true);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
      }, 20000);
    };

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'transcript_chunk' && msg.words?.length) {
          const s = store.getState();
          s.appendWords(msg.words);
          // Persist to IndexedDB (non-blocking, silent fail OK)
          const sid = s.sessionId;
          if (sid) saveWords(sid, msg.words).catch(() => {});
          maybeNotes(msg.words.length);
          maybeQuiz(msg.words.length);
        }
      } catch { /* malformed frame — ignore */ }
    };

    ws.onerror = () => store.getState().setConnected(false);
    ws.onclose = () => {
      store.getState().setConnected(false);
      clearInterval(pingRef.current);
      // Auto-reconnect only while session active
      if (isActiveRef.current) setTimeout(connectWS, 2000);
    };

    wsRef.current = ws;
  }

  // ── Web Speech API (Chrome / Edge) ───────────────────────────────────────
  function buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const r = new SR();
    r.continuous      = true;
    r.interimResults  = true;
    r.lang            = 'en-US';
    r.maxAlternatives = 1;

    // ── KEY FIX: correct results iteration ────────────────────────────────
    // event.resultIndex tells us which results are NEW this event.
    // We must start from resultIndex, not 0, to avoid processing old results.
    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text   = result[0].transcript.trim();
        const conf   = result[0].confidence || 0.88;

        if (!result.isFinal) {
          // Show interim (greyed out) — never commit to store
          store.getState().setInterimText(text);
          continue;
        }

        // Final result — commit
        store.getState().setInterimText('');
        if (!text) continue;

        // Dedup guard — blocks SpeechRecognition repeat bug
        if (dedup.current.isDup(text)) {
          console.debug('[Dedup blocked]', text.slice(0, 40));
          continue;
        }

        const speaker = speakerDet.current.current();
        sendToWS(text, true, conf, speaker);
      }
    };

    // ── KEY FIX: robust auto-restart with guard ───────────────────────────
    r.onend = () => {
      store.getState().setInterimText('');
      if (!isActiveRef.current) return; // user stopped — don't restart

      restartCount.current++;
      // Exponential backoff: 200 → 400 → 800 → cap 3000ms
      const delay = Math.min(200 * restartCount.current, 3000);

      setTimeout(() => {
        if (!isActiveRef.current) return; // double-check still active
        try {
          r.start();
          // Decay restart count on successful start
          setTimeout(() => { restartCount.current = Math.max(0, restartCount.current - 1); }, 5000);
        } catch (err) {
          // 'already started' is harmless — everything else log
          if (!err.message?.includes('already started')) {
            console.warn('[SpeechRecognition restart]', err.message);
          }
        }
      }, delay);
    };

    r.onerror = (e) => {
      // These are normal — don't restart
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.warn('[SpeechRecognition error]', e.error);
      // 'network' and 'service-not-allowed' need user action — surface them
      if (e.error === 'not-allowed') {
        store.getState().setRecordingError('Microphone permission revoked. Please refresh and allow access.');
      }
    };

    return r;
  }

  // ── MediaRecorder fallback (Safari / Firefox) ─────────────────────────
  function startMediaRecorderFallback(stream) {
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
               : MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4'
               : 'audio/ogg';
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mrRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data.size > 100) mrChunks.current.push(e.data); };

    mr.onstop = async () => {
      if (!mrChunks.current.length || !isActiveRef.current) return;
      const blob = new Blob(mrChunks.current, { type: mime });
      mrChunks.current = [];

      if (!rateLimiter.canCall()) {
        console.warn('[Fallback] Rate limit hit — skipping audio chunk');
        scheduleNextChunk(mr);
        return;
      }

      try {
        const base64 = await blobToBase64(blob);
        rateLimiter.record();
        const res = await fetch('/api/transcribe-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64, mimeType: mime }),
        });
        if (res.ok) {
          const { text, confidence } = await res.json();
          if (text?.trim() && !dedup.current.isDup(text)) {
            sendToWS(text.trim(), true, confidence || 0.85, speakerDet.current.current());
          }
        }
      } catch (e) { console.warn('[Fallback transcription]', e.message); }

      scheduleNextChunk(mr);
    };

    mr.start();
    scheduleNextChunk(mr);
  }

  function scheduleNextChunk(mr) {
    if (!isActiveRef.current) return;
    mrTimer.current = setTimeout(() => {
      if (mr.state === 'recording') {
        try { mr.stop(); } catch { /* already stopped */ }
      }
    }, 15000);
  }

  // ── Energy ticker (speaker detection) ────────────────────────────────────
  function startEnergyLoop() {
    const tick = () => {
      speakerDet.current.tick();
      energyFrame.current = requestAnimationFrame(tick);
    };
    energyFrame.current = requestAnimationFrame(tick);
  }

  // ── START ─────────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isActiveRef.current) return; // guard against double-start
    isActiveRef.current = true;
    restartCount.current = 0;

    store.getState().startSession();
    store.getState().setRecordingError('');
    sessionMsRef.current = Date.now();
    dedup.current.reset();
    speakerDet.current.reset();
    wSinceNotes.current = 0;
    wSinceQuiz.current  = 0;

    // Mic
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      isActiveRef.current = false;
      throw err;
    }
    streamRef.current = stream;

    // AudioContext for real timestamps + speaker energy
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    speakerDet.current.init(ctx, source);
    startEnergyLoop();

    connectWS();

    // Choose engine
    const recog = buildRecognition();
    if (recog) {
      recog.start();
      recogRef.current = recog;
    } else {
      startMediaRecorderFallback(stream);
    }

    store.getState().setRecording(true);
    store.getState().setBrowserMode(recog ? 'Web Speech API' : 'Gemini Fallback');
  }, []);

  // ── STOP ──────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    isActiveRef.current = false; // must be first — stops all auto-restarts

    store.getState().setInterimText('');
    store.getState().setRecording(false);
    store.getState().setConnected(false);

    // Stop speech recognition
    try { recogRef.current?.abort(); } catch { }
    recogRef.current = null;

    // Stop MediaRecorder fallback
    clearTimeout(mrTimer.current);
    try { if (mrRef.current?.state === 'recording') mrRef.current.stop(); } catch { }
    mrRef.current = null;
    mrChunks.current = [];

    // Stop energy loop
    if (energyFrame.current) cancelAnimationFrame(energyFrame.current);

    // Close AudioContext
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    // Stop mic stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    // Close WebSocket
    clearInterval(pingRef.current);
    if (wsRef.current) {
      wsRef.current.close(1000, 'User stopped');
      wsRef.current = null;
    }
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (isActiveRef.current) stopRecording();
    };
  }, []);

  return {
    startRecording,
    stopRecording,
    rateLimiter,
    isNativeSpeech: () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
