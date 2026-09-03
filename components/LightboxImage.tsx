"use client";

import { useEffect, useState } from "react";
import { photoDriveViewUrl, photoFullUrl, photoFullUrlFallback } from "@/lib/roomPhotos";

/**
 * รูปใหญ่ใน lightbox พร้อมแผนสำรอง (bug r25) — เดิมถ้ารูปโหลดพัง
 * ผู้ใช้เจอจอดำว่างเปล่าเฉยๆ ไม่รู้ว่าเกิดอะไรขึ้น:
 *   1. drive.google.com/thumbnail w1600 (โฮสต์เดียวกับรูปเล็กที่โหลดได้ชัวร์)
 *   2. พัง → ลอง lh3.googleusercontent.com (endpoint เดิม)
 *   3. พังอีก → ข้อความบอกตรงๆ + ปุ่มเปิดรูปใน Google Drive
 */

interface Props {
  fileId: string;
  alt: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function LightboxImage({ fileId, alt, className, onClick }: Props) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => { setStage(0); }, [fileId]);

  if (stage === 2) {
    return (
      <div className="ac-lightbox-fail" onClick={onClick}>
        <p>โหลดรูปขนาดเต็มไม่สำเร็จ</p>
        <a
          className="ac-btn ac-btn-primary"
          href={photoDriveViewUrl(fileId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >เปิดรูปใน Google Drive ↗</a>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={stage === 0 ? photoFullUrl(fileId) : photoFullUrlFallback(fileId)}
      alt={alt}
      onClick={onClick}
      onError={() => setStage((s) => (s === 0 ? 1 : 2))}
    />
  );
}
