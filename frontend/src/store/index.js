import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveSession, loadSession } from '../services/db.js';

/**
 * Global app store.
 * UI state is ephemeral; session data is persisted to IndexedDB.
 */
export const useStore = create(
  persist(
    (set, get) => ({
      // ── Session ──────────────────────────────────────────────────────────
      sessionId: null,
      isRecording: false,
      isConnected: false,

      // ── Transcript ───────────────────────────────────────────────────────
      words: [],          // { id, word, startMs, endMs, confidence, speaker }
      transcriptText: '', // joined plain text

      // ── Notes ────────────────────────────────────────────────────────────
      notes: [],          // array of note objects from API

      // ── Quiz ─────────────────────────────────────────────────────────────
      quizQueue: [],      // pending questions
      quizHistory: [],    // { questionId, topic, correct, ts }

      // ── Weakness Profile ─────────────────────────────────────────────────
      topicScores: {},    // { [topicTag]: { correct: n, total: n } }

      // ── Chat ─────────────────────────────────────────────────────────────
      chatHistory: [],    // { role, text, ts }

      // ── UI panels ────────────────────────────────────────────────────────
      activePanel: 'transcript', // transcript | notes | quiz | chat | reteach

      // ── Actions ──────────────────────────────────────────────────────────
      startSession: () => {
        const id = `session_${Date.now()}`;
        set({ sessionId: id, words: [], transcriptText: '', notes: [], quizQueue: [], chatHistory: [] });
      },

      setRecording: (val) => set({ isRecording: val }),
      setConnected: (val) => set({ isConnected: val }),

      appendWords: (newWords) => {
        set((s) => {
          const words = [...s.words, ...newWords];
          const transcriptText = words.map((w) => w.word).join(' ');
          return { words, transcriptText };
        });
      },

      addNotes: (note) => set((s) => ({ notes: [note, ...s.notes] })),

      addQuizQuestions: (questions) =>
        set((s) => ({ quizQueue: [...s.quizQueue, ...questions] })),

      removeQuizQuestion: (id) =>
        set((s) => ({ quizQueue: s.quizQueue.filter((q) => q.id !== id) })),

      recordQuizAnswer: (questionId, topicTag, correct) => {
        set((s) => {
          const prev = s.topicScores[topicTag] || { correct: 0, total: 0 };
          return {
            quizHistory: [
              ...s.quizHistory,
              { questionId, topicTag, correct, ts: Date.now() },
            ],
            topicScores: {
              ...s.topicScores,
              [topicTag]: {
                correct: prev.correct + (correct ? 1 : 0),
                total: prev.total + 1,
              },
            },
          };
        });
      },

      addChatMessage: (role, text) =>
        set((s) => ({
          chatHistory: [...s.chatHistory, { role, text, ts: Date.now() }],
        })),

      setActivePanel: (panel) => set({ activePanel: panel }),

      interimText: '',
      setInterimText: (text) => set({ interimText: text }),

      browserMode: '',
      setBrowserMode: (m) => set({ browserMode: m }),

      recordingError: '',
      setRecordingError: (err) => set({ recordingError: err }),

      getWeakTopics: () => {
        const { topicScores } = get();
        return Object.entries(topicScores)
          .map(([topic, { correct, total }]) => ({
            topic,
            score: total > 0 ? correct / total : 0,
            total,
          }))
          .filter((t) => t.total >= 1)
          .sort((a, b) => a.score - b.score);
      },

      getRecentTranscript: (maxChars = 8000) => {
        const { transcriptText } = get();
        return transcriptText.slice(-maxChars);
      },

      resetSession: () => set({
        sessionId: null, isRecording: false, isConnected: false,
        words: [], transcriptText: '', notes: [],
        quizQueue: [], quizHistory: [], topicScores: {},
        chatHistory: [], activePanel: 'transcript',
      }),
    }),
    {
      name: 'eduscript-store',
      partialize: (s) => ({
        topicScores: s.topicScores,
        quizHistory: s.quizHistory,
      }),
    }
  )
);
