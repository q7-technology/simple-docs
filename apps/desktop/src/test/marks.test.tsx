import { render, screen } from "@testing-library/react";
import { OrgMark } from "../ui/OrgMark";
import { SimpleDocsMark } from "../ui/SimpleDocsMark";
import { makeStars, StarField } from "../ui/StarField";

describe("the marks and the star field", () => {
  it("draws the same still star field every time, hidden from screen readers", () => {
    expect(makeStars(140, 7)).toEqual(makeStars(140, 7));
    for (const star of makeStars(140, 7)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(100);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThanOrEqual(100);
    }
    render(<StarField />);
    const field = screen.getByTestId("star-field");
    expect(field).toHaveAttribute("aria-hidden", "true");
    expect(field).toHaveClass("pointer-events-none", "fixed");
    expect(field.querySelectorAll("circle")).toHaveLength(140);
    expect(field.querySelector("animate")).toBeNull();
  });

  it("keeps the Simple Docs mark decorative unless it is named", () => {
    const { container, rerender } = render(<SimpleDocsMark />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<SimpleDocsMark title="Simple Docs" />);
    expect(screen.getByRole("img", { name: "Simple Docs" })).toBeInTheDocument();
  });

  it("shows the organisation's logo when there is one, else the mark", () => {
    const { container, rerender } = render(<OrgMark logoId="logo-1" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/branding/logo?v=logo-1");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    rerender(<OrgMark logoId={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
