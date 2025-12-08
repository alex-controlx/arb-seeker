// Betfair Authentication and Session Management

export class BetfairAuth {
  private kv: Deno.Kv;
  private appKey: string;
  private username: string;
  private password: string;

  constructor(kv: Deno.Kv, appKey: string, username: string, password: string) {
    this.kv = kv;
    this.appKey = appKey;
    this.username = username;
    this.password = password;
  }

  async getSessionToken(): Promise<string> {
    // 1. Check Cache
    const cached = await this.kv.get<string>(["betfair_session"]);
    if (cached.value) {
      // console.log("Using Cached Betfair Token"); 
      return cached.value;
    }

    console.log("🔄 Requesting new Betfair Session...");

    // 2. Prepare Payload (x-www-form-urlencoded)
    const body = new URLSearchParams();
    body.append("username", this.username);
    body.append("password", this.password);
    body.append("login", "true");
    body.append("redirectMethod", "POST");
    body.append("product", "home.betfair.int");
    body.append("url", "https://www.betfair.com.au/");

    // 3. Send Request with "Human" Headers
    const res = await fetch("https://identitysso.betfair.com/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Application": this.appKey,
        "Accept": "application/json",
        // CRITICAL: Spoof a real browser to bypass WAF/Cloudflare
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: body,
    });

    // 4. Handle Response
    const text = await res.text(); // Get raw text first to debug HTML errors
    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      // If parsing fails, it's likely HTML (Access Denied / Cloudflare)
      console.error("❌ Betfair API returned HTML/Invalid JSON. Preview:", text.substring(0, 100));
      throw new Error(`Betfair API Error: Response was not JSON. Status: ${res.status}`);
    }

    if (data.status !== "SUCCESS") {
      throw new Error(`Betfair Login Failed: ${data.error} (Status: ${data.status})`);
    }

    // 5. Cache Token (4 Hours)
    const token = data.token;
    await this.kv.set(["betfair_session"], token, { expireIn: 14400 * 1000 });
    
    return token;
  }

  /**
   * Handle INVALID_SESSION error by refreshing token
   */
  async refreshSession(): Promise<string> {
    // Clear existing session
    await this.kv.delete(["betfair_session"]);

    // Get new token
    return await this.getSessionToken();
  }
}
