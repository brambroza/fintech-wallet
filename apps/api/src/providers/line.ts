/** Verifies a LIFF/LINE Login ID token and returns the LINE user id. */
export interface LineVerifier {
  verify(idToken: string): Promise<{ sub: string; name?: string } | null>;
}

/** Real verification via LINE's endpoint (https://developers.line.biz/en/reference/line-login/#verify-id-token). */
export class LineApiVerifier implements LineVerifier {
  constructor(private channelId: string) {}
  async verify(idToken: string) {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: this.channelId }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { sub?: string; name?: string };
    return j.sub ? { sub: j.sub, name: j.name } : null;
  }
}

/** Sandbox: accepts tokens of the form "sandbox:<lineUserId>" so the LIFF flow can be tested without LINE. */
export class SandboxLineVerifier implements LineVerifier {
  async verify(idToken: string) {
    const m = /^sandbox:([A-Za-z0-9_-]{4,64})$/.exec(idToken);
    return m ? { sub: m[1], name: "LINE sandbox" } : null;
  }
}
