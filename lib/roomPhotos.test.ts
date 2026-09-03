import { describe, expect, it } from "vitest";
import {
  MAX_EDGE,
  getCachedPetPhotos,
  getCachedRoomPhotos,
  setCachedPetPhotos,
  setCachedRoomPhotos,
  extractImageFiles,
  fitScale,
  photoFullUrl,
  photoFullUrlFallback,
  photoDriveViewUrl,
  photoThumbUrl,
  stripDataUrlPrefix,
} from "./roomPhotos";

describe("fitScale", () => {
  it("never upscales a small image", () => {
    expect(fitScale(800, 600)).toBe(1);
    expect(fitScale(1600, 1200)).toBe(1);
  });

  it("scales the LONGEST edge down to MAX_EDGE", () => {
    expect(fitScale(3200, 2400)).toBe(0.5);
    expect(fitScale(2400, 3200)).toBe(0.5); // portrait too
    expect(4000 * fitScale(4000, 3000)).toBe(MAX_EDGE);
  });

  it("tolerates degenerate dimensions", () => {
    expect(fitScale(0, 0)).toBe(1);
    expect(fitScale(-5, 10)).toBeGreaterThan(0);
  });
});

describe("stripDataUrlPrefix", () => {
  it("removes the data: prefix", () => {
    expect(stripDataUrlPrefix("data:image/jpeg;base64,AAAA")).toBe("AAAA");
  });
  it("passes through bare base64 unchanged", () => {
    expect(stripDataUrlPrefix("AAAA")).toBe("AAAA");
  });
});

describe("photo URLs", () => {
  it("builds the Drive thumbnail URL", () => {
    expect(photoThumbUrl("abc123")).toBe(
      "https://drive.google.com/thumbnail?id=abc123&sz=w400"
    );
    expect(photoThumbUrl("abc123", 800)).toContain("sz=w800");
  });
  it("full-view uses the SAME host as thumbnails at w1600 (bug r25)", () => {
    // lightbox เดิมใช้ lh3 คนละโฮสต์กับรูปเล็ก — บางเครือข่ายโหลดไม่ขึ้น
    // ทั้งที่รูปเล็กปกติ. w1600 = คุณภาพเต็มเพราะอัปโหลดบีบที่ MAX_EDGE 1600.
    expect(photoFullUrl("a/b")).toBe("https://drive.google.com/thumbnail?id=a%2Fb&sz=w1600");
    expect(photoFullUrlFallback("a/b")).toBe("https://lh3.googleusercontent.com/d/a%2Fb");
    expect(photoDriveViewUrl("a/b")).toBe("https://drive.google.com/file/d/a%2Fb/view");
  });
});

describe("extractImageFiles", () => {
  const img = new File(["x"], "a.jpg", { type: "image/jpeg" });
  const txt = new File(["x"], "a.txt", { type: "text/plain" });

  function fakeDt(opts: { items?: File[]; files?: File[] }): DataTransfer {
    const items = (opts.items || []).map((f) => ({
      kind: "file",
      type: f.type,
      getAsFile: () => f,
    }));
    return {
      items: Object.assign(items, { length: items.length }),
      files: Object.assign(opts.files || [], { length: (opts.files || []).length }),
    } as unknown as DataTransfer;
  }

  it("returns [] for null (no clipboardData)", () => {
    expect(extractImageFiles(null)).toEqual([]);
    expect(extractImageFiles(undefined)).toEqual([]);
  });

  it("takes image files from items (paste path) and skips non-images", () => {
    expect(extractImageFiles(fakeDt({ items: [img, txt] }))).toEqual([img]);
  });

  it("falls back to files when items yield nothing (drop path)", () => {
    expect(extractImageFiles(fakeDt({ items: [txt], files: [img] }))).toEqual([img]);
    expect(extractImageFiles(fakeDt({ files: [img, txt] }))).toEqual([img]);
  });
});

describe("session photo cache (perf r13)", () => {
  it("round-trips per room and expires after the TTL", () => {
    const rows = [{ id: "p1", building: "มีทอง", room: "204", fileId: "f1", note: "", creator: "", createdAt: "" }];
    setCachedRoomPhotos("มีทอง", "204", rows);
    expect(getCachedRoomPhotos("มีทอง", "204")).toBe(rows);
    expect(getCachedRoomPhotos("มีทอง", "205")).toBeNull(); // per-room isolation

    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60_000; // past the 5-min TTL
    try {
      expect(getCachedRoomPhotos("มีทอง", "204")).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("pets cache is independent of room caches", () => {
    const pets = [{ id: "c1", building: "มีทอง", room: "204", fileId: "f9", note: "ส้มจุด", creator: "", createdAt: "", category: "สัตว์เลี้ยง" }];
    setCachedPetPhotos(pets);
    expect(getCachedPetPhotos()).toBe(pets);
    expect(getCachedRoomPhotos("::pets::", "")).toBeNull();
  });
});
