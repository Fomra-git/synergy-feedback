"use client";

import { useCallback, useRef, useState } from "react";

const LIMIT = 100;
const COALESCE_MS = 800;

/**
 * Undo/redo history. Consecutive updates with the same `coalesceKey` within a
 * short window (e.g. typing into one input) become a single undo step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });

  const set = useCallback((updater: T | ((prev: T) => T), coalesceKey?: string) => {
    setState((s) => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(s.present) : updater;
      if (Object.is(next, s.present)) return s;
      const now = Date.now();
      const coalesce = coalesceKey && last.current.key === coalesceKey && now - last.current.at < COALESCE_MS;
      last.current = { key: coalesceKey ?? null, at: now };
      return {
        past: coalesce ? s.past : [...s.past, s.present].slice(-LIMIT),
        present: next,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { key: null, at: 0 };
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1]!, future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = { key: null, at: 0 };
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0]!, future: s.future.slice(1) } : s));
  }, []);

  return { value: state.present, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
