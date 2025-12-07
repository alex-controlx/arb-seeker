// Mock data for testing

import type { ArbOpportunity } from './types.ts';
import type { OddsApiEvent } from './types.ts';
import type { BetfairMarket, BetfairRunner } from './types.ts';

/**
 * Generate a perfect mock arbitrage opportunity
 * Sportsbet 2.50 / Betfair 2.30
 */
export function generateMockArb(): ArbOpportunity {
  // Use timestamp to ensure unique ID each time in mock mode
  const timestamp = Date.now();
  return {
    id: `mock_arb_${timestamp}`,
    event: 'Lakers vs Celtics',
    sport: 'Basketball',
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
    bookie: 'Sportsbet',
    bookieOdds: 2.50,
    bookieUrl: 'https://www.sportsbet.com.au/bet/mock-event',
    suggestedStake: 315, // Grey Man stake (not divisible by 50 or 100)
    betfairMarketId: '1.234567890',
    betfairSelectionId: 12345,
    layOdds: 2.30,
    layLiquidity: 1100, // Enough to cover max stake (420 * 2.50 = 1050)
    profitMargin: (2.50 - 2.30) / 2.30, // ~8.7%
  };
}

/**
 * Generate mock The-Odds-API response
 */
export function mockOddsResponse(): OddsApiEvent[] {
  return [
    {
      id: 'mock_event_001',
      sport_key: 'basketball_nba',
      sport_title: 'Basketball',
      commence_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      home_team: 'Lakers',
      away_team: 'Celtics',
      bookmakers: [
        {
          key: 'sportsbet',
          title: 'Sportsbet',
          last_update: new Date().toISOString(),
          markets: [
            {
              key: 'h2h',
              last_update: new Date().toISOString(),
              outcomes: [
                {
                  name: 'Lakers',
                  price: 2.50,
                },
                {
                  name: 'Celtics',
                  price: 1.60,
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

/**
 * Generate mock Betfair market response
 */
export function mockBetfairMarket(): BetfairMarket {
  const runner: BetfairRunner = {
    selectionId: 12345,
    runnerName: 'Lakers',
    status: 'ACTIVE',
    ex: {
      availableToBack: [
        { price: 2.40, size: 500 },
      ],
      availableToLay: [
        { price: 2.30, size: 1000 },
      ],
    },
  };

  return {
    marketId: '1.234567890',
    marketName: 'Lakers vs Celtics',
    totalMatched: 50000,
    runners: [runner],
  };
}

/**
 * Mock Betfair place order response (success)
 */
export function mockBetfairPlaceOrderSuccess() {
  return {
    status: 'SUCCESS',
    marketId: '1.234567890',
    instructionReports: [
      {
        status: 'SUCCESS',
        betId: 'mock_bet_12345',
        instruction: {
          selectionId: 12345,
          limitOrder: {
            size: 100,
            price: 2.30,
            persistenceType: 'LAPSE' as const,
          },
          orderType: 'LIMIT' as const,
          side: 'LAY' as const,
        },
        placedDate: new Date().toISOString(),
        averagePriceMatched: 2.30,
        sizeMatched: 100,
      },
    ],
  };
}

