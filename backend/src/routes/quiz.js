import { getModel, withRetry, safeParseJSON } from '../services/gemini.js';

const QUIZ_SYSTEM_PROMPT = `You are an expert educator creating multiple-choice quiz questions from lecture content.

Return ONLY valid JSON — no markdown fences, no preamble:
{
  "questions": [
    {
      "id": "string — unique alphanumeric e.g. q1",
      "question": "string — clear, unambiguous question",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctIndex": 0,
      "explanation": "string — why the answer is correct (1-2 sentences)",
      "topicTag": "string — single topic label",
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}

Rules:
- Generate exactly 4 questions unless transcript is very short (then 2–3)
- Each question must have exactly 4 options labeled A–D
- correctIndex is 0-based (0=A, 1=B, 2=C, 3=D)
- Questions must be directly answerable from the transcript — no outside knowledge needed
- Avoid trivial questions like "What did the teacher say first?"
- Difficulty: easy = recall, medium = understanding, hard = application/analysis
- Never repeat questions from prior context if provided
- Keep option text short (under 12 words each)
- CRITICAL: Output ONLY the JSON object. No markdown fences. No preamble. Start with { end with }`;

export async function quizRoute(app) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['transcript'],
        properties: {
          transcript: { type: 'string', minLength: 20, maxLength: 20000 },
          topicContext: { type: 'string' },
          priorQuestions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (req, reply) => {
    const { transcript, topicContext = '', priorQuestions = [] } = req.body;

    const model = getModel('flash');

    const priorCtx = priorQuestions.length > 0
      ? `\n\nAlready asked questions (do not repeat):\n${priorQuestions.join('\n')}`
      : '';

    try {
      const result = await withRetry(() =>
        model.generateContent({
          systemInstruction: QUIZ_SYSTEM_PROMPT,
          contents: [
            {
              role: 'user',
              parts: [{
                text: `Topic context: ${topicContext || 'General lecture'}\n\nTranscript:\n${transcript}${priorCtx}`,
              }],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 3000,
          },
        })
      );

      const raw = result.response.text();
      const parsed = safeParseJSON(raw);

      if (!parsed?.questions || !Array.isArray(parsed.questions)) {
        return reply.status(422).send({ error: 'Could not generate quiz questions' });
      }

      // Validate each question shape
      const valid = parsed.questions.filter(
        (q) =>
          q.id && q.question?.length > 10 &&
          Array.isArray(q.options) && q.options.length === 4 &&
          typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3 &&
          q.explanation && q.topicTag
      );

      if (valid.length === 0) {
        return reply.status(422).send({ error: 'No valid questions generated' });
      }

      return reply.send({ ok: true, questions: valid, generatedAt: Date.now() });
    } catch (err) {
      req.log.error({ err }, 'Quiz generation failed');
      return reply.status(500).send({ error: 'Quiz generation failed' });
    }
  });
}
