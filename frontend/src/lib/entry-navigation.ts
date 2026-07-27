import type { Location } from "react-router-dom";

export type EntryEditorRouteState = {
  backgroundLocation: Location;
};

export function entryEditorRouteState(
  backgroundLocation: Location,
): EntryEditorRouteState {
  return { backgroundLocation };
}

export function getEntryEditorBackground(state: unknown): Location | undefined {
  if (
    typeof state !== "object" ||
    state === null ||
    !("backgroundLocation" in state)
  ) {
    return undefined;
  }

  const backgroundLocation = state.backgroundLocation;
  if (
    typeof backgroundLocation !== "object" ||
    backgroundLocation === null ||
    !("pathname" in backgroundLocation) ||
    typeof backgroundLocation.pathname !== "string"
  ) {
    return undefined;
  }

  return backgroundLocation as Location;
}
