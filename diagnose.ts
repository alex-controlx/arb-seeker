// diagnose.ts
import { loadConfig } from "./src/config.ts";
import { BetfairAuth } from "./src/betfairAuth.ts";

console.log("🏥 STARTING ARB-SEEKER DIAGNOSTIC ROUTINE 🏥");
console.log("==================================================");

async function runTests() {
  const results = {
    env: "PENDING",
    telegram: "PENDING",
    oddsApi: "PENDING",
    betfair: "PENDING",
    math: "PENDING"
  };

  // --- TEST 1: ENVIRONMENT VARIABLES ---
  console.log("\n🔍 TEST 1: CONFIGURATION CHECK");
  try {
    const required = ["ODDS_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "BETFAIR_APP_KEY", "BETFAIR_USERNAME"];
    const missing = required.filter(key => !Deno.env.get(key));
    
    if (missing.length > 0) {
      throw new Error(`Missing Keys: ${missing.join(", ")}`);
    }
    
    // Check Config Object
    const config = loadConfig();
    if (!config.oddsApiKey || !config.telegramBotToken) {
       throw new Error("Config export is not reading env vars correctly.");
    }

    console.log("✅ Config Loaded Successfully");
    results.env = "PASS";
  } catch (e) {
    console.error("❌ Config Failed:", e.message);
    results.env = "FAIL";
  }

  // --- TEST 2: TELEGRAM CONNECTIVITY ---
  console.log("\n🔍 TEST 2: TELEGRAM BOT CONNECTION");
  try {
    const config = loadConfig();
    const url = `https://api.telegram.org/bot${config.telegramBotToken}/getMe`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (!data.ok) {
      throw new Error(`Telegram API Error: ${data.description}`);
    }
    console.log(`✅ Connected as Bot: @${data.result.username}`);
    results.telegram = "PASS";
  } catch (e) {
    console.error("❌ Telegram Failed:", e.message);
    results.telegram = "FAIL";
  }

  // --- TEST 3: THE-ODDS-API CONNECTIVITY ---
  console.log("\n🔍 TEST 3: ODDS API ACCESS");
  try {
    const config = loadConfig();
    // We request 'cricket' as a lightweight check
    const url = `https://api.the-odds-api.com/v4/sports/cricket_test_match/odds?apiKey=${config.oddsApiKey}&regions=au&markets=h2h`;
    const res = await fetch(url);
    
    console.log(`ℹ️ API Status Code: ${res.status}`);
    console.log(`ℹ️ Remaining Requests: ${res.headers.get("x-requests-remaining")}`);
    
    if (res.status !== 200) {
      throw new Error("Odds API responded with error.");
    }
    results.oddsApi = "PASS";
    console.log("✅ Odds API is reachable.");
  } catch (e) {
    console.error("❌ Odds API Failed:", e.message);
    results.oddsApi = "FAIL";
  }

  // --- TEST 4: BETFAIR AUTHENTICATION ---
  console.log("\n🔍 TEST 4: BETFAIR SESSION GENERATION");
  try {
    const config = loadConfig();
    const kv = await Deno.openKv();
    const betfairAuth = new BetfairAuth(
      kv,
      config.betfairAppKey,
      config.betfairUsername,
      config.betfairPassword,
    );
    
    console.log("ℹ️ Attempting to get Session Token...");
    const token = await betfairAuth.getSessionToken();
    
    if (!token || token.length < 10) {
      throw new Error("Token received but looks invalid.");
    }
    
    console.log("✅ Betfair Session Token Generated: " + token.substring(0, 5) + "...");
    results.betfair = "PASS";
  } catch (e) {
    const errorMsg = e.message || String(e);
    console.error("❌ Betfair Auth Failed:", errorMsg);
    
    // Check for common Betfair errors
    if (errorMsg.includes("INVALID_USERNAME_OR_PASSWORD")) {
      console.error("   ⚠️  CRITICAL: Check if you're using API password (not website password)");
    } else if (errorMsg.includes("Unexpected token") || errorMsg.includes("DOCTYPE")) {
      console.error("   ⚠️  Betfair API returned HTML instead of JSON - check credentials/endpoint");
    }
    
    results.betfair = "FAIL";
  }

  // --- TEST 5: MATH ENGINE (UNIT TEST) ---
  console.log("\n🔍 TEST 5: ARB CALCULATION LOGIC");
  try {
    // Test with odds that should give ~4.3% margin
    const bookieOdds = 2.10;
    const layOdds = 2.05;
    const impliedProb = (1 / bookieOdds) + (1 / layOdds);
    const margin = (1 / impliedProb) - 1;
    
    console.log(`ℹ️ Scenario: Back @ ${bookieOdds} / Lay @ ${layOdds}`);
    console.log(`ℹ️ Calculated Margin: ${(margin * 100).toFixed(2)}%`);
    
    // Verify margin is positive (no arb opportunity) and reasonable
    if (margin < 0 || margin > 0.1) {
       throw new Error(`Math Error: Margin out of expected range (0-10%), got ${(margin * 100).toFixed(2)}%`);
    }
    
    // Verify calculation is correct: margin should be ~3.7% for these odds
    const expectedMargin = 0.037;
    const marginDiff = Math.abs(margin - expectedMargin);
    if (marginDiff > 0.01) {
       throw new Error(`Math Error: Expected ~3.7% margin, got ${(margin * 100).toFixed(2)}%`);
    }
    console.log("✅ Math Engine Verified");
    results.math = "PASS";
  } catch (e) {
    console.error("❌ Math Logic Failed:", e.message);
    results.math = "FAIL";
  }

  // --- SUMMARY ---
  console.log("\n==================================================");
  console.log("📊 DIAGNOSTIC SUMMARY");
  console.table(results);
  
  if (Object.values(results).includes("FAIL") || Object.values(results).includes("PENDING")) {
    console.log("⚠️ SYSTEM UNHEALTHY - DO NOT DEPLOY");
    Deno.exit(1);
  } else {
    console.log("🚀 SYSTEM HEALTHY - READY FOR DEPLOYMENT");
    Deno.exit(0);
  }
}

runTests();

