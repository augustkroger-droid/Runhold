import { describe, expect, it } from "vitest";
import {
  MIN_USERNAME_LENGTH,
  isValidEmail,
  isValidUsername,
  normalizeUsername,
} from "@/lib/auth/username";

describe("auth username helpers", () => {
  it("normalizes usernames for Supabase profile lookup", () => {
    expect(normalizeUsername("  Åsa.Runner!  ")).toBe("asa.runner");
  });

  it("requires usernames to be at least four normalized characters", () => {
    expect(MIN_USERNAME_LENGTH).toBe(4);
    expect(isValidUsername("abc")).toBe(false);
    expect(isValidUsername("abcd")).toBe(true);
  });

  it("validates basic email addresses", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("person.example.com")).toBe(false);
  });
});
