import { postJson } from '../network.js';
import { normalizeConfiguredBaseUrl } from '../shared.js';
import { resolveEndpoint } from './common.js';

export async function callDeepSeek(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'deepseek-chat';
  const endpoint = resolveEndpoint(
    normalizeConfiguredBaseUrl('deepseek', baseUrl) || 'https://api.deepseek.com',
    '/chat/completions'
  );

  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const data = await postJson(endpoint, headers, body, { provider: 'deepseek', model: modelName });
  return data.choices[0].message.content;
}
