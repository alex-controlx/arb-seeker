// Betfair Authentication and Session Management

import type { BetfairSessionResponse } from './types.ts';

const BETFAIR_LOGIN_URL = 'https://identitysso.betfair.com/api/login';
const SESSION_KEY = ['betfair', 'session'];
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StoredSession {
  token: string;
  expiresAt: number;
}

export class BetfairAuth {
  private kv: Deno.Kv;
  private appKey: string;
  private username: string;
  private password: string;

  constructor(
    kv: Deno.Kv,
    appKey: string,
    username: string,
    password: string,
  ) {
    this.kv = kv;
    this.appKey = appKey;
    this.username = username;
    this.password = password;
  }

  /**
   * Login to Betfair and get session token
   */
  private async login(): Promise<string> {
    const formData = new URLSearchParams();
    formData.append('username', this.username);
    formData.append('password', this.password);

    const response = await fetch(BETFAIR_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Application': this.appKey,
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Betfair login failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as BetfairSessionResponse;

    if (data.status !== 'SUCCESS' || !data.token) {
      throw new Error(`Betfair login failed: ${data.error || 'Unknown error'}`);
    }

    return data.token;
  }

  /**
   * Get valid session token, refreshing if necessary
   */
  async getSessionToken(): Promise<string> {
    // Try to get existing session
    const stored = await this.kv.get<StoredSession>(SESSION_KEY);

    if (stored.value) {
      const now = Date.now();
      // Refresh if expires within 1 hour
      if (stored.value.expiresAt > now + 60 * 60 * 1000) {
        return stored.value.token;
      }
    }

    // Login to get new token
    const token = await this.login();
    const expiresAt = Date.now() + SESSION_EXPIRY_MS;

    // Store session
    await this.kv.set(SESSION_KEY, {
      token,
      expiresAt,
    } as StoredSession, {
      expireIn: SESSION_EXPIRY_MS,
    });

    return token;
  }

  /**
   * Handle INVALID_SESSION error by refreshing token
   */
  async refreshSession(): Promise<string> {
    // Clear existing session
    await this.kv.delete(SESSION_KEY);

    // Get new token
    return await this.getSessionToken();
  }
}

