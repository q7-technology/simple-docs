import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { SectionHeading } from "../ui/SectionHeading";

describe("the Q7 components", () => {
  it("fills a primary button space-blue with space-darkBlue text, never white", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("bg-space-blue", "text-space-darkBlue");
    expect(button.className).not.toMatch(/text-white/);
    expect(button).toHaveAttribute("type", "button");
  });

  it("keeps the focus ring on every button", () => {
    render(<Button variant="ghost">Cancel</Button>);
    expect(screen.getByRole("button")).toHaveClass("focus-visible:outline-ring");
  });

  it("draws a card on the brand surface", () => {
    render(<Card data-testid="card"><CardTitle>Users</CardTitle></Card>);
    expect(screen.getByTestId("card")).toHaveClass("bg-space-darkBlue/60", "border-space-blue/20", "backdrop-blur-sm");
    expect(screen.getByRole("heading", { level: 2, name: "Users" })).toHaveClass("text-space-lightGray");
  });

  it("wires a field's label, hint and error to its input", () => {
    render(<TextField label="Username" hint="Lower case is fine." error="That username is taken." />);
    const input = screen.getByLabelText("Username");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Lower case is fine. That username is taken.");
  });

  it("keeps the field's wiring over anything passed in, and a visible edge", () => {
    render(<TextField label="Email" id="mine" aria-describedby="other" hint="Work email." />);
    const input = screen.getByLabelText("Email");
    expect(input.id).not.toBe("mine");
    expect(input).toHaveAccessibleDescription("Work email.");
    expect(input).toHaveClass("border-space-gray/70");
    expect(input).not.toHaveClass("border-input");
  });

  it("leaves a field without an error unmarked", () => {
    render(<TextField label="Phone" />);
    expect(screen.getByLabelText("Phone")).not.toHaveAttribute("aria-invalid");
  });

  it("hides a chip's icon from screen readers and keeps its words", () => {
    const { container } = render(<Chip icon={Sparkles} tone="eyebrow" accent="gold">Draft</Chip>);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Draft")).toHaveClass("uppercase", "text-space-gold");
  });

  it("starts a heading with its accent phrase", () => {
    render(<SectionHeading accentText="Set up" description="Two minutes.">Simple Docs</SectionHeading>);
    const heading = screen.getByRole("heading", { level: 1, name: "Set up Simple Docs" });
    expect(heading.querySelector("span")).toHaveClass("text-space-blue");
    expect(screen.getByText("Two minutes.")).toHaveClass("text-space-gray");
  });

  it("says a warning as an alert and a success as a status", () => {
    render(<><Notice>Wrong username or password.</Notice><Notice tone="success">Saved.</Notice></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Wrong username or password.");
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });

  it("gives a badge its word in its own casing", () => {
    render(<Badge tone="gold">Locked</Badge>);
    expect(screen.getByText("Locked")).toHaveClass("text-space-gold");
  });
});
