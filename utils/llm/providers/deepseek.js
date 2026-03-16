import { postJson } from '../network.js';
import { normalizeConfiguredBaseUrl } from '../shared.js';
import { resolveEndpoint } from './common.js';

export async function callDeepSeek(prompt, apiKey, model, baseUrl, providerHint = 'deepseek') {
  const modelName = model || 'deepseek-chat';
  const normalizedProviderHint = providerHint || 'deepseek';
  const endpoint = resolveEndpoint(
    normalizeConfiguredBaseUrl(normalizedProviderHint, baseUrl) || 'https://api.deepseek.com',
    '/chat/completions'
  );

  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const data = await postJson(endpoint, headers, body, { provider: normalizedProviderHint, model: modelName });
  return data.choices[0].message.content;
}
