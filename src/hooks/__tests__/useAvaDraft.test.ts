import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAvaDraft } from "../useAvaDraft";

describe("useAvaDraft", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it("returns empty value when no user", () => {
    const { result } = renderHook(() => useAvaDraft(undefined));
    expect(result.current[0]).toBe("");
  });

  it("persists value to localStorage after debounce", () => {
    const { result } = renderHook(() => useAvaDraft("u1", "c1"));
    act(() => result.current[1]("hello"));
    expect(result.current[0]).toBe("hello");
    act(() => { vi.advanceTimersByTime(500); });
    expect(localStorage.getItem("pp-ava-draft:u1:c1")).toBe("hello");
  });

  it("clears draft removes localStorage entry", () => {
    localStorage.setItem("pp-ava-draft:u2:c2", "x");
    const { result } = renderHook(() => useAvaDraft("u2", "c2"));
    expect(result.current[0]).toBe("x");
    act(() => result.current[2]());
    expect(localStorage.getItem("pp-ava-draft:u2:c2")).toBeNull();
  });

  it("removes entry when text becomes empty", () => {
    const { result } = renderHook(() => useAvaDraft("u3", "c3"));
    act(() => result.current[1]("draft"));
    act(() => { vi.advanceTimersByTime(500); });
    expect(localStorage.getItem("pp-ava-draft:u3:c3")).toBe("draft");
    act(() => result.current[1](""));
    act(() => { vi.advanceTimersByTime(500); });
    expect(localStorage.getItem("pp-ava-draft:u3:c3")).toBeNull();
  });
});
