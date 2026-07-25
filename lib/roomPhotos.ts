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

/** Full-size view for the lightbox. */
export function photoFullUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`;
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

/** GET this room's photos. Returns [] on old backend / network failure —
 *  the gallery just shows its add button. */
export async function fetchRoomPhotos(building: string, room: string): Promise<RoomPhoto[]> {
  try {
    const qs = new URLSearchParams({ building, room });
    const res = await fetch(`/api/room-photos?${qs}`, { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean; rows?: RoomPhoto[] };
    if (data?.ok && Array.isArray(data.rows)) return data.rows;
    return [];
  } catch {
    return [];
  }
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
