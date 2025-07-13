// 从环境变量获取配置
const jwtTokens = (Deno.env.get("JWT_TOKEN") || "").split(",").filter(Boolean);
const authTokens = (Deno.env.get("AUTH_TOKEN") || "sk-yourauthtoken").split(",").filter(Boolean);

// 模型分类
class ModelCategories {
  static deepseek = [
    "deepseek-chat",
    "deepseek-reasoner",
    "deepseek-v3",
    "deepseek-r1-0528"
  ];

  static xai = [
    "grok-beta",
    "grok-3-mini"
  ];

  static openai = [
    "gpt-4.1-nano",
    "gpt-4o-mini",
    "o1",
    "o1-mini",
    "o1-pro",
    "o4-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview"
  ];

  static claude = [
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
    "claude-3-7-sonnet-latest",
    "claude-3-5-sonnet-latest",
  ];

  static mistral = [
    "mistral-large-latest",
    "codestral-latest"
  ];

  // 获取所有模型列表
  static getAllModels() {
    return [
      ...ModelCategories.deepseek.map(id => ({ id, owned_by: "deepseek" })),
      ...ModelCategories.xai.map(id => ({ id, owned_by: "xai" })),
      ...ModelCategories.openai.map(id => ({ id, owned_by: "openai" })),
      ...ModelCategories.claude.map(id => ({ id, owned_by: "anthropic" })),
      ...ModelCategories.mistral.map(id => ({ id, owned_by: "mistral" }))
    ];
  }
}

// 鉴权中间件
function authMiddleware(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Authorization header missing" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const token = authHeader.replace("Bearer ", "");
  if (!authTokens.includes(token)) {
    return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  return null;
}

// 处理模型列表请求
function handleModelsRequest() {
  const models = ModelCategories.getAllModels();
  const responseData = {
    object: "list",
    data: models.map(model => ({
      id: model.id,
      object: "model",
      created: 1752371050, // 固定时间戳
      owned_by: model.owned_by
    }))
  };

  return new Response(JSON.stringify(responseData), {
    headers: { "Content-Type": "application/json" }
  });
}

// 处理聊天请求
async function handleChatRequest(req: Request) {
  // 随机选择一个JWT令牌
  const selectedToken = jwtTokens[Math.floor(Math.random() * jwtTokens.length)];
  
  const requestData = await req.json();
  const { messages, model, stream = false } = requestData;

  // 确定驱动类型
  let driver = "openai-completion"; // 默认值
  if (ModelCategories.deepseek.includes(model)) driver = "deepseek";
  else if (ModelCategories.xai.includes(model)) driver = "xai";
  else if (ModelCategories.claude.includes(model)) driver = "claude";
  else if (ModelCategories.mistral.includes(model)) driver = "mistral";

  const requestPayload = {
    interface: "puter-chat-completion",
    driver,
    test_mode: false,
    method: "complete",
    args: {
      messages,
      model,
      stream
    }
  };

  const headers = {
    "Host": "api.puter.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
    "Accept": "*/*",
    "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
    "Authorization": `Bearer ${selectedToken}`,
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://docs.puter.com",
    "Referer": "https://docs.puter.com/",
    "DNT": "1",
    "Sec-GPC": "1",
    "Idempotency-Key": "\"4900243693008804770\""
  };

  try {
    const response = await fetch("https://api.puter.com/drivers/call", {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: "Upstream API error",
        status: response.status 
      }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (stream) {
      // 创建转换流来处理SSE格式
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      
      // 异步处理流
      (async () => {
        const reader = response.body?.getReader();
        if (!reader) return;

        // 发送初始角色信息
        const initialEvent = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            delta: { role: "assistant" },
            finish_reason: null
          }]
        };
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(initialEvent)}\n\n`));

        try {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // 将Uint8Array转换为字符串
            const chunk = new TextDecoder().decode(value);
            buffer += chunk;
            
            // 处理可能的多行数据
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // 保留未完成的行
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const jsonData = JSON.parse(line);
                
                // 处理不同的响应格式
                let text = "";
                if (jsonData.text) {
                  text = jsonData.text;
                } else if (jsonData.result?.message?.content) {
                  const content = jsonData.result.message.content;
                  if (Array.isArray(content)) {
                    text = content.find((item: any) => item.type === "text")?.text || "";
                  } else if (typeof content === "string") {
                    text = content;
                  }
                }
                
                if (text) {
                  const chunkEvent = {
                    id: `chatcmpl-${Date.now()}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [{
                      index: 0,
                      delta: { content: text },
                      finish_reason: null
                    }]
                  };
                  await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(chunkEvent)}\n\n`));
                }
              } catch (e) {
                console.error("Error parsing JSON:", e);
              }
            }
          }
          
          // 发送结束事件
          const doneEvent = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }]
          };
          await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
          await writer.write(new TextEncoder().encode("data: [DONE]\n\n"));
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: { 
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    } else {
      // 非流式响应
      const data = await response.json();
      let content = data?.result?.message?.content || "No text, maybe error?";
      
      if (driver === "claude" && Array.isArray(content)) {
        content = content[0].text;
      }

      const usage = data?.result?.usage;
      let tokenUsage = [0, 0, 0];
      
      if (Array.isArray(usage)) {
        tokenUsage = [
          ...usage.map((x: any) => x.amount),
          usage.reduce((sum: number, x: any) => sum + x.amount, 0)
        ];
      } else if (usage && typeof usage === "object") {
        tokenUsage = [
          usage.input_tokens,
          usage.output_tokens,
          usage.input_tokens + usage.output_tokens
        ];
      }

      return new Response(JSON.stringify({
        choices: [{
          message: { role: "assistant", content },
          finish_reason: "stop"
        }],
        usage: {
          prompt_tokens: tokenUsage[0],
          completion_tokens: tokenUsage[1],
          total_tokens: tokenUsage[2]
        }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      details: error.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// 主请求处理器
async function handler(req: Request) {
  const url = new URL(req.url);
  
  // 鉴权检查
  const authResponse = authMiddleware(req);
  if (authResponse) return authResponse;

  // 路由处理
  if (url.pathname === "/v1/models" && req.method === "GET") {
    return handleModelsRequest();
  } else if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
    return handleChatRequest(req);
  } else {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// 启动服务器
Deno.serve({ port: 8000 }, handler);
