# 使用官方 Deno + Alpine 镜像
FROM denoland/deno:alpine-2.1.6

# 安装 Node.js + npm（自带 npx），给 MCP server-github 用
RUN apk add --no-cache nodejs npm

# 一些 Deno 运行时优化（避免更新检查等）
ENV DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1

# 工作目录
WORKDIR /app

# 把当前项目复制进容器
COPY . .

# 预先缓存依赖（可选，但能早点发现问题）
RUN deno cache web-server.ts github-health-agent.ts

# 暴露端口（Railway 会注入 PORT 环境变量）
EXPOSE 8000

# 启动你的 Web 服务器
# -A：允许网络、读写、环境变量等（Zypher + MCP 需要）
CMD ["deno", "run", "-A", "web-server.ts"]
