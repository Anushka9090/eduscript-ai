// FILE: backend/src/routes/chat.js
import { getModel, withRetry } from '../services/gemini.js';

const CHAT_SYSTEM_PROMPT = `You are EduScript AI — an intelligent learning assistant that helps students understand lecture content.

You have access to the lecture transcript provided in each message. Always prioritize answering from the transcript context.

Guidelines:
- Be concise and clear — students need quick understanding
- Use simple language and analogies when explaining complex concepts
- If the question is not covered in the transcript, say so and answer from general knowledge
- Never make up facts — be honest about uncertainty
- Format with markdown (bold for key terms, short bullet lists for multi-part answers)
- Keep responses under 250 words unless the question genuinely requires more`;

export async function chatRoute(app) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['question', 'transcriptContext'],
        properties: {
          question:          { type: 'string', minLength: 1, maxLength: 2000 },
          transcriptContext: { type: 'string', maxLength: 30000 },
          history: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              required: ['role', 'text'],
              properties: {
                role: { type: 'string', enum: ['user', 'model'] },
                text: { type: 'string', maxLength: 2000 },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { question, transcriptContext, history = [] } = req.body;

    // FIX: Use flash instead of pro — pro sometimes unavailable on free keys
    const model = getModel('flash');

    const contents = [];

    // Inject transcript context
    const ctxText = transcriptContext?.trim()
      ? `[LECTURE TRANSCRIPT]\n${transcriptContext.slice(0, 20000)}\n[END TRANSCRIPT]`
      : '[No transcript available yet — answer from general knowledge]';

    contents.push({ role: 'user',  parts: [{ text: ctxText }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood. I have the lecture context. Ask your question.' }] });

    // Add history (validated — skip malformed turns)
    for (const turn of history.slice(-8)) {
      if (turn.role && turn.text?.trim()) {
        contents.push({ role: turn.role, parts: [{ text: turn.text }] });
      }
    }

    contents.push({ role: 'user', parts: [{ text: question.trim() }] });

    let answer = '';
    try {
      const result = await withRetry(() =>
        model.generateContent({
          systemInstruction: CHAT_SYSTEM_PROMPT,
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
        })
      );

      // FIX: Safely extract text — result.response.text() can throw if response is blocked
      try {
        answer = result.response.text();
      } catch (extractErr) {
        req.log.warn({ extractErr }, 'response.text() threw — checking candidates');
        answer = result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      }

      // FIX: Catch empty response (safety filter blocked it)
      if (!answer?.trim()) {
        const finishReason = result.response?.candidates?.[0]?.finishReason;
        req.log.warn({ finishReason }, 'Empty answer from Gemini');
        return reply.status(422).send({
          error: finishReason === 'SAFETY'
            ? 'Response was blocked by safety filters. Please rephrase your question.'
            : 'Gemini returned an empty response. Please try again.',
        });
      }

      return reply.send({ ok: true, answer: answer.trim(), generatedAt: Date.now() });

    } catch (err) {
      req.log.error({ err }, 'Chat generation failed');
      return reply.status(502).send({
        error: 'AI error: ' + (err.message?.slice(0, 120) || 'unknown error'),
      });
    }
  });
}
