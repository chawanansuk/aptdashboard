import { describe, expect, it } from "vitest";
import { shouldPromptUpdate } from "./version";

describe("shouldPromptUpdate", () => {
  it("prompts when the live build differs from the loaded one", () => {
    expect(shouldPromptUpdate("abc123", "def456")).toBe(true);
  });
  it("does not prompt when builds match", () => {
    expect(shouldPromptUpdate("abc123", "abc123")).toBe(false);
  });
  it("never prompts in local/dev on either side", () => {
    expect(shouldPromptUpdate("dev", "abc123")).toBe(false);
    expect(shouldPromptUpdate("abc123", "dev")).toBe(false);
    expect(shouldPromptUpdate("dev", "dev")).toBe(false);
  });
  it("does not prompt on missing/empty values", () => {
    expect(shouldPromptUpdate(undefined, "abc123")).toBe(false);
    expect(shouldPromptUpdate("abc123", undefined)).toBe(false);
    expect(shouldPromptUpdate("", "abc123")).toBe(false);
    expect(shouldPromptUpdate("abc123", "")).toBe(false);
  });
});
