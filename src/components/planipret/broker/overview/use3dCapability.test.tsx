// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useInViewOnce } from "./use3dCapability";

const instances: Array<{ root: Element | null; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  root: Element | null;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root ?? null;
    instances.push(this);
  }
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

function Probe() {
  const [ref] = useInViewOnce<HTMLDivElement>();
  return <div className="pp-mobile-scroll"><div ref={ref} data-testid="chart-probe" /></div>;
}

describe("useInViewOnce", () => {
  afterEach(() => {
    instances.splice(0);
    vi.unstubAllGlobals();
  });

  it("observe les graphiques depuis le conteneur de défilement mobile", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const { getByTestId } = render(<Probe />);
    await waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0].root).toBe(getByTestId("chart-probe").parentElement);
    expect(instances[0].observe).toHaveBeenCalledWith(getByTestId("chart-probe"));
  });
});
