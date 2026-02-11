const OFFICIAL_PROXY = 'https://aibookmark.tenb68.workers.dev';

export async function classifyWithLLM(title, url, content, existingFolders = [], allowNewFolders = true, enableRename = false) {
  const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'model', 'ollamaHost', 'baseUrl', 'language']);
  const lang = config.language || 'zh_CN';
  
  const foldersStr = existingFolders.length > 0 ? existingFolders.join('、') : (lang === 'en' ? 'None' : '无');
  
  let prompt = '';

  if (lang === 'en') {
    prompt = `Please analyze the following web page information and return a suitable bookmark folder name according to the rules.

Existing folders: ${foldersStr}
Allow new folders: ${allowNewFolders ? 'Yes' : 'No'}

Page Info:
Title: ${title}
URL: ${url}
Description: ${content.description || ''}
Keywords: ${content.keywords || ''}

Rules:
1. Prioritize choosing the best match from the "Existing folders" list.
2. If no existing folder matches:
   - If allowed to create new folders: Please return a new, short (1-3 words) English category name (e.g., Tech Docs, News).
   - If not allowed: Forcefully choose the closest one from the existing list; if absolutely no match, return "Default".`;

    if (enableRename) {
      prompt += `
3. Also generate a simplified page title (remove irrelevant suffixes, keep core content).
4. Must return JSON format:
{"category": "Category Name", "title": "Simplified Title"}
Do not include markdown blocks, just raw JSON string.`;
    } else {
      prompt += `
3. Return only the folder name, no explanations or other text.`;
    }

  } else {
    // Default to zh_CN
    prompt = `请分析以下网页信息，并根据规则返回一个合适的书签分类文件夹名称。

现有文件夹列表：${foldersStr}
允许创建新文件夹：${allowNewFolders ? '是' : '否'}

网页信息：
标题: ${title}
URL: ${url}
内容摘要: ${content.description || ''}
关键词: ${content.keywords || ''}

规则：
1. 优先从“现有文件夹列表”中选择最匹配的名称。
2. 如果现有文件夹都不匹配：
   - 如果允许创建新文件夹：请返回一个新的、简短的（2-4字）中文分类名称（如：技术文档、新闻资讯）。
   - 如果不允许创建新文件夹：请强制从现有列表中选一个最接近的；如果实在无法关联，返回“默认收藏”。`;

    if (enableRename) {
      prompt += `
3. 请同时生成一个简化的网页标题（去除无关后缀，保留核心内容）。
4. 请务必返回 JSON 格式，格式如下：
{"category": "分类名称", "title": "简化后的标题"}
不要包含 markdown 代码块标记，只返回纯 JSON 字符串。`;
    } else {
      prompt += `
3. 只返回文件夹名称，不要包含任何解释或其他文字。`;
    }
  }

  console.log('=== LLM Request Prompt ===\n', prompt);
  
  let resultText;
  
  try {
    if (config.llmProvider === 'default') {
       // 使用默认代理 (DeepSeek via Worker)
       resultText = await callDeepSeek(prompt, '', config.model, OFFICIAL_PROXY);
    } else if (config.llmProvider === 'deepseek') {
      // 用户界面已隐藏 Base URL，强制使用官方默认地址 (避免读取到其他 Provider 设置的 Base URL)
      resultText = await callDeepSeek(prompt, config.apiKey, config.model, null);
    } else if (config.llmProvider === 'chatgpt') {
      resultText = await callChatGPT(prompt, config.apiKey, config.model, config.baseUrl);
    } else if (config.llmProvider === 'gemini') {
      resultText = await callGemini(prompt, config.apiKey, config.model);
    } else if (config.llmProvider === 'chrome_builtin') {
      resultText = await callChromeBuiltInAI(prompt);
    } else if (config.llmProvider === 'ollama') {
      resultText = await callOllama(prompt, config.model, config.ollamaHost);
    } else if (config.llmProvider === 'doubao') {
      resultText = await callDoubao(prompt, config.apiKey, config.model);
    } else {
      // Fallback or error
      if (!config.llmProvider) {
          // 如果未配置，默认尝试使用 Default
          resultText = await callDeepSeek(prompt, '', config.model, OFFICIAL_PROXY);
      } else {
          throw new Error('未配置有效的 LLM 提供商');
      }
    }
  } catch (error) {
    console.error('LLM调用失败:', error);
    throw error;
  }

  console.log('=== LLM Response ===\n', resultText);

  // 解析结果
  let category = '默认收藏';
  let newTitle = title;

  try {
    // 尝试解析 JSON
    // 有时候 LLM 会用 ```json ... ``` 包裹
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const jsonObj = JSON.parse(jsonStr);
      if (jsonObj.category) category = jsonObj.category;
      if (jsonObj.title) newTitle = jsonObj.title;
    } else {
      // 如果不是 JSON，假设是纯文本分类名 (旧逻辑兼容)
      category = resultText.replace(/["'。]/g, '').trim();
    }
  } catch (e) {
    console.warn('解析LLM响应失败，使用原始内容作为分类:', e);
    category = resultText.replace(/["'。]/g, '').trim();
  }

  // 如果没有启用重命名，强制使用原标题
  if (!enableRename) {
    newTitle = title;
  }

  return { category, title: newTitle };
}

async function callDeepSeek(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'deepseek-chat';
  // Use custom Base URL if provided, otherwise default to official API
  const apiEndpoint = baseUrl ? baseUrl : 'https://api.deepseek.com/chat/completions';
  
  // If baseUrl is just the host (e.g. https://api.deepseek.com), append path
  const finalUrl = apiEndpoint.endsWith('/chat/completions') 
    ? apiEndpoint 
    : (apiEndpoint.endsWith('/') ? apiEndpoint + 'chat/completions' : apiEndpoint + '/chat/completions');

  console.log('Calling DeepSeek API at:', finalUrl);

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callChatGPT(prompt, apiKey, model, baseUrl) {
  const modelName = model || 'gpt-4o-mini';
  const apiEndpoint = baseUrl ? baseUrl : 'https://api.openai.com/v1/chat/completions';
  
  const finalUrl = apiEndpoint.endsWith('/chat/completions') 
    ? apiEndpoint 
    : (apiEndpoint.endsWith('/') ? apiEndpoint + 'chat/completions' : apiEndpoint + '/chat/completions');

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ChatGPT API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callGemini(prompt, apiKey, model) {
  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  // Gemini response structure: candidates[0].content.parts[0].text
  if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text.trim();
  } else {
      throw new Error('Gemini API returned unexpected format');
  }
}

async function callDoubao(prompt, apiKey, model) {
  if (!model) {
      throw new Error('使用豆包需要配置 Model (Endpoint ID)');
  }

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Doubao API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callOllama(prompt, model, host) {
  const modelName = model || 'llama3';
  const apiHost = host || 'http://localhost:11434';
  
  // Ollama generate API
  const response = await fetch(`${apiHost}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      prompt: prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama Error: ${response.status}`);
  }

  const data = await response.json();
  return data.response.trim();
}

// Offscreen Document Management for Chrome Built-in AI
let creatingOffscreen;
const OFFSCREEN_PATH = 'offscreen/offscreen.html';

async function setupOffscreenDocument() {
  // Check if offscreen document exists
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });

  if (contexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['DOM_PARSER'],
      justification: 'Running AI prompt in window context'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

async function callChromeBuiltInAI(prompt) {
  try {
    await setupOffscreenDocument();
    
    const response = await chrome.runtime.sendMessage({
      type: 'PROMPT_AI',
      target: 'offscreen',
      prompt: prompt
    });

    if (response && response.error) {
      throw new Error(response.error);
    }
    
    if (response && response.result) {
      return response.result.trim();
    }
    
    throw new Error('Unknown error from Chrome AI');
  } catch (e) {
    console.error('Chrome AI Call Failed:', e);
    throw new Error('Chrome Built-in AI 调用失败，请确保浏览器版本支持并已开启相关功能: ' + e.message);
  }
}
