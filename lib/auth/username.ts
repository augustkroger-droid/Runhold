export const MIN_USERNAME_LENGTH = 4;

export function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9._-]/g, "");
}

export function isValidUsername(username: string): boolean {
  return normalizeUsername(username).length >= MIN_USERNAME_LENGTH;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 10 &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}
