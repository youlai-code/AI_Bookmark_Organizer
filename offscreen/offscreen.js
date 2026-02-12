chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'CHECK_AI') {
    checkAI().then(sendResponse);
    return true; // Keep channel open
  }

  if (message.type === 'PROMPT_AI') {
    promptAI(message.prompt).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // Keep channel open
  }
});

async function checkAI() {
  if (!window.ai) {
    return { available: false, reason: 'window.ai not found' };
  }
  try {
    const capabilities = await window.ai.languageModel.capabilities();
    return { 
      available: capabilities.available !== 'no',
      capabilities 
    };
  } catch (e) {
    return { available: false, reason: e.message };
  }
}

async function promptAI(text) {
  if (!window.ai) {
    throw new Error('window.ai not supported in this browser');
  }

  try {
    // Create a new session
    const session = await window.ai.languageModel.create();
    
    // Prompt the model
    const result = await session.prompt(text);
    
    // Destroy session to free resources
    session.destroy();
    
    return { result };
  } catch (e) {
    throw e;
  }
}
