import { postJson } from '../network.js';
import { normalizeConfiguredBaseUrl } from '../shared.js';
import { resolveEndpoint } from './common.js';

export async function callChatGPT(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'gpt-4o-mini';
  const endpoint = resolveEndpoint(
    normalizeConfiguredBaseUrl('chatgpt', baseUrl) || 'https://api.openai.com/v1',
    '/chat/completions'
  );

  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  };

  const data = await postJson(endpoint, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }, body, { provider: 'chatgpt', model: modelName });

  return data.choices[0].message.content;
}
