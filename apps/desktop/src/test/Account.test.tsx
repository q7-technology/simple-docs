import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiError, MEL, renderApp, stubApi } from "./harness";

async function change(current: string, next: string, again = next) {
  const form = await screen.findByRole("form", { name: "Change your password" });
  await userEvent.type(within(form).getByLabelText("Current password"), current);
  await userEvent.type(within(form).getByLabelText("New password"), next);
  await userEvent.type(within(form).getByLabelText("New password again"), again);
  await userEvent.click(within(form).getByRole("button", { name: "Change password" }));
  return form;
}

describe("your account", () => {
  it("says who you are", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/account");
    expect(await screen.findByRole("heading", { level: 1, name: "Your account" })).toBeInTheDocument();
    expect(screen.getByText("Signed in as mel, an editor.")).toBeInTheDocument();
  });

  it("changes your password with the current one", async () => {
    const { calls } = stubApi((method, url) => method === "POST" && url === "/api/v1/auth/password"
      ? new Response(null, { status: 204 }) : null, { me: MEL });
    renderApp("/account");
    const form = await change("correct horse battery", "a brand new password");
    expect(await screen.findByText(/^Password changed\./)).toBeInTheDocument();
    expect(screen.getByText(/^Password changed\./).closest("[role=status]")).not.toBeNull();
    expect(calls.find((c) => c.url === "/api/v1/auth/password")?.body).toEqual({
      current_password: "correct horse battery", new_password: "a brand new password" });
    expect(within(form).getByLabelText("Current password")).toHaveValue("");
    expect(within(form).getByLabelText("New password")).toHaveValue("");
    expect(within(form).getByLabelText("New password again")).toHaveValue("");
  });

  it("asks the browser for the current password and a new one", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/account");
    const form = await screen.findByRole("form", { name: "Change your password" });
    expect(within(form).getByLabelText("Current password")).toHaveAttribute("autocomplete", "current-password");
    expect(within(form).getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(within(form).getByLabelText("New password again")).toHaveAttribute("autocomplete", "new-password");
  });

  it("shows a wrong current password beside its field", async () => {
    stubApi((_method, url) => url === "/api/v1/auth/password"
      ? apiError(422, "invalid", "That isn't your current password.",
                 { current_password: "That isn't your current password." }) : null, { me: MEL });
    renderApp("/account");
    const form = await change("nope", "a brand new password");
    expect(await within(form).findByText("That isn't your current password.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows what is wrong with the new password beside its field", async () => {
    stubApi((_method, url) => url === "/api/v1/auth/password"
      ? apiError(422, "invalid", "Choose a password you aren't using now.",
                 { new_password: "Choose a password you aren't using now." }) : null, { me: MEL });
    renderApp("/account");
    const form = await change("correct horse battery", "correct horse battery");
    expect(await within(form).findByText("Choose a password you aren't using now.")).toBeInTheDocument();
    expect(within(form).getByLabelText("New password")).toHaveAttribute("aria-invalid", "true");
  });

  it("says when too many wrong tries have locked it, and keeps you here", async () => {
    stubApi((_method, url) => url === "/api/v1/auth/password"
      ? apiError(401, "locked", "Too many wrong passwords. Try again in 15 minutes.") : null, { me: MEL });
    renderApp("/account");
    await change("nope", "a brand new password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong passwords. Try again in 15 minutes.");
    expect(screen.getByTestId("where")).toHaveTextContent("/account");
    expect(screen.getByRole("form", { name: "Change your password" })).toBeInTheDocument();
  });

  it("checks the new passwords match before sending anything", async () => {
    const { calls } = stubApi(undefined, { me: MEL });
    renderApp("/account");
    await change("correct horse battery", "a brand new password", "a different one entirely");
    expect(await screen.findByText("The new passwords don't match.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/v1/auth/password")).toBe(false);
  });
});
