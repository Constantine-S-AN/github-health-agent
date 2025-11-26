// Minimal HTTP server for the web UI and /api/health endpoint.

// NOTE: no std "serve" import needed; we'll use Deno.serve so this works
// both locally and on Railway / Deno Deploy.

import {
  runGitHubHealthReport,
  type HealthMode,
  type Scenario,
} from "./github-health-agent.ts";

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // Serve the main web UI
  if (url.pathname === "/") {
    try {
      const htmlUrl = new URL("./index.html", import.meta.url);
      const html = await Deno.readTextFile(htmlUrl);
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      console.error("Failed to read index.html:", err);
      return new Response("index.html not found", { status: 500 });
    }
  }

  // JSON API endpoint: /api/health
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

    // mode: "plan" | "auto"
    const mode: HealthMode = modeParam === "auto" ? "auto" : "plan";

    // scenario: validate the string before casting
    let scenario: Scenario = "health";
    if (
      scenarioParam === "health" ||
      scenarioParam === "backlog" ||
      scenarioParam === "release" ||
      scenarioParam === "custom" ||
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
        JSON.stringify(
          {
            repo: repoParam,
            mode,
            scenario,
            task: taskParam || undefined,
            report,
          },
          null,
          2,
        ),
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

const port = Number(Deno.env.get("PORT") ?? "8000");

console.log(`Web server running at http://localhost:${port}`);

Deno.serve({ port }, handler);
