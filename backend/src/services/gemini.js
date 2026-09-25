import { GoogleGenAI } from '@google/genai';

let _client = null;

export function getGeminiClient() {
  if (!_client) {
    _client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  return _client;
}

export function getModel(tier = 'flash') {
  const client = getGeminiClient();

  return {
    async generateContent(options) {
      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: options.contents,
        config: {
          systemInstruction: options.systemInstruction,
          temperature: options.generationConfig?.temperature ?? 0.2,
          maxOutputTokens: options.generationConfig?.maxOutputTokens ?? 2048,
        },
      });

      return {
        response: {
          text: () => response.text,
        },
      };
    },
  };
}

export async function withRetry(fn, maxRetries = 3) {
  let lastErr;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const code = err?.status ?? err?.code ?? 0;
      const msg = err?.message ?? '';

      const isRetryable =
        code === 429 ||
        code === 503 ||
        code === 500 ||
        msg.includes('quota') ||
        msg.includes('overloaded') ||
        msg.includes('RESOURCE_EXHAUSTED');

      if (!isRetryable) {
        throw err;
      }

      const delay = Math.min(
        1200 * 2 ** attempt + Math.random() * 400,
        10000
      );

      console.warn(
        `[Gemini] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastErr;
}

export function safeParseJSON(text) {
  if (!text || typeof text !== 'string') return null;

  let jsonStr = extractJSONString(text);

  if (!jsonStr) {
    console.warn(
      '[safeParseJSON] No JSON-like content found:',
      text.slice(0, 100)
    );
    return null;
  }

  try {
    return JSON.parse(jsonStr);
  } catch {}

  const repaired = repairTruncatedJSON(jsonStr);

  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch (e) {
      console.warn(
        '[safeParseJSON] Repair failed:',
        e.message
      );
    }
  }

  return null;
}

function extractJSONString(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);

  if (fenced) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');

  if (start !== -1) {
    return text.slice(start).trim();
  }

  const arrStart = text.indexOf('[');

  if (arrStart !== -1) {
    return text.slice(arrStart).trim();
  }

  return null;
}

function repairTruncatedJSON(str) {
  let s = str.trimEnd().replace(/,\s*$/, '');

  if (/:\s*$/.test(s)) {
    s += 'null';
  }

  const lastDelim = Math.max(
    s.lastIndexOf(','),
    s.lastIndexOf('{'),
    s.lastIndexOf('[')
  );

  const tail = s.slice(lastDelim + 1);

  const quoteCount =
    (tail.match(/(?<!\\)"/g) || []).length;

  if (quoteCount % 2 !== 0) {
    s += '"';
  }

  const stack = [];
  let inString = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (
      ch === '"' &&
      (i === 0 || s[i - 1] !== '\\')
    ) {
      inString = !inString;
    }

    if (inString) continue;

    if (ch === '{') {
      stack.push('}');
    } else if (ch === '[') {
      stack.push(']');
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    }
  }

  return s + stack.reverse().join('');
}