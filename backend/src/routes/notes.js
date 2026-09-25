import { getModel, withRetry, safeParseJSON } from '../services/gemini.js';

const NOTES_SYSTEM_PROMPT = `You are an expert academic note-taker. Given a lecture transcript chunk, generate well-structured notes.

Return ONLY valid JSON — no markdown fences, no preamble:
{
  "title": "string — inferred topic title (max 8 words)",
  "summary": "string — 2-3 sentence summary",
  "keyPoints": ["string", ...],
  "definitions": [{ "term": "string", "definition": "string" }, ...],
  "formulas": ["string", ...],
  "examples": ["string", ...],
  "topicTags": ["string", ...]
}

Rules:
- keyPoints: 3–7 bullet points, each a complete sentence
- definitions: only genuine technical terms (0–5 items)
- formulas: LaTeX or plain text (0–3 items, empty array if none)
- examples: concrete examples mentioned (0–4 items)
- topicTags: 1–5 short topic labels for categorization
- If transcript is too short or unclear, still return valid JSON with best effort
- Keep all string values concise — max 2 sentences each
- CRITICAL: Output ONLY the JSON object. No markdown fences. No preamble. Start with { end with }`;

export async function notesRoute(app) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['transcript'],
        properties: {
          transcript: { type: 'string', minLength: 10, maxLength: 20000 },
          sessionId: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { transcript } = req.body;

    const model = getModel('flash');

    try {
      const result = await withRetry(() =>
        model.generateContent({
          systemInstruction: NOTES_SYSTEM_PROMPT,
          contents: [
            {
              role: 'user',
              parts: [{ text: `Transcript:\n${transcript}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        })
      );

      const raw = result.response.text();
      const notes = safeParseJSON(raw);

      if (!notes || !notes.title) {
        return reply.status(422).send({ error: 'Could not parse notes from transcript' });
      }

      return reply.send({ ok: true, notes, generatedAt: Date.now() });
    } catch (err) {
      req.log.error({ err }, 'Notes generation failed');
      return reply.status(500).send({ error: 'Notes generation failed' });
    }
  });
}
