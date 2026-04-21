import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";

type ServerOptions = {
  distDir: string;
  port: number;
};

type ClaimRow = {
  playerName: string;
  playerNameNormalized: string;
  subjectId: string;
  subjectTitle: string;
  periodKey: string;
  weekKey: string;
  bingoCount: number;
  createdAt: string;
  updatedAt: string;
};

type LeaderboardRow = {
  playerName: string;
  playerNameNormalized: string;
  totalBingos: number;
  claimedCards: number;
  latestClaimAt: string;
};

type ClaimPayload = {
  playerName?: unknown;
  subjectId?: unknown;
  subjectTitle?: unknown;
  periodKey?: unknown;
  weekKey?: unknown;
  bingoCount?: unknown;
};

const dbPath = Bun.env.BINGO_DB_PATH ?? join(process.cwd(), "data", "bingo-sync.sqlite");
const dbDir = dirname(dbPath);

if (dbDir && !existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath, { create: true });

db.exec(`
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    player_name_normalized TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    subject_title TEXT NOT NULL,
    period_key TEXT NOT NULL,
    week_key TEXT NOT NULL,
    bingo_count INTEGER NOT NULL CHECK (bingo_count >= 1),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (player_name_normalized, subject_id, period_key)
  );

  CREATE INDEX IF NOT EXISTS claims_week_idx
    ON claims (week_key, updated_at DESC);

  CREATE INDEX IF NOT EXISTS claims_player_idx
    ON claims (player_name_normalized, updated_at DESC);
`);

const upsertClaimStatement = db.prepare(`
  INSERT INTO claims (
    player_name,
    player_name_normalized,
    subject_id,
    subject_title,
    period_key,
    week_key,
    bingo_count
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (player_name_normalized, subject_id, period_key)
  DO UPDATE SET
    player_name = excluded.player_name,
    subject_title = excluded.subject_title,
    week_key = excluded.week_key,
    bingo_count = excluded.bingo_count,
    updated_at = CURRENT_TIMESTAMP
`);

const deleteClaimStatement = db.prepare(`
  DELETE FROM claims
  WHERE player_name_normalized = ?
    AND subject_id = ?
    AND period_key = ?
`);

const selectWeeklyClaimsStatement = db.query<ClaimRow, [string]>(`
  SELECT
    player_name AS playerName,
    player_name_normalized AS playerNameNormalized,
    subject_id AS subjectId,
    subject_title AS subjectTitle,
    period_key AS periodKey,
    week_key AS weekKey,
    bingo_count AS bingoCount,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM claims
  WHERE week_key = ?
  ORDER BY bingo_count DESC, updated_at DESC, player_name COLLATE NOCASE ASC
`);

const selectLeaderboardStatement = db.query<LeaderboardRow>(`
  SELECT
    player_name AS playerName,
    player_name_normalized AS playerNameNormalized,
    SUM(bingo_count) AS totalBingos,
    COUNT(*) AS claimedCards,
    MAX(updated_at) AS latestClaimAt
  FROM claims
  GROUP BY player_name_normalized
  ORDER BY totalBingos DESC, latestClaimAt DESC, player_name COLLATE NOCASE ASC
`);

export function startAppServer({ distDir, port }: ServerOptions) {
  return Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return handleApiRequest(request, url);
      }

      return serveStaticAsset(distDir, url.pathname);
    },
  });
}

async function handleApiRequest(request: Request, url: URL): Promise<Response> {
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        databasePath: dbPath,
        now: new Date().toISOString(),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/weekly-summary") {
      const weekKey = sanitizeWeekKey(url.searchParams.get("weekKey")) ?? getIsoWeekKey(new Date());
      const claims = selectWeeklyClaimsStatement.all(weekKey);

      return jsonResponse({
        weekKey,
        claims,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/leaderboard") {
      return jsonResponse({
        leaderboard: selectLeaderboardStatement.all(),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/claims") {
      let payload: ClaimPayload;

      try {
        payload = await request.json();
      } catch {
        return jsonError("Request body must be valid JSON.", 400);
      }

      const playerName = sanitizePlayerName(payload.playerName);
      const playerNameNormalized = normalizeName(playerName);
      const subjectId = sanitizeIdentifier(payload.subjectId, "subjectId");
      const subjectTitle = sanitizeText(payload.subjectTitle, "subjectTitle", 80);
      const periodKey = sanitizePeriodKey(payload.periodKey);
      const weekKey = sanitizeWeekKey(payload.weekKey) ?? getIsoWeekKey(new Date());
      const bingoCount = sanitizeBingoCount(payload.bingoCount);

      if (bingoCount === 0) {
        deleteClaimStatement.run(
          playerNameNormalized,
          subjectId,
          periodKey,
        );
      } else {
        upsertClaimStatement.run(
          playerName,
          playerNameNormalized,
          subjectId,
          subjectTitle,
          periodKey,
          weekKey,
          bingoCount,
        );
      }

      const claims = selectWeeklyClaimsStatement.all(weekKey);

      return jsonResponse(
        {
          ok: true,
          message: bingoCount === 0 ? "Claim removed." : "Claim saved.",
          weekKey,
          claims,
        },
        201,
      );
    }

    return jsonError("Route not found.", 404);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return jsonError(message, 500);
  }
}

async function serveStaticAsset(distDir: string, pathname: string): Promise<Response> {
  let safePathname = decodeURIComponent(pathname);

  if (safePathname === "/") {
    safePathname = "/index.html";
  }

  const relativePath = safePathname.replace(/^\/+/, "");
  const file = Bun.file(join(distDir, relativePath));

  if (await file.exists()) {
    return new Response(file);
  }

  const fallback = Bun.file(join(distDir, "index.html"));
  return new Response(fallback, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonError(message: string, status: number): Response {
  return jsonResponse({ ok: false, message }, status);
}

function sanitizePlayerName(value: unknown): string {
  return sanitizeText(value, "playerName", 80);
}

function sanitizeIdentifier(value: unknown, field: string): string {
  const text = sanitizeText(value, field, 60);

  if (!/^[a-z0-9-]+$/i.test(text)) {
    throw new Response(
      JSON.stringify({
        ok: false,
        message: `${field} may only contain letters, numbers, and dashes.`,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  return text;
}

function sanitizeText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Response(
      JSON.stringify({
        ok: false,
        message: `${field} must be a string.`,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  if (trimmed.length === 0) {
    throw new Response(
      JSON.stringify({
        ok: false,
        message: `${field} cannot be empty.`,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  if (trimmed.length > maxLength) {
    throw new Response(
      JSON.stringify({
        ok: false,
        message: `${field} must be at most ${maxLength} characters.`,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  return trimmed;
}

function sanitizePeriodKey(value: unknown): string {
  if (typeof value !== "string" || !/^(\d{4}-W\d{2}|\d{4}-\d{2}-\d{2})$/.test(value)) {
    throw new Response(
      JSON.stringify({
        ok: false,
        message: "periodKey must look like 2026-W17 or 2026-04-21.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  return value;
}

function sanitizeWeekKey(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  if (!/^\d{4}-W\d{2}$/.test(value)) {
    throw new Response(
      JSON.stringify({
        ok: false,
        message: "weekKey must look like 2026-W17.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  return value;
}

function sanitizeBingoCount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 12
  ) {
    throw new Response(
      JSON.stringify({
        ok: false,
        message: "bingoCount must be an integer between 0 and 12.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  return value;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function getIsoWeekKey(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}
