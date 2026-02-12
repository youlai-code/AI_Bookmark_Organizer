
const OFFICIAL_PROXY = 'https://youlainote.cloud';
const PROMPT = 'Hello, this is a test message. Please reply with "DeepSeek is working!".';

async function testDeepSeek() {
  console.log('Testing DeepSeek via CF Proxy...');
  
  const baseUrl = OFFICIAL_PROXY;
  const finalUrl = baseUrl.endsWith('/chat/completions') 
    ? baseUrl 
    : (baseUrl.endsWith('/') ? baseUrl + 'chat/completions' : baseUrl + '/chat/completions');

  console.log(`Endpoint: ${finalUrl}`);

  try {
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' // Empty API Key for default provider
      },
      body: JSON.stringify({
        model: 'deepseek-chat', // Default model
        messages: [{ role: 'user', content: PROMPT }],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
        console.log('\nSUCCESS! DeepSeek Reply:', data.choices[0].message.content);
    } else {
        console.warn('\nWARNING: Unexpected response structure.');
    }

  } catch (error) {
    console.error('\nFAILED:', error.message);
  }
}

testDeepSeek();
