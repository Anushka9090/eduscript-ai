/**
 * Export utilities for transcript, notes, and session data
 */

function msToSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mil).padStart(3, '0')}`;
}

export function exportSRT(words) {
  if (!words?.length) return '';

  // Group words into subtitle segments (max 10 words or 5s)
  const segments = [];
  let current = [];
  let segStart = words[0]?.startMs || 0;

  for (const word of words) {
    current.push(word);
    const duration = word.endMs - segStart;
    if (current.length >= 10 || duration >= 5000) {
      segments.push({ words: current, start: segStart, end: word.endMs });
      current = [];
      segStart = word.endMs;
    }
  }
  if (current.length) {
    segments.push({ words: current, start: segStart, end: current.at(-1).endMs });
  }

  return segments
    .map((seg, i) => {
      const text = seg.words.map((w) => w.word).join(' ');
      return `${i + 1}\n${msToSrtTime(seg.start)} --> ${msToSrtTime(seg.end)}\n${text}\n`;
    })
    .join('\n');
}

export function exportJSON(words, notes, sessionId) {
  return JSON.stringify(
    {
      sessionId,
      exportedAt: new Date().toISOString(),
      wordCount: words.length,
      words: words.map((w) => ({
        word: w.word,
        startMs: w.startMs,
        endMs: w.endMs,
        confidence: w.confidence,
        speaker: w.speaker,
      })),
      notes,
    },
    null,
    2
  );
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
