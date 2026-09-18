import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

// Public web-app identifiers (not secrets), all real — no demo-* placeholders.
// A missing web/.env must fail loudly, not silently target the wrong
// project or initialize with a dead key.
function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `${key} is not set. Copy web/.env.example to web/.env and fill in the Firebase project config.`
    );
  }
  return value;
}

const projectId = requireEnv('VITE_FIREBASE_PROJECT_ID');

const app = initializeApp({
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
});

export const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1';

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

/** The License:CheckUrl value a client installation must be configured with. */
export function licenseCheckUrl(clientId: string): string {
  if (usingEmulators) {
    return `http://127.0.0.1:5001/${projectId}/${FUNCTIONS_REGION}/licenseCheck?clientId=${clientId}`;
  }
  return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/licenseCheck?clientId=${clientId}`;
}
