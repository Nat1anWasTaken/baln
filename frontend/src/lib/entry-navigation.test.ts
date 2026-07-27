import { describe, expect, it } from "vitest";
import type { Location } from "react-router-dom";

import {
  entryEditorRouteState,
  getEntryEditorBackground,
} from "@/lib/entry-navigation";

const background: Location = {
  pathname: "/entries/01980000-0000-7000-8000-000000000010",
  search: "?q=午餐",
  hash: "",
  state: null,
  key: "entry-detail",
};

describe("transaction editor route state", () => {
  it("preserves a valid background location", () => {
    const state = entryEditorRouteState(background);

    expect(getEntryEditorBackground(state)).toBe(background);
  });

  it.each([null, {}, { backgroundLocation: null }, { backgroundLocation: {} }])(
    "rejects invalid route state %#",
    (state) => {
      expect(getEntryEditorBackground(state)).toBeUndefined();
    },
  );
});
