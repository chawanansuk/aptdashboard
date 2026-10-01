import { resilientPost } from "@/lib/resilientWrite";
import { bangkokTodayYmd } from "@/lib/dateUtils";
import { publishBusEvent } from "@/lib/realtimeBus";
import { toast } from "@/lib/toast";
import { categoryForEquipment } from "@/lib/repairCategories";

/**
 * "ซ่อมแล้ว" on an equipment / facility record used to flip its status
 * and nothing else — the repair never reached the งาน sheet, so it was
 * missing from the ซ่อมบำรุง log and every report (รอบ 1 งานซ่อมจุกจิก).
 * Now it also files a finished ซ่อม task for the room (or the common
 * area), categorised from the equipment's kind. Fire-and-forget: the
 * status change already succeeded; if this part fails the user is told
 * where to log it by hand.
 */
export async function logEquipmentRepair(p: { building: string; room: string; what: string; doneBy?: string }): Promise<void> {
  const what = p.what.trim();
  try {
    const { data } = await resilientPost("/api/sheet/update", {
      action: "addTask",
      date: bangkokTodayYmd(),
      type: "ซ่อม",
      building: p.building,
      room: p.room,
      note: `ซ่อม${what}แล้ว (กดจากรายการอุปกรณ์)`,
      status: "เสร็จ",
      category: categoryForEquipment(what),
      ...(p.doneBy ? { doneBy: p.doneBy } : {}),
    }, { retries: 0 });
    if (!data.ok) throw new Error(data.error || "addTask failed");
    if (!(data as { skipped?: string }).skipped) {
      publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
    }
  } catch {
    toast.warning("บันทึกสถานะอุปกรณ์แล้ว แต่ยังไม่ได้ลงบันทึกงานซ่อม", {
      description: "ลงเองได้ที่หน้าซ่อมบำรุง › ลงบันทึกงาน",
    });
  }
}
