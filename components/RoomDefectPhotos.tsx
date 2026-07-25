"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomPhoto } from "@/types";
import { toast } from "@/lib/toast";
import {
  compressImageFile,
  extractImageFiles,
  fetchRoomPhotos,
  photoFullUrl,
  photoThumbUrl,
  setPhotoNote,
  uploadRoomPhoto,
} from "@/lib/roomPhotos";

/**
 * รูปตำหนิสภาพห้อง (v3.25) — capture + gallery for the RoomModal.
 *
 * Why it exists: meters + the signed defect sheet already live on paper;
 * the ONLY missing evidence is photos of the defects themselves. This
 * section lets staff attach them to the room in one place.
 *
 * Input paths (sales work on computers — ทิศ B):
 *   1. 📷 mobile — file picker opens the camera/gallery chooser
 *   2. 🖥 file picker — same button on desktop
 *   3. drag & drop onto the section
 *   4. Ctrl+V paste (e.g. copy a photo from LINE PC, paste here)
 *
 * Every image is compressed client-side (~1600px JPEG) before upload.
 * Uploads are NOT idempotent → no blind auto-retry; failures stay in
 * the strip with a manual "ลองอีกครั้ง".
 *
 * The ledger is append-only by design (evidence for deposit disputes) —
 * that's why there is no delete button.
 */

interface QueueItem {
  key: string;
  /** object URL for the local preview thumbnail */
  previewUrl: string;
  dataBase64: string;
  mimeType: string;
  note: string;
  status: "queued" | "uploading" | "error";
  error?: string;
}

interface Props {
  building: string;
  room: string;
  /** True during the move-out/turnover pipeline — Phase 2: emphasize
   *  "เทียบรูปแรกเข้าก่อนคืนมัดจำ" so the inspector actually compares. */
  turnover?: boolean;
}

let keySeq = 0;

export default function RoomDefectPhotos({ building, room, turnover }: Props) {
  const [photos, setPhotos] = useState<RoomPhoto[] | null>(null);
  // The upload queue's source of truth is a REF, mirrored into state for
  // rendering. The pump is a sync loop over async uploads — reading React
  // state from it races the commit schedule (the first cut did exactly
  // that and items sat in "รอคิว" forever); a ref is always current.
  const itemsRef = useRef<QueueItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<RoomPhoto | null>(null);
  // Add-description-later editor (v3.25.1): the natural flow is snap
  // first, describe second — without this, text typed after upload had
  // nowhere to go and looked like "ลงบันทึกไม่ได้".
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pumpBusy = useRef(false);

  const sync = useCallback(() => setQueue([...itemsRef.current]), []);

  // Lazy fetch on mount (the section only mounts inside an open modal).
  useEffect(() => {
    let cancelled = false;
    setPhotos(null);
    itemsRef.current.forEach((q) => URL.revokeObjectURL(q.previewUrl));
    itemsRef.current = [];
    setQueue([]);
    fetchRoomPhotos(building, room).then((rows) => {
      if (!cancelled) setPhotos(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [building, room]);

  /** Sequential upload worker — one file at a time so a slow Apps Script
   *  cold start doesn't stack 5 concurrent 45s requests. */
  const pump = useCallback(async () => {
    if (pumpBusy.current) return;
    pumpBusy.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((q) => q.status === "queued");
        if (!next) break;
        next.status = "uploading";
        sync();
        try {
          const r = await uploadRoomPhoto({
            building,
            room,
            dataBase64: next.dataBase64,
            mimeType: next.mimeType,
            note: next.note,
          });
          URL.revokeObjectURL(next.previewUrl);
          itemsRef.current = itemsRef.current.filter((q) => q.key !== next.key);
          sync();
          setPhotos((rows) => [
            {
              id: r.id,
              building,
              room,
              fileId: r.fileId,
              note: next.note,
              creator: "",
              createdAt: r.createdAt || "",
            },
            ...(rows || []),
          ]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ";
          next.status = "error";
          next.error = msg;
          sync();
          toast.error(`รูปตำหนิ: ${msg}`);
        }
      }
    } finally {
      pumpBusy.current = false;
    }
  }, [building, room, sync]);

  // Photos upload without a description — staff add one afterwards via
  // "+ คำอธิบาย" under the thumbnail. There used to be a type-note-first
  // box next to the add button, but "พิมพ์แล้วไม่เกิดอะไร" — two
  // competing note flows confused more than they helped (owner feedback).
  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      let added = 0;
      for (const f of files) {
        try {
          const c = await compressImageFile(f);
          itemsRef.current.push({
            key: `q${++keySeq}`,
            previewUrl: URL.createObjectURL(f),
            dataBase64: c.dataBase64,
            mimeType: c.mimeType,
            note: "",
            status: "queued",
          });
          added++;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "อ่านรูปไม่สำเร็จ");
        }
      }
      if (added > 0) {
        sync();
        void pump();
      }
    },
    [pump, sync]
  );

  // Escape closes the LIGHTBOX only — capture phase so it wins over the
  // room modal's own Escape handler (otherwise one press closed both).
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setLightbox(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightbox]);

  // Ctrl+V paste anywhere while the section is mounted (LINE PC flow).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = extractImageFiles(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const retry = (key: string) => {
    const item = itemsRef.current.find((q) => q.key === key);
    if (!item) return;
    item.status = "queued";
    item.error = undefined;
    sync();
    void pump();
  };

  const discard = (key: string) => {
    const item = itemsRef.current.find((q) => q.key === key);
    if (item) URL.revokeObjectURL(item.previewUrl);
    itemsRef.current = itemsRef.current.filter((q) => q.key !== key);
    sync();
  };

  const saveNote = async (photo: RoomPhoto) => {
    const text = editText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    try {
      await setPhotoNote(photo.id, text);
      setPhotos((rows) =>
        (rows || []).map((p) => (p.id === photo.id ? { ...p, note: text } : p))
      );
      setEditingId(null);
      setEditText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกคำอธิบายไม่สำเร็จ");
    } finally {
      setSavingNote(false);
    }
  };

  const count = photos?.length ?? 0;

  return (
    <section
      className={`ac-form-section ac-defect-photos ${dragOver ? "is-dragover" : ""}`}
      aria-label="รูปตำหนิสภาพห้อง"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void addFiles(extractImageFiles(e.dataTransfer));
      }}
    >
      <div className="ac-form-section-label">
        📷 รูปตำหนิสภาพห้อง
        {count > 0 && <span className="ac-form-section-optional">({count} รูป)</span>}
      </div>

      {/* Phase 2 — during turnover, an inspector opening this room should
          COMPARE against the move-in photos before returning the deposit. */}
      {turnover && count > 0 && (
        <div className="ac-banner ac-banner-info ac-defect-compare-banner">
          มีรูปตำหนิบันทึกไว้ <strong>{count} รูป</strong> — เปิดเทียบสภาพห้องก่อนคืนมัดจำ
        </div>
      )}

      {(count > 0 || queue.length > 0) && (
        <div className="ac-room-gallery-strip ac-defect-strip">
          {queue.map((q) => (
            <div
              key={q.key}
              className={`ac-defect-thumb ac-defect-pending ${q.status === "error" ? "is-error" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.previewUrl} alt="รออัปโหลด" />
              {q.status !== "error" ? (
                <span className="ac-defect-thumb-state" aria-live="polite">
                  {q.status === "uploading" ? "กำลังอัปโหลด…" : "รอคิว…"}
                </span>
              ) : (
                <span className="ac-defect-thumb-actions">
                  <button type="button" className="ac-btn ac-btn-secondary" onClick={() => retry(q.key)}>
                    ลองอีกครั้ง
                  </button>
                  <button type="button" className="ac-btn ac-btn-ghost" onClick={() => discard(q.key)} aria-label="ลบออกจากคิว">
                    ✕
                  </button>
                </span>
              )}
            </div>
          ))}
          {(photos || []).map((p) => (
            <figure key={p.id || p.fileId} className="ac-defect-cell">
              <button
                type="button"
                className="ac-room-gallery-thumb ac-defect-thumb"
                onClick={() => setLightbox(p)}
                title={p.note || p.createdAt}
                aria-label={`ดูรูปตำหนิ ${p.note || p.createdAt || ""}`.trim()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoThumbUrl(p.fileId)} alt={p.note || "รูปตำหนิ"} loading="lazy" />
              </button>
              {/* Caption is ALWAYS visible — a note nobody can see reads
                  as "ไม่ได้บันทึก" even when it saved fine. */}
              {p.note ? (
                <figcaption className="ac-defect-caption" title={p.note}>{p.note}</figcaption>
              ) : editingId === p.id ? (
                <span className="ac-defect-caption-edit">
                  <input
                    type="text"
                    value={editText}
                    autoFocus
                    maxLength={200}
                    placeholder="เช่น รอยขีดผนัง"
                    disabled={savingNote}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveNote(p);
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="ac-btn ac-btn-primary"
                    disabled={savingNote || !editText.trim()}
                    onClick={() => void saveNote(p)}
                  >{savingNote ? "..." : "บันทึก"}</button>
                </span>
              ) : (
                <button
                  type="button"
                  className="ac-defect-caption-add"
                  onClick={() => {
                    setEditingId(p.id);
                    setEditText("");
                  }}
                >+ คำอธิบาย</button>
              )}
            </figure>
          ))}
        </div>
      )}

      <div className="ac-defect-add">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files || []).filter((f) =>
              f.type.startsWith("image/")
            );
            e.target.value = ""; // allow re-picking the same file
            void addFiles(files);
          }}
        />
        <button
          type="button"
          className="ac-btn ac-btn-secondary ac-defect-add-btn"
          onClick={() => fileRef.current?.click()}
        >
          📷 เพิ่มรูปตำหนิ
        </button>
      </div>
      <p className="ac-defect-hint">
        ถ่ายจากมือถือ · เลือกไฟล์ · ลากมาวาง · หรือกด Ctrl+V วางรูปที่ก๊อปมา (เช่นจาก LINE) —
        รูปถูกย่ออัตโนมัติ และลบไม่ได้ (เป็นหลักฐานคืนมัดจำ) ·
        อัปเสร็จแล้วกด <strong>+ คำอธิบาย</strong> ใต้รูปเพื่อบอกว่าตำหนิอะไร (เขียนได้ครั้งเดียว)
      </p>

      {lightbox && (
        <div
          className="ac-room-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="รูปตำหนิขยาย"
          onClick={() => setLightbox(null)}
        >
          <button type="button" className="ac-room-lightbox-close" onClick={() => setLightbox(null)} aria-label="ปิด">
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="ac-room-lightbox-img"
            src={photoFullUrl(lightbox.fileId)}
            alt={lightbox.note || "รูปตำหนิ"}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="ac-room-lightbox-count">
            {[lightbox.createdAt, lightbox.note].filter(Boolean).join(" · ") || "รูปตำหนิ"}
          </div>
        </div>
      )}
    </section>
  );
}
