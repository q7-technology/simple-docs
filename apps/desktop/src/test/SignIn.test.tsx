import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACME, apiError, json, MEL, renderApp, stubApi } from "./harness";

async function signInAs(username: string, password: string) {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("signing in", () => {
  it("sends someone signed out to sign in, under the organisation's name", async () => {
    stubApi(undefined, { me: null });
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Acme Pty Ltd on Simple Docs")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/sign-in");
  });

  it("signs someone in with their username and password", async () => {
    const { calls } = stubApi((method, url) =>
      method === "POST" && url === "/api/v1/auth/sign-in" ? json(200, MEL) : null, { me: null });
    renderApp("/sign-in");
    await signInAs("mel", "correct horse battery");
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/sign-in"));
    expect(calls.find((c) => c.url === "/api/v1/auth/sign-in")?.body).toEqual({
      username: "mel", password: "correct horse battery" });
  });

  it("says plainly why not", async () => {
    stubApi((_method, url) => url === "/api/v1/auth/sign-in"
      ? apiError(401, "locked", "Too many wrong passwords. Try again in 15 minutes.") : null, { me: null });
    renderApp("/sign-in");
    await signInAs("mel", "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong passwords. Try again in 15 minutes.");
    expect(screen.getByTestId("where")).toHaveTextContent("/sign-in");
  });

  it("shows the organisation's logo when it has one", async () => {
    stubApi(undefined, { me: null, branding: { ...ACME, logo_id: "logo-1" } });
    const { container } = renderApp("/sign-in");
    await screen.findByRole("heading", { name: "Sign in" });
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/branding/logo?v=logo-1");
  });

  it("sends someone already signed in onwards", async () => {
    stubApi();
    renderApp("/sign-in");
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/sign-in"));
  });

  it("offers another try when Simple Docs can't be reached", async () => {
    let down = true;
    stubApi((_method, url) => {
      if (url === "/api/v1/branding" && down) throw new TypeError("Failed to fetch");
      return null;
    });
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Simple Docs right now.");
    down = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
