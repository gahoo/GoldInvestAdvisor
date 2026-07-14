export const BUILT_IN_BUY_STRATEGIES = {
  grid: {
    name: '基础网格吃单 (经典版)',
    description: '逻辑：利用底层引擎合成的真实周 K 线，精确计算周级别的真实波动率 (Weekly ATR)，在现价下方预留半个真实波动空间作为防守安全垫。\n算法：目标价 = 现价 - (真实周ATR × 0.5)。买入倍率受中长期均线 (MA60) 的乖离率动态调节。',
    script: `
      targetPrice = currentPrice - (weeklyAtr * 0.5);
      multiplier = max(0.1, min(3.0, 1.0 - (bias * 15)));
      reason = concat("当前偏离均线 ", round(bias * 100, 2), "%，通过线性函数自动调节定投倍率为 ", round(multiplier, 2), "x。");
    `
  },
  grid_drawdown: {
    name: '保守网格：历史典型回撤预测法',
    description: '逻辑：直接回溯过去 52 周的真实历史行情，计算每周“周一开局至当周极值”的典型跌幅（中位数）作为安全垫。\n算法：目标价 = 本周基准锚点价 × (1 - 历史中位数跌幅)。基准锚点优先锁定“本周一收盘价”，遇到盘中或假期真空期会自动降级为当前现价。这完美贴合黄金“急跌慢涨”的非对称属性。',
    script: `
      targetPrice = referencePrice * (1 + drawdown);
      multiplier = max(0.5, min(3.0, 1.0 - (bias * 10)));
      reason = concat("结合回撤锚点与当前乖离率动态量化，测算参考购入倍率为 ", round(multiplier, 2), "x。");
    `
  },
  grid_fib: {
    name: '动态防守：ATR与斐波那契结合法',
    description: '逻辑：结合当前趋势强度（斐波那契回调位）和市场的极值恐慌度（真实周 ATR）来动态决定防守深度。\n算法：如果在强支撑上方，目标价 = 现价 - 真实周ATR × 38.2%；如果跌破支撑陷入震荡，防守底线后撤至更极端的 61.8% 深位。',
    script: `
      is_strong = currentPrice > fib_level382;
      targetPrice = currentPrice - (weeklyAtr * (is_strong ? 0.382 : 0.618));
      multiplier = is_strong ? max(0.5, min(2.0, 1.0 - (bias * 10))) : max(1.0, min(3.0, 1.2 - (bias * 15)));
      reason = is_strong ? "处于强趋势上方，防守挂单偏浅，依据当前偏离度平滑调整倍数。" : "处于趋势下方，防守挂单较深，适当放大左侧参考的倍率倾斜。";
    `
  },
  mean_reversion: {
    name: '均值回归',
    description: '逻辑：寻找极端超买超卖点的反转机会。\n算法：目标价设在近期的 61.8% 斐波那契强支撑位。结合 RSI，超卖(<30)两倍加仓，超买(>70)观望不买。',
    script: `
      targetPrice = min(fib_level618, currentPrice);
      multiplier = max(0.0, min(3.0, 1.0 + (50 - rsi) / 20));
      reason = concat("RSI 为 ", round(rsi, 1), "，基于 RSI 中轴偏离度映射为 ", round(multiplier, 2), "x 连续倍率。");
    `
  },
  calendar: {
    name: '日历效应叠加法',
    description: '逻辑：根据历史数据统计，一周当中哪一天黄金最容易遭到抛售产生低点？\n算法：如果今天是全周最佳买入日，则现价买入；否则建议观望，并在现价上往下打折预期累计跌幅。',
    script: `
      targetPrice = currentPrice * 0.998;
      is_best_day = calendar_bestBuyDay == wday;
      multiplier = is_best_day ? 1.0 : 0.0;
      reason = is_best_day ? "今天是历史统计的当周最低日，可略微打折挂单。" : "今天不是历史最佳买入日，建议观望或大幅打折挂单。";
    `
  },
  macro: {
    name: '宏观多因子跨市场套利',
    description: '逻辑：美元指数和美国十年期国债收益率是压制金价的两座大山。利用它们的数据预判黄金短线异动。\n算法：如果 DXY 和 US10Y 盘中双双暴涨，预判黄金承压，目标挂单价向下打折 1%，并 1.5 倍加仓接多。',
    script: `
      pressure = macro_dxy_changePercent + macro_tnx_changePercent;
      is_pressure = macro_valid and (pressure > 0);
      multiplier = is_pressure ? min(3.0, 1.0 + (pressure * 0.5)) : 1.0;
      targetPrice = is_pressure ? currentPrice * (1 - (pressure * 0.005)) : currentPrice;
      reason = is_pressure ? concat("美债和美元产生 ", round(pressure, 2), "% 的联合共振压制，动态向下打折接针，加码 ", round(multiplier, 2), "x。") : (macro_valid ? "宏观因子未形成共振上行压制，维持现价 1.00x 正常定投。" : "加载宏观因子中，维持默认定投。");
    `
  },
  ladder_advanced: {
    name: '动态多档阶梯 (原生)',
    description: '逻辑：直接利用底层原生接口生成多档阶梯网格。结合乖离率(BIAS)和真实波动率(ATR)动态调节间距。\n算法：在上升趋势中(BIAS>0)缩小网格间距以确保部分成交；在下跌趋势中拉大网格以接更深的针。',
    script: `
      # 动态档位数与间距
      is_down = bias < 0;
      levels = is_down ? 4 : 3;
      drop_pct = is_down ? 0.008 : 0.005;
      
      # 根据超买超卖调整总倍率
      total_multi = max(0.5, min(3.0, 1.0 - (bias * 10)));
      
      # 起始首档防守价 (贴近现价或下移半个ATR)
      start_price = currentPrice - (weeklyAtr * (is_down ? 0.5 : 0.2));
      
      # 显式生成底层多档订单结构
      orders = gridOrders(start_price, total_multi, levels, drop_pct);
      
      reason = concat("根据 BIAS(", round(bias * 100, 2), "%) 判定分配为 ", levels, " 档挂单，层级间距 ", drop_pct * 100, "%，首档防守位 ", round(start_price, 2), "。");
    `
  }
};

export const BUILT_IN_SELL_STRATEGIES = {
  rsi_scale_out: {
    name: '均值回归高抛',
    description: '当 RSI 大于 70（超买）且当前处于浮盈状态时，卖出 30% 持仓锁定利润，保留 70% 作为压舱石底仓。',
    script: `
      pnlRatio = averageCost > 0 ? (currentPrice - averageCost) / averageCost : 0;
      sellRatio = (rsi > 70 and pnlRatio > 0) ? 0.3 : 0;
      reason = sellRatio > 0 ? "RSI超买且有浮盈，触发均值回归高抛，卖出30%留底仓" : "";
    `
  },
  profit_scale_out: {
    name: '目标收益减仓',
    description: '当浮盈比例超过 10% 时，卖出 50% 持仓，收回大部分本金，剩余 50% 继续跟随趋势。',
    script: `
      pnlRatio = averageCost > 0 ? (currentPrice - averageCost) / averageCost : 0;
      sellRatio = pnlRatio > 0.10 ? 0.5 : 0;
      reason = sellRatio > 0 ? "浮盈超过10%，触发目标收益减仓，卖出50%锁定利润" : "";
    `
  },
  trend_break_clear: {
    name: '破位清仓止损',
    description: '当价格跌破 MA60 中期均线，且当前仍处于浮盈状态时，清仓（卖出 100%）以规避长期下跌风险。',
    script: `
      pnlRatio = averageCost > 0 ? (currentPrice - averageCost) / averageCost : 0;
      sellRatio = (ma60 > 0 and currentPrice < ma60 and pnlRatio > 0) ? 1.0 : 0;
      reason = sellRatio > 0 ? "跌破MA60中期趋势线且有浮盈，触发防守性清仓止盈" : "";
    `
  }
};
