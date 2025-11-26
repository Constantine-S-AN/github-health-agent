# 使用官方 Deno + Alpine 镜像（跟随最新稳定版）
FROM denoland/deno:alpine

# 安装 Node.js + npm（自带 npx），给 MCP server-github 用
RUN apk add --no-cache nodejs npm

# 一些 Deno 运行时优化（避免更新检查等）
ENV DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1

# 工作目录
WORKDIR /app

# 把当前项目复制进容器
COPY . .

# 在容器里删除你本地生成的 deno.lock，
# 然后用容器里的 Deno 重新 cache（会生成一个新锁）
RUN rm -f deno.lock && deno cache web-server.ts github-health-agent.ts

# 暴露端口（Railway 会注入 PORT 环境变量）
EXPOSE 8000

# 启动你的 Web 服务器
# -A：允许网络、读写、环境变量等（Zypher + MCP 需要）
CMD ["deno", "run", "-A", "web-server.ts"]
