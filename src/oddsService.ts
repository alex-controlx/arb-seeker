// The-Odds-API Integration Service

import type { OddsApiResponse, OddsApiEvent } from './types.ts';
import { isActiveHours } from './config.ts';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
const REGIONS = ['au']; // Australian bookmakers
const MARKETS = ['h2h']; // Head-to-head markets

export interface FetchOddsOptions {
  sportKey: string;
  regions?: string[];
  markets?: string[];
  dateFormat?: string;
}

/**
 * Custom error for quota exhaustion
 */
export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExhaustedError';
  }
}

/**
 * Fetch odds from The-Odds-API
 * Only fetches games starting in the next 24 hours
 */
export async function fetchOdds(
  apiKey: string,
  options: FetchOddsOptions,
): Promise<OddsApiEvent[]> {
  const { sportKey, regions = REGIONS, markets = MARKETS } = options;

  // Check active hours filter
  if (!isActiveHours(sportKey)) {
    console.log(`Skipping ${sportKey} - outside active hours`);
    return [];
  }

  const regionsParam = regions.join(',');
  const marketsParam = markets.join(',');
  const url = `${ODDS_API_BASE_URL}/sports/${sportKey}/odds?regions=${regionsParam}&markets=${marketsParam}&apiKey=${apiKey}&dateFormat=iso`;

  try {
    const response = await fetch(url);
    
    // Check for quota exhaustion before checking response.ok
    const requestsRemaining = response.headers.get('x-requests-remaining');
    if (response.status === 429 || requestsRemaining === '0' || requestsRemaining === null) {
      throw new QuotaExhaustedError('ODDS API quota exhausted');
    }
    
    if (!response.ok) {
      // 404 means sport key doesn't exist - log and return empty array
      if (response.status === 404) {
        console.log(`Sport key '${sportKey}' not found in The-Odds-API`);
        return [];
      }
      throw new Error(`Odds API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as OddsApiEvent[];

    // Filter to only games starting in next 24 hours
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return data.filter((event) => {
      const startTime = new Date(event.commence_time);
      return startTime >= now && startTime <= tomorrow;
    });
  } catch (error) {
    console.error(`Error fetching odds for ${sportKey}:`, error);
    throw error;
  }
}

/**
 * Parse odds response and extract structured data
 */
export function parseOddsResponse(events: OddsApiEvent[]) {
  return events.map((event) => ({
    eventId: event.id,
    sport: event.sport_title,
    sportKey: event.sport_key,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commenceTime: event.commence_time,
    bookmakers: event.bookmakers.flatMap((bookmaker) =>
      bookmaker.markets.flatMap((market) =>
        market.outcomes.map((outcome) => ({
          bookie: bookmaker.title,
          bookieKey: bookmaker.key,
          market: market.key,
          outcome: outcome.name,
          odds: outcome.price,
          point: outcome.point,
        }))
      )
    ),
  }));
}

