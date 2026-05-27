/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import NotificationDropdown from "./NotificationDropdown";
import type { NotificationItem } from "@/lib/notifications";

const overdue: NotificationItem = {
  kind: "overdueTasks", level: "critical", glyph: "🔴",
  title: "งานเลยกำหนด", detail: "เก่าสุด เลย 28 วัน", count: 23, route: "today",
};
const moveout: NotificationItem = {
  kind: "moveoutPending", level: "warning", glyph: "🚪",
  title: "ห้องแจ้งย้ายออก", detail: "วางแผนทำสะอาด", count: 7, route: "moveout",
};

function open() {
  fireEvent.click(screen.getByRole("button", { name: /แจ้งเตือน/ }));
}

describe("NotificationDropdown", () => {
  it("invokes onNavigate with the row's route and closes the panel", () => {
    const onNavigate = vi.fn();
    render(<NotificationDropdown items={[overdue, moveout]} onNavigate={onNavigate} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /งานเลยกำหนด/ }));
    expect(onNavigate).toHaveBeenCalledWith("today");
    // panel closed → menu gone
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("routes the moveout row to its own view", () => {
    const onNavigate = vi.fn();
    render(<NotificationDropdown items={[overdue, moveout]} onNavigate={onNavigate} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /ห้องแจ้งย้ายออก/ }));
    expect(onNavigate).toHaveBeenCalledWith("moveout");
  });

  it("disables rows when no onNavigate is provided (not clickable)", () => {
    render(<NotificationDropdown items={[overdue]} />);
    open();
    const row = screen.getByRole("menuitem", { name: /งานเลยกำหนด/ });
    expect((row as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables a row that has no route even when onNavigate is provided", () => {
    const onNavigate = vi.fn();
    const noRoute: NotificationItem = { ...overdue, route: undefined };
    render(<NotificationDropdown items={[noRoute]} onNavigate={onNavigate} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /งานเลยกำหนด/ }));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
