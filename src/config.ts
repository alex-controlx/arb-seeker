// Configuration and environment variables

export interface Config {
  oddsApiKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  betfairAppKey: string;
  betfairUsername: string;
  betfairPassword: string;
  greyManMinStake: number;
  greyManMaxStake: number;
  mockMode: boolean;
}

// Smart Polling Configuration
export const POLLING_INTERVALS = {
  TIER_1: 120000, // 2 minutes (NBA, AFL, NRL)
  TIER_2: 600000, // 10 minutes (Cricket, Rugby Union)
  TIER_3: 21600000, // 6 hours (Futures/Outrights)
} as const;

// Sport Keys (corrected for API compatibility)
export const SPORT_KEYS = {
  NBA: 'basketball_nba',
  AFL: 'aussierules_afl', // Note: No underscore in 'aussierules'
  NRL: 'rugbyleague_nrl', // Note: No underscore in 'rugbyleague'
  CRICKET: 'cricket',
  RUGBY_UNION: 'rugbyunion',
} as const;

// Sport Tiers Mapping
export const SPORT_TIERS: Record<string, 'TIER_1' | 'TIER_2' | 'TIER_3'> = {
  [SPORT_KEYS.NBA]: 'TIER_1',
  [SPORT_KEYS.AFL]: 'TIER_1',
  [SPORT_KEYS.NRL]: 'TIER_1',
  [SPORT_KEYS.CRICKET]: 'TIER_2',
  [SPORT_KEYS.RUGBY_UNION]: 'TIER_2',
};

// Active Hours Filter (AEDT timezone)
// Skip scanning when games are typically over
export const ACTIVE_HOURS: Record<string, { start: number; end: number }> = {
  [SPORT_KEYS.NBA]: { start: 8, end: 14 }, // 8 AM - 2 PM AEDT
  [SPORT_KEYS.AFL]: { start: 12, end: 22 }, // 12 PM - 10 PM AEDT
  [SPORT_KEYS.NRL]: { start: 16, end: 22 }, // 4 PM - 10 PM AEDT
  [SPORT_KEYS.CRICKET]: { start: 10, end: 20 }, // 10 AM - 8 PM AEDT
  [SPORT_KEYS.RUGBY_UNION]: { start: 18, end: 23 }, // 6 PM - 11 PM AEDT
};

export function loadConfig(): Config {
  const oddsApiKey = Deno.env.get('ODDS_API_KEY');
  const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID') || '';
  const betfairAppKey = Deno.env.get('BETFAIR_APP_KEY');
  const betfairUsername = Deno.env.get('BETFAIR_USERNAME');
  const betfairPassword = Deno.env.get('BETFAIR_PASSWORD');
  const greyManMinStake = parseInt(Deno.env.get('GREY_MAN_MIN_STAKE') || '280', 10);
  const greyManMaxStake = parseInt(Deno.env.get('GREY_MAN_MAX_STAKE') || '420', 10);
  const mockMode = Deno.env.get('MOCK_MODE') === 'true';

  if (!oddsApiKey) throw new Error('ODDS_API_KEY is required');
  if (!telegramBotToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!telegramChatId) throw new Error('TELEGRAM_CHAT_ID is required');
  if (!betfairAppKey) throw new Error('BETFAIR_APP_KEY is required');
  if (!betfairUsername) throw new Error('BETFAIR_USERNAME is required');
  if (!betfairPassword) throw new Error('BETFAIR_PASSWORD is required');

  return {
    oddsApiKey,
    telegramBotToken,
    telegramChatId,
    betfairAppKey,
    betfairUsername,
    betfairPassword,
    greyManMinStake,
    greyManMaxStake,
    mockMode,
  };
}

/**
 * Check if current time is within Sydney daytime (7am-11pm AEST/AEDT)
 * Accounts for daylight saving time automatically
 */
export function isSydneyDaytime(): boolean {
  const now = new Date();
  // Get Sydney time (handles AEST/AEDT automatically)
  const sydneyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const currentHour = sydneyTime.getHours();
  // 7am (7) to 11pm (23)
  return currentHour >= 7 && currentHour < 23;
}

export function isActiveHours(sportKey: string): boolean {
  const hours = ACTIVE_HOURS[sportKey];
  if (!hours) return true; // Default to active if no hours defined

  const now = new Date();
  const aedtOffset = 11 * 60; // AEDT is UTC+11
  const aedtTime = new Date(now.getTime() + aedtOffset * 60 * 1000);
  const currentHour = aedtTime.getUTCHours();

  // Handle wrap-around (e.g., 22-8 means 22:00 to 08:00 next day)
  if (hours.start > hours.end) {
    return currentHour >= hours.start || currentHour < hours.end;
  }
  return currentHour >= hours.start && currentHour < hours.end;
}

