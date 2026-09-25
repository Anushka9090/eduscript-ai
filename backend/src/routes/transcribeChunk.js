/**
 * transcribeChunk.js
 *
 * Safari/Firefox fallback: receives a base64 audio blob (webm/mp4),
 * sends to Gemini Flash for transcription, returns { text, confidence }.
 * Called once per ~15s chunk — very token-friendly.
 */

import { getModel, withRetry, safeParseJSON } from '../services/gemini.js';

export async function transcribeChunkRoute(app) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['audio'],
        properties: {
          audio: { type: 'string', minLength: 10 },      // base64
          mimeType: { type: 'string', default: 'audio/webm' },
        },
      },
    },
  }, async (req, reply) => {
    const { audio, mimeType = 'audio/webm' } = req.body;
    const model = getModel('flash');

    try {
      const result = await withRetry(() =>
        model.generateContent({
          contents: [{
            role: 'user',
            parts: [
              {
                text: `Transcribe this audio accurately. Return ONLY valid JSON, no markdown:
{"text": "full transcription here", "confidence": 0.0-1.0}
If inaudible or silent return: {"text": "", "confidence": 0}
Handle accents, technical terms, and overlapping speech as best as possible.`,
              },
              { inlineData: { mimeType, data: audio } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        })
      );

      const raw = result.response.text();
      const parsed = safeParseJSON(raw);

      if (!parsed || typeof parsed.text !== 'string') {
        return reply.send({ text: '', confidence: 0 });
      }

      return reply.send({ text: parsed.text.trim(), confidence: parsed.confidence ?? 0.85 });
    } catch (err) {
      req.log.error({ err }, 'Chunk transcription failed');
      return reply.status(500).send({ error: 'Transcription failed' });
    }
  });
}
