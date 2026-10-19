import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ADA, apiError, FRESH, json, renderApp, stubApi } from "./harness";

const RULE = "Use 2 to 64 letters, numbers, dots, dashes or underscores, starting with a letter or number.";

async function fillIn(again = "correct horse battery") {
  await userEvent.type(await screen.findByLabelText("Organisation"), "Acme Pty Ltd");
  await userEvent.type(screen.getByLabelText("Your name"), "Ada Admin");
  await userEvent.type(screen.getByLabelText("Username"), "ada");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
  await userEvent.type(screen.getByLabelText("Password again"), again);
  await userEvent.click(screen.getByRole("button", { name: "Set up Simple Docs" }));
}

describe("first run", () => {
  it("sends a fresh install to first run", async () => {
    stubApi(undefined, { me: null, branding: FRESH });
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Set up Simple Docs" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/setup");
  });

  it("makes the first admin and signs them in", async () => {
    const { calls } = stubApi((method, url) =>
      method === "POST" && url === "/api/v1/setup" ? json(201, ADA) : null, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn();
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/setup"));
    expect(calls.find((c) => c.url === "/api/v1/setup")?.body).toEqual({
      org_name: "Acme Pty Ltd", display_name: "Ada Admin", username: "ada", password: "correct horse battery" });
  });

  it("checks the passwords match before sending anything", async () => {
    const { calls } = stubApi(undefined, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn("something else entirely");
    expect(await screen.findByText("The passwords don't match.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/v1/setup")).toBe(false);
    expect(screen.getByLabelText("Password again")).toHaveFocus();
  });

  it("shows what the API says is wrong beside its field", async () => {
    stubApi((_method, url) => url === "/api/v1/setup"
      ? apiError(422, "invalid", RULE, { username: RULE }) : null, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn();
    expect(await screen.findByText(RULE)).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Username")).toHaveFocus();
  });

  it("sends anyone to sign in once Simple Docs is set up", async () => {
    stubApi(undefined, { me: null });
    renderApp("/setup");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
