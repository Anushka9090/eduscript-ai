/**
 * useTranscription.js
 * Production-safe transcription hook
 */

import { useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { saveWords } from '../services/db.js';

// ── Backend URLs ──────────────────────────────────────────────────────────
const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : 'https://eduscript-ai.onrender.com/api';

const WS_BASE =
  window.location.hostname === 'localhost'
    ? 'ws://localhost:3001'
    : 'wss://eduscript-ai.onrender.com';

const WS_URL = `${WS_BASE}/ws/transcribe`;

const WORDS_FOR_NOTES = 200;
const WORDS_FOR_QUIZ = 150;

// ── Rate limiter ──────────────────────────────────────────────────────────
const _dk = () => new Date().toDateString();

export const rateLimiter = {
  calls: [],
  MAX_PER_MIN: 3,
  MAX_PER_DAY: 18,

  _dk: _dk(),
  _dc: parseInt(localStorage.getItem('es_dc') || '0'),

  canCall() {
    if (_dk() !== this._dk) {
      this._dk = _dk();
      this._dc = 0;
      localStorage.setItem('es_dc', '0');
    }

    if (this._dc >= this.MAX_PER_DAY) return false;

    this.calls = this.calls.filter(
      (t) => Date.now() - t < 60000
    );

    return this.calls.length < this.MAX_PER_MIN;
  },

  record() {
    this.calls.push(Date.now());
    this._dc++;
    localStorage.setItem('es_dc', String(this._dc));
  },

  remaining() {
    this.calls = this.calls.filter(
      (t) => Date.now() - t < 60000
    );

    return {
      perMin: Math.max(
        0,
        this.MAX_PER_MIN - this.calls.length
      ),
      perDay: Math.max(
        0,
        this.MAX_PER_DAY - this._dc
      ),
    };
  },
};

// ── Dedup ─────────────────────────────────────────────────────────────────
function makeDedup(size = 10) {
  const ring = [];
  const seen = new Set();

  return {
    isDup(text) {
      const key = text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .slice(0, 80);

      if (seen.has(key)) return true;

      ring.push(key);
      seen.add(key);

      if (ring.length > size) {
        seen.delete(ring.shift());
      }

      return false;
    },

    reset() {
      ring.length = 0;
      seen.clear();
    },
  };
}

// ── Speaker detector ─────────────────────────────────────────────────────
function makeSpeakerDet() {
  let idx = 1;
  let silentFrames = 0;
  let wasLoud = false;

  let analyser = null;
  let buf = null;

  const THRESH = 0.008;
  const FRAMES = 20;

  return {
    init(ctx, source) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;

      buf = new Float32Array(
        analyser.frequencyBinCount
      );

      source.connect(analyser);
    },

    tick() {
      if (!analyser) return `SPEAKER_0${idx}`;

      analyser.getFloatTimeDomainData(buf);

      const energy =
        buf.reduce((s, v) => s + v * v, 0) /
        buf.length;

      const isLoud = energy > THRESH;

      if (!isLoud) {
        silentFrames++;
      } else {
        if (silentFrames >= FRAMES && wasLoud) {
          idx = Math.min(idx + 1, 5);
        }

        silentFrames = 0;
      }

      wasLoud = isLoud;

      return `SPEAKER_0${idx}`;
    },

    current() {
      return `SPEAKER_0${idx}`;
    },

    reset() {
      idx = 1;
      silentFrames = 0;
      wasLoud = false;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════

export function useTranscription() {
  const wsRef = useRef(null);
  const recogRef = useRef(null);

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);

  const speakerDet = useRef(makeSpeakerDet());
  const dedup = useRef(makeDedup());

  const pingRef = useRef(null);
  const energyFrame = useRef(null);

  const sessionMsRef = useRef(0);
  const isActiveRef = useRef(false);
  const restartCount = useRef(0);

  const wSinceNotes = useRef(0);
  const wSinceQuiz = useRef(0);

  const askedQs = useRef([]);

  // WebSocket message queue
  const pendingMessages = useRef([]);

  // MediaRecorder fallback
  const mrRef = useRef(null);
  const mrChunks = useRef([]);
  const mrTimer = useRef(null);

  const store = useStore;

  // ── AI Notes ────────────────────────────────────────────────────────────
  async function maybeNotes(n) {
    wSinceNotes.current += n;

    if (
      wSinceNotes.current < WORDS_FOR_NOTES ||
      !rateLimiter.canCall()
    ) {
      return;
    }

    wSinceNotes.current = 0;
    rateLimiter.record();

    try {
      const { api } = await import('../services/api.js');

      const transcript =
        store.getState().getRecentTranscript(8000);

      const r = await api.generateNotes(transcript);

      if (r.notes) {
        store.getState().addNotes(r.notes);
      }
    } catch (e) {
      console.warn('[Notes]', e.message);
    }
  }

  // ── AI Quiz ─────────────────────────────────────────────────────────────
  async function maybeQuiz(n) {
    wSinceQuiz.current += n;

    if (
      wSinceQuiz.current < WORDS_FOR_QUIZ ||
      !rateLimiter.canCall()
    ) {
      return;
    }

    wSinceQuiz.current = 0;
    rateLimiter.record();

    try {
      const { api } = await import('../services/api.js');

      const transcript =
        store.getState().getRecentTranscript(6000);

      const r = await api.generateQuiz(
        transcript,
        '',
        askedQs.current.slice(-8)
      );

      if (r.questions?.length) {
        askedQs.current.push(
          ...r.questions.map((q) => q.question)
        );

        store
          .getState()
          .addQuizQuestions(r.questions);
      }
    } catch (e) {
      console.warn('[Quiz]', e.message);
    }
  }

  // ── Send transcript to WebSocket ───────────────────────────────────────
  function sendToWS(
    text,
    isFinal,
    confidence,
    speaker
  ) {
    const message = JSON.stringify({
      type: 'transcript_text',
      text,
      isFinal,
      confidence,
      speakerLabel: speaker,
    });

    if (
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      wsRef.current.send(message);
    } else if (isActiveRef.current) {
      // Keep message until WebSocket opens
      pendingMessages.current.push(message);
    }
  }

  // ── WebSocket ──────────────────────────────────────────────────────────
  function connectWS() {
    if (
      wsRef.current &&
      (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    console.log('[WS] Connecting:', WS_URL);

    let ws;

    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      console.error('[WS] Creation failed:', e);
      return;
    }

    ws.onopen = () => {
      console.log('[WS] Connected');

      store.getState().setConnected(true);

      // Send messages that arrived before connection
      while (pendingMessages.current.length > 0) {
        const message =
          pendingMessages.current.shift();

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }

      clearInterval(pingRef.current);

      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'pong',
            })
          );
        }
      }, 20000);
    };

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (
          msg.type === 'transcript_chunk' &&
          msg.words?.length
        ) {
          const s = store.getState();

          s.appendWords(msg.words);

          const sid = s.sessionId;

          if (sid) {
            saveWords(
              sid,
              msg.words
            ).catch(() => {});
          }

          maybeNotes(msg.words.length);
          maybeQuiz(msg.words.length);
        }
      } catch {
        // Ignore malformed WebSocket messages
      }
    };

    ws.onerror = (error) => {
      console.warn('[WS] Error', error);
      store.getState().setConnected(false);
    };

    ws.onclose = () => {
      console.log('[WS] Closed');

      store.getState().setConnected(false);

      clearInterval(pingRef.current);

      if (isActiveRef.current) {
        setTimeout(() => {
          if (isActiveRef.current) {
            connectWS();
          }
        }, 2000);
      }
    };

    wsRef.current = ws;
  }

  // ── Speech Recognition ─────────────────────────────────────────────────
  function buildRecognition() {
    const SR =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SR) return null;

    const r = new SR();

    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result = event.results[i];

        const text =
          result[0].transcript.trim();

        const conf =
          result[0].confidence || 0.88;

        // Interim text
        if (!result.isFinal) {
          store
            .getState()
            .setInterimText(text);

          continue;
        }

        // Final text
        store
          .getState()
          .setInterimText('');

        if (!text) continue;

        if (dedup.current.isDup(text)) {
          console.debug(
            '[Dedup blocked]',
            text.slice(0, 40)
          );

          continue;
        }

        const speaker =
          speakerDet.current.current();

        sendToWS(
          text,
          true,
          conf,
          speaker
        );
      }
    };

    r.onend = () => {
      store
        .getState()
        .setInterimText('');

      if (!isActiveRef.current) {
        return;
      }

      restartCount.current++;

      const delay = Math.min(
        200 * restartCount.current,
        3000
      );

      setTimeout(() => {
        if (!isActiveRef.current) return;

        try {
          r.start();

          setTimeout(() => {
            restartCount.current =
              Math.max(
                0,
                restartCount.current - 1
              );
          }, 5000);
        } catch (err) {
          if (
            !err.message?.includes(
              'already started'
            )
          ) {
            console.warn(
              '[SpeechRecognition restart]',
              err.message
            );
          }
        }
      }, delay);
    };

    r.onerror = (e) => {
      console.warn(
        '[SpeechRecognition error]',
        e.error
      );

      if (e.error === 'not-allowed') {
        store
          .getState()
          .setRecordingError(
            'Microphone permission revoked. Please refresh and allow access.'
          );
      }
    };

    return r;
  }

  // ── MediaRecorder fallback ─────────────────────────────────────────────
  function startMediaRecorderFallback(stream) {
    const mime =
      MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg';

    const mr = new MediaRecorder(stream, {
      mimeType: mime,
    });

    mrRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 100) {
        mrChunks.current.push(e.data);
      }
    };

    mr.onstop = async () => {
      if (
        !mrChunks.current.length ||
        !isActiveRef.current
      ) {
        return;
      }

      const chunks = [...mrChunks.current];
      mrChunks.current = [];

      const blob = new Blob(chunks, {
        type: mime,
      });

      if (!rateLimiter.canCall()) {
        console.warn(
          '[Fallback] Rate limit hit'
        );

        scheduleNextChunk(mr);

        return;
      }

      try {
        const base64 =
          await blobToBase64(blob);

        rateLimiter.record();

        const res = await fetch(
          `${API_BASE}/transcribe-chunk`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              audio: base64,
              mimeType: mime,
            }),
          }
        );

        if (res.ok) {
          const {
            text,
            confidence,
          } = await res.json();

          if (
            text?.trim() &&
            !dedup.current.isDup(text)
          ) {
            sendToWS(
              text.trim(),
              true,
              confidence || 0.85,
              speakerDet.current.current()
            );
          }
        } else {
          console.warn(
            '[Fallback] API status:',
            res.status
          );
        }
      } catch (e) {
        console.warn(
          '[Fallback transcription]',
          e.message
        );
      }

      scheduleNextChunk(mr);
    };

    mr.start();

    scheduleNextChunk(mr);
  }

  function scheduleNextChunk(mr) {
    if (!isActiveRef.current) return;

    clearTimeout(mrTimer.current);

    mrTimer.current = setTimeout(() => {
      if (mr.state === 'recording') {
        try {
          mr.stop();
        } catch {
          // already stopped
        }
      }
    }, 15000);
  }

  // ── Speaker energy ─────────────────────────────────────────────────────
  function startEnergyLoop() {
    const tick = () => {
      if (!isActiveRef.current) return;

      speakerDet.current.tick();

      energyFrame.current =
        requestAnimationFrame(tick);
    };

    energyFrame.current =
      requestAnimationFrame(tick);
  }

  // ── START RECORDING ────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isActiveRef.current) return;

    try {
      isActiveRef.current = true;
      restartCount.current = 0;
      pendingMessages.current = [];

      store.getState().startSession();
      store.getState().setRecordingError('');

      sessionMsRef.current = Date.now();

      dedup.current.reset();
      speakerDet.current.reset();

      wSinceNotes.current = 0;
      wSinceQuiz.current = 0;

      // Microphone
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });

      streamRef.current = stream;

      // AudioContext
      const AudioCtx =
        window.AudioContext ||
        window.webkitAudioContext;

      if (AudioCtx) {
        const ctx = new AudioCtx({
          sampleRate: 16000,
        });

        audioCtxRef.current = ctx;

        const source =
          ctx.createMediaStreamSource(stream);

        speakerDet.current.init(
          ctx,
          source
        );

        startEnergyLoop();
      }

      // WebSocket
      connectWS();

      // Speech engine
      const recog = buildRecognition();

      if (recog) {
        recogRef.current = recog;

        try {
          recog.start();
        } catch (err) {
          console.warn(
            '[SpeechRecognition start]',
            err.message
          );
        }

        store
          .getState()
          .setBrowserMode(
            'Web Speech API'
          );
      } else {
        startMediaRecorderFallback(stream);

        store
          .getState()
          .setBrowserMode(
            'Gemini Fallback'
          );
      }

      store.getState().setRecording(true);

      console.log('[Recording] Started');
    } catch (err) {
      console.error(
        '[Recording] Start failed:',
        err
      );

      isActiveRef.current = false;

      store
        .getState()
        .setRecording(false);

      store
        .getState()
        .setRecordingError(
          err?.message ||
            'Unable to start recording. Please check microphone permission.'
        );

      streamRef.current
        ?.getTracks()
        .forEach((t) => t.stop());

      streamRef.current = null;

      throw err;
    }
  }, []);

  // ── STOP RECORDING ─────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    isActiveRef.current = false;

    store
      .getState()
      .setInterimText('');

    store
      .getState()
      .setRecording(false);

    store
      .getState()
      .setConnected(false);

    // Speech Recognition
    try {
      recogRef.current?.abort();
    } catch {}

    recogRef.current = null;

    // MediaRecorder
    clearTimeout(mrTimer.current);

    try {
      if (
        mrRef.current?.state ===
        'recording'
      ) {
        mrRef.current.stop();
      }
    } catch {}

    mrRef.current = null;

    // Energy loop
    if (energyFrame.current) {
      cancelAnimationFrame(
        energyFrame.current
      );

      energyFrame.current = null;
    }

    // AudioContext
    audioCtxRef.current
      ?.close()
      .catch(() => {});

    audioCtxRef.current = null;

    // Microphone
    streamRef.current
      ?.getTracks()
      .forEach((t) => t.stop());

    streamRef.current = null;

    // WebSocket
    clearInterval(pingRef.current);

    pendingMessages.current = [];

    if (wsRef.current) {
      try {
        wsRef.current.close(
          1000,
          'User stopped'
        );
      } catch {}

      wsRef.current = null;
    }

    console.log('[Recording] Stopped');
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (isActiveRef.current) {
        stopRecording();
      }
    };
  }, []);

  return {
    startRecording,
    stopRecording,
    rateLimiter,

    isNativeSpeech: () =>
      !!(
        window.SpeechRecognition ||
        window.webkitSpeechRecognition
      ),
  };
}

// ── Blob → Base64 ─────────────────────────────────────────────────────────
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(
        reader.result.split(',')[1]
      );
    };

    reader.onerror = reject;

    reader.readAsDataURL(blob);
  });
}