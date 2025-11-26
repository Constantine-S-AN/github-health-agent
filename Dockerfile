# Use a Deno version that supports lockfile version 5
# (2.3.2 or newer; you can also use :latest if you prefer)
FROM denoland/deno:2.3.2

# Create app dir
WORKDIR /app

# Copy everything
COPY . .

# (Optional) cache dependencies to speed up builds
# This will now succeed because the Deno version matches the lockfile.
RUN deno cache web-server.ts github-health-agent.ts mirix-client.ts

# Railway will set PORT, we just expose the default
EXPOSE 8000

# Start the web server
# -A: allow all (net, env, fs) so Zypher + MCP + HTTP can work
CMD ["run", "-A", "web-server.ts"]
