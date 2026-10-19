import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ADA, apiError, json, MEL, renderApp, stubApi } from "./harness";

async function mainLinks() {
  const nav = await screen.findByRole("navigation", { name: "Main" });
  return within(nav).getAllByRole("link").map((a) => a.textContent);
}

describe("the app shell", () => {
  it("opens on Documents, saying when it arrives", async () => {
    stubApi();
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Documents" })).toBeInTheDocument();
    expect(screen.getByText("Arrives in step 2")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/documents");
  });

  it("gives an admin the design's navbar", async () => {
    stubApi();
    renderApp("/documents");
    expect(await mainLinks()).toEqual(["Documents", "Clients", "Templates", "Spend"]);
    expect(screen.getByRole("link", { name: "Simple Docs" })).toHaveAttribute("href", "/documents");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Ada Admin, Admin: your account" })).toHaveAttribute("href", "/account");
  });

  it("shows an editor only what an editor can open", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/documents");
    expect(await mainLinks()).toEqual(["Documents", "Clients"]);
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("sends an editor away from an admin's page", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/spend");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/documents"));
  });

  it.each([
    { path: "/clients", title: "Clients", step: 2 },
    { path: "/templates", title: "Templates", step: 7 },
    { path: "/spend", title: "Spend", step: 3 },
  ])("says when $path arrives", async ({ path, title, step }) => {
    stubApi();
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(`Arrives in step ${step}`)).toBeInTheDocument();
  });

  it("puts the skip link first", async () => {
    stubApi();
    renderApp("/documents");
    await screen.findByRole("heading", { name: "Documents" });
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
    expect(document.getElementById("main")?.tagName).toBe("MAIN");
  });

  it("signs out and goes back to sign in", async () => {
    const { calls } = stubApi();
    renderApp("/documents");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/v1/auth/sign-out")).toBe(true);
  });

  it("signs out here whatever the API answers", async () => {
    stubApi((_method, url) => url === "/api/v1/auth/sign-out"
      ? apiError(500, "internal", "Something broke on our side.") : null);
    renderApp("/documents");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("keeps you signed in, and says so, when sign-out can't reach Simple Docs", async () => {
    stubApi((_method, url) => {
      if (url === "/api/v1/auth/sign-out") throw new TypeError("Failed to fetch");
      return null;
    });
    renderApp("/documents");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't sign out: Can't reach Simple Docs right now.");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/documents");
  });

  it("moves focus to the new page's heading when you follow a link", async () => {
    stubApi();
    renderApp("/documents");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    await userEvent.click(within(nav).getByRole("link", { name: "Clients" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Clients" })).toHaveFocus();
  });

  it("notices a session ended elsewhere when you move to another page", async () => {
    let asked = 0;
    const { calls } = stubApi((_method, url) => {
      if (url !== "/api/v1/auth/me") return null;
      asked += 1;
      return asked === 1 ? json(200, ADA) : apiError(401, "signed_out", "You're signed out. Sign in again.");
    });
    renderApp("/documents");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    // opening the app asks who you are once, not twice
    expect(calls.filter((c) => c.url === "/api/v1/auth/me")).toHaveLength(1);
    await userEvent.click(within(nav).getByRole("link", { name: "Clients" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("leaves focus alone on the first page", async () => {
    stubApi();
    renderApp("/documents");
    await screen.findByRole("heading", { level: 1, name: "Documents" });
    expect(document.body).toHaveFocus();
  });
});
