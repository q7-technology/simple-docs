import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Org } from "../api/types";
import { ACME, ADA, apiError, FRESH, json, renderApp, said, stubApi, type Handler } from "./harness";

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

/** The card the Logo heading is in. */
function logoCard() {
  return screen.getByRole("heading", { level: 2, name: "Logo" }).parentElement?.parentElement;
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
    await said("Saved.");
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
    await said("Logo updated.");
    const sent = calls.find((c) => c.url === "/api/v1/settings/org/logo");
    expect(sent?.body).toBe(logo);
    expect(sent?.headers.get("Content-Type")).toBe("image/png");
  });

  it("takes one logo at a time", async () => {
    let letGo: (r: Response) => void = () => {};
    const { calls } = orgApi((method, url) => method === "PUT" && url === "/api/v1/settings/org/logo"
      ? new Promise<Response>((resolve) => { letGo = resolve; }) : null);
    renderApp("/settings/org");
    const picker = await screen.findByLabelText("Upload logo");
    const logo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });
    await userEvent.upload(picker, logo);
    const busy = screen.getByLabelText("Uploading…");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toBeEnabled();
    await userEvent.upload(busy, logo);
    letGo(new Response(null, { status: 204 }));
    await said("Logo updated.");
    expect(calls.filter((c) => c.url === "/api/v1/settings/org/logo")).toHaveLength(1);
    expect(screen.getByLabelText("Upload logo")).not.toHaveAttribute("aria-disabled");
  });

  it("says when the details can't be loaded, and tries again", async () => {
    let failed = false;
    orgApi((method, url) => {
      if (method === "GET" && url === "/api/v1/settings/org" && !failed) {
        failed = true;
        return apiError(500, "internal", "Something broke on our side.");
      }
      return null;
    });
    renderApp("/settings/org");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your organisation's details.");
    expect(screen.queryByText("Loading…")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Name")).toHaveValue("Acme Pty Ltd");
  });

  it("refuses a logo over 512 KB before sending it", async () => {
    const { calls } = orgApi();
    renderApp("/settings/org");
    const big = new File([new Uint8Array(512 * 1024 + 1)], "big.png", { type: "image/png" });
    await userEvent.upload(await screen.findByLabelText("Upload logo"), big);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The logo can be 512 KB at most.");
    // said in the Logo card, beside the picker, not at the top of the page
    expect(logoCard()).toContainElement(alert);
    expect(calls.some((c) => c.url === "/api/v1/settings/org/logo")).toBe(false);
  });

  it("says why the API refused a logo in the Logo card", async () => {
    orgApi((method, url) => method === "PUT" && url === "/api/v1/settings/org/logo"
      ? apiError(422, "invalid", "That isn't a PNG or JPEG we can read.") : null);
    renderApp("/settings/org");
    const logo = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
    await userEvent.upload(await screen.findByLabelText("Upload logo"), logo);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That isn't a PNG or JPEG we can read.");
    expect(logoCard()).toContainElement(alert);
  });

  it("shows the picker's focus ring at once rather than fading it in", async () => {
    orgApi();
    renderApp("/settings/org");
    const label = (await screen.findByLabelText("Upload logo")).closest("label");
    expect(label).toHaveClass("transition-[color,background-color,border-color]");
    expect(label).not.toHaveClass("transition-colors");
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
    await said("Logo removed.");
    // the Remove button has gone, so focus goes to the way to add one again
    expect(screen.getByLabelText("Upload logo")).toHaveFocus();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("is where first run ends", async () => {
    let done = false;
    stubApi((method, url) => {
      if (method === "POST" && url === "/api/v1/setup") {
        done = true;
        return json(201, ADA);
      }
      if (done && url === "/api/v1/branding") return json(200, ACME);
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
