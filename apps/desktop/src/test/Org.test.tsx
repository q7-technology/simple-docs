import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Org } from "../api/types";
import { ACME, ADA, apiError, FRESH, json, renderApp, stubApi, type Handler } from "./harness";

const ORG: Org = {
  name: "Acme Pty Ltd", abn: "51 824 753 556", phone: null, email: "office@acme.com.au",
  address: "1 Collins Street\nMelbourne VIC 3000", logo_id: null,
};

function orgApi(extra: Handler = () => null, branding = ACME) {
  return stubApi(async (method, url, body) => {
    const answer = await extra(method, url, body);
    if (answer) return answer;
    if (method === "GET" && url === "/api/v1/settings/org") return json(200, { ...ORG, logo_id: branding.logo_id });
    return null;
  }, { branding });
}

describe("Settings → Organisation", () => {
  it("shows the organisation's details", async () => {
    orgApi();
    renderApp("/settings/org");
    expect(await screen.findByLabelText("Name")).toHaveValue("Acme Pty Ltd");
    expect(screen.getByLabelText("ABN")).toHaveValue("51 824 753 556");
    expect(screen.getByLabelText("Phone")).toHaveValue("");
    expect(screen.getByLabelText("Address")).toHaveValue("1 Collins Street\nMelbourne VIC 3000");
    expect(screen.getByRole("link", { name: "Organisation" })).toHaveAttribute("href", "/settings/org");
  });

  it("saves them, and the new name shows everywhere", async () => {
    const { calls } = orgApi((method, url, body) => method === "PUT" && url === "/api/v1/settings/org"
      ? json(200, { ...ORG, ...(body as object) }) : null);
    renderApp("/settings/org");
    await userEvent.type(await screen.findByLabelText("Phone"), "03 9000 0000");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ name: "Acme Pty Ltd", phone: "03 9000 0000" });
    expect(calls.filter((c) => c.url === "/api/v1/branding")).toHaveLength(2);
  });

  it("shows an ABN the API refuses beside the field", async () => {
    orgApi((method) => method === "PUT"
      ? apiError(422, "invalid", "That isn't a valid ABN. Check the 11 digits.",
                 { abn: "That isn't a valid ABN. Check the 11 digits." }) : null);
    renderApp("/settings/org");
    await userEvent.click(await screen.findByRole("button", { name: "Save details" }));
    expect(await screen.findByText("That isn't a valid ABN. Check the 11 digits.")).toBeInTheDocument();
    expect(screen.getByLabelText("ABN")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("ABN")).toHaveFocus();
  });

  it("uploads a logo as it is", async () => {
    const { calls } = orgApi((method, url) => method === "PUT" && url === "/api/v1/settings/org/logo"
      ? new Response(null, { status: 204 }) : null);
    renderApp("/settings/org");
    const logo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });
    await userEvent.upload(await screen.findByLabelText("Upload logo"), logo);
    expect(await screen.findByRole("status")).toHaveTextContent("Logo updated.");
    const sent = calls.find((c) => c.url === "/api/v1/settings/org/logo");
    expect(sent?.body).toBe(logo);
    expect(sent?.headers.get("Content-Type")).toBe("image/png");
  });

  it("refuses a logo over 512 KB before sending it", async () => {
    const { calls } = orgApi();
    renderApp("/settings/org");
    const big = new File([new Uint8Array(512 * 1024 + 1)], "big.png", { type: "image/png" });
    await userEvent.upload(await screen.findByLabelText("Upload logo"), big);
    expect(await screen.findByRole("alert")).toHaveTextContent("The logo can be 512 KB at most.");
    expect(calls.some((c) => c.url === "/api/v1/settings/org/logo")).toBe(false);
  });

  it("removes the logo", async () => {
    let removed = false;
    const { calls } = orgApi((method, url) => {
      if (method === "DELETE" && url === "/api/v1/settings/org/logo") {
        removed = true;
        return new Response(null, { status: 204 });
      }
      if (removed && url === "/api/v1/branding") return json(200, ACME);
      return null;
    }, { ...ACME, logo_id: "logo-1" });
    renderApp("/settings/org");
    await userEvent.click(await screen.findByRole("button", { name: "Remove logo" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Logo removed.");
    // the Remove button has gone, so focus goes to the way to add one again
    expect(screen.getByLabelText("Upload logo")).toHaveFocus();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("is where first run ends", async () => {
    stubApi((method, url) => {
      if (method === "POST" && url === "/api/v1/setup") return json(201, ADA);
      if (url === "/api/v1/settings/org") return json(200, ORG);
      return null;
    }, { me: null, branding: FRESH });
    renderApp("/setup");
    await userEvent.type(await screen.findByLabelText("Organisation"), "Acme Pty Ltd");
    await userEvent.type(screen.getByLabelText("Your name"), "Ada Admin");
    await userEvent.type(screen.getByLabelText("Username"), "ada");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
    await userEvent.type(screen.getByLabelText("Password again"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Set up Simple Docs" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/settings/org"));
  });
});
