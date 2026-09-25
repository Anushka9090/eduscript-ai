import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { transcriptionWsHandler } from './routes/transcription.js';
import { notesRoute } from './routes/notes.js';
import { quizRoute } from './routes/quiz.js';
import { chatRoute } from './routes/chat.js';
import { reteachRoute } from './routes/reteach.js';
import { transcribeChunkRoute } from './routes/transcribeChunk.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY is not set in .env');
  process.exit(1);
}

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

// ── Plugins ────────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:4173'],
  methods: ['GET', 'POST', 'OPTIONS'],
});

await app.register(websocket);

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

// WebSocket: live audio → transcript tokens
app.register(async (instance) => {
  instance.get('/ws/transcribe', { websocket: true }, transcriptionWsHandler);
});

// REST: content processing
app.register(notesRoute, { prefix: '/api/notes' });
app.register(quizRoute, { prefix: '/api/quiz' });
app.register(chatRoute, { prefix: '/api/chat' });
app.register(reteachRoute, { prefix: '/api/reteach' });
app.register(transcribeChunkRoute, { prefix: '/api/transcribe-chunk' });

// ── Global error handler ───────────────────────────────────────────────────
app.setErrorHandler((error, _req, reply) => {
  app.log.error(error);
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    error: statusCode === 500 ? 'Internal server error' : error.message,
  });
});

// ── Boot ───────────────────────────────────────────────────────────────────
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🚀 EduScript API running on http://localhost:${PORT}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
