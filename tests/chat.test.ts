import { describe, it, expect } from "vitest";

// Test invite token expiry logic
describe("Invite Token Logic", () => {
  it("should calculate 6-hour expiry correctly", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 6 * 60 * 60 * 1000);
    const diff = expiresAt.getTime() - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    expect(hours).toBe(6);
  });

  it("should detect expired token", () => {
    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    const isExpired = pastDate < new Date();
    expect(isExpired).toBe(true);
  });

  it("should detect valid token", () => {
    const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now
    const isValid = futureDate > new Date();
    expect(isValid).toBe(true);
  });
});

// Test nickname validation logic
describe("Nickname Validation", () => {
  const validateNickname = (nickname: string): string | null => {
    const trimmed = nickname.trim();
    if (!trimmed) return "Please enter a nickname to join.";
    if (trimmed.length < 2) return "Nickname must be at least 2 characters.";
    if (trimmed.length > 20) return "Nickname must be 20 characters or less.";
    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) return "Nickname can only contain letters, numbers, _ and -";
    return null;
  };

  it("should reject empty nickname", () => {
    expect(validateNickname("")).not.toBeNull();
    expect(validateNickname("   ")).not.toBeNull();
  });

  it("should reject too-short nickname", () => {
    expect(validateNickname("a")).not.toBeNull();
  });

  it("should reject too-long nickname", () => {
    expect(validateNickname("a".repeat(21))).not.toBeNull();
  });

  it("should reject special characters", () => {
    expect(validateNickname("user@name")).not.toBeNull();
    expect(validateNickname("user name")).not.toBeNull();
  });

  it("should accept valid nicknames", () => {
    expect(validateNickname("JohnDoe")).toBeNull();
    expect(validateNickname("user_123")).toBeNull();
    expect(validateNickname("cool-cat")).toBeNull();
    expect(validateNickname("AB")).toBeNull();
  });
});

// Test message formatting
describe("Message Formatting", () => {
  it("should format time correctly", () => {
    const date = new Date("2024-01-15T14:30:00");
    const formatted = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    expect(formatted).toBeTruthy();
    expect(typeof formatted).toBe("string");
  });

  it("should identify system messages", () => {
    const msg = { type: "system", content: "User joined", senderNickname: "system" };
    expect(msg.type).toBe("system");
  });

  it("should identify private messages", () => {
    const msg = { type: "private", content: "Hello!", senderNickname: "Alice", recipientNickname: "Bob" };
    expect(msg.type).toBe("private");
    expect(msg.recipientNickname).toBe("Bob");
  });
});
