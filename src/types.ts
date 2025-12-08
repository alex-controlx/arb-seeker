// Core data models

export interface ArbOpportunity {
  id: string; // Unique Hash (EventID + MarketType)
  event: string; // e.g. "Lakers vs Celtics"
  sport: string; // e.g. "Basketball"
  startTime: string; // ISO Date

  // The "Back" Side (Bookie)
  bookie: string; // e.g. "Sportsbet"
  bookieOdds: number; // e.g. 2.50
  bookieUrl: string; // Deep Link provided by Odds API
  suggestedStake: number; // Calculated via Grey Man strategy

  // The "Lay" Side (Betfair)
  betfairMarketId: string; // Crucial for automation (e.g., "1.2345678")
  betfairSelectionId: number; // The specific runner ID
  layOdds: number; // e.g. 2.30
  layLiquidity: number; // Available $ to Lay

  // Math
  profitMargin: number; // e.g. 0.04 (4%)
}

// The-Odds-API Response Types
export interface OddsApiResponse {
  success: boolean;
  data: OddsApiEvent[];
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

export interface OddsApiMarket {
  key: string;
  last_update: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

// Betfair API Types
export interface BetfairSessionResponse {
  token: string;
  product: string;
  status: string;
  error?: string;
}

export interface BetfairJsonRpcRequest {
  jsonrpc: string;
  method: string;
  params: Record<string, unknown>;
  id: number;
}

export interface BetfairJsonRpcResponse<T = unknown> {
  jsonrpc: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number;
}

export interface BetfairMarket {
  marketId: string;
  marketName: string;
  totalMatched: number;
  runners: BetfairRunner[];
}

export interface BetfairRunner {
  selectionId: number;
  runnerName: string;
  handicap?: number;
  status: string;
  adjustmentFactor?: number;
  lastPriceTraded?: number;
  totalMatched?: number;
  ex?: {
    availableToBack: BetfairPrice[];
    availableToLay: BetfairPrice[];
  };
}

export interface BetfairPrice {
  price: number;
  size: number;
}

export interface BetfairPlaceOrderRequest extends Record<string, unknown> {
  marketId: string;
  instructions: BetfairInstruction[];
  customerRef?: string;
}

export interface BetfairInstruction {
  selectionId: number;
  handicap?: number;
  limitOrder: {
    size: number;
    price: number;
    persistenceType: 'LAPSE' | 'PERSIST' | 'MARKET_ON_CLOSE';
  };
  orderType: 'LIMIT';
  side: 'BACK' | 'LAY';
}

export interface BetfairPlaceOrderResponse {
  status: 'SUCCESS' | 'FAILURE';
  marketId: string;
  instructionReports: BetfairInstructionReport[];
  errorCode?: string;
}

export interface BetfairInstructionReport {
  status: 'SUCCESS' | 'FAILURE';
  errorCode?: string;
  instruction: BetfairInstruction;
  betId?: string;
  placedDate?: string;
  averagePriceMatched?: number;
  sizeMatched?: number;
}

export interface BetfairAccountFunds {
  availableToBetBalance: number;
  exposure: number;
  retainedCommission: number;
  exposureLimit: number;
  discountRate: number;
  pointsBalance: number;
  wallet: string;
}

// Google Chat Types
export interface GoogleChatCard {
  cardsV2: {
    cardId: string;
    card: {
      header?: {
        title: string;
        subtitle?: string;
        imageUrl?: string;
        imageType?: string;
      };
      sections: GoogleChatSection[];
    };
  };
}

export interface GoogleChatSection {
  header?: string;
  widgets: GoogleChatWidget[];
}

export interface GoogleChatWidget {
  decoratedText?: {
    text: string;
    topLabel?: string;
    bottomLabel?: string;
  };
  buttonList?: {
    buttons: GoogleChatButton[];
  };
}

export interface GoogleChatButton {
  text: string;
  onClick: {
    openLink: {
      url: string;
    };
  };
}

