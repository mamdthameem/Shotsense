import { createHash } from "crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "./lib/admin";
import { ClientDoc, clientRef, isValidClientId, keysMatch } from "./lib/registry";

/**
 * A client's tag file ("site profile"): its PLC tag list and recording rules, which differ per client
 * and must stay private to our office (decided 2026-10-13).
 *
 *   uploadSiteProfile (callable, any cloud admin) — the file chosen in the client dialog. Only the
 *     five sections below are kept; anything else in the file (say, a whole appsettings.json with its
 *     keys) is dropped, never stored. The file itself lives in siteProfiles/{clientId}, which no
 *     browser can read — the dashboard only ever shows a summary (file name, tag count, date).
 *   siteProfile (HTTP, the gateway) — GET ?clientId=<id> with X-License-Key, exactly like licenseCheck.
 *     Served even while the licence is expired or suspended: recording must go on, only the gateway's
 *     dashboard locks.
 *
 * The gateway fetches it at every start and keeps an encrypted copy for starts without internet; the
 * hourly licenseCheck reports siteProfileVersion, so a new upload reaches a running gateway within an
 * hour with no extra calls.
 */

/** Must match SiteProfile.Sections in the gateway (PLCGateway/Hosting/SiteProfile.cs). */
const SECTIONS = ["Tags", "ScanIntervalMs", "CovRules", "DataCollection", "MaintenanceThresholds"] as const;

const PROFILES = "siteProfiles";
const MAX_FILE_CHARS = 900_000; // well under Firestore's 1 MiB document limit

interface SiteProfileDoc {
  json: string;
  version: string;
  tagCount: number;
  fileName: string;
  uploadedAt: FieldValue;
  uploadedBy: string;
}

interface PickedProfile {
  profile: Record<string, unknown>;
  tagCount: number;
  ignored: string[];
}

/** The allowed sections of an uploaded file, checked enough that a gateway can read it. */
function pickProfile(text: string): PickedProfile {
  let root: unknown;
  try {
    root = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new HttpsError("invalid-argument", "That file is not valid JSON.");
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new HttpsError("invalid-argument", "The file must be a JSON object with a \"Tags\" list.");
  }
  const source = root as Record<string, unknown>;

  const profile: Record<string, unknown> = {};
  for (const section of SECTIONS) {
    if (source[section] !== undefined) profile[section] = source[section];
  }
  const ignored = Object.keys(source).filter((k) => !(SECTIONS as readonly string[]).includes(k));

  const tags = profile.Tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new HttpsError("invalid-argument", "The file has no \"Tags\" list, or it is empty.");
  }
  tags.forEach((tag, i) => {
    const t = tag as Record<string, unknown> | null;
    if (!t || typeof t !== "object" || typeof t.Name !== "string" || typeof t.Address !== "string" || typeof t.DataType !== "string") {
      throw new HttpsError("invalid-argument", `Tag ${i + 1} needs a Name, an Address and a DataType.`);
    }
  });

  return { profile, tagCount: tags.length, ignored };
}

/** Saves a client's tag file. Returns the summary the dialog shows, plus any sections it dropped. */
export const uploadSiteProfile = onCall(
  { region: "asia-south1", maxInstances: 2, memory: "256MiB" },
  async (request) => {
    const uid = await assertAdmin(request);
    const { clientId, fileName, content } = (request.data ?? {}) as { clientId?: unknown; fileName?: unknown; content?: unknown };

    if (!isValidClientId(clientId)) throw new HttpsError("invalid-argument", "A valid clientId is required.");
    if (typeof content !== "string" || !content.trim()) throw new HttpsError("invalid-argument", "The file is empty.");
    if (content.length > MAX_FILE_CHARS) throw new HttpsError("invalid-argument", "The file is too large (over 900 KB).");

    const ref = clientRef(clientId);
    if (!(await ref.get()).exists) throw new HttpsError("not-found", "Unknown client.");

    const { profile, tagCount, ignored } = pickProfile(content);
    const json = JSON.stringify(profile);
    const version = createHash("sha256").update(json).digest("hex").slice(0, 16);
    const name = typeof fileName === "string" && fileName.trim() ? fileName.trim().slice(0, 200) : "site-profile.json";

    const doc: SiteProfileDoc = {
      json, version, tagCount, fileName: name, uploadedAt: FieldValue.serverTimestamp(), uploadedBy: uid,
    };
    const batch = getFirestore().batch();
    batch.set(getFirestore().collection(PROFILES).doc(clientId), doc);
    batch.update(ref, {
      siteProfileVersion: version,
      siteProfileTagCount: tagCount,
      siteProfileFileName: name,
      siteProfileUploadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    logger.info("site profile uploaded", { clientId, version, tagCount, ignored });
    return { version, tagCount, fileName: name, ignored };
  }
);

/** The gateway's download: { version, profile }. 404 until a file is uploaded; 403 on a wrong key. */
export const siteProfile = onRequest(
  { region: "asia-south1", maxInstances: 2, timeoutSeconds: 15, memory: "256MiB" },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "method not allowed" });
      return;
    }

    const clientId = req.query.clientId;
    const providedKey = req.get("X-License-Key") ?? "";
    if (!isValidClientId(clientId) || !providedKey) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const snap = await clientRef(clientId).get();
    if (!snap.exists || !keysMatch(providedKey, (snap.data() as ClientDoc).licenseKey ?? "")) {
      logger.warn("site profile denied", { clientId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const profileSnap = await getFirestore().collection(PROFILES).doc(clientId).get();
    if (!profileSnap.exists) {
      res.status(404).json({ error: "no tag file uploaded for this client" });
      return;
    }
    const doc = profileSnap.data() as SiteProfileDoc;
    res.set("Cache-Control", "no-store");
    res.status(200).json({ version: doc.version, profile: JSON.parse(doc.json) });
  }
);
