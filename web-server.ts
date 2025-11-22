// web-server.ts
// Simple HTTP server that exposes the GitHub Health Agent as a web API + static HTML.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  runGitHubHealthReport,
  normalizeRepo,
} from "./github-health-agent.ts";

const PORT = 8000;

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // Serve the front-end page.
  if (url.pathname === "/") {
    const html = await Deno.readTextFile("index.html");
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }

  // JSON API: /api/health?repo=owner/repo_or_url
  if (url.pathname === "/api/health") {
    const repoParam = url.searchParams.get("repo") ?? "";
    if (!repoParam) {
      return new Response(
        JSON.stringify({ error: "Missing 'repo' query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const report = await runGitHubHealthReport(repoParam);
      const normalizedRepo = normalizeRepo(repoParam);
      return new Response(
        JSON.stringify({ repo: normalizedRepo, report }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("Error analyzing repo:", err);
      return new Response(
        JSON.stringify({ error: "Failed to analyze repository" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Not found", { status: 404 });
};

console.log(`🌐 Web server running at http://localhost:${PORT}`);
serve(handler, { port: PORT });
