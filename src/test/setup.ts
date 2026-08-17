import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom does not implement Blob URL helpers used by attachment downloads.
if (typeof URL.createObjectURL !== "function") (URL as any).createObjectURL = () => "blob:stub";
if (typeof URL.revokeObjectURL !== "function") (URL as any).revokeObjectURL = () => {};
