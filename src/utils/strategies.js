import { evaluate } from 'mathjs';
import { BUILT_IN_BUY_STRATEGIES, BUILT_IN_SELL_STRATEGIES } from './builtin_formulas';

export function evaluateStrategy(indicators, macro, strategy, baseGrams, wday) {
  if (!indicators) return null;
  
  // Build the execution scope
  const scope = {
    ...indicators,
    wday: wday || (new Date().getDay() || 7),
    baseGrams,
    // Flatten specific nested indicators for easier access in mathjs
    fib_level382: indicators.fib?.level382 || 0,
    fib_level618: indicators.fib?.level618 || 0,
    calendar_bestBuyDay: indicators.calendar?.bestBuyDay || -1,
    macro_valid: !!(macro && macro.dxy?.changePercent !== undefined && macro.tnx?.changePercent !== undefined),
    macro_dxy_changePercent: macro?.dxy?.changePercent || 0,
    macro_tnx_changePercent: macro?.tnx?.changePercent || 0,
    // Provide custom functions for mathjs
    concat: (...args) => args.join(''),
  };

  let script = '';
  if (BUILT_IN_BUY_STRATEGIES[strategy]) {
    script = BUILT_IN_BUY_STRATEGIES[strategy].script;
  } else if (strategy.startsWith('custom_buy_')) {
    try {
      const customStrats = JSON.parse(localStorage.getItem('customBuyStrategies') || '[]');
      const custom = customStrats.find(s => s.id === strategy);
      if (custom) script = custom.script;
    } catch (e) {
      console.warn("Error parsing customBuyStrategies", e);
    }
  }

  try {
    if (script) {
      evaluate(script, scope);
    }
  } catch (error) {
    console.warn("Strategy Evaluation Error:", error);
    scope.targetPrice = indicators.currentPrice;
    scope.multiplier = 1.0;
    scope.reason = "策略代码存在语法错误，使用默认现价和基础倍率。";
  }

  // Ensure targetPrice and multiplier are present in scope, fallback if not
  let targetPrice = scope.targetPrice !== undefined ? scope.targetPrice : (scope.target_price !== undefined ? scope.target_price : indicators.currentPrice);
  let multiplier = scope.multiplier !== undefined ? scope.multiplier : 1.0;
  let reason = scope.reason || "已执行策略。";

  const grams = baseGrams * multiplier;

  return { targetPrice, grams, multiplier, reason };
}

export function evaluateSellStrategy(indicators, currentHoldings, averageCost, activeSellStrategies) {
  if (!indicators || currentHoldings <= 0 || !activeSellStrategies || activeSellStrategies.length === 0) {
    return { shouldSell: false, sellRatio: 0, reason: '' };
  }

  const scope = {
    ...indicators,
    currentHoldings,
    averageCost,
    concat: (...args) => args.join('')
  };

  let maxSellRatio = 0;
  let reasons = [];

  for (const stratKey of activeSellStrategies) {
    scope.sellRatio = 0;
    scope.reason = '';

    let script = '';
    if (BUILT_IN_SELL_STRATEGIES[stratKey]) {
      script = BUILT_IN_SELL_STRATEGIES[stratKey].script;
    } else if (stratKey.startsWith('custom_sell_')) {
      try {
        const customStrats = JSON.parse(localStorage.getItem('customSellStrategies') || '[]');
        const custom = customStrats.find(s => s.id === stratKey);
        if (custom) script = custom.script;
      } catch (e) {
        console.warn("Error parsing customSellStrategies", e);
      }
    }
    
    if (!script) continue;

    try {
      evaluate(script, scope);
      if (scope.sellRatio > 0) {
        maxSellRatio = Math.max(maxSellRatio, scope.sellRatio);
        if (scope.reason) {
          reasons.push(scope.reason);
        }
      }
    } catch (error) {
      console.warn("Sell Strategy Evaluation Error:", error);
    }
  }

  if (maxSellRatio > 0) {
    return {
      shouldSell: true,
      sellRatio: maxSellRatio,
      reason: reasons.join('；')
    };
  }

  return { shouldSell: false, sellRatio: 0, reason: '' };
}

