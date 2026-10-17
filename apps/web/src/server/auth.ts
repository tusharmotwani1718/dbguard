import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Minimal demo login: one shared username/password from env, and a stateless
// session cookie of the form "<expiresAtMs>.<hmac>" signed with AUTH_SECRET.

export const SESSION_COOKIE = "dbguard_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// Hash both sides first so the comparison doesn't leak the length of the secret.
function safeEqual(a: string, b: string) {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}

function sign(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function checkCredentials(username: string, password: string) {
  const expectedUser = process.env.DEMO_USERNAME ?? "";
  const expectedPassword = process.env.DEMO_PASSWORD ?? "";
  if (!expectedUser || !expectedPassword) return false;
  // Evaluate both so timing doesn't reveal which one was wrong.
  const userOk = safeEqual(username, expectedUser);
  const passwordOk = safeEqual(password, expectedPassword);
  return userOk && passwordOk;
}

export function createSessionToken() {
  const expiresAt = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function isValidSession(token: string | undefined) {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;
  return safeEqual(signature, sign(expiresAt)) && Number(expiresAt) > Date.now();
}
