// github-health-agent.ts
// GitHub Health Agent built with Zypher + GitHub MCP.
// Usage:
//   deno run -A --env-file=.env github-health-agent.ts owner/repo
//   deno run -A --env-file=.env github-health-agent.ts https://github.com/owner/repo
//
// .env needs at least:
//   ANTHROPIC_API_KEY=...
//   GITHUB_TOKEN=...

import {
  ZypherAgent,
  AnthropicModelProvider,
  createZypherContext,
} from "@corespeed/zypher";
import { eachValueFrom } from "rxjs-for-await";

/**
 * Read a required environment variable or throw a clear error.
 */
const getRequiredEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

/**
 * Normalize user input into "owner/repo".
 * - Accepts either "owner/repo" or a full GitHub URL.
 * - Falls back to a default repo if nothing is provided.
 */
const normalizeRepo = (input?: string): string => {
  if (!input) return "corespeedio/zypher";

  // e.g. https://github.com/owner/repo[...]
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const url = new URL(input);
      const parts = url.pathname.split("/").filter(Boolean); // drop empty strings
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`; // owner/repo
      }
    } catch {
      // If URL parsing fails, just fall through and return the raw input.
    }
  }

  // Already looks like "owner/repo".
  return input;
};

const repo = normalizeRepo(Deno.args[0]);

// 1. Initialize Zypher context (same pattern as Quick Start).
const zypherContext = await createZypherContext(Deno.cwd());

// 2. Create ZypherAgent with Anthropic as the model provider.
const agent = new ZypherAgent(
  zypherContext,
  new AnthropicModelProvider({
    apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),
  }),
);

// 3. Register GitHub MCP server (for issues / PR / commits / etc.).
await agent.mcp.registerServer({
  id: "github",
  type: "command",
  command: {
    command: "npx",
    args: ["-y", "github-mcp"],
    env: {
      // Expose the same PAT under multiple names so whatever the MCP expects, it will see it.
      GITHUB_TOKEN: getRequiredEnv("GITHUB_TOKEN"),
      GITHUB_ACCESS_TOKEN: getRequiredEnv("GITHUB_TOKEN"),
      GITHUB_PERSONAL_ACCESS_TOKEN: getRequiredEnv("GITHUB_TOKEN"),
    },
  },
});

// 4. Define the GitHub health task (what the agent should do).
const task = `
You are a GitHub repository health assistant.

Target repository: "${repo}".

You ONLY have access to:
- GitHub MCP tools (server id: "github") that can inspect repository metadata,
  issues, pull requests, commits, and releases.

Do NOT use any other MCP servers or tools.

Your goals:

1. Gather quantitative signals:
   - Number of open issues and pull requests.
   - Recent activity: commits in the last 30 days.
   - Latest release or tag date, if available.
   - Signs of staleness (e.g., no commits for a long time, many stale issues/PRs).

2. Use these signals to compute a 0–100 "Health Score" for the repository.
   - Clearly explain how you computed this score.

3. Produce a concise Markdown report with the following sections:
   - "Health Score": a single number and 1–2 sentence summary.
   - "Indicators": bullet points for activity, issues/PR hygiene, releases.
   - "Risks": potential problems (e.g., many stale PRs, no releases, low test coverage signals).
   - "Recommended Next Actions": 3–5 concrete things a maintainer should do next.

Be explicit about which pieces of information came from GitHub tools
versus your own reasoning.

Keep the final report under 400 words.
`;

// 5. Run the task using Claude Sonnet.
const event$ = agent.runTask(task, "claude-sonnet-4-20250514");

console.log(`🔍 Analyzing GitHub repo: ${repo}\n`);

let finalText = "";

// 6. Stream task events and accumulate the final text response.
for await (const event of eachValueFrom(event$)) {
  switch (event.type) {
    case "text": {
      // TaskTextEvent: content is a string chunk.
      finalText += event.content;
      break;
    }
    case "tool_use": {
      // TaskToolUseEvent: we log which tool is being used.
      console.log(`\n🛠  Using tool: ${event.toolName}`);
      break;
    }
    case "tool_use_input": {
      // TaskToolUseInputEvent: can be used for debugging if needed.
      // console.log(`   partial input: ${event.partialInput}`);
      break;
    }
    case "message": {
      // TaskMessageEvent: full message / final message, usually no need to log here.
      break;
    }
    default: {
      // Other events: history changes, cancellation, etc. We ignore them for now.
      break;
    }
  }
}

console.log("\n💬 Agent report:\n");
console.log(finalText.trim());
console.log("\n✅ GitHub health analysis completed!");
