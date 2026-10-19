import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "../api/types";
import { apiError, json, MEL, renderApp, stubApi, type Handler } from "./harness";

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

describe("Settings → Users", () => {
  it("opens Settings on Users and lists everyone with their role and state", async () => {
    usersApi();
    renderApp("/settings");
    const table = await screen.findByRole("table");
    expect(screen.getByTestId("where")).toHaveTextContent("/settings/users");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Ada Admin", "Mel Grant", "Old Timer"]);
    expect(within(rows[1]).getByText("Locked")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Deactivated")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Mel Grant")).toHaveValue("editor");
  });

  it("adds someone", async () => {
    const { calls } = usersApi((method, url) =>
      method === "POST" && url === "/api/v1/users" ? json(201, USERS[1]) : null);
    renderApp("/settings/users");
    await addSomeone("Kim Lee", "kim", "reviewer", "another long password");
    expect(await screen.findByRole("status")).toHaveTextContent("Kim Lee can sign in now.");
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/users")?.body).toEqual({
      display_name: "Kim Lee", username: "kim", role: "reviewer", password: "another long password" });
  });

  it("shows what is wrong beside the field", async () => {
    usersApi((method, url) => method === "POST" && url === "/api/v1/users"
      ? apiError(422, "invalid", "That username is taken.", { username: "That username is taken." }) : null);
    renderApp("/settings/users");
    const form = await addSomeone("Mel Two", "mel", "editor", "another long password");
    expect(await within(form).findByText("That username is taken.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
  });

  it("changes someone's role", async () => {
    const { calls } = usersApi((method) => method === "PATCH" ? json(200, { ...USERS[1], role: "reviewer" }) : null);
    renderApp("/settings/users");
    await userEvent.selectOptions(await screen.findByLabelText("Role for Mel Grant"), "reviewer");
    expect(await screen.findByRole("status")).toHaveTextContent("Mel Grant is a reviewer now.");
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/v1/users/u-mel", body: { role: "reviewer" } });
  });

  it("deactivates and brings back, but never offers to deactivate you", async () => {
    const { calls } = usersApi((method) => method === "PATCH" ? json(200, USERS[1]) : null);
    renderApp("/settings/users");
    await userEvent.click(await screen.findByRole("button", { name: "Deactivate Mel Grant" }));
    // it asks first, with the answer focused, and sends nothing until then
    const yes = screen.getByRole("button", { name: "Yes, deactivate Mel Grant" });
    expect(yes).toHaveFocus();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await userEvent.click(yes);
    expect(await screen.findByRole("status")).toHaveTextContent("Mel Grant is deactivated");
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: false });
    expect(screen.getByRole("button", { name: "Reactivate Old Timer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate Ada Admin" })).toBeNull();
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Simple Docs needs at least one active admin.");
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
    expect(await screen.findByRole("status")).toHaveTextContent("Mel Grant's password is set.");
    expect(calls.find((c) => c.url === "/api/v1/users/u-mel/password")?.body).toEqual({ password: "a brand new password" });
    expect(screen.queryByRole("form", { name: "New password for Mel Grant" })).toBeNull();
    expect(screen.getByRole("button", { name: "Set password for Mel Grant" })).toHaveFocus();
  });

  it("keeps Settings for admins", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/settings/users");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/documents"));
  });
});
