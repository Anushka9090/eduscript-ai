# EduScript AI 🎓
### by CtrlAltDefeat

> Real-time classroom transcription + adaptive learning assistant powered by Google Gemini.

---

## ✨ Features

| Module | What it does |
|---|---|
| 🎙 **Live Transcript** | Real-time speech-to-text with speaker labels, confidence scores, word timestamps |
| 📝 **Auto Notes** | AI-generated structured notes every ~2 minutes of lecture |
| ❓ **Real-Time Quiz** | MCQs auto-generated from lecture content to test understanding |
| 📊 **Weakness Profiler** | Tracks quiz performance per topic — shows your knowledge gaps |
| 💬 **Doubt Resolver** | Chat grounded in your lecture transcript for instant answers |
| 🔁 **Re-Teaching** | Personalized micro-lessons with analogy, example, and check question |

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js ≥ 18
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com)

### 2. Clone & Install

```bash
git clone https://github.com/your-team/eduscript-ai
cd eduscript-ai
npm install
```

### 3. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set your GEMINI_API_KEY
```

### 4. Run Development Server

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/health

---

## 🏗️ Architecture

```
eduscript-ai/
├── backend/                  # Node.js + Fastify API
│   ├── src/
│   │   ├── index.js          # Server entry, plugin registration
│   │   ├── services/
│   │   │   └── gemini.js     # Gemini client, retry, JSON utils
│   │   └── routes/
│   │       ├── transcription.js  # WebSocket: audio → transcript tokens
│   │       ├── notes.js          # POST /api/notes
│   │       ├── quiz.js           # POST /api/quiz
│   │       ├── chat.js           # POST /api/chat
│   │       └── reteach.js        # POST /api/reteach
│   └── .env.example
│
└── frontend/                 # React + Vite PWA
    ├── src/
    │   ├── App.jsx           # Root layout, nav, recording control
    │   ├── store/index.js    # Zustand global state
    │   ├── hooks/
    │   │   └── useTranscription.js  # Audio capture + WebSocket
    │   ├── services/
    │   │   ├── api.js        # All backend HTTP calls
    │   │   └── db.js         # IndexedDB persistence (idb)
    │   ├── utils/
    │   │   └── export.js     # SRT / JSON export
    │   └── components/
    │       ├── transcription/TranscriptPanel.jsx
    │       ├── notes/NotesPanel.jsx
    │       ├── quiz/QuizPanel.jsx
    │       ├── chat/ChatPanel.jsx
    │       └── reteach/ReteachPanel.jsx
    └── vite.config.js
```

---

## 🔑 Gemini API Usage

| Task | Model | Why |
|---|---|---|
| Transcription | `gemini-1.5-flash-latest` | Fast, supports inline audio |
| Notes generation | `gemini-1.5-flash-latest` | Low cost, structured JSON output |
| Quiz generation | `gemini-1.5-flash-latest` | Fast iteration per lecture chunk |
| Doubt chat | `gemini-1.5-pro-latest` | Better reasoning for multi-turn |
| Re-teaching | `gemini-1.5-flash-latest` | Good at pedagogical explanation |

---

## 📦 Production Deployment

### Backend (Railway / Render / any Node host)

```bash
cd backend
npm start
```

Set environment variables:
- `GEMINI_API_KEY` — your key
- `PORT` — e.g. 3001
- `FRONTEND_URL` — your deployed frontend URL (for CORS)
- `NODE_ENV=production`

### Frontend (Vercel / Netlify)

```bash
cd frontend
npm run build
# Upload dist/ to Vercel or Netlify
```

Set in Vercel:
- Add proxy rewrites for `/api` → backend URL
- Add proxy rewrites for `/ws` → backend WebSocket URL

Or update `vite.config.js` proxy target to your backend URL.

---

## 🎯 Demo Script (1 minute)

1. Open app → click **Record**
2. Speak a short lecture excerpt (30s)
3. Show live captions appearing in Transcript tab
4. Switch to Notes → click **Generate Now**
5. Switch to Quiz → show auto-generated question, answer it
6. Switch to Chat → ask "What was just explained?"
7. Switch to Re-Teach → tap a weak topic chip

---

## ⚡ Known Limits & Mitigations

| Issue | Mitigation |
|---|---|
| Gemini audio transcription via REST (not true streaming) | Chunks sent every 2s — latency is ~300-500ms per chunk |
| Speaker diarization is heuristic-only | Silence gaps + speaker count — works for 2-3 clear speakers |
| Quiz quality depends on transcript length | Minimum 30-word guard before generation |
| Rate limits on Gemini API | Exponential backoff with 3 retries built-in |

---

## 👥 Team

**CtrlAltDefeat** — Built for Hackathon 2025

---

## 📄 License

MIT
