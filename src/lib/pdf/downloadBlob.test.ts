import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadPdfBlob } from "./downloadBlob";

/**
 * Simulates a given browser user-agent so we can verify the download flow
 * does NOT fall back to the print dialog on Chrome or Safari.
 */
function withUserAgent(ua: string, run: () => void) {
  const original = navigator.userAgent;
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  try {
    run();
  } finally {
    Object.defineProperty(navigator, "userAgent", { value: original, configurable: true });
  }
}

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("downloadPdfBlob", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let printSpy: ReturnType<typeof vi.spyOn>;
  let anchorClick: ReturnType<typeof vi.fn>;
  let appendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => "blob:fake-url");
    revokeObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;

    anchorClick = vi.fn();
    // Intercept anchor click so jsdom doesn't try to navigate
    HTMLAnchorElement.prototype.click = anchorClick as any;

    printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    appendSpy = vi.spyOn(document.body, "appendChild");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  for (const [browser, ua] of [
    ["Chrome", CHROME_UA],
    ["Safari", SAFARI_UA],
  ] as const) {
    it(`downloads the PDF as a file (no print dialog) on ${browser}`, () => {
      withUserAgent(ua, () => {
        const blob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
          type: "application/pdf",
        });
        const filename = "audit-planipret-2026-06-25.pdf";

        downloadPdfBlob(blob, filename);

        // A blob URL was created from the PDF blob
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(createObjectURL).toHaveBeenCalledWith(blob);

        // An <a download="..."> was appended and clicked
        const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement;
        expect(anchor).toBeInstanceOf(HTMLAnchorElement);
        expect(anchor.tagName).toBe("A");
        expect(anchor.getAttribute("download")).toBe(filename);
        expect(anchor.href).toBe("blob:fake-url");
        expect(anchorClick).toHaveBeenCalledTimes(1);

        // CRITICAL: the print dialog must NOT be triggered
        expect(printSpy).not.toHaveBeenCalled();

        // Cleanup revokes the blob URL after a short delay
        vi.advanceTimersByTime(2100);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");

        // Anchor was removed from DOM (no leftover element)
        expect(document.body.querySelector("a[download]")).toBeNull();
      });
    });
  }

  it("throws on invalid input instead of silently opening a print dialog", () => {
    expect(() => downloadPdfBlob(null as any, "x.pdf")).toThrow();
    expect(() => downloadPdfBlob(new Blob(), "")).toThrow();
    expect(printSpy).not.toHaveBeenCalled();
  });
});
