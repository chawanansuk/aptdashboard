/**
 * Zod schemas for the six actions accepted by `/api/sheet/update`.
 *
 * Why: the route is the single chokepoint for every write into the
 * Google Sheet (addTask, updateTask, updateTaskStatus, deleteTask,
 * updateRoomStatus, debugFindTask). Before this it validated by hand
 * (typeof === "string" on action only) and forwarded the rest of the
 * body raw to Apps Script. That's enough to keep Apps Script's own
 * validation honest, but means a corrupted client can quietly write
 * malformed rows the spreadsheet then has to live with. With these
 * schemas:
 *
 *   - missing required fields return 400 with a Thai error before we
 *     ever touch the network (saves an Apps Script call + retry)
 *   - unknown fields are silently dropped via `.strip()` so a stale
 *     client can't poison a row with stale columns
 *   - downstream handlers see a typed object, not `Record<string, unknown>`
 *
 * Schemas are intentionally permissive on Thai strings (no regex on
 * room formats etc) — the sheet is the source of truth for what's a
 * valid room, and we already validate that elsewhere (taskSchema).
 * Here we focus on the SHAPE.
 */

import { z } from "zod";
import { TASK_TYPES } from "@/lib/taskConstants";

// Reusable bits — the same building/room/date triple appears in every action.
const Building = z.string().trim().min(1, "เลือกตึก").max(40);
const Room = z.string().trim().min(1, "กรอกเลขห้อง").max(60);
// Date is dd/MM/yyyy in our sheet; addTask sometimes posts yyyy-MM-dd
// (HTML input). We accept any non-empty string and let Apps Script's
// date parser normalize — checking the format here would diverge from
// the lib/dateUtils parser without adding value.
const TaskDate = z.string().trim().min(1, "กรอกวันที่").max(40);
const TaskTypeEnum = z.enum(TASK_TYPES, { message: "เลือกประเภทงาน" });

// Optional Thai strings — present in some payloads, absent in others.
// `.optional()` accepts both `undefined` and a missing key; `.default("")`
// would force them present which we don't want (a write that omits
// `note` shouldn't blank an existing one).
const OptText = (max: number) => z.string().max(max).optional();
const OptBuilding = Building.optional();
const OptRoom = Room.optional();

/**
 * addTask: schedule a new task in the งาน sheet.
 * Notes: cost is optional. customer/phone/note can be empty strings.
 */
export const AddTaskSchema = z.object({
  action: z.literal("addTask"),
  date: TaskDate,
  type: TaskTypeEnum,
  building: Building,
  room: Room,
  customer: OptText(120),
  phone: OptText(40),
  note: OptText(500),
  /** Optional THB amount; integer is fine, decimals tolerated. */
  cost: z.number().nonnegative().optional(),
}).strip();

/**
 * updateTask: replace fields on an existing row.
 *
 * The client supplies the 4-tuple as a `match` object plus any subset
 * of the editable fields. Apps Script enforces "row must exist" so we
 * don't need to here.
 */
export const UpdateTaskSchema = z.object({
  action: z.literal("updateTask"),
  match: z.object({
    date: TaskDate,
    type: TaskTypeEnum,
    building: Building,
    room: Room,
  }).strip(),
  // The "what to change" half — at least one field should be present;
  // we keep it loose so the client can also blank a note by sending "".
  date: OptText(40),
  type: TaskTypeEnum.optional(),
  building: OptBuilding,
  room: OptRoom,
  customer: OptText(120),
  phone: OptText(40),
  note: OptText(500),
  status: OptText(40),
  cost: z.number().nonnegative().optional(),
}).strip();

/**
 * updateTaskStatus: light variant — same 4-tuple at the top level
 * (legacy shape), plus the new status. Status is freeform so we don't
 * accidentally reject a valid Apps-Script-side status we don't know
 * about (e.g. a future "พักงาน" without a deploy).
 */
export const UpdateTaskStatusSchema = z.object({
  action: z.literal("updateTaskStatus"),
  date: TaskDate,
  type: TaskTypeEnum,
  building: Building,
  room: Room,
  status: z.string().max(40),
}).strip();

/**
 * deleteTask: callers send either `match: {...}` (TasksList bulk delete)
 * or the 4-tuple inline. We accept both — refining for "at least one
 * form present" so a payload of `{ action: "deleteTask" }` 400s here
 * instead of blanking an Apps Script row.
 */
export const DeleteTaskSchema = z.object({
  action: z.literal("deleteTask"),
  match: z.object({
    date: TaskDate,
    type: TaskTypeEnum,
    building: Building,
    room: Room,
  }).strip().optional(),
  date: OptText(40),
  type: TaskTypeEnum.optional(),
  building: OptBuilding,
  room: OptRoom,
}).strip().refine(
  (b) => b.match !== undefined || (b.date && b.type && b.building && b.room),
  { message: "deleteTask: ต้องส่ง match หรือ date+type+building+room ครบ" },
);

/**
 * updateRoomStatus: rewrites the ห้อง sheet row. Status can be the
 * Thai source label OR a normalized RoomStatus key — Apps Script
 * normalizes either, so we don't enforce a string set here.
 *
 * Note: `note` here is *room* note, not a task note. Kept on the
 * permissive side because operators paste arbitrary free text.
 */
export const UpdateRoomStatusSchema = z.object({
  action: z.literal("updateRoomStatus"),
  building: Building,
  room: Room,
  status: z.string().min(1).max(40),
  tenant: OptText(120),
  phone: OptText(40),
  price: z.string().max(40).optional(),
  contractEnd: OptText(40),
  note: OptText(500),
  /** Comma-separated image URLs from the "รูป" column. */
  images: OptText(2000),
  /** Raw source label, preserved for audit (e.g. "ว่าง" vs "ready"). */
  rawStatus: OptText(40),
}).strip();

/**
 * debugFindTask: read-only diagnostic. Same 4-tuple shape; Apps Script
 * returns the matched row (or null) so the engineer can confirm what
 * the sheet thinks exists. No data is mutated.
 */
export const DebugFindTaskSchema = z.object({
  action: z.literal("debugFindTask"),
  date: TaskDate,
  type: TaskTypeEnum,
  building: Building,
  room: Room,
}).strip();

/**
 * Tagged union over every action. `discriminatedUnion` on `action`
 * gives us a cleaner error (zod points at the right schema) and lets
 * downstream TypeScript narrow `body.action` to the action's payload.
 */
export const SheetUpdateBodySchema = z.discriminatedUnion("action", [
  AddTaskSchema,
  UpdateTaskSchema,
  UpdateTaskStatusSchema,
  DeleteTaskSchema,
  UpdateRoomStatusSchema,
  DebugFindTaskSchema,
]);

export type SheetUpdateBody = z.infer<typeof SheetUpdateBodySchema>;

/**
 * Render a zod issue list into a single Thai-friendly error string for
 * the API response. We prefer the deepest issue's message (usually the
 * one the user can act on) and prepend the field path so a "missing
 * date" error reads `date: กรอกวันที่` instead of just `Required`.
 */
export function formatSheetUpdateError(err: z.ZodError): string {
  const issues = err.issues;
  if (issues.length === 0) return "invalid body";
  const first = issues[0];
  const path = first.path.join(".");
  // Refine errors (e.g. the deleteTask one) have no path — surface as-is.
  return path ? `${path}: ${first.message}` : first.message;
}
