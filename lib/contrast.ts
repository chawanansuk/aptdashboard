/**
 * WCAG 2.x contrast math (r30, จาก Prom Design "contrast fixture in CI").
 * ใช้ในเทสที่อ่าน token สีจาก globals.css แล้วยืนยันว่าทุกคู่ ข้อความ×พื้น
 * ผ่าน 4.5:1 — กันบั๊กแบบ r20 (ตัวอักษรจาง 2.9:1) กลับมาแบบเงียบๆ.
 */

export function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** อัตราส่วนคอนทราสต์ 1..21 (สลับลำดับได้ ไม่ต่างกัน) */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return 0;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/**
 * ดึงค่า token จาก block CSS (`:root { ... }` หรือ `html.dark { ... }`) —
 * คืน Map ชื่อ → ค่า (เฉพาะที่เป็น hex ล้วน; ค่าที่อ้าง var() อื่นข้าม)
 */
export function readTokens(css: string, selector: string): Map<string, string> {
  const out = new Map<string, string>();
  // selector เดียวกันอาจถูกประกาศหลาย block (เช่น html.dark { shadows } แล้ว
  // html.dark { surfaces }) — รวมทุก block; ค่าหลังทับค่าก่อนเหมือน CSS
  const needle = `\n${selector} {`;
  let from = 0;
  for (;;) {
    const start = css.indexOf(needle, from);
    if (start < 0) break;
    const end = css.indexOf("\n}", start);
    const body = css.slice(start, end < 0 ? undefined : end);
    const re = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) out.set(m[1], m[2]);
    if (end < 0) break;
    from = end + 2;
  }
  return out;
}
