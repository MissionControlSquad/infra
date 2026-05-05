import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  terminateIdleConnections,
  refreshEnvAll,
  refreshEnvAllAndRestart,
  restartPostgres,
  getConnectionStats,
} from "@/lib/shell";

export const dynamic = "force-dynamic";

const ACTIONS = {
  "terminate-idle": { fn: terminateIdleConnections, requiresPassword: false },
  "refresh-env-all": { fn: refreshEnvAll, requiresPassword: false },
  "refresh-and-restart": { fn: refreshEnvAllAndRestart, requiresPassword: true },
  "restart-postgres": { fn: restartPostgres, requiresPassword: true },
  "connection-stats": { fn: getConnectionStats, requiresPassword: false },
} as const;

type Action = keyof typeof ACTIONS;

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { action?: string; password?: string };
  const { action, password } = body;

  if (!action || !(action in ACTIONS)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { fn, requiresPassword } = ACTIONS[action as Action];

  if (requiresPassword) {
    const { verifyPassword } = await import("@/lib/auth");
    if (!password || !verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 403 });
    }
  }

  try {
    const output = fn();
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Operation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
