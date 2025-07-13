# puter.js-2api
Puter.js 2api deno version, reverse puter.js into openai API format

# Deno 版 Puter API 代理服务

## 使用说明

1. **环境变量配置**:
   - `jwtTokens`: Puter.com 的 JWT 令牌，支持多个令牌用英文逗号`,`分隔
   - `authTokens`: API 鉴权令牌，默认为 `sk-yourauthtoken`，支持多个令牌用英文逗号`,`分隔

2. **启动服务**:
```bash
deno run --allow-net --allow-env main.ts
```

3. **API 端点**:
   - `GET /v1/models`: 获取支持的模型列表
   - `POST /v1/chat/completions`: 聊天补全接口，支持流式和非流式响应

4. **请求头**:
   需要在请求头中添加 `Authorization: Bearer <your_auth_token>`

## 功能说明

1. **多令牌支持**:
   - 支持配置多个 JWT 令牌，每次请求随机选择一个使用
   - 支持配置多个 API 鉴权令牌，只有使用有效令牌才能访问 API

2. **模型列表**:
   - 返回所有支持的模型，按照所属组织分类
   - 响应格式符合 OpenAI API 标准

3. **聊天接口**:
   - 支持流式和非流式响应
   - 请求格式和响应格式兼容 OpenAI API
   - 自动根据模型选择正确的驱动类型

4. **错误处理**:
   - 完善的错误处理和状态码返回
   - 详细的错误信息返回
