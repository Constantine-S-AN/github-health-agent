// mirix-client.ts
// Thin client talking to the local MIRIX memory service.

const MIRIX_BASE_URL = Deno.env.get("MIRIX_URL") ?? "http://127.0.0.1:8000";

async function safeFetchJson(
  path: string,
  body: unknown,
): Promise<unknown | null> {
  try {
    const res = await fetch(`${MIRIX_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(
        `MIRIX request to ${path} failed: ${res.status} ${res.statusText}`,
      );
      const text = await res.text().catch(() => "");
      if (text) console.warn("MIRIX response body:", text);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn(`MIRIX request to ${path} threw:`, err);
    return null;
  }
}

export async function pushMirixMemory(
  repo: string,
  text: string,
): Promise<void> {
  await safeFetchJson("/mirix/add", { repo, text });
}

export async function fetchMirixMemoryContext(
  repo: string,
  conversation: string,
): Promise<string | null> {
  const data = await safeFetchJson("/mirix/system_prompt", {
    repo,
    conversation,
  });

  if (!data || typeof data !== "object") return null;
  const anyData = data as { memory_context?: unknown };
  const ctx = anyData.memory_context;
  return typeof ctx === "string" && ctx.trim().length > 0 ? ctx : null;
}
