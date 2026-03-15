import { postJson } from '../network.js';

export async function callDoubao(prompt, apiKey, model) {
  if (!model) throw new Error('Model (Endpoint ID) required for Doubao');

  const data = await postJson('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }, {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  }, { provider: 'doubao', model });

  return data.choices[0].message.content;
}
