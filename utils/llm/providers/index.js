import { OFFICIAL_PROXY } from '../constants.js';
import { callChatGPT } from './chatgpt.js';
import { callDeepSeek } from './deepseek.js';
import { callDoubao } from './doubao.js';
import { callGemini } from './gemini.js';
import { callOllama } from './ollama.js';
import { callZhipu } from './zhipu.js';

export async function executeProviderRequest(provider, prompt, config) {
  switch (provider) {
    case 'deepseek':
      return await callDeepSeek(prompt, config.apiKey, config.model, config.baseUrl, 'deepseek');
    case 'chatgpt':
      return await callChatGPT(prompt, config.apiKey, config.model, config.baseUrl);
    case 'gemini':
      return await callGemini(prompt, config.apiKey, config.model);
    case 'zhipu':
      return await callZhipu(prompt, config.apiKey, config.model, config.baseUrl);
    case 'ollama':
      return await callOllama(prompt, config.model, config.ollamaHost);
    case 'doubao':
      return await callDoubao(prompt, config.apiKey, config.model);
    case 'default':
    default:
      return await callDeepSeek(prompt, '', config.model, OFFICIAL_PROXY, 'default');
  }
}
