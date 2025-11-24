// web-server.ts
// HTTP server exposing the GitHub Health Agent as a web API + static HTML.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  runGitHubHealthReport,
  type HealthMode,
  type Scenario,
} from "./github-health-agent.ts";

const PORT = 8000;

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (url.pathname === "/") {
    try {
      const html = await Deno.readTextFile(
        new URL("./index.html", import.meta.url),
      );
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      console.error("Failed to read index.html:", err);
      return new Response("index.html not found", { status: 500 });
    }
  }

  if (url.pathname === "/api/health") {
    const repoParam = url.searchParams.get("repo");
    const modeParam = url.searchParams.get("mode") ?? "plan";
    const taskParam = url.searchParams.get("task") ?? "";
    const scenarioParam = url.searchParams.get("scenario") ?? "health";

    if (!repoParam) {
      return new Response(
        JSON.stringify({ error: "Missing 'repo' query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let mode: HealthMode = "plan";
    if (modeParam === "auto") mode = "auto";

    let scenario: Scenario = "health";
    if (
      scenarioParam === "health" || scenarioParam === "backlog" ||
      scenarioParam === "release" || scenarioParam === "custom" ||
      scenarioParam === "chat"
    ) {
      scenario = scenarioParam as Scenario;
    }

    try {
      console.log(
        `🌐 HTTP request: repo=${repoParam} mode=${mode} scenario=${scenario} task=${taskParam}`,
      );

      const report = await runGitHubHealthReport(
        repoParam,
        mode,
        taskParam || undefined,
        scenario,
      );

      return new Response(
        JSON.stringify({
          repo: repoParam,
          mode,
          scenario,
          task: taskParam || undefined,
          report,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("Error analyzing repo:", err);
      const message =
        err instanceof Error ? err.message : "Failed to analyze repository";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Not found", { status: 404 });
};

console.log(`🌐 Web server running at http://localhost:${PORT}`);
serve(handler, { port: PORT });
