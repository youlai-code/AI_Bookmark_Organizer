import { postJson } from '../network.js';

export async function callGemini(prompt, apiKey, model) {
  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const data = await postJson(url, { 'Content-Type': 'application/json' }, {
    contents: [{ parts: [{ text: prompt }] }]
  }, { provider: 'gemini', model: modelName });

  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Unexpected Gemini response format');
}
