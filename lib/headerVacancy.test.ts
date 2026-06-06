import { describe, expect, it } from "vitest";
import type { RoomView } from "@/types";
import {
  computeVacancyByBuilding, isSupplyRelevantView, SUPPLY_RELEVANT_VIEWS,
} from "./headerVacancy";

function mkRoom(p: Partial<RoomView>): RoomView {
  return {
    building: "Kl", room: "101", floor: "1", price: "5000",
    status: "ready", rawStatus: "ว่าง", tenant: "", phone: "",
    contractEnd: "", today: false, needsCleaning: false,
    todayTasks: [], upcomingTasks: [], pastTasks: [],
    ...p,
  };
}

describe("computeVacancyByBuilding", () => {
  it("counts only ready rooms, grouped by building", () => {
    const rooms = [
      mkRoom({ building: "Kl", status: "ready" }),
      mkRoom({ building: "Kl", status: "ready" }),
      mkRoom({ building: "Kl", status: "occupied" }),
      mkRoom({ building: "มั่งมี", status: "ready" }),
      mkRoom({ building: "มั่งมี", status: "moveout" }),
    ];
    expect(computeVacancyByBuilding(rooms)).toEqual({ Kl: 2, "มั่งมี": 1 });
  });

  it("buildings with no vacancies are absent from the map (not zero)", () => {
    const rooms = [
      mkRoom({ building: "Kl", status: "occupied" }),
      mkRoom({ building: "มั่งมี", status: "ready" }),
    ];
    const m = computeVacancyByBuilding(rooms);
    expect(m.Kl).toBeUndefined();
    expect(m["มั่งมี"]).toBe(1);
  });

  it("returns an empty map for an empty room list", () => {
    expect(computeVacancyByBuilding([])).toEqual({});
  });
});

describe("isSupplyRelevantView", () => {
  it("returns true for the five supply views", () => {
    ["overview", "salespipeline", "ready", "pending", "moveout"].forEach((v) => {
      expect(isSupplyRelevantView(v)).toBe(true);
    });
  });

  it("returns false for engineer/maintenance/etc.", () => {
    ["engineerkanban", "maintenance", "calendar", "tenants", "today", "facilities", "vehicles"].forEach((v) => {
      expect(isSupplyRelevantView(v)).toBe(false);
    });
  });

  it("the exported set is exactly the five views", () => {
    expect(SUPPLY_RELEVANT_VIEWS.size).toBe(5);
  });
});
