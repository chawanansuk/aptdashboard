import { toast } from "@/lib/toast";
import type { RepairPartLine } from "@/components/RoomRepairParts";

/**
 * Shared "file part requisitions for a job" flow — extracted from
 * RoomModalHost.quickRepair (audit r8) so every place that records work
 * (quick-repair, บันทึกซ่อมบำรุง log modal, …) decrements stock the same
 * way.
 *
 * Semantics preserved exactly:
 *   - the JOB is already saved before this runs; requisition failures
 *     degrade to a warning toast, never a rollback
 *   - serial POSTs (Apps Script writes are lock-serialized anyway)
 *   - Apps Script clamps a withdrawal at remaining stock and flags it —
 *     we surface that honestly instead of pretending the full quantity
 *     came out
 *   - NO auto-retry here: addRequisition has no server dedup, a re-send
 *     would double-decrement stock (see lib/resilientWrite warning)
 */
export async function fileRequisitionLines(
  parts: RepairPartLine[] | undefined,
  ctx: { building: string; room: string; jobNote: string },
): Promise<void> {
  const lines = (parts || []).filter((p) => p.partId && p.quantity > 0);
  if (lines.length === 0) return;

  let okCount = 0;
  let clampedCount = 0;
  for (const line of lines) {
    try {
      const rq = await fetch("/api/part-requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          partId: line.partId,
          quantity: line.quantity,
          building: ctx.building,
          room: ctx.room,
          note: `งานซ่อม: ${ctx.jobNote.slice(0, 80)}`,
        }),
      });
      const rqData = await rq.json().catch(() => ({ ok: false }));
      if (rqData.ok) {
        okCount++;
        if (rqData.clamped) clampedCount++;
      }
    } catch { /* counted in the summary below */ }
  }
  if (okCount === lines.length && clampedCount === 0) {
    toast.success(`เบิกอะไหล่แล้ว ${okCount} รายการ`);
  } else if (okCount === lines.length) {
    toast.info(`เบิกแล้ว ${okCount} รายการ — ${clampedCount} รายการสต็อกไม่พอ เบิกได้เท่าที่เหลือ (เช็คหน้าอะไหล่)`);
  } else {
    toast.error(`เบิกอะไหล่สำเร็จ ${okCount}/${lines.length} รายการ — เช็คหน้าอะไหล่`);
  }
}
