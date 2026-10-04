import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "./lib/admin";
import { appendEvent, ClientDoc, ClientEvent, clientRef, ContactStatus, isValidClientId } from "./lib/registry";

interface HistoryQuery {
  metric?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

interface TrendsQuery {
  bucket?: "auto" | "hour" | "day" | "month";
  start?: string;
  end?: string;
}

// Matches CONTRACT-admin-api.md's POST /api/admin/filter request body exactly.
interface FilterBody {
  filterBy?: "time" | "cycle" | "metal";
  filterStart?: string;
  filterEnd?: string;
  periodLabel?: string;
  filterCycleFrom?: number;
  filterCycleTo?: number;
  filterMetalName?: string;
  selectedParameters?: string[];
}

type View = "live" | "history" | "trends" | "filter" | "amps-by-cycle" | "filter-amps";
const VIEWS: ReadonlySet<string> = new Set<View>(["live", "history", "trends", "filter", "amps-by-cycle", "filter-amps"]);
const TREND_BUCKETS: ReadonlySet<string> = new Set(["auto", "hour", "day", "month"]);

interface ProxyRequest {
  clientId?: string;
  view?: View;
  query?: HistoryQuery;
  trendsQuery?: TrendsQuery;
  filterBody?: FilterBody;
  impeller?: number;   // amps-by-cycle
  requestId?: number;  // filter-amps
}

// Network-level failures are split out beyond the historic "unreachable" so the
// admin UI can tell a client's server down (connection-refused) from a bad DNS
// entry, an expired/mismatched cert, or the proxy's own timeout budget — all of
// which look identical to a caller unless the underlying error code is kept.
type FailureReason =
  | "timeout"
  | "dns"
  | "connection-refused"
  | "tls-error"
  | "unreachable"
  | "auth-failed"
  | "gateway-error";

// trendBucket carries the gateway's X-Trend-Bucket response header (the bucket
// it picked for bucket=auto) when it sends one.
type ProxyResult =
  | { ok: true; data: unknown; trendBucket?: string }
  | { ok: false; reason: FailureReason; status?: number; message?: string };

// "filter" gets a much longer budget than the others — a synchronous filtered
// calculation can be slow, and CONTRACT-admin-api.md suggests 30–60s until it
// is benchmarked at real scale; 60s is the top of that range. It must stay
// under the function's own timeoutSeconds (75s) and Cloudflare's 100s origin
// limit when the gateway sits behind a tunnel. "trends" and the two per-cycle
// amps views read whole-history series, so they get a bit more headroom than
// live/history's tight 8s.
const FETCH_TIMEOUT_MS: Record<View, number> = {
  live: 8000,
  history: 8000,
  trends: 15000,
  filter: 60000,
  "amps-by-cycle": 15000,
  "filter-amps": 15000,
};
const MAX_HISTORY_LIMIT = 20000;

// A reply bigger than this is refused rather than relayed (a callable response
// has to fit in the function's memory and Firebase's response size limit).
// A very wide filter window is the realistic way to hit it (filter-amps).
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

// Status codes Cloudflare (tunnel) and similar front proxies return when they
// themselves are up but cannot reach the gateway behind them.
const FRONT_PROXY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);

/**
 * On-demand pass-through to one client's gateway API (never cached, never
 * stored): looks up the client's address + API key in the registry, calls
 * /api/admin/{live|history|trends|filter|amps/by-cycle|filter/{id}/amps} over
 * HTTPS, and returns the JSON as-is. Reachability problems come back as
 * { ok: false } rather than errors so the dashboard can render a clear
 * "client unreachable" state.
 */
export const gatewayProxy = onCall(
  // timeoutSeconds must cover the slowest path (filter, 60s fetch budget)
  // with headroom — live/history/trends still return in seconds as before.
  { region: "asia-south1", maxInstances: 2, timeoutSeconds: 75, memory: "256MiB" },
  async (request): Promise<ProxyResult> => {
    // Callable functions verify the Firebase ID token before this runs;
    // assertAdmin then requires request.auth plus an admins/{uid} document.
    await assertAdmin(request);

    // Only the client ID comes from the browser. The gateway address and
    // API key are read from the registry below, server-side.
    const data = (request.data ?? {}) as ProxyRequest;
    const { clientId, view } = data;
    if (!isValidClientId(clientId)) {
      throw new HttpsError("invalid-argument", "A valid clientId is required.");
    }
    if (!view || !VIEWS.has(view)) {
      throw new HttpsError("invalid-argument", `view must be one of: ${[...VIEWS].join(", ")}.`);
    }

    const ref = clientRef(clientId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Unknown client.");
    }
    const client = snap.data() as ClientDoc;

    const { url, method, body } = buildRequest(client, view, data);
    const result = await fetchGateway(url, client.adminApiKey ?? "", FETCH_TIMEOUT_MS[view], method, body);

    // Best-effort reachability bookkeeping — never fail the call over it.
    // lastAdminContactAt records the last *attempt* (success or failure) so an
    // admin can tell "we just tried and it failed" from "we haven't tried in
    // days" — lastContactStatus carries the outcome of that attempt.
    const status: ContactStatus = result.ok ? "ok" : result.reason === "auth-failed" ? "auth-failed" : "unreachable";
    const now = new Date();
    const update: Record<string, unknown> = {
      lastContactStatus: status,
      lastAdminContactAt: Timestamp.fromDate(now),
    };
    if (!result.ok || client.lastContactStatus !== "ok") {
      const event: ClientEvent = {
        at: now.toISOString(),
        type: result.ok ? "pull-ok" : result.reason === "auth-failed" ? "pull-auth-failed" : "pull-unreachable",
      };
      if (!result.ok) {
        event.detail = `${view} → ${result.reason}${result.status ? ` ${result.status}` : ""}${result.message ? `: ${result.message}` : ""}`;
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

function buildRequest(
  client: ClientDoc,
  view: View,
  { query, trendsQuery, filterBody, impeller, requestId }: ProxyRequest
): { url: string; method: "GET" | "POST"; body?: string } {
  let path: string = view;
  if (view === "amps-by-cycle") {
    if (!Number.isInteger(impeller) || impeller! < 1 || impeller! > 10) {
      throw new HttpsError("invalid-argument", "amps-by-cycle requires impeller 1–10.");
    }
    path = "amps/by-cycle";
  } else if (view === "filter-amps") {
    if (!Number.isSafeInteger(requestId) || requestId! < 1) {
      throw new HttpsError("invalid-argument", "filter-amps requires a positive integer requestId.");
    }
    path = `filter/${requestId}/amps`;
  }

  const scheme = client.useTls ? "https" : "http";
  const host = client.hostnameOverride || client.staticIp;
  const port = client.port ?? (client.useTls ? 443 : 80);
  const url = new URL(`${scheme}://${host}:${port}/api/admin/${path}`);

  // Plain HTTP would send the X-Api-Key across the internet unencrypted.
  if (url.protocol !== "https:") {
    throw new HttpsError(
      "failed-precondition",
      "This client is set to plain HTTP, which would send the API key unencrypted. " +
        "Turn on HTTPS for it (a Cloudflare tunnel address works)."
    );
  }

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
    return { url: url.toString(), method: "GET" };
  }

  if (view === "amps-by-cycle") {
    url.searchParams.set("impeller", String(impeller));
    return { url: url.toString(), method: "GET" };
  }

  if (view === "trends") {
    const bucket = trendsQuery?.bucket ?? "day";
    if (!TREND_BUCKETS.has(bucket)) {
      throw new HttpsError("invalid-argument", "trends bucket must be auto, hour, day or month.");
    }
    if (bucket === "hour" && (!trendsQuery?.start || !trendsQuery?.end)) {
      throw new HttpsError("invalid-argument", "trends with bucket=hour requires start and end.");
    }
    url.searchParams.set("bucket", bucket);
    if (trendsQuery?.start) url.searchParams.set("start", trendsQuery.start);
    if (trendsQuery?.end) url.searchParams.set("end", trendsQuery.end);
    return { url: url.toString(), method: "GET" };
  }

  if (view === "filter") {
    if (!filterBody?.filterBy) {
      throw new HttpsError("invalid-argument", "filter requires filterBy.");
    }
    if (filterBody.filterBy === "time" && (!filterBody.filterStart || !filterBody.filterEnd)) {
      throw new HttpsError("invalid-argument", "time filter requires filterStart and filterEnd.");
    }
    if (filterBody.filterBy === "cycle" && (filterBody.filterCycleFrom == null || filterBody.filterCycleTo == null)) {
      throw new HttpsError("invalid-argument", "cycle filter requires filterCycleFrom and filterCycleTo.");
    }
    if (filterBody.filterBy === "metal" && !filterBody.filterMetalName) {
      throw new HttpsError("invalid-argument", "metal filter requires filterMetalName.");
    }
    return { url: url.toString(), method: "POST", body: JSON.stringify(filterBody) };
  }

  return { url: url.toString(), method: "GET" };
}

async function fetchGateway(
  url: string,
  apiKey: string,
  timeoutMs: number,
  method: "GET" | "POST",
  body?: string
): Promise<ProxyResult> {
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname;
  const port = parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80");

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      // Never follow a redirect: it would re-send X-Api-Key to wherever the
      // Location header points.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      return {
        ok: false, reason: "gateway-error", status: response.status,
        message: "Gateway answered with a redirect. It was not followed, so the API key was not sent anywhere else. Check the client's address.",
      };
    }
    if (!response.ok) {
      const upstreamMessage = await readErrorMessage(response);
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false, reason: "auth-failed", status: response.status,
          message: upstreamMessage ?? "Gateway rejected the API key.",
        };
      }
      if (!upstreamMessage && FRONT_PROXY_STATUSES.has(response.status)) {
        return {
          ok: false, reason: "gateway-error", status: response.status,
          message: "The tunnel or proxy in front of the gateway is up, but could not reach the gateway behind it.",
        };
      }
      return {
        ok: false, reason: "gateway-error", status: response.status,
        message: upstreamMessage ?? `Gateway returned HTTP ${response.status}.`,
      };
    }
    const result = await readJsonBody(response);
    // With bucket=auto only the gateway knows which bucket it used; the page
    // needs it to title the chart, so relay the header's value.
    const trendBucket = response.headers.get("x-trend-bucket")?.trim().toLowerCase();
    if (result.ok && trendBucket && TREND_BUCKETS.has(trendBucket) && trendBucket !== "auto") {
      result.trendBucket = trendBucket;
    }
    return result;
  } catch (err) {
    const { reason, message } = classifyFetchError(err, hostname, port);
    logger.info("gateway fetch failed", { url, reason, err: String(err) });
    return { ok: false, reason, message };
  }
}

/** Reads a 2xx body as JSON, refusing oversized or non-JSON replies with a clear reason. */
async function readJsonBody(response: Response): Promise<ProxyResult> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return tooLarge(response.status);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    return tooLarge(response.status);
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return {
      ok: false, reason: "gateway-error", status: response.status,
      message: "Gateway replied, but not with JSON — the address may point at the wrong server.",
    };
  }
}

function tooLarge(status: number): ProxyResult {
  return {
    ok: false, reason: "gateway-error", status,
    message: "Gateway reply was larger than 10 MB. Try a shorter filter window.",
  };
}

/** Best-effort read of the gateway's documented `{"error": "..."}` failure body (CONTRACT-admin-api.md). */
async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    return typeof body.error === "string" && body.error.trim() ? body.error : null;
  } catch {
    return null;
  }
}

/**
 * Turns an opaque fetch rejection into a reason the admin UI can act on.
 * Node's fetch (undici) throws `TypeError: fetch failed` with the real cause
 * on `err.cause` for network errors, and a TimeoutError/AbortError directly
 * when `AbortSignal.timeout()` fires — both shapes are handled here.
 */
function classifyFetchError(err: unknown, host: string, port: string): { reason: FailureReason; message: string } {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
  const name = e?.name;
  const code = e?.code ?? e?.cause?.code;
  const detail = e?.cause?.message ?? e?.message;

  if (name === "TimeoutError" || name === "AbortError") {
    return { reason: "timeout", message: `Timed out waiting for a response from ${host}:${port}.` };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { reason: "dns", message: `DNS lookup failed for "${host}" — hostname could not be resolved.` };
  }
  if (code === "ECONNREFUSED") {
    return { reason: "connection-refused", message: `Connection refused by ${host}:${port} — nothing is listening there.` };
  }
  if (code && /^(CERT_|ERR_TLS|ERR_SSL|DEPTH_ZERO|UNABLE_TO_VERIFY|SELF_SIGNED|HOSTNAME_MISMATCH)/.test(code)) {
    return { reason: "tls-error", message: `TLS/certificate error connecting to ${host}: ${code}.` };
  }
  return { reason: "unreachable", message: detail || `Could not reach ${host}:${port}.` };
}
