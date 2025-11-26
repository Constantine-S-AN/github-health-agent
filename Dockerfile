# Use official Deno 2 image (pick a recent 2.x tag)
FROM denoland/deno:2.2.15

# Create app dir
WORKDIR /app

# Copy everything
COPY . .

# (Optional) cache dependencies to speed up builds
# Adjust file list if you rename files
RUN deno cache web-server.ts github-health-agent.ts mirix-client.ts

# Railway will set PORT, we just expose the default
EXPOSE 8000

# Start the web server
# -A: allow all (net, env, fs) so Zypher + MCP + HTTP can work
CMD ["run", "-A", "web-server.ts"]
