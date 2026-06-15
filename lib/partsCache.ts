import { SwrSlot } from "@/lib/serverSwr";
import type { Part } from "@/types";

/**
 * Server-side SWR slot for the parts inventory, in a shared module so
 * BOTH /api/parts (the canonical reader/writer) and /api/part-requisitions
 * (which decrements stock) can invalidate it. Keeping it route-local meant
 * a requisition busted only Apps Script's cache, not this one, so the parts
 * view served stale (higher) stock for the fresh-TTL window and an engineer
 * could over-requisition against a number already spent.
 */
export const partsSlot = new SwrSlot<Part[]>();
