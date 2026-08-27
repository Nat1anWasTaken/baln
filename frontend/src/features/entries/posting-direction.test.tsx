import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PostingDirectionBadge,
  PostingDirectionText,
  postingDirectionFromAmount,
} from "@/features/entries/posting-direction";

describe("posting direction presentation", () => {
  it("uses the shared debit tone for badges and text", () => {
    render(
      <>
        <PostingDirectionBadge direction="debit" />
        <PostingDirectionText direction="debit" suffix="合計" />
      </>,
    );

    expect(screen.getByText("借方")).toHaveClass(
      "bg-finance-debit/10",
      "text-finance-debit",
    );
    expect(screen.getByText("借方合計")).toHaveClass("text-finance-debit");
  });

  it("uses the shared credit tone for badges and text", () => {
    render(
      <>
        <PostingDirectionBadge direction="credit" />
        <PostingDirectionText direction="credit" suffix="合計" />
      </>,
    );

    expect(screen.getByText("貸方")).toHaveClass(
      "bg-finance-credit/10",
      "text-finance-credit",
    );
    expect(screen.getByText("貸方合計")).toHaveClass("text-finance-credit");
  });

  it("derives direction from a non-zero signed posting amount", () => {
    expect(postingDirectionFromAmount(1)).toBe("debit");
    expect(postingDirectionFromAmount(-1)).toBe("credit");
    expect(() => postingDirectionFromAmount(0)).toThrowError(
      "Posting amount cannot be zero",
    );
  });
});
