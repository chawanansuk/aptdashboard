"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { RoomPhoto, RoomView } from "@/types";
import { canViewTenant } from "@/lib/permissions";
import { formatSheetPhone, sheetPhoneDigits } from "@/lib/phoneFormat";
import { deleteRoomPhoto, fetchPetPhotos, getCachedPetPhotos, setCachedPetPhotos, photoThumbUrl } from "@/lib/roomPhotos";
import LightboxImage from "./LightboxImage";
import { toast } from "@/lib/toast";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ErrorBanner from "./ErrorBanner";

/**
 * 🐱 สัตว์เลี้ยง — property-wide pet photo grid (v3.25.4).
 *
 * The scenario this exists for: a cat escapes and staff need to know
 * whose it is. One grid of every registered pet across the property
 * (photo + room + name/markings) beats opening rooms one by one.
 *
 * Registration happens in the RoomModal's สัตว์เลี้ยงประจำห้อง strip;
 * this view is read-only lookup. Clicking a photo opens a lightbox
 * with the room and — for roles with tenant.view — the tenant's name
 * and a tap-to-call phone link, so "found the cat" flows straight
 * into "call the owner".
 *
 * Perf: fetched only when the view opens (one sheet-scan payload of
 * text rows); image bytes come from Google's CDN, lazy per thumbnail.
 * The main dashboard feed is untouched.
 */

interface Props {
  buildings: string[];
  activeBuilding: string;
  rooms: RoomView[];
}

export default function PetsView({ buildings, activeBuilding, rooms }: Props) {
  const { data: session } = useSession();
  const canSeeTenant = canViewTenant(session?.user?.roles);
  const [pets, setPets] = useState<RoomPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // activeBuilding can be the "ทั้งหมด" pseudo-value — only adopt it
  // when it's a REAL building; anything else means "show all".
  const [building, setBuilding] = useState<string>(
    buildings.includes(activeBuilding) ? activeBuilding : ""
  );
  const [lightbox, setLightbox] = useState<RoomPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);

  // โหลดใหม่ได้จากปุ่ม "ลองอีกครั้ง" ด้วย (r26: Apps Script ช้าเป็นครั้งคราว
  // — timeout แล้วเดิมผู้ใช้ติดหน้า error ต้องออกแล้วเข้าใหม่เอง)
  const load = useCallback(async () => {
    setError(null);
    // Stale-while-revalidate (perf r13): revisiting the view paints the
    // last-known grid instantly; the fresh fetch replaces it silently.
    const cached = getCachedPetPhotos();
    // ไม่มีแคช → กลับไปสถานะกำลังโหลด (กดลองใหม่หลัง error เดิมโชว์
    // "ยังไม่มีรูปสัตว์เลี้ยง" ค้าง 20-40 วิระหว่างรอ — audit r27)
    setPets(cached ?? null);
    try {
      const rows = await fetchPetPhotos();
      setPets(rows);
    } catch (e) {
      // มีของเก่าในแคช → โชว์ต่อ อย่าล้างทิ้ง (r26: เดิม error ล้างกริด
      // ที่เพิ่งวาดจากแคชไปด้วย ทั้งที่ข้อมูลยังใช้ได้)
      setPets((cur) => cur ?? []);
      setError(e instanceof Error ? e.message : "โหลดรูปสัตว์เลี้ยงไม่สำเร็จ");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Escape closes the lightbox (capture — same pattern as the room
  // modal gallery so muscle memory carries over).
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setLightbox(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightbox]);

  const shown = useMemo(() => {
    if (!pets) return [];
    const filtered = building ? pets.filter((p) => p.building === building) : pets;
    // Group by room so multiple photos of the same cat sit together.
    return [...filtered].sort(
      (a, b) =>
        a.building.localeCompare(b.building, "th") ||
        a.room.localeCompare(b.room, undefined, { numeric: true })
    );
  }, [pets, building]);

  /**
   * Room lookup for a photo. `occupied` matters: pet photos survive a
   * tenant turnover, so a photo on a vacant/moved-out room belongs to
   * the PREVIOUS tenant — showing the new tenant's phone next to it
   * would send staff calling the wrong person about someone else's cat.
   */
  const roomInfo = (p: RoomPhoto) => {
    const r = rooms.find((rv) => rv.building === p.building && rv.room === p.room);
    const occupied = r ? r.status === "occupied" : false;
    const tenant = canSeeTenant && occupied ? r?.tenant || "" : "";
    const phone = canSeeTenant && occupied ? r?.phone || "" : "";
    return { found: !!r, occupied, tenant, phone };
  };

  /** Pet photos are a registry, not evidence — any role may delete
   *  (owner decision). Cleanup right where the stale photo is noticed. */
  const removePhoto = async (p: RoomPhoto) => {
    if (deleting) return;
    if (!window.confirm(`ลบรูปนี้ (${p.building} ${p.room}${p.note ? ` — ${p.note}` : ""}) ?`)) return;
    setDeleting(true);
    try {
      await deleteRoomPhoto(p.id);
      setPets((rows) => (rows || []).filter((x) => x.id !== p.id));
      setLightbox(null);
      toast.success("ลบรูปแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบรูปไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  };

  // Write-through: current grid = cache (mutations like delete included).
  useEffect(() => {
    if (pets) setCachedPetPhotos(pets);
  }, [pets]);

  if (pets === null) return <LoadingState label="กำลังโหลดรูปสัตว์เลี้ยง…" />;

  return (
    <div className="ac-pets-view">
      <div className="ac-pets-head">
        <h2 className="ac-pets-title">🐱 สัตว์เลี้ยงทั้งหอ</h2>
        <div className="ac-pets-filters" role="tablist" aria-label="กรองตามตึก">
          <button
            type="button"
            role="tab"
            aria-selected={building === ""}
            className={`ac-chip ${building === "" ? "is-active" : ""}`}
            onClick={() => setBuilding("")}
          >ทั้งหมด</button>
          {buildings.map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={building === b}
              className={`ac-chip ${building === b ? "is-active" : ""}`}
              onClick={() => setBuilding(b)}
            >{b}</button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {!error && shown.length === 0 && (
        <EmptyState
          icon="search"
          title={building ? `ยังไม่มีรูปสัตว์เลี้ยงของตึก ${building}` : "ยังไม่มีรูปสัตว์เลี้ยง"}
          description='ลงทะเบียนได้ที่หน้าห้อง → แถบ "🐱 สัตว์เลี้ยงประจำห้อง" — ใส่ชื่อ+จุดเด่นไว้ เวลาแมวหลุดจะได้เทียบตัวถูก'
        />
      )}

      {shown.length > 0 && (
        <div className="ac-pets-grid">
          {shown.map((p) => (
            <figure key={p.id || p.fileId} className="ac-pets-card">
              <button
                type="button"
                className="ac-pets-thumb"
                onClick={() => setLightbox(p)}
                aria-label={`ดูรูป ${p.note || ""} ${p.building} ${p.room}`.trim()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoThumbUrl(p.fileId, 800)} alt={p.note || "สัตว์เลี้ยง"} loading="lazy" />
              </button>
              <figcaption className="ac-pets-caption">
                <span className="ac-pets-room">
                  {p.building} {p.room}
                  {!roomInfo(p).occupied && (
                    <span className="ac-pets-stale" title="ห้องนี้ไม่มีผู้เช่าแล้ว — รูปอาจเป็นของผู้เช่าคนก่อน">ห้องว่าง</span>
                  )}
                </span>
                {p.note && <span className="ac-pets-note" title={p.note}>{p.note}</span>}
                {p.createdAt && <span className="ac-pets-date">{p.createdAt.slice(0, 10)}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="ac-room-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="รูปสัตว์เลี้ยงขยาย"
          onClick={() => setLightbox(null)}
        >
          <button type="button" className="ac-room-lightbox-close" onClick={() => setLightbox(null)} aria-label="ปิด">
            ✕
          </button>
          <LightboxImage
            className="ac-room-lightbox-img"
            fileId={lightbox.fileId}
            alt={lightbox.note || "สัตว์เลี้ยง"}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="ac-pets-lightbox-info" onClick={(e) => e.stopPropagation()}>
            <strong>{lightbox.building} {lightbox.room}</strong>
            {lightbox.note && <span> · {lightbox.note}</span>}
            {lightbox.createdAt && <span className="ac-pets-date"> · {lightbox.createdAt}</span>}
            {(() => {
              const info = roomInfo(lightbox);
              if (!info.occupied) {
                return (
                  <span className="ac-pets-stale">
                    ห้องนี้ไม่มีผู้เช่าแล้ว — รูปอาจเป็นของผู้เช่าคนก่อน
                  </span>
                );
              }
              if (!info.tenant && !info.phone) return null;
              return (
                <span className="ac-pets-owner">
                  {info.tenant && <span> · ผู้เช่าห้องนี้: {info.tenant}</span>}
                  {info.phone && (
                    <a className="ac-pets-call" href={`tel:${sheetPhoneDigits(info.phone)}`}>
                      📞 โทร {formatSheetPhone(info.phone)}
                    </a>
                  )}
                </span>
              );
            })()}
          </div>
          <button
            type="button"
            className="ac-defect-delete-btn"
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              void removePhoto(lightbox);
            }}
          >{deleting ? "กำลังลบ…" : "🗑 ลบรูป"}</button>
        </div>
      )}
    </div>
  );
}
