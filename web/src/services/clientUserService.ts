import { httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, functions } from '../firebase';
import type { ClientUser, ClientUserRole } from '../types';

/**
 * Managing a client company's logins. Every privileged step runs in a Cloud Function that
 * requires a cloud admin (any of them); this file only calls them and reports what came back.
 *
 * Passwords are never part of any of it: an account is created without one, and the person sets
 * their own from a link Firebase emails them.
 */

const call = <Req, Res>(name: string) => httpsCallable<Req, Res>(functions, name);

const createUserFn   = call<{ email: string; name: string; clientId: string; role: ClientUserRole }, { uid: string; email: string; resetLink: string }>('createClientUser');
const listUsersFn    = call<{ clientId: string }, { users: ClientUser[] }>('listClientUsers');
const disableUserFn  = call<{ uid: string }, { uid: string; disabled: boolean }>('disableClientUser');
const enableUserFn   = call<{ uid: string }, { uid: string; disabled: boolean }>('enableClientUser');
const resetFn        = call<{ email: string }, { email: string; resetLink: string }>('sendPasswordReset');
const changeRoleFn   = call<{ uid: string; role: ClientUserRole }, { uid: string; role: ClientUserRole }>('changeUserRole');

/** A callable's error as one line an admin can act on. */
export function describeCallFailure(err: unknown): string {
  const { code, message } = (err ?? {}) as { code?: string; message?: string };
  if (code === 'functions/permission-denied') return 'Only a cloud admin can manage client users.';
  if (code === 'functions/unauthenticated') return 'Your session has expired. Sign in again.';
  if (code === 'functions/already-exists') return 'That email already has an account.';
  return message || 'Something went wrong. Try again.';
}

/**
 * Asks Firebase to email a "set your password" link.
 *
 * It is sent from the browser because Firebase's own mailer is the only one this project has,
 * and only the client SDK can trigger it — the Admin SDK can mint the link but not post it. The
 * callables return that link too, so an admin can pass it on when the email does not arrive.
 */
async function emailPasswordLink(email: string): Promise<boolean> {
  try {
    await sendPasswordResetEmail(auth, email);
    return true;
  } catch {
    // Not fatal: the caller still has the link to send by hand.
    return false;
  }
}

export interface InviteResult {
  uid: string;
  resetLink: string;
  /** False when Firebase would not send the email — show the link instead. */
  emailSent: boolean;
}

export async function createClientUser(
  input: { email: string; name: string; clientId: string; role: ClientUserRole }
): Promise<InviteResult> {
  const { data } = await createUserFn({ ...input, email: input.email.trim().toLowerCase(), name: input.name.trim() });
  return { uid: data.uid, resetLink: data.resetLink, emailSent: await emailPasswordLink(data.email) };
}

export async function listClientUsers(clientId: string): Promise<ClientUser[]> {
  const { data } = await listUsersFn({ clientId });
  return data.users ?? [];
}

export async function setClientUserDisabled(uid: string, disabled: boolean): Promise<void> {
  await (disabled ? disableUserFn : enableUserFn)({ uid });
}

export async function changeUserRole(uid: string, role: ClientUserRole): Promise<void> {
  await changeRoleFn({ uid, role });
}

export async function sendPasswordReset(email: string): Promise<InviteResult> {
  const { data } = await resetFn({ email });
  return { uid: '', resetLink: data.resetLink, emailSent: await emailPasswordLink(data.email) };
}
