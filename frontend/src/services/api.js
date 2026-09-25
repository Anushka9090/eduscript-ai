// FILE: frontend/src/services/api.js
import { rateLimiter } from '../hooks/useTranscription.js';

const BASE = '/api';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // FIX: Always parse error body for exact message
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      errMsg = errBody.error || errBody.message || errMsg;
    } catch { /* response wasn't JSON */ }
    throw new Error(errMsg);
  }

  return res.json();
}

/**
 * FIX: Increased limits to match Gemini free tier reality.
 * Real free tier: 15 req/min, 1500 req/day on Flash.
 * We budget conservatively: 10/min, 100/day — still safe, no longer blocking.
 */
rateLimiter.MAX_PER_MIN = 10;
rateLimiter.MAX_PER_DAY = 100;

async function geminiCall(label, fn) {
  if (!rateLimiter.canCall()) {
    const r = rateLimiter.remaining();
    const msg = r.perDay <= 0
      ? `Daily API limit reached (resets tomorrow)`
      : `Too many requests — wait ~60s (${r.perMin} slots free)`;
    throw new Error(msg);
  }
  rateLimiter.record();
  try {
    return await fn();
  } catch (err) {
    // Don't count failed calls against the budget
    rateLimiter.calls.pop();
    rateLimiter._dc = Math.max(0, rateLimiter._dc - 1);
    localStorage.setItem('es_dc', String(rateLimiter._dc));
    throw err;
  }
}

export const api = {
  generateNotes: (transcript, sessionId) =>
    geminiCall('notes', () => post('/notes', { transcript, sessionId })),

  generateQuiz: (transcript, topicContext, priorQuestions) =>
    geminiCall('quiz', () => post('/quiz', {
      transcript,
      topicContext:   topicContext   || '',
      priorQuestions: priorQuestions || [],
    })),

  chat: (question, transcriptContext, history) =>
    geminiCall('chat', () => post('/chat', {
      question,
      transcriptContext: transcriptContext || '',
      history:           history           || [],
    })),

  // FIX: Guard empty topic in api layer too — belt-and-suspenders
  reteach: (topic, lectureContext, studentLevel = 'intermediate') => {
    const cleanTopic = (topic || '').trim();
    if (!cleanTopic) return Promise.reject(new Error('Please enter a topic to re-learn.'));
    return geminiCall('reteach', () => post('/reteach', {
      topic:          cleanTopic,
      lectureContext: lectureContext || '',
      studentLevel,
    }));
  },

  getBudget: () => rateLimiter.remaining(),
};
