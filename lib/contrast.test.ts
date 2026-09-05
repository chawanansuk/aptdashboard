import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, parseHex, readTokens } from "./contrast";

describe("contrast math", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(parseHex("#abc")).toEqual([170, 187, 204]);
    expect(parseHex("not-a-color")).toBeNull();
  });
});

/**
 * Contrast fixture (Prom Design → CI): ทุกคู่ "ข้อความ × พื้น" ของ token
 * ในทั้งสองธีมต้อง ≥ 4.5:1 (WCAG AA ข้อความปกติ). ถ้าใครแก้ token แล้ว
 * ตกเกณฑ์ เทสนี้ fail ก่อน merge — บั๊ก r20 (faint 2.9:1) จะไม่กลับมาเงียบๆ.
 */
describe("design tokens pass WCAG AA on every surface", () => {
  const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
  const TEXT = ["--color-text", "--color-text-muted", "--color-text-faint"];
  const SURFACES = ["--color-surface", "--color-surface-2", "--color-surface-3"];

  for (const [theme, selector] of [["light", ":root"], ["dark", "html.dark"]] as const) {
    it(`${theme} theme`, () => {
      const tokens = readTokens(css, selector);
      for (const t of TEXT) expect(tokens.get(t), `${t} missing in ${selector}`).toBeTruthy();
      for (const s of SURFACES) expect(tokens.get(s), `${s} missing in ${selector}`).toBeTruthy();
      const failures: string[] = [];
      for (const t of TEXT) {
        for (const s of SURFACES) {
          const ratio = contrastRatio(tokens.get(t)!, tokens.get(s)!);
          if (ratio < 4.5) failures.push(`${t} on ${s} = ${ratio}:1`);
        }
      }
      expect(failures, `contrast below 4.5:1 (${theme}):\n${failures.join("\n")}`).toEqual([]);
    });
  }

  it("accent (link/button text colour) is readable on the surface", () => {
    for (const selector of [":root", "html.dark"]) {
      const tokens = readTokens(css, selector);
      const ratio = contrastRatio(tokens.get("--color-accent")!, tokens.get("--color-surface")!);
      expect(ratio, `${selector} accent on surface = ${ratio}`).toBeGreaterThanOrEqual(3); // large/bold UI text
    }
  });
});
