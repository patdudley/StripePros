import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../lib/password";

describe("password security", () => {
  it("stores a salted PBKDF2 hash and verifies without retaining plaintext", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(encoded).toMatch(/^pbkdf2_sha256\$210000\$/);
    expect(encoded).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", encoded)).toBe(true);
    expect(await verifyPassword("wrong password", encoded)).toBe(false);
  });

  it("uses a unique salt for the same password", async () => {
    const first = await hashPassword("a sufficiently long password");
    const second = await hashPassword("a sufficiently long password");
    expect(first).not.toBe(second);
  });
});
