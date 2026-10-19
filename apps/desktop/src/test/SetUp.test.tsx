import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACME, ADA, apiError, FRESH, json, MEL, renderApp, stubApi, visited } from "./harness";

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
    let done = false;
    const { calls } = stubApi((method, url) => {
      if (method === "POST" && url === "/api/v1/setup") {
        done = true;
        return json(201, ADA);
      }
      return done && url === "/api/v1/branding" ? json(200, ACME) : null;
    }, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn();
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/setup"));
    expect(calls.find((c) => c.url === "/api/v1/setup")?.body).toEqual({
      org_name: "Acme Pty Ltd", display_name: "Ada Admin", username: "ada", password: "correct horse battery" });
    // the branding is the API's, asked for once first run is done
    const setup = calls.findIndex((c) => c.url === "/api/v1/setup");
    expect(calls.slice(setup).some((c) => c.method === "GET" && c.url === "/api/v1/branding")).toBe(true);
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

  it("sends someone signed in who isn't an admin home", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/setup");
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/setup"));
    // never by way of Settings, which isn't theirs
    expect(visited.filter((p) => p.startsWith("/settings"))).toEqual([]);
  });

  it("offers another try when Simple Docs can't be reached", async () => {
    stubApi((_method, url) => {
      if (url === "/api/v1/branding") throw new TypeError("Failed to fetch");
      return null;
    });
    renderApp("/setup");
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Simple Docs right now.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Organisation")).toBeNull();
  });

  it("goes to sign in when someone else finished first run first", async () => {
    let done = false;
    stubApi((_method, url) => {
      if (url === "/api/v1/setup") {
        done = true;
        return apiError(409, "already_set_up", "Simple Docs is already set up. Sign in instead.");
      }
      if (url === "/api/v1/branding" && done) return json(200, ACME);
      return null;
    }, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn();
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("says what is wrong when the API names a field this page doesn't have", async () => {
    stubApi((_method, url) => url === "/api/v1/setup"
      ? apiError(422, "invalid", "Something in that isn't right.", { colour: "Not a colour." }) : null,
    { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something in that isn't right.");
  });
});
