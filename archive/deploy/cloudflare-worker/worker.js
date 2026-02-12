/**
 * Cloudflare Worker 代理脚本 (安全增强版)
 * 
 * 安全功能:
 * 1. 隐藏 API Key: 用户无需配置 Key
 * 2. 业务验证: 仅允许包含特定关键词的请求 (防止被用于通用聊天)
 * 3. 来源检查: 可选配置，限制特定 Chrome 扩展 ID
 * 
 * 部署说明:
 * 1. 复制此代码到 Cloudflare Worker
 * 2. 设置环境变量 DEEPSEEK_API_KEY
 * 3. (可选) 设置环境变量 ALLOWED_EXTENSION_ID 为你的插件 ID (chrome://extensions 中查看)
 */

export default {
  async fetch(request, env) {
    // 1. 处理 CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (!url.pathname.endsWith("/chat/completions")) {
      return new Response("Invalid Path", { status: 404 });
    }

    try {
      const body = await request.json();
      const messages = body.messages || [];
      const lastMessage = messages[messages.length - 1]?.content || "";

      // === 安全检查 1: 业务内容验证 ===
      // 只有包含插件特有提示词的请求才会被转发
      // 防止他人盗用你的 URL 去让 AI 写代码或聊天
      const requiredKeywords = ["书签分类", "现有文件夹"];
      const isValidBusinessRequest = requiredKeywords.some(keyword => lastMessage.includes(keyword));
      
      if (!isValidBusinessRequest) {
         return new Response(JSON.stringify({ 
             error: "Forbidden: 此接口仅供书签分类插件使用，禁止通用聊天用途。" 
         }), { status: 403 });
      }

      // === 安全检查 2: 来源 ID 验证 (可选) ===
      // 如果你在 Worker 变量里设置了 ALLOWED_EXTENSION_ID
      if (env.ALLOWED_EXTENSION_ID) {
          const origin = request.headers.get("Origin") || "";
          // Chrome 扩展的 Origin 格式通常是 chrome-extension://<id>
          if (!origin.includes(env.ALLOWED_EXTENSION_ID)) {
              return new Response(JSON.stringify({ 
                  error: "Forbidden: 非法插件来源" 
              }), { status: 403 });
          }
      }

      // === 转发请求 ===
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify(body)
      });

      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      return newResponse;

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" } 
      });
    }
  },
};
