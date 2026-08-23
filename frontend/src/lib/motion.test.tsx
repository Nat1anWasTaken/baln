import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PressMotionBoundary, usePressMotionOwnership } from "@/lib/motion";

function OwnershipProbe({ name }: { name: string }) {
  const ownsPressMotion = usePressMotionOwnership();
  return <output aria-label={name}>{String(ownsPressMotion)}</output>;
}

describe("press Motion ownership", () => {
  it("allows one owner and suppresses nested press controllers", () => {
    render(
      <>
        <OwnershipProbe name="root" />
        <PressMotionBoundary>
          <OwnershipProbe name="nested" />
          <PressMotionBoundary>
            <OwnershipProbe name="deeply nested" />
          </PressMotionBoundary>
        </PressMotionBoundary>
      </>,
    );

    expect(screen.getByLabelText("root")).toHaveTextContent("true");
    expect(screen.getByLabelText("nested")).toHaveTextContent("false");
    expect(screen.getByLabelText("deeply nested")).toHaveTextContent("false");
  });
});
