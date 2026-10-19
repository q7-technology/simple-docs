import { ApiClient, ApiError, messageOf, Unreachable } from "../api/client";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ApiClient", () => {
  let calls: { url: string; init: RequestInit }[];
  let answers: (Response | Error)[];
  let client: ApiClient;

  beforeEach(() => {
    calls = [];
    answers = [];
    client = new ApiClient(async (url, init) => {
      calls.push({ url, init });
      const a = answers.shift() ?? json(500, { error: { code: "no_answer", message: "no answer queued" } });
      if (a instanceof Error) throw a;
      return a;
    });
  });

  it("asks under /api with the cookie, the header and JSON", async () => {
    answers.push(json(201, { username: "kim" }));
    expect(await client.post("/v1/users", { username: "kim" })).toEqual({ username: "kim" });
    expect(calls[0].url).toBe("/api/v1/users");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.credentials).toBe("same-origin");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("X-Simple-Docs")).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].init.body).toBe('{"username":"kim"}');
  });

  it("sends a file as it is, with its own type", async () => {
    answers.push(new Response(null, { status: 204 }));
    const logo = new Blob(["png"], { type: "image/png" });
    expect(await client.put("/v1/settings/org/logo", logo)).toBeUndefined();
    expect(calls[0].init.body).toBe(logo);
    expect(new Headers(calls[0].init.headers).get("Content-Type")).toBe("image/png");
  });

  it("gives the API's code, message and fields", async () => {
    answers.push(json(422, { error: { code: "invalid", message: "That username is taken.",
                                      fields: { username: "That username is taken." } } }));
    const e = (await client.post("/v1/users", {}).catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.message]).toEqual([422, "invalid", "That username is taken."]);
    expect(e.fields).toEqual({ username: "That username is taken." });
  });

  it("says so when the session has ended", async () => {
    const signedOut = vi.fn();
    client.onSignedOut = signedOut;
    answers.push(json(401, { error: { code: "signed_out", message: "You're signed out. Sign in again." } }));
    await expect(client.get("/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(signedOut).toHaveBeenCalledOnce();
  });

  it("doesn't take a wrong password for an ended session", async () => {
    const signedOut = vi.fn();
    client.onSignedOut = signedOut;
    answers.push(json(401, { error: { code: "wrong_password", message: "Wrong username or password." } }));
    await expect(client.post("/v1/auth/sign-in", {})).rejects.toThrow("Wrong username or password.");
    expect(signedOut).not.toHaveBeenCalled();
  });

  it("doesn't take a lock on changing your own password for an ended session", async () => {
    const signedOut = vi.fn();
    client.onSignedOut = signedOut;
    answers.push(json(401, { error: { code: "locked",
                                      message: "Too many wrong passwords. Try again in 15 minutes." } }));
    const e = (await client.post("/v1/auth/password", {}).catch((x) => x)) as ApiError;
    expect([e.status, e.code]).toEqual([401, "locked"]);
    expect(signedOut).not.toHaveBeenCalled();
  });

  it("says Simple Docs can't be reached when there is no proper answer", async () => {
    answers.push(new TypeError("Failed to fetch"));
    await expect(client.get("/v1/health")).rejects.toBeInstanceOf(Unreachable);
    answers.push(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(client.get("/v1/health")).rejects.toThrow("Can't reach Simple Docs right now.");
  });

  it("puts any trouble into words", () => {
    expect(messageOf(new ApiError(409, "last_admin", "Make someone else an admin first."))).toBe(
      "Make someone else an admin first.");
    expect(messageOf(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});
