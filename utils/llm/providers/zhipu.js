import { postJson } from '../network.js';
import { normalizeConfiguredBaseUrl } from '../shared.js';
import { resolveEndpoint } from './common.js';

export async function callZhipu(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'glm-4.7-flash';
  const endpoint = resolveEndpoint(
    normalizeConfiguredBaseUrl('zhipu', baseUrl) || 'https://open.bigmodel.cn/api/paas/v4',
    '/chat/completions'
  );

  const data = await postJson(endpoint, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }, {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    temperature: 0.3
  }, { provider: 'zhipu', model: modelName });

  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error('Unexpected Zhipu response format');
}
