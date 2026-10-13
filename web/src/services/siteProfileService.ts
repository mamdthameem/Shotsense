import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface SiteProfileUploadResult {
  version: string;
  tagCount: number;
  fileName: string;
  /** Top-level sections in the file that are not part of a tag file, and were not stored. */
  ignored: string[];
}

const uploadFn = httpsCallable<{ clientId: string; fileName: string; content: string }, SiteProfileUploadResult>(
  functions, 'uploadSiteProfile');

/**
 * Sends a client's tag file to the cloud. The function keeps only the tag sections and stores them
 * where no browser can read them; the client's gateway fetches them with its licence key.
 */
export async function uploadSiteProfile(clientId: string, file: File): Promise<SiteProfileUploadResult> {
  const content = await file.text();
  return (await uploadFn({ clientId, fileName: file.name, content })).data;
}
