import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "./lib/admin";
import { appendEvent, ClientDoc, ClientEvent, clientRef, ContactStatus } from "./lib/registry";

interface HistoryQuery {
  metric?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

interface ProxyRequest {
  clientId?: string;
  view?: "live" | "history";
  query?: HistoryQuery;
}

type ProxyResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: "unreachable" | "auth-failed" | "gateway-error"; status?: number };

const FETCH_TIMEOUT_MS = 8000;
const MAX_HISTORY_LIMIT = 20000;

/**
 * On-demand pass-through to one client's gateway API (never cached, never
 * stored): looks up the client's address + API key in the registry, calls
 * /api/admin/{live|history} over HTTP(S), and returns the JSON as-is.
 * Reachability problems come back as { ok: false } rather than errors so the
 * dashboard can render a clear "client unreachable" state.
 */
export const gatewayProxy = onCall(
  { region: "asia-south1", maxInstances: 2, timeoutSeconds: 20, memory: "256MiB" },
  async (request): Promise<ProxyResult> => {
    await assertAdmin(request);

    const { clientId, view, query } = (request.data ?? {}) as ProxyRequest;
    if (!clientId || typeof clientId !== "string") {
      throw new HttpsError("invalid-argument", "clientId is required.");
    }
    if (view !== "live" && view !== "history") {
      throw new HttpsError("invalid-argument", "view must be 'live' or 'history'.");
    }

    const ref = clientRef(clientId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Unknown client.");
    }
    const client = snap.data() as ClientDoc;

    const url = buildUrl(client, view, query);
    const result = await fetchGateway(url, client.adminApiKey ?? "");

    // Best-effort reachability bookkeeping — never fail the call over it.
    const status: ContactStatus = result.ok ? "ok" : result.reason === "auth-failed" ? "auth-failed" : "unreachable";
    const now = new Date();
    const update: Record<string, unknown> = { lastContactStatus: status };
    if (result.ok) {
      update.lastAdminContactAt = Timestamp.fromDate(now);
    }
    if (!result.ok || client.lastContactStatus !== "ok") {
      const event: ClientEvent = {
        at: now.toISOString(),
        type: result.ok ? "pull-ok" : result.reason === "auth-failed" ? "pull-auth-failed" : "pull-unreachable",
      };
      if (!result.ok) {
        event.detail = `${view} → ${result.reason}${result.status ? ` (${result.status})` : ""}`;
      }
      update.recentEvents = appendEvent(client.recentEvents, event);
    }
    try {
      await ref.update(update);
    } catch (err) {
      logger.warn("contact write failed", { clientId, err });
    }

    return result;
  }
);

function buildUrl(client: ClientDoc, view: "live" | "history", query?: HistoryQuery): string {
  const scheme = client.useTls ? "https" : "http";
  const host = client.hostnameOverride || client.staticIp;
  const port = client.port ?? (client.useTls ? 443 : 80);
  const url = new URL(`${scheme}://${host}:${port}/api/admin/${view}`);

  if (view === "history") {
    if (!query?.metric || !query.from || !query.to) {
      throw new HttpsError("invalid-argument", "history requires metric, from and to.");
    }
    url.searchParams.set("metric", query.metric);
    url.searchParams.set("from", query.from);
    url.searchParams.set("to", query.to);
    const limit = Math.min(Math.max(1, query.limit ?? 2000), MAX_HISTORY_LIMIT);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(Math.max(0, query.offset ?? 0)));
  }
  return url.toString();
}

async function fetchGateway(url: string, apiKey: string): Promise<ProxyResult> {
  try {
    const response = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "auth-failed", status: response.status };
    }
    if (!response.ok) {
      return { ok: false, reason: "gateway-error", status: response.status };
    }
    return { ok: true, data: await response.json() };
  } catch (err) {
    logger.info("gateway fetch failed", { url, err: String(err) });
    return { ok: false, reason: "unreachable" };
  }
}
