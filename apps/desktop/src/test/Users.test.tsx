import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "../api/types";
import { ADA, apiError, json, MEL, renderApp, said, stubApi, type Handler } from "./harness";

const USERS: User[] = [
  { id: "u-ada", username: "ada", display_name: "Ada Admin", role: "admin", active: true, locked: false,
    last_sign_in_at: "2026-10-19T09:00:00Z", created_at: "2026-10-19T08:00:00Z" },
  { id: "u-mel", username: "mel", display_name: "Mel Grant", role: "editor", active: true, locked: true,
    last_sign_in_at: null, created_at: "2026-10-19T08:10:00Z" },
  { id: "u-old", username: "old", display_name: "Old Timer", role: "reviewer", active: false, locked: false,
    last_sign_in_at: null, created_at: "2026-10-19T08:20:00Z" },
];

function usersApi(extra: Handler = () => null) {
  return stubApi(async (method, url, body) => {
    const answer = await extra(method, url, body);
    if (answer) return answer;
    if (method === "GET" && url === "/api/v1/users") return json(200, { items: USERS });
    return null;
  });
}

async function addSomeone(name: string, username: string, role: string, password: string) {
  const form = await screen.findByRole("form", { name: "Add someone" });
  await userEvent.type(within(form).getByLabelText("Name"), name);
  await userEvent.type(within(form).getByLabelText("Username"), username);
  await userEvent.selectOptions(within(form).getByLabelText("Role"), role);
  await userEvent.type(within(form).getByLabelText("Password"), password);
  await userEvent.click(within(form).getByRole("button", { name: "Add" }));
  return form;
}

/** An answer held back until the test lets it go. */
function later() {
  let letGo: (r: Response) => void = () => {};
  const answer = new Promise<Response>((resolve) => {
    letGo = resolve;
  });
  return { answer, letGo: (r: Response) => letGo(r) };
}

describe("Settings → Users", () => {
  it("opens Settings on Users and lists everyone with their role and state", async () => {
    usersApi();
    renderApp("/settings");
    const table = await screen.findByRole("table", { name: "People who sign in" });
    expect(screen.getByTestId("where")).toHaveTextContent("/settings/users");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Ada Admin", "Mel Grant", "Old Timer"]);
    expect(within(rows[1]).getByText("Locked")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Deactivated")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Mel Grant")).toHaveValue("editor");
  });

  it("scrolls the table inside its card, with the card's words for screen readers kept there too", async () => {
    usersApi();
    renderApp("/settings/users");
    const table = await screen.findByRole("table", { name: "People who sign in" });
    // sr-only text is absolute: without a positioned scroller it is placed
    // against the page and widens it on a narrow window
    expect(table.parentElement).toHaveClass("relative", "overflow-x-auto");
  });

  it("says when the list can't be loaded, and tries again", async () => {
    let failed = false;
    usersApi((method, url) => {
      if (method === "GET" && url === "/api/v1/users" && !failed) {
        failed = true;
        return apiError(500, "internal", "Something broke on our side.");
      }
      return null;
    });
    renderApp("/settings/users");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the people who sign in.");
    expect(screen.queryByText("Loading…")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "People who sign in" })).toBeInTheDocument();
  });

  it("adds someone", async () => {
    const { calls } = usersApi((method, url) =>
      method === "POST" && url === "/api/v1/users" ? json(201, USERS[1]) : null);
    renderApp("/settings/users");
    await addSomeone("Kim Lee", "kim", "reviewer", "another long password");
    await said("Kim Lee can sign in now.");
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/users")?.body).toEqual({
      display_name: "Kim Lee", username: "kim", role: "reviewer", password: "another long password" });
  });

  it("adds someone once, however quickly Add is clicked twice", async () => {
    const held = later();
    const { calls } = usersApi((method, url) =>
      method === "POST" && url === "/api/v1/users" ? held.answer : null);
    renderApp("/settings/users");
    const form = await screen.findByRole("form", { name: "Add someone" });
    await userEvent.type(within(form).getByLabelText("Name"), "Kim Lee");
    await userEvent.type(within(form).getByLabelText("Username"), "kim");
    await userEvent.type(within(form).getByLabelText("Password"), "another long password");
    await userEvent.dblClick(within(form).getByRole("button", { name: "Add" }));
    expect(within(form).getByRole("button", { name: "Adding…" })).toBeDisabled();
    held.letGo(json(201, USERS[1]));
    await said("Kim Lee can sign in now.");
    expect(calls.filter((c) => c.method === "POST" && c.url === "/api/v1/users")).toHaveLength(1);
  });

  it("shows what is wrong beside the field", async () => {
    usersApi((method, url) => method === "POST" && url === "/api/v1/users"
      ? apiError(422, "invalid", "That username is taken.", { username: "That username is taken." }) : null);
    renderApp("/settings/users");
    const form = await addSomeone("Mel Two", "mel", "editor", "another long password");
    expect(await within(form).findByText("That username is taken.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(within(form).getByLabelText("Username")).toHaveFocus();
  });

  it("changes someone's role", async () => {
    const { calls } = usersApi((method) => method === "PATCH" ? json(200, { ...USERS[1], role: "reviewer" }) : null);
    renderApp("/settings/users");
    await userEvent.selectOptions(await screen.findByLabelText("Role for Mel Grant"), "reviewer");
    await said("Mel Grant is a reviewer now.");
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/v1/users/u-mel", body: { role: "reviewer" } });
  });

  it("shows the new role while it saves, and sends one change at a time", async () => {
    const held = later();
    const { calls } = usersApi((method) => method === "PATCH" ? held.answer : null);
    renderApp("/settings/users");
    const select = await screen.findByLabelText("Role for Mel Grant");
    await userEvent.selectOptions(select, "reviewer");
    expect(select).toHaveValue("reviewer");
    expect(select).toBeEnabled();
    expect(select.closest("tr")).toHaveAttribute("aria-busy", "true");
    await userEvent.selectOptions(select, "admin");
    expect(select).toHaveValue("reviewer");
    held.letGo(json(200, { ...USERS[1], role: "reviewer" }));
    await said("Mel Grant is a reviewer now.");
    await waitFor(() => expect(select.closest("tr")).not.toHaveAttribute("aria-busy"));
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
  });

  it("asks before you give up admin, and then takes you out of Settings", async () => {
    let demoted = false;
    const { calls } = usersApi((method, url) => {
      if (method === "PATCH" && url === "/api/v1/users/u-ada") {
        demoted = true;
        return json(200, { ...USERS[0], role: "editor" });
      }
      if (demoted && url === "/api/v1/auth/me") return json(200, { ...ADA, role: "editor", scopes: MEL.scopes });
      return null;
    });
    renderApp("/settings/users");
    await userEvent.selectOptions(await screen.findByLabelText("Role for Ada Admin"), "editor");
    expect(screen.getByRole("group", { name: "You'll lose Settings. Change your role?" })).toBeInTheDocument();
    const yes = screen.getByRole("button", { name: "Yes, change my role" });
    expect(yes).toHaveFocus();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await userEvent.click(yes);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/documents"));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ role: "editor" });
    // who you are is asked again; the list isn't
    expect(calls.filter((c) => c.url === "/api/v1/users")).toHaveLength(1);
  });

  it("keeps you an admin if you think better of it", async () => {
    const { calls } = usersApi();
    renderApp("/settings/users");
    await userEvent.selectOptions(await screen.findByLabelText("Role for Ada Admin"), "reviewer");
    await userEvent.click(screen.getByRole("button", { name: "Keep admin" }));
    expect(screen.getByLabelText("Role for Ada Admin")).toHaveValue("admin");
    expect(screen.getByLabelText("Role for Ada Admin")).toHaveFocus();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("deactivates and brings back, keeping focus in the row, but never offers to deactivate you", async () => {
    let people = USERS;
    const { calls } = stubApi((method, url, body) => {
      if (method === "GET" && url === "/api/v1/users") return json(200, { items: people });
      if (method === "PATCH") {
        const id = url.split("/").pop();
        people = people.map((u) => (u.id === id ? { ...u, ...(body as object) } : u));
        return json(200, people.find((u) => u.id === id));
      }
      return null;
    });
    renderApp("/settings/users");
    await userEvent.click(await screen.findByRole("button", { name: "Deactivate Mel Grant" }));
    // it asks first, with the answer focused, and sends nothing until then
    const yes = screen.getByRole("button", { name: "Yes, deactivate Mel Grant" });
    expect(yes).toHaveFocus();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await userEvent.click(yes);
    await said("Mel Grant is deactivated");
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: false });
    await waitFor(() => expect(screen.getByRole("button", { name: "Reactivate Mel Grant" })).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Deactivate Ada Admin" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Reactivate Old Timer" }));
    await said("Old Timer can sign in again.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Deactivate Old Timer" })).toHaveFocus());
  });

  it("lets you think better of deactivating, and puts you back where you were", async () => {
    const { calls } = usersApi();
    renderApp("/settings/users");
    const deactivate = await screen.findByRole("button", { name: "Deactivate Mel Grant" });
    await userEvent.click(deactivate);
    await userEvent.click(screen.getByRole("button", { name: "Keep Mel Grant" }));
    expect(screen.getByRole("button", { name: "Deactivate Mel Grant" })).toHaveFocus();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("says why the last admin can't step down", async () => {
    usersApi((method) => method === "PATCH"
      ? apiError(409, "last_admin", "Simple Docs needs at least one active admin. Make someone else an admin first.")
      : null);
    renderApp("/settings/users");
    await userEvent.selectOptions(await screen.findByLabelText("Role for Ada Admin"), "editor");
    await userEvent.click(screen.getByRole("button", { name: "Yes, change my role" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Simple Docs needs at least one active admin.");
    expect(screen.getByLabelText("Role for Ada Admin")).toHaveValue("admin");
  });

  it("sets someone's password", async () => {
    const { calls } = usersApi((method, url) =>
      method === "POST" && url === "/api/v1/users/u-mel/password" ? new Response(null, { status: 204 }) : null);
    renderApp("/settings/users");
    await userEvent.click(await screen.findByRole("button", { name: "Set password for Mel Grant" }));
    const form = screen.getByRole("form", { name: "New password for Mel Grant" });
    expect(within(form).getByLabelText("New password")).toHaveFocus();
    await userEvent.type(within(form).getByLabelText("New password"), "a brand new password");
    await userEvent.click(within(form).getByRole("button", { name: "Save password" }));
    await said("Mel Grant's password is set.");
    expect(calls.find((c) => c.url === "/api/v1/users/u-mel/password")?.body).toEqual({ password: "a brand new password" });
    expect(screen.queryByRole("form", { name: "New password for Mel Grant" })).toBeNull();
    expect(screen.getByRole("button", { name: "Set password for Mel Grant" })).toHaveFocus();
  });

  it("says trouble that isn't about the password in a notice, not beside the field", async () => {
    usersApi((method, url) => method === "POST" && url === "/api/v1/users/u-mel/password"
      ? apiError(404, "not_found", "That person isn't in Simple Docs any more.") : null);
    renderApp("/settings/users");
    await userEvent.click(await screen.findByRole("button", { name: "Set password for Mel Grant" }));
    const form = screen.getByRole("form", { name: "New password for Mel Grant" });
    await userEvent.type(within(form).getByLabelText("New password"), "a brand new password");
    await userEvent.click(within(form).getByRole("button", { name: "Save password" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("That person isn't in Simple Docs any more.");
    expect(within(form).getByLabelText("New password")).not.toHaveAttribute("aria-invalid");
  });

  it("sends you to your account page for your own password", async () => {
    usersApi();
    renderApp("/settings/users");
    await screen.findByRole("table", { name: "People who sign in" });
    expect(screen.queryByRole("button", { name: "Set password for Ada Admin" })).toBeNull();
    expect(screen.getByRole("link", { name: /Change it on your account page/ })).toHaveAttribute("href", "/account");
  });

  it("keeps Settings for admins", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/settings/users");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/documents"));
  });
});
