# 使用基于 Debian 的 Deno 镜像（自带 glibc）
FROM denoland/deno:2.1.6

# 安装 Node.js + npm（带 npx），给 MCP server-github 用
RUN apt-get update && \
    apt-get install -y nodejs npm && \
    rm -rf /var/lib/apt/lists/*

# 一些 Deno 运行时优化
ENV DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1 \
    NODE_ENV=production

# 工作目录
WORKDIR /app

# 把当前项目复制进容器
COPY . .

# 删除旧的 lockfile（可能版本不兼容），由容器里的 Deno 重新生成
RUN rm -f deno.lock && deno cache web-server.ts github-health-agent.ts

# 暴露端口（Railway 会注入 PORT）
EXPOSE 8000

# 启动你的 Web 服务器
CMD ["deno", "run", "-A", "web-server.ts"]
