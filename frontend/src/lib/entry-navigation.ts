import type { Location } from "react-router-dom";

export type EntryCreateRouteState = {
  backgroundLocation: Location;
};

export function entryCreateRouteState(
  backgroundLocation: Location,
): EntryCreateRouteState {
  return { backgroundLocation };
}

export function getEntryCreateBackground(state: unknown): Location | undefined {
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
