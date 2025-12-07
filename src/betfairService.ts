// Betfair Service - Market operations and lay betting

import { BetfairAuth } from './betfairAuth.ts';
import type {
  BetfairJsonRpcRequest,
  BetfairJsonRpcResponse,
  BetfairAccountFunds,
  BetfairPlaceOrderRequest,
  BetfairPlaceOrderResponse,
  BetfairInstruction,
} from './types.ts';
import { calculateLayStake } from './utils.ts';

const BETFAIR_API_URL = 'https://api.betfair.com/exchange/betting/json-rpc/v1';
const BETFAIR_ACCOUNT_URL = 'https://api.betfair.com/exchange/account/json-rpc/v1';

export interface LayBetResult {
  status: 'SUCCESS' | 'FAILED';
  betId?: string;
  error?: string;
}

export class BetfairService {
  private auth: BetfairAuth;
  private appKey: string;

  constructor(auth: BetfairAuth, appKey: string) {
    this.auth = auth;
    this.appKey = appKey;
  }

  /**
   * Make a JSON-RPC request to Betfair API
   */
  private async makeRequest<T>(
    url: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const sessionToken = await this.auth.getSessionToken();

    const request: BetfairJsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Application': this.appKey,
        'X-Authentication': sessionToken,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Betfair API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as BetfairJsonRpcResponse<T>;

    // Handle INVALID_SESSION
    if (data.error?.message?.includes('INVALID_SESSION')) {
      await this.auth.refreshSession();
      // Retry once
      return this.makeRequest<T>(url, method, params);
    }

    if (data.error) {
      throw new Error(`Betfair API error: ${data.error.message}`);
    }

    if (!data.result) {
      throw new Error('Betfair API returned no result');
    }

    return data.result;
  }

  /**
   * Get account funds/balance
   */
  async getAccountFunds(): Promise<BetfairAccountFunds> {
    return await this.makeRequest<BetfairAccountFunds>(
      BETFAIR_ACCOUNT_URL,
      'getAccountFunds',
      {},
    );
  }

  /**
   * Place a lay bet on Betfair
   */
  async placeLayBet(
    marketId: string,
    selectionId: number,
    liabilityNeeded: number,
    layOdds: number,
  ): Promise<LayBetResult> {
    try {
      // Calculate lay stake
      const layStake = calculateLayStake(liabilityNeeded, layOdds);

      // Check account balance
      const funds = await this.getAccountFunds();
      if (funds.availableToBetBalance < liabilityNeeded) {
        return {
          status: 'FAILED',
          error: `Insufficient balance: need $${liabilityNeeded.toFixed(2)}, have $${funds.availableToBetBalance.toFixed(2)}`,
        };
      }

      // Build instruction
      const instruction: BetfairInstruction = {
        selectionId,
        limitOrder: {
          size: layStake,
          price: layOdds,
          persistenceType: 'LAPSE',
        },
        orderType: 'LIMIT',
        side: 'LAY',
      };

      const request: BetfairPlaceOrderRequest = {
        marketId,
        instructions: [instruction],
      };

      const result = await this.makeRequest<BetfairPlaceOrderResponse>(
        BETFAIR_API_URL,
        'placeOrders',
        request,
      );

      if (result.status === 'SUCCESS' && result.instructionReports.length > 0) {
        const report = result.instructionReports[0];
        if (report.status === 'SUCCESS' && report.betId) {
          return {
            status: 'SUCCESS',
            betId: report.betId,
          };
        } else {
          return {
            status: 'FAILED',
            error: report.errorCode || 'Unknown error placing bet',
          };
        }
      }

      return {
        status: 'FAILED',
        error: result.errorCode || 'Failed to place bet',
      };
    } catch (error) {
      return {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

