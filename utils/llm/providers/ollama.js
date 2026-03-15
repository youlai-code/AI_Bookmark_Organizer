import { postJson } from '../network.js';

export async function callOllama(prompt, model, host) {
  const modelName = model || 'llama3';
  const endpoint = (host || 'http://localhost:11434').replace(/\/$/, '') + '/api/generate';
  const data = await postJson(endpoint, { 'Content-Type': 'application/json' }, {
    model: modelName,
    prompt,
    stream: false
  }, { provider: 'ollama', model: modelName });

  return data.response;
}
