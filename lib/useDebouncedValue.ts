"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (Problem: list views recompute their
 * filter + sort on every keystroke). Bind the <input> to the raw value
 * for instant typing feedback, but feed THIS debounced copy into the
 * filtering useMemo so the expensive recompute runs once the user
 * pauses instead of per character.
 *
 *   const [search, setSearch] = useState("");
 *   const q = useDebouncedValue(search, 150);
 *   const filtered = useMemo(() => rows.filter(...q...), [rows, q]);
 *
 * 150ms is below the ~200ms perceptual threshold, so the list still
 * feels live. The trailing timeout is cleared on every change and on
 * unmount, so a value that's still settling never lands after the
 * component is gone.
 */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
