"use client";

import { useState } from "react";

/**
 * Read-only room photo gallery (#7). Renders a horizontal strip of
 * thumbnails parsed from a comma/newline-separated URL string (the
 * sheet's "รูป" column); clicking one opens a full-screen lightbox.
 *
 * Deliberately read-only — no upload/storage backend. Staff paste image
 * links (Drive / LINE / Imgur / …) into the sheet. When the column is
 * empty or absent the component renders nothing, so it's safe to mount
 * unconditionally.
 */
export function parseImageUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

export default function RoomImageGallery({ images, label }: { images?: string; label?: string }) {
  const urls = parseImageUrls(images);
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (urls.length === 0) return null;

  const close = () => setLightbox(null);
  const show = (i: number) => setLightbox(((i % urls.length) + urls.length) % urls.length);

  return (
    <section className="ac-room-gallery" aria-label="รูปห้อง">
      <div className="ac-room-gallery-strip">
        {urls.map((u, i) => (
          <button
            key={u + i}
            type="button"
            className="ac-room-gallery-thumb"
            onClick={() => setLightbox(i)}
            aria-label={`ดูรูปที่ ${i + 1} จาก ${urls.length}${label ? ` ของ ${label}` : ""}`}
          >
            {/* Plain <img> on purpose — URLs are arbitrary external hosts
                (Drive/LINE/etc) that aren't in next.config's allowlist,
                so next/image would reject them. loading=lazy keeps it cheap. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`รูปห้อง ${i + 1}`} loading="lazy" />
          </button>
        ))}
      </div>

      {lightbox !== null && (
        <div className="ac-room-lightbox" role="dialog" aria-modal="true" aria-label="รูปขยาย" onClick={close}>
          <button type="button" className="ac-room-lightbox-close" onClick={close} aria-label="ปิด">✕</button>
          {urls.length > 1 && (
            <button
              type="button"
              className="ac-room-lightbox-nav is-prev"
              onClick={(e) => { e.stopPropagation(); show(lightbox - 1); }}
              aria-label="รูปก่อนหน้า"
            >‹</button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="ac-room-lightbox-img"
            src={urls[lightbox]}
            alt={`รูปห้อง ${lightbox + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
          {urls.length > 1 && (
            <button
              type="button"
              className="ac-room-lightbox-nav is-next"
              onClick={(e) => { e.stopPropagation(); show(lightbox + 1); }}
              aria-label="รูปถัดไป"
            >›</button>
          )}
          <div className="ac-room-lightbox-count">{lightbox + 1} / {urls.length}</div>
        </div>
      )}
    </section>
  );
}
