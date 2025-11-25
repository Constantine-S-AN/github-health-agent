// GitHub Health Agent entrypoint (CLI + web) with Zypher, GitHub MCP, and MIRIX-backed memory.
import {
  AnthropicModelProvider,
  createZypherContext,
  ZypherAgent,
} from "@corespeed/zypher";
import { eachValueFrom } from "rxjs-for-await";

import { fetchMirixMemoryContext, pushMirixMemory } from "./mirix-client.ts";

export type HealthMode = "plan" | "auto";
export type Scenario = "health" | "backlog" | "release" | "custom" | "chat";

interface RepoMemoryEpisode {
  timestamp: string;
  healthScore: number | null;
  summary: string;
}

interface RepoMemoryCore {
  description?: string;
  ownership?: string[];
}

interface RepoMemoryProcedural {
  triagePolicy?: string;
  releasePolicy?: string;
}

interface RepoMemory {
  core?: RepoMemoryCore;
  episodic?: RepoMemoryEpisode[];
  procedural?: RepoMemoryProcedural;
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Normalize user input into "owner/repo".
 * Accepts:
 *   - owner/repo
 *   - https://github.com/owner/repo
 *   - github.com/owner/repo
 */
export function normalizeRepo(input: string | undefined): string {
  if (!input) {
    throw new Error(
      "Repository is required (e.g. owner/repo or https://github.com/owner/repo)",
    );
  }
  const trimmed = input.trim();

  // URL first
  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith("github.com")) {
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }
  } catch {
    // not a URL
  }

  const withoutHost = trimmed.replace(/^github\.com[/:]+/, "");
  const pieces = withoutHost.split("/");
  if (pieces.length >= 2) {
    return `${pieces[0]}/${pieces[1]}`;
  }

  throw new Error(`Could not parse GitHub repo from: "${input}"`);
}

const MEMORY_DIR = "./memory";

async function ensureMemoryDir(): Promise<void> {
  try {
    await Deno.mkdir(MEMORY_DIR, { recursive: true });
  } catch (err) {
    if (err instanceof Deno.errors.AlreadyExists) return;
    throw err;
  }
}

function memoryPathForRepo(repo: string): string {
  const safe = repo.replace(/[^a-zA-Z0-9._-]+/g, "__");
  return `${MEMORY_DIR}/${safe}.json`;
}

async function loadRepoMemory(repo: string): Promise<RepoMemory | null> {
  await ensureMemoryDir();
  const path = memoryPathForRepo(repo);
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text) as RepoMemory;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    console.warn("Failed to load memory file:", err);
    return null;
  }
}

async function saveRepoMemory(repo: string, memory: RepoMemory): Promise<void> {
  await ensureMemoryDir();
  const path = memoryPathForRepo(repo);
  await Deno.writeTextFile(path, JSON.stringify(memory, null, 2));
}

function summarizeMemoryForPrompt(memory: RepoMemory | null): string {
  if (!memory) return "No prior memory for this repository yet.";
  const lines: string[] = [];

  if (memory.core?.description) {
    lines.push(`Core description: ${memory.core.description}`);
  }
  if (memory.core?.ownership && memory.core.ownership.length > 0) {
    lines.push(`Ownership: ${memory.core.ownership.join(", ")}`);
  }
  if (memory.procedural?.triagePolicy) {
    lines.push(`Triage policy: ${memory.procedural.triagePolicy}`);
  }
  if (memory.procedural?.releasePolicy) {
    lines.push(`Release policy: ${memory.procedural.releasePolicy}`);
  }

  const episodes = memory.episodic ?? [];
  if (episodes.length > 0) {
    lines.push("Recent health runs (latest 3):");
    const recent = episodes.slice(-3);
    for (const ep of recent) {
      lines.push(
        `- [${ep.timestamp}] score=${ep.healthScore ?? "n/a"}: ${
          ep.summary.slice(0, 180).replace(/\s+/g, " ")
        }...`,
      );
    }
  }

  return lines.join("\n");
}

function buildMirixConversationBuffer(params: {
  repo: string;
  scenario: Scenario;
  mode: HealthMode;
  userTask?: string;
  memorySummary: string;
}): string {
  const lines: string[] = [];

  lines.push(
    `[User] Run ${params.scenario} scenario for ${params.repo} in ${params.mode} mode.`,
  );

  if (params.userTask && params.userTask.trim().length > 0) {
    lines.push(`[User-Task] ${params.userTask.trim()}`);
  }

  if (params.memorySummary && params.memorySummary.trim().length > 0) {
    lines.push(`[Local-Memory-Summary] ${params.memorySummary.trim()}`);
  }

  return lines.join("\n");
}

function extractHealthScore(markdown: string): number | null {
  const match = markdown.match(
    /Health\s*Score[^0-9]*([0-9]{1,3})\s*\/\s*100/i,
  );
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
}

// --- Zypher agent initialization ---

const context = await createZypherContext(Deno.cwd());

const agent = new ZypherAgent(
  context,
  new AnthropicModelProvider({
    apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),
  }),
);

// GitHub MCP
await agent.mcp.registerServer({
  id: "github",
  type: "command",
  command: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: getRequiredEnv("GITHUB_TOKEN"),
    },
  },
});

// --- Task prompt builder ---

interface BuildTaskParams {
  repo: string;
  mode: HealthMode;
  memorySummary: string;
  mirixContext?: string;
  userTask?: string;
  scenario: Scenario;
}

function buildTask({
  repo,
  mode,
  memorySummary,
  mirixContext,
  userTask,
  scenario,
}: BuildTaskParams): string {
  const modeText =
    mode === "auto"
      ? "AUTO MODE (authorized to perform SAFE write actions: label issues, comment on PRs, open triage issues, create umbrella tasks)"
      : "PLAN-ONLY (read-only diagnosis, no write actions)";

  const userTaskSection = userTask && userTask.trim().length > 0
    ? `User request (HIGH PRIORITY, natural language):
    
${userTask}

You MUST treat this as a primary goal when planning and executing your loop.`
    : `No specific user task was provided.

Default behavior:
- Run a scenario-specific campaign for this repository.
- Diagnose, visualize, and, if in AUTO mode, perform small janitor-style fixes.`;

  let scenarioHeader = "";
  let scenarioFocus = "";

  switch (scenario) {
    case "health":
      scenarioHeader = "Scenario: Repository Health Overview";
      scenarioFocus =
        `Focus on overall health: activity, issues, PRs, releases, tests, docs, and contributor experience.`;
      break;
    case "backlog":
      scenarioHeader = "Scenario: Backlog Cleanup";
      scenarioFocus =
        `Focus on cleaning and structuring the backlog: stale issues, missing labels, duplicates, and triage policies.`;
      break;
    case "release":
      scenarioHeader = "Scenario: Release Preparation";
      scenarioFocus =
        `Focus on preparing the next release: PR readiness, blockers, changelog, release notes, and follow-up tasks.`;
      break;
    case "custom":
      scenarioHeader = "Scenario: Custom Task";
      scenarioFocus =
        `Interpret the user request as the main objective. Decide which parts of repo health / backlog / release / docs are most relevant to fulfill it.`;
      break;
    case "chat":
      scenarioHeader = "Scenario: Free Chat (Agentic)";
      scenarioFocus =
        `Behave like an autonomous repo assistant in a free-form conversation. Interpret the user request broadly and decide what actions (labels, comments, issues) are most helpful. Also provide a natural-language response in the dashboard.`;
      break;
  }

  // 合并本地 JSON memory + MIRIX 抽取的 memory context
  const combinedMemory =
    mirixContext && mirixContext.trim().length > 0
      ? `${memorySummary}\n\n[Mirix Memory Context]\n${mirixContext}`
      : memorySummary;

  return `
You are the **Autonomous Repository Guardian** for "${repo}".
Current Mode: ${modeText}
${scenarioHeader}

${scenarioFocus}

CRITICAL RESOURCE CONSTRAINTS:
1. You have a strict token limit. DO NOT read large files like 'package-lock.json', 'yarn.lock', or minified assets.
2. When listing issues or commits, ALWAYS limit your request to the most recent 5-10 items first. Do not fetch 100 items.
3. If a file is larger than 500 lines, only read the first 100 lines or ask for a summary.
4. Be concise in your internal reasoning.


Your job is to behave like a proactive, opinionated internal engineer:
- You don't just answer questions.
- You scan, visualize, and (when allowed) take small but meaningful actions to improve repo health.
- You are allowed to make reasonable, conservative decisions without asking the user for confirmation every step.

**User Context / Request**
${userTaskSection}

**Repository Memory (MIRIX-style summary)**
${combinedMemory}

---

## Agent Loop Behavior

During this task, you must explicitly follow a **Plan → Act → Observe → Re-plan** loop:

1. **Plan** the next 1–3 concrete sub-steps needed to fulfill the scenario and user request
   (for example: "inspect stale issues", "analyze PR latency", "propose labels", "identify release blockers").
2. **Act** by calling GitHub MCP tools whenever you need data or want to perform an action.
3. **Observe** the tool results and update your understanding of the repository.
4. **Re-plan** based on what you just learned, then decide the next best sub-steps.

Repeat this loop multiple times within a single task run until:
- You have a clear, coherent 2-week campaign plan for this scenario, and
- (If in AUTO mode) you have executed the highest-leverage **safe janitor actions** related to the scenario and user request.

You should **not** wait for user confirmation between these sub-steps.
By default, operate **autonomously** within the safety constraints below.

---

## Scenario-Specific Hints

- Health:
  - Balance across signals: issues, PRs, releases, docs, tests, contributor UX.
- Backlog Cleanup:
  - Prioritize: stale, unlabeled, duplicate, low-signal issues.
  - Suggest or apply labels, and surface "triage policy" ideas.
- Release Prep:
  - Focus on open PRs, tests, artifacts, and a draft changelog.
  - Identify blockers and pre-/post-release tasks.
- Custom Task:
  - Tie everything back to the user request; do not over-index on generic health.
- Free Chat:
  - Interpret the user request conversationally.
  - It's okay to "decide what to do" as long as you stay within safe write actions and explain your reasoning.

---

## Required Technical Steps (for all scenarios)

1. **Deep Scan**
   - Use GitHub MCP tools to inspect:
     - Open issues (count, labels, age distribution).
     - PRs (open vs closed, CI status, review latency).
     - Recent commit activity (last 30–90 days).
   - You MUST rely on MCP tools for data; do not hallucinate numbers.

2. **Visual Reporting (DeckSpeed Style)**
   - You MUST generate **Mermaid.js** diagrams:
     - A pie chart (or equivalent) showing issue status or type distribution (e.g., open vs closed, bug vs enhancement).
     - A Gantt chart showing the next 2 weeks of your proposed actions.
   - Put these diagrams in fenced code blocks using:
     \`\`\`mermaid
     ...
     \`\`\`

3. **Action Execution (If AUTO mode)**
   - When mode is AUTO, you MAY call GitHub MCP write tools to perform small, safe janitor tasks, such as:
     - Adding labels to unlabeled issues (e.g., "bug", "enhancement", "question").
     - Adding a polite comment to PRs that have been inactive for > 30 days asking for a status update.
     - Optionally opening a single "Health Campaign" or scenario-specific umbrella issue summarizing your findings.
   - DO NOT:
     - Force-push or modify code.
     - Close issues or PRs unless they are very clearly spam and you can explain why.
   - Every time you perform a write action via MCP, you must later summarize it in the "Auto-Fix Log" section.

---

## Output Format (Markdown)

Return a single Markdown document with the following structure:

# 🏥 Repository Dashboard: ${repo}

## 📊 Visual Insights
- Brief explanation of what your diagrams show.
- Then include at least one Mermaid diagram, for example:

\`\`\`mermaid
%% Example (the actual data should come from MCP):
pie showData
  "Open issues" : 42
  "Closed issues (last 30d)" : 17
\`\`\`

## 🚦 Executive Summary
- **Scenario**: ${scenarioHeader}
- **Health Score**: XX/100  ← IMPORTANT: always use this exact "XX/100" pattern so tools can parse it.
- **Trend**: [Improving / Stable / Declining] based on episodic memory and recent activity.
- 3–5 bullet points highlighting key signals.

## ⚠️ Critical Risks
- Bullet list of the most important risks and bottlenecks (unreviewed PRs, stale backlog, missing tests/docs, etc.).

## 🛠 Action Plan (2-Week Gantt)
- Describe the main workstreams (e.g., "Backlog clean-up", "Release prep", "Docs & onboarding").
- Then include a Mermaid Gantt chart like:

\`\`\`mermaid
gantt
  dateFormat  YYYY-MM-DD
  title 2-Week Health Campaign
  section Backlog clean-up
    Triage stale issues        :active, 2025-11-24, 3d
    Label unlabeled issues     :        2025-11-27, 3d
  section Release prep
    Draft release notes        :        2025-11-26, 4d
    Identify blockers          :        2025-11-28, 3d
\`\`\`

## 🧠 Agent Loop Log
- Add 4–10 bullet points, one per Plan→Act→Observe→Re-plan iteration.
- Each bullet should briefly state:
  - What you planned to do.
  - Which MCP tool(s) you used (if any).
  - The key observation(s) and how they changed your next plan.

## 🤖 Auto-Fix Log
- If mode = AUTO and you executed any MCP write actions, list them explicitly, e.g.:
  - "Labeled issue #42 as 'bug' and 'high priority'."
  - "Commented on PR #17 asking for a status update (inactive for 45 days)."
- If no actions were executed, write: "No write actions executed in this run."

Think step by step. Always prefer MCP tools over guessing. Keep the tone concise but opinionated, like an internal senior engineer.
`;
}

// --- Public API ---

export async function runGitHubHealthReport(
  repoInput: string,
  mode: HealthMode = "plan",
  userTask?: string,
  scenario: Scenario = "health",
): Promise<string> {
  const repo = normalizeRepo(repoInput);

  const memory = await loadRepoMemory(repo);
  const memorySummary = summarizeMemoryForPrompt(memory);

  let effectiveMode: HealthMode = mode;
  if (scenario === "chat") {
    effectiveMode = "auto";
  }

  // Build conversation buffer for MIRIX retrieval (fallback to local memory if unavailable)
  const mirixConversation = buildMirixConversationBuffer({
    repo,
    scenario,
    mode: effectiveMode,
    userTask,
    memorySummary,
  });

  const mirixContext = await fetchMirixMemoryContext(
    repo,
    mirixConversation,
  );

  const task = buildTask({
    repo,
    mode: effectiveMode,
    memorySummary,
    mirixContext: mirixContext ?? undefined,
    userTask,
    scenario,
  });

  const event$ = agent.runTask(
    task,
    "claude-sonnet-4-20250514",
    undefined,
    {
      maxIterations: 24,
    },
  );

  let finalText = "";

  for await (const event of eachValueFrom(event$)) {
    switch (event.type) {
      case "text": {
        finalText += event.content;
        break;
      }
      case "tool_use": {
        console.log(`\n🛠  Using tool: ${event.toolName}`);
        break;
      }
      case "tool_use_input":
      case "tool_result":
      case "checkpoint":
      case "checkpoint_restored":
      case "message":
        break;
      case "error": {
        console.error("Task error event:", event.error);
        break;
      }
      default:
        console.log("Unhandled event:", event);
    }
  }

  try {
    const score = extractHealthScore(finalText);
    const episode: RepoMemoryEpisode = {
      timestamp: new Date().toISOString(),
      healthScore: score,
      summary: finalText.slice(0, 2000),
    };
    const nextMemory: RepoMemory = {
      ...(memory ?? {}),
      episodic: [...(memory?.episodic ?? []), episode].slice(-10),
    };
    await saveRepoMemory(repo, nextMemory);

    // 同步写入 MIRIX 长期记忆
    const linesForMirix: string[] = [];
    linesForMirix.push(
      `GitHub repo: ${repo}`,
      `Scenario: ${scenario}`,
      `Mode: ${effectiveMode}`,
    );
    if (score !== null) {
      linesForMirix.push(`Health score this run: ${score}/100`);
    }
    linesForMirix.push("", "Agent final summary:", finalText);

    await pushMirixMemory(repo, linesForMirix.join("\n"));
  } catch (err) {
    console.warn(
      "Failed to update local memory or push MIRIX memory:",
      err,
    );
  }

  return finalText.trim();
}

// --- Daemon (cron) ---

async function startDaemonMode(repo: string, scenario: Scenario) {
  console.log(`⏰ Starting Health Agent Daemon for ${repo}...`);
  console.log("   Schedule: Every day at 08:00 UTC");

  // 注意：需要 --unstable-cron
  Deno.cron("Daily Repo Health Check", "0 8 * * *", async () => {
    console.log(`\n🚀 Triggering scheduled health check for ${repo}...`);
    try {
      const report = await runGitHubHealthReport(
        repo,
        "auto",
        undefined,
        scenario,
      );
      // TODO: push to Slack/Discord/email if needed
      console.log("✅ Scheduled check complete. Memory updated.");
      console.log(report.slice(0, 300) + "...\n");
    } catch (err) {
      console.error("❌ Scheduled check failed:", err);
    }
  });

  await new Promise<never>(() => {});
}

// --- CLI entrypoint ---

if (import.meta.main) {
  const [repoArg, ...rest] = Deno.args;

  if (!repoArg) {
    console.error(
      "Usage: deno run -A --env-file=.env github-health-agent.ts <repo> [--mode=plan|auto] [--scenario=health|backlog|release|custom|chat] [--task=\"...\"] [--daemon]",
    );
    Deno.exit(1);
  }

  let mode: HealthMode = "plan";
  let scenario: Scenario = "health";
  let isDaemon = false;
  let userTaskArg: string | undefined;

  for (const arg of rest) {
    if (arg.startsWith("--mode=")) {
      const val = arg.split("=")[1];
      if (val === "auto" || val === "plan") {
        mode = val;
      } else {
        console.warn(`Unknown mode "${val}", falling back to "plan".`);
      }
    } else if (arg.startsWith("--scenario=")) {
      const val = arg.split("=")[1] as Scenario;
      if (
        val === "health" || val === "backlog" || val === "release" ||
        val === "custom" || val === "chat"
      ) {
        scenario = val;
      } else {
        console.warn(
          `Unknown scenario "${val}", falling back to "health".`,
        );
      }
    } else if (arg.startsWith("--task=")) {
      userTaskArg = arg.slice("--task=".length);
    } else if (arg === "--daemon") {
      isDaemon = true;
    }
  }

  const repo = normalizeRepo(repoArg);

  if (isDaemon) {
    await startDaemonMode(repo, scenario);
  } else {
    console.log(
      `🔍 Analyzing ${repo} (mode: ${mode}, scenario: ${scenario})...\n`,
    );
    const report = await runGitHubHealthReport(
      repo,
      mode,
      userTaskArg,
      scenario,
    );
    console.log(report);
    console.log("\n✅ GitHub health analysis completed!");
  }
}
