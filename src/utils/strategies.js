import { evaluate } from 'mathjs';
import { BUILT_IN_BUY_STRATEGIES, BUILT_IN_SELL_STRATEGIES } from './builtin_formulas';

export function evaluateStrategy(indicators, macro, strategy, baseGrams, wday, enableLadderOrders = false) {
  if (!indicators) return null;
  
  // Build the execution scope
  const scope = {
    ...indicators,
    wday: wday || (new Date().getDay() || 7),
    baseGrams,
    fib_level382: indicators.fib?.level382 || 0,
    fib_level618: indicators.fib?.level618 || 0,
    calendar_bestBuyDay: indicators.calendar?.bestBuyDay || -1,
    macro_valid: !!(macro && macro.dxy?.changePercent !== undefined && macro.tnx?.changePercent !== undefined),
    macro_dxy_changePercent: macro?.dxy?.changePercent || 0,
    macro_tnx_changePercent: macro?.tnx?.changePercent || 0,
    is_ladder_enabled: enableLadderOrders,
    // Provide custom functions for mathjs
    concat: (...args) => args.join(''),
    cond: (...args) => {
      for (let i = 0; i < args.length - 1; i += 2) {
        if (args[i]) return args[i + 1];
      }
      return args[args.length - 1];
    },
    match: (...args) => {
      const value = args[0];
      for (let i = 1; i < args.length - 1; i += 2) {
        if (value === args[i]) return args[i + 1];
      }
      return args[args.length - 1];
    },
    singleOrder: (price, multiplier = 1.0) => {
      return [{ price, multiplier, label: '单笔' }];
    },
    gridOrders: (basePrice, totalMultiplier = 1.0, levels = 3, dropPct = 0.01) => {
      const orders = [];
      const multiPerLevel = totalMultiplier / levels;
      for (let i = 0; i < levels; i++) {
        orders.push({
          price: basePrice * (1 - dropPct * i),
          multiplier: multiPerLevel,
          label: `阶梯${i + 1}`
        });
      }
      return orders;
    },
    weightedLadder: (basePrice, dropsRaw, weightsRaw) => {
      const drops = dropsRaw?.toArray ? dropsRaw.toArray() : (dropsRaw?.valueOf ? dropsRaw.valueOf() : dropsRaw);
      const weights = weightsRaw?.toArray ? weightsRaw.toArray() : (weightsRaw?.valueOf ? weightsRaw.valueOf() : weightsRaw);
      
      if (!Array.isArray(drops) || !Array.isArray(weights) || drops.length === 0) {
        return [{ price: basePrice, multiplier: 1.0, label: '单笔' }];
      }
      
      return drops.map((drop, i) => ({
        price: basePrice * (1 - drop),
        multiplier: weights[i] !== undefined ? weights[i] : 0,
        label: `加权阶梯${i + 1}`
      }));
    }
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

  // Format result into an orders array
  let reason = scope.reason || "已执行策略。";
  let orders = [];

  if (Array.isArray(scope.orders)) {
    // Strategy explicit array output
    orders = scope.orders.map((o, idx) => {
      let m = o.multiplier !== undefined ? o.multiplier : 1.0;
      if (!Number.isFinite(m) || m < 0) m = 1.0;
      let p = o.price;
      if (!Number.isFinite(p) || p <= 0) p = indicators.currentPrice;
      return { price: p, grams: baseGrams * m, multiplier: m, label: o.label || `挂单${idx + 1}` };
    });
  } else {
    // Legacy fallback parsing
    let targetPrice = scope.targetPrice !== undefined ? scope.targetPrice : (scope.target_price !== undefined ? scope.target_price : indicators.currentPrice);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) targetPrice = indicators.currentPrice;
    let multiplier = scope.multiplier !== undefined ? scope.multiplier : 1.0;
    if (!Number.isFinite(multiplier) || multiplier < 0) multiplier = 1.0;

    if (enableLadderOrders) {
      const gPerLevel = (baseGrams * multiplier) / 3;
      const mPerLevel = multiplier / 3;
      orders = [
        { price: targetPrice, grams: gPerLevel, multiplier: mPerLevel, label: '阶梯1' },
        { price: targetPrice * 0.99, grams: gPerLevel, multiplier: mPerLevel, label: '阶梯2' },
        { price: targetPrice * 0.98, grams: gPerLevel, multiplier: mPerLevel, label: '阶梯3' }
      ];
      reason = `[多档扩展] ` + reason;
    } else {
      orders = [{ price: targetPrice, grams: baseGrams * multiplier, multiplier, label: '单笔' }];
    }
  }

  // Calculate summary for backward compatibility and overview
  const totalGrams = orders.reduce((sum, o) => sum + o.grams, 0);
  const totalMultiplier = orders.reduce((sum, o) => sum + o.multiplier, 0);
  let avgPrice = indicators.currentPrice;
  if (totalGrams > 0) {
    avgPrice = orders.reduce((sum, o) => sum + o.price * o.grams, 0) / totalGrams;
  }

  return { targetPrice: avgPrice, grams: totalGrams, multiplier: totalMultiplier, reason, orders };
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
      
      // 校验结果
      if (Number.isFinite(scope.sellRatio) && scope.sellRatio > 0) {
        let validRatio = Math.min(scope.sellRatio, 1.0); // 最大不能超过 1
        maxSellRatio = Math.max(maxSellRatio, validRatio);
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

