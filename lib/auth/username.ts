const INTERNAL_AUTH_DOMAIN = "users.runhold.app";

export function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9._-]/g, "");
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${INTERNAL_AUTH_DOMAIN}`;
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 10 &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}
