import type { RoomPhoto } from "@/types";

/**
 * รูปตำหนิ (defect photos) — client helpers.
 *
 * Photos are stored in Google Drive by Apps Script (v3.25); the app only
 * ever handles a Drive fileId. Rendering uses Google's public thumbnail
 * endpoints (files are shared anyone-with-link/VIEW server-side), so no
 * bytes flow through Vercel.
 *
 * Compression happens HERE, before upload: phones produce 3-8MB camera
 * originals, which would blow both the Apps Script payload ceiling and
 * the owner's free Drive quota. A ~1600px JPEG (~200-400KB) is plenty to
 * document a scratch or stain.
 */

/** Longest edge after resize — enough detail for defect evidence. */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.8;

/** Grid thumbnail (w=400 ≈ 2x for a ~180px cell). */
export function photoThumbUrl(fileId: string, width = 400): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

/**
 * Full-size view for the lightbox (bug r25: "เปิดดูรูปไม่ได้").
 *
 * ใช้ endpoint เดียวกับ thumbnail (drive.google.com/thumbnail) ที่ w1600 —
 * รูปถูกบีบไว้ที่ขอบยาว 1600px ตอนอัปโหลดอยู่แล้ว (MAX_EDGE) ดังนั้น
 * w1600 = คุณภาพเต็ม. เดิมใช้ lh3.googleusercontent.com/d/ ซึ่งเป็นคนละ
 * โฮสต์กับรูปเล็ก — บางบัญชี/บางเครือข่ายโดนบล็อกเงียบๆ ทำให้ lightbox
 * เปิดมาเป็นจอดำว่างเปล่า ("กดแล้วไม่มีอะไรเกิดขึ้น") ทั้งที่รูปเล็กโหลดปกติ.
 */
export function photoFullUrl(fileId: string): string {
  return photoThumbUrl(fileId, 1600);
}

/** สำรองเมื่อ photoFullUrl พัง (img.onError สลับมาใช้ตัวนี้ก่อนยอมแพ้). */
export function photoFullUrlFallback(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`;
}

/** เปิดไฟล์ตรงใน Google Drive — ทางหนีสุดท้ายเมื่อรูปในแอปโหลดไม่ขึ้น. */
export function photoDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/** Scale factor that fits (w,h) inside maxEdge without upscaling. */
export function fitScale(w: number, h: number, maxEdge = MAX_EDGE): number {
  const longest = Math.max(w, h);
  if (longest <= 0) return 1;
  return Math.min(1, maxEdge / longest);
}

/** "data:image/jpeg;base64,AAAA" → "AAAA" (Apps Script wants bare base64). */
export function stripDataUrlPrefix(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/**
 * Pull image files out of a drop / paste payload. Covers all three
 * computer-only input paths the sales team uses (ทิศ B): file picker
 * gives a FileList, drag-drop and Ctrl+V (e.g. copy from LINE PC) give
 * a DataTransfer.
 */
export function extractImageFiles(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  // items first — paste events often have files ONLY here.
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const it = dt.items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
    if (out.length > 0) return out;
  }
  for (let i = 0; i < (dt.files?.length || 0); i++) {
    const f = dt.files[i];
    if (f.type.startsWith("image/")) out.push(f);
  }
  return out;
}

export interface CompressedImage {
  dataBase64: string;
  mimeType: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    r.readAsDataURL(blob);
  });
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ไฟล์นี้ไม่ใช่รูปภาพ หรือรูปเสียหาย"));
    };
    img.src = url;
  });
}

/**
 * Resize + re-encode an image file to upload size. Always outputs JPEG
 * (evidence photos don't need transparency; JPEG is 5-10x smaller).
 * Throws on non-image/corrupt input — caller shows the message.
 */
export async function compressImageFile(file: Blob): Promise<CompressedImage> {
  const img = await loadImage(file);
  const scale = fitScale(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Ancient browser — send the original if it's already small enough.
    if (file.size <= 1_500_000) {
      const dataUrl = await blobToDataUrl(file);
      return { dataBase64: stripDataUrlPrefix(dataUrl), mimeType: file.type || "image/jpeg" };
    }
    throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");
  }
  // White backing so transparent PNG regions don't turn black in JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { dataBase64: stripDataUrlPrefix(dataUrl), mimeType: "image/jpeg" };
}

/** หมวด value the backend stores for pet photos (col หมวด). */
export const PHOTO_CATEGORY_PET = "สัตว์เลี้ยง";

export function isPetPhoto(p: { category?: string }): boolean {
  return (p.category || "") === PHOTO_CATEGORY_PET;
}

/* ===== Session photo cache (perf r13) =====
 * Every RoomModal open used to refetch photos from Apps Script
 * (600ms-2s on a cold start) even for a room viewed seconds earlier.
 * Stale-while-revalidate: the gallery paints instantly from this cache
 * and the fresh fetch replaces it when it lands. Write-through from the
 * components keeps mutations (upload/note/delete) in sync. Module-level
 * → per-tab, gone on reload, no invalidation protocol needed. */
const PHOTO_CACHE_TTL_MS = 5 * 60_000;
const photoCache = new Map<string, { rows: RoomPhoto[]; at: number }>();
const PETS_CACHE_KEY = "::pets::";

function cacheKey(building: string, room: string): string {
  return `${building}|${room}`;
}

export function getCachedRoomPhotos(building: string, room: string): RoomPhoto[] | null {
  const hit = photoCache.get(cacheKey(building, room));
  if (!hit || Date.now() - hit.at > PHOTO_CACHE_TTL_MS) return null;
  return hit.rows;
}

export function setCachedRoomPhotos(building: string, room: string, rows: RoomPhoto[]): void {
  photoCache.set(cacheKey(building, room), { rows, at: Date.now() });
}

export function getCachedPetPhotos(): RoomPhoto[] | null {
  const hit = photoCache.get(PETS_CACHE_KEY);
  if (!hit || Date.now() - hit.at > PHOTO_CACHE_TTL_MS) return null;
  return hit.rows;
}

export function setCachedPetPhotos(rows: RoomPhoto[]): void {
  photoCache.set(PETS_CACHE_KEY, { rows, at: Date.now() });
}

/** GET this room's photos. Throws with a Thai message on failure (audit
 *  r27 HIGH): เดิมคืน [] เงียบๆ → แกลเลอรีเขียนทับแคช 5 นาทีด้วยค่าว่าง
 *  แถมแบนเนอร์ "มีรูปตำหนิ N รูป — เปิดเทียบก่อนคืนมัดจำ" หายไปเฉยๆ
 *  ผู้ตรวจห้องอาจคืนมัดจำโดยคิดว่าไม่มีรูป. */
export async function fetchRoomPhotos(building: string, room: string): Promise<RoomPhoto[]> {
  const qs = new URLSearchParams({ building, room });
  const res = await fetch(`/api/room-photos?${qs}`, { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; rows?: RoomPhoto[] }
    | null;
  if (!res.ok || !data?.ok || !Array.isArray(data.rows)) {
    throw new Error(data?.error || `โหลดรูปไม่สำเร็จ (HTTP ${res.status})`);
  }
  return data.rows;
}

/** GET every pet photo across the property (หน้ารวมสัตว์เลี้ยง).
 *  Throws with a Thai message (incl. old-backend hint) — the view shows
 *  the error instead of a silent empty grid. */
export async function fetchPetPhotos(): Promise<RoomPhoto[]> {
  const res = await fetch("/api/room-photos?scope=pets", { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; rows?: RoomPhoto[] }
    | null;
  if (!res.ok || !data?.ok || !Array.isArray(data.rows)) {
    throw new Error(data?.error || `โหลดรูปสัตว์เลี้ยงไม่สำเร็จ (HTTP ${res.status})`);
  }
  return data.rows;
}

/**
 * Fill-once description on an existing photo (v3.25.1). The backend
 * rejects changing a non-empty note (evidence stays tamper-resistant);
 * replaying the same text is accepted, so this is safe to retry by hand.
 * Throws with a Thai message on failure (incl. old-backend hint).
 */
export async function setPhotoNote(id: string, note: string): Promise<void> {
  const res = await fetch("/api/room-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setNote", id, note }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `บันทึกคำอธิบายไม่สำเร็จ (HTTP ${res.status})`);
  }
}

/**
 * Delete a photo (v3.25.3) — MANAGEMENT ONLY (route enforces; the UI
 * hides the button for other roles). Removes the ledger row and trashes
 * the Drive file (30-day undo). Idempotent upstream, safe to retry.
 * Throws with a Thai message on failure (incl. old-backend hint).
 */
export async function deleteRoomPhoto(id: string): Promise<void> {
  const res = await fetch("/api/room-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", id }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `ลบรูปไม่สำเร็จ (HTTP ${res.status})`);
  }
}

/**
 * Upload ONE photo. NOT idempotent (each call creates a Drive file +
 * ledger row) — deliberately no auto-retry here; the UI offers a manual
 * "ลองอีกครั้ง" instead. Throws with a Thai message on failure.
 */
export async function uploadRoomPhoto(params: {
  building: string;
  room: string;
  dataBase64: string;
  mimeType: string;
  note?: string;
  /** "pet" files the photo under สัตว์เลี้ยง (v3.25.4); omit = defect. */
  category?: "pet";
}): Promise<{ id: string; fileId: string; createdAt?: string }> {
  const res = await fetch("/api/room-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; id?: string; fileId?: string; createdAt?: string }
    | null;
  if (!res.ok || !data?.ok || !data.fileId) {
    throw new Error(data?.error || `อัปโหลดไม่สำเร็จ (HTTP ${res.status})`);
  }
  return { id: data.id || "", fileId: data.fileId, createdAt: data.createdAt };
}
