import { type ForwardedRef, useCallback, useRef } from "react";

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * Returns a stable callback ref that forwards to `ref`, ignoring the
 * detach/reattach pair React performs when a child component hands the DOM
 * node a new callback ref on every render.
 *
 * React Router's `Link` merges its refs with a fresh function each render, so
 * every re-render detaches (`null`) and reattaches the anchor. Motion treats
 * that `null` as an unmount and tears down in-flight gestures, which leaves
 * press feedback stuck mid-animation. Deferring the detach to a microtask lets
 * the same-commit reattach cancel it, while a real unmount still forwards
 * `null` before any further work runs.
 */
export function useCoalescedRef<T>(ref: ForwardedRef<T>) {
  const state = useRef<{
    node: T | null;
    target: ForwardedRef<T>;
    pendingDetach: boolean;
  }>({ node: null, target: null, pendingDetach: false });

  return useCallback(
    (node: T | null) => {
      const current = state.current;
      if (node) {
        current.pendingDetach = false;
        if (current.node === node && current.target === ref) return;
        if (current.node) assignRef(current.target, null);
        current.node = node;
        current.target = ref;
        assignRef(ref, node);
        return;
      }

      current.pendingDetach = true;
      queueMicrotask(() => {
        if (!current.pendingDetach) return;
        current.pendingDetach = false;
        const target = current.target;
        current.node = null;
        current.target = null;
        assignRef(target, null);
      });
    },
    [ref],
  );
}
