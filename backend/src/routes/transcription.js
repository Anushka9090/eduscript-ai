/**
 * transcription.js — v4
 *
 * WebSocket: receives transcript_text from browser, enriches with
 * speaker label + timing, relays back as transcript_chunk.
 * Zero Gemini tokens. Handles reconnects gracefully.
 */

export async function transcriptionWsHandler(connection, req) {
  const socket = connection.socket;
  const log = req.server.log;

  const sessionStartMs = Date.now();
  let wordIndex = 0;
  let lastActivityMs = Date.now();
  let totalWordsReceived = 0;

  const pingTimer = setInterval(() => {
    if (socket.readyState === 1) safeSend({ type: 'ping' });
  }, 20000);

  function safeSend(payload) {
    try {
      if (socket.readyState === 1) socket.send(JSON.stringify(payload));
    } catch (e) {
      log.warn({ e }, 'safeSend failed');
    }
  }

  socket.on('message', (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      return; // ignore non-JSON (e.g. ping frames)
    }

    if (msg.type === 'pong') return;

    if (msg.type === 'transcript_text') {
      const text = (msg.text || '').trim();
      if (!text) return;

      const nowMs = Date.now() - sessionStartMs;
      lastActivityMs = Date.now();

      const speaker = msg.speakerLabel || 'SPEAKER_01';
      const confidence = typeof msg.confidence === 'number'
        ? Math.max(0, Math.min(1, msg.confidence))
        : 0.9;

      const tokens = text.split(/\s+/).filter(Boolean);
      if (!tokens.length) return;

      // Distribute tokens across the segment duration
      // Assume average speaking rate: 140 wpm → ~430ms/word
      const avgWordMs = 430;
      const segEnd = nowMs;
      const segStart = Math.max(0, segEnd - tokens.length * avgWordMs);

      const words = tokens.map((word, i) => ({
        id:         `w_${++wordIndex}`,
        word,
        startMs:    Math.round(segStart + i * avgWordMs),
        endMs:      Math.round(segStart + (i + 1) * avgWordMs),
        confidence,
        speaker,
        isFinal:    msg.isFinal ?? true,
      }));

      totalWordsReceived += words.length;
      safeSend({ type: 'transcript_chunk', words, text, speaker, isFinal: msg.isFinal ?? true });

    } else if (msg.type === 'ping') {
      safeSend({ type: 'pong' });
    }
  });

  socket.on('close', (code, reason) => {
    clearInterval(pingTimer);
    log.info({ code, totalWordsReceived }, 'Transcription WS closed');
  });

  socket.on('error', (err) => {
    clearInterval(pingTimer);
    log.error({ err }, 'WS error');
  });

  safeSend({ type: 'ready', ts: Date.now() });
  log.info('Transcription WS ready');
}
