import { createHash, timingSafeEqual } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { appendEvent, ClientDoc, clientRef, deriveLicenseStatus } from "./lib/registry";

/**
 * License validation endpoint called by each client installation:
 *   GET /licenseCheck?clientId=<id>   with header  X-License-Key: <key>
 *
 * The caller treats any 2xx as "licensed" and applies its own grace logic
 * around failures, so the HTTP status code is the contract:
 *   200 → active or within the server-side grace window
 *   402 → expired or suspended
 *   403 → unknown client or wrong key (no detail leaked)
 * The JSON body is informational.
 */
export const licenseCheck = onRequest(
  { region: "asia-south1", maxInstances: 2, timeoutSeconds: 15, memory: "256MiB" },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "method not allowed" });
      return;
    }

    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
    const providedKey = req.get("X-License-Key") ?? "";
    if (!clientId || !providedKey) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const ref = clientRef(clientId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const client = snap.data() as ClientDoc;

    if (!keysMatch(providedKey, client.licenseKey ?? "")) {
      logger.warn("license check denied", { clientId });
      await ref
        .update({
          recentEvents: appendEvent(client.recentEvents, {
            at: new Date().toISOString(),
            type: "license-denied",
            detail: "license key mismatch",
          }),
        })
        .catch((err) => logger.warn("event write failed", { clientId, err }));
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const now = new Date();
    const status = deriveLicenseStatus(client, now);
    const body = {
      status,
      expiresAt: client.licenseExpiresAt?.toDate().toISOString() ?? null,
      graceDays: client.graceDays ?? 0,
      serverTime: now.toISOString(),
    };

    if (status === "active" || status === "grace") {
      // Record the check-in; skip a duplicate license-ok event so the capped
      // log keeps room for the interesting entries.
      const lastEvent = client.recentEvents?.[client.recentEvents.length - 1];
      const events =
        lastEvent?.type === "license-ok"
          ? client.recentEvents
          : appendEvent(client.recentEvents, { at: now.toISOString(), type: "license-ok" });
      await ref
        .update({ lastLicenseCheckAt: Timestamp.fromDate(now), recentEvents: events })
        .catch((err) => logger.warn("check-in write failed", { clientId, err }));
      res.status(200).json(body);
      return;
    }

    res.status(402).json(body);
  }
);

/** Constant-time key comparison (hashes normalize length first). */
function keysMatch(provided: string, stored: string): boolean {
  if (!stored) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(stored).digest();
  return timingSafeEqual(a, b);
}
