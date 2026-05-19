import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => cleanup());

function Boom({ message = "kaboom" }: { message?: string }): never {
  throw new Error(message);
}

describe("<ErrorBoundary>", () => {
  // Silence the noisy React + componentDidCatch console.error for each test
  // (we still assert that onError gets called)
  const origError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = origError;
  });

  it("renders children when no error is thrown", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>,
    );
    expect(getByText("safe content")).toBeTruthy();
  });

  it("shows the default fallback when a child throws", () => {
    const { getByRole, getByText } = render(
      <ErrorBoundary level="section">
        <Boom />
      </ErrorBoundary>,
    );
    const alert = getByRole("alert");
    expect(alert).toBeTruthy();
    expect(getByText(/เกิดข้อผิดพลาด/)).toBeTruthy();
  });

  it("uses the global heading when level=global", () => {
    const { getByText } = render(
      <ErrorBoundary level="global">
        <Boom />
      </ErrorBoundary>,
    );
    expect(getByText(/ขออภัย เกิดข้อผิดพลาด/)).toBeTruthy();
  });

  it("uses a label-aware heading when label is provided", () => {
    const { getByText } = render(
      <ErrorBoundary level="section" label="ปฏิทิน">
        <Boom />
      </ErrorBoundary>,
    );
    expect(getByText(/ปฏิทิน/)).toBeTruthy();
  });

  it("calls onError with the thrown error", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom message="specific-msg" />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const [err] = onError.mock.calls[0];
    expect((err as Error).message).toBe("specific-msg");
  });

  it("custom fallback render-prop replaces the default UI", () => {
    const { getByText } = render(
      <ErrorBoundary
        fallback={({ error, reset }) => (
          <div>
            <span>custom: {error.message}</span>
            <button onClick={reset}>retry</button>
          </div>
        )}
      >
        <Boom message="custom-test" />
      </ErrorBoundary>,
    );
    expect(getByText("custom: custom-test")).toBeTruthy();
    expect(getByText("retry")).toBeTruthy();
  });

  it("reset() clears the error so children can re-render", () => {
    // We need a child that can flip from throwing → not throwing.
    function Toggler({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) throw new Error("flap");
      return <div>recovered</div>;
    }
    let shouldThrow = true;
    let resetFn: null | (() => void) = null;
    function captureReset(r: () => void) { resetFn = r; }
    const { rerender, getByText } = render(
      <ErrorBoundary
        fallback={({ reset }) => {
          captureReset(reset);
          return <div>boundary-up</div>;
        }}
      >
        <Toggler shouldThrow={shouldThrow} />
      </ErrorBoundary>,
    );
    expect(getByText("boundary-up")).toBeTruthy();
    // Caller fixes the underlying problem, then clicks "try again"
    shouldThrow = false;
    if (resetFn) (resetFn as () => void)();
    rerender(
      <ErrorBoundary
        fallback={({ reset }) => {
          captureReset(reset);
          return <div>boundary-up</div>;
        }}
      >
        <Toggler shouldThrow={shouldThrow} />
      </ErrorBoundary>,
    );
    expect(getByText("recovered")).toBeTruthy();
  });
});

