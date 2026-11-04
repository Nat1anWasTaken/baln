import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCoalescedRef } from "@/hooks/use-coalesced-ref";

const flushMicrotasks = () => Promise.resolve();

describe("useCoalescedRef", () => {
  it("ignores a detach that is reattached to the same node in one commit", async () => {
    const target = vi.fn();
    const { result } = renderHook(() => useCoalescedRef(target));
    const node = document.createElement("a");

    result.current(node);
    result.current(null);
    result.current(node);
    await flushMicrotasks();

    expect(target.mock.calls).toEqual([[node]]);
  });

  it("forwards a real detach after the commit", async () => {
    const target = { current: null as HTMLAnchorElement | null };
    const { result } = renderHook(() => useCoalescedRef(target));
    const node = document.createElement("a");

    result.current(node);
    result.current(null);
    expect(target.current).toBe(node);
    await flushMicrotasks();

    expect(target.current).toBeNull();
  });

  it("moves the node when the forwarded ref changes", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ ref }) => useCoalescedRef(ref), {
      initialProps: { ref: first },
    });
    const node = document.createElement("a");

    result.current(node);
    const previous = result.current;
    rerender({ ref: second });
    previous(null);
    result.current(node);
    await flushMicrotasks();

    expect(first.mock.calls).toEqual([[node], [null]]);
    expect(second.mock.calls).toEqual([[node]]);
  });
});
