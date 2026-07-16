import { calculateMomentum, calculateYoY, calculateDelta } from '../indicators';

export class MacroProbabilityModel {
  /**
   * 无未来函数的滚动回测评估
   * 根据当前的历史数据（金价、M2、实际利率、CFTC多头等），计算宏观因子并输出未来3-6个月上涨的概率。
   * 
   * @param {Object} dataContext 包含各类时序数据的对象
   *   - gold: 黄金价格数据数组
   *   - m2: M2 货币供应量数据数组
   *   - realRate: TIPS 实际利率数据数组
   *   - cftc: CFTC 管理资金净多头数据数组
   *   - options: 包含 gammaWalls 等期权数据的对象
   * @returns {Object} 概率评分及因子贡献
   */
  static evaluate(dataContext) {
    const { gold, m2, realRate, cftc, options } = dataContext;

    if (!gold || gold.length < 252) {
      return { 
        success: false, 
        error: "黄金历史数据不足（需要至少1年数据以计算基础动量和趋势）" 
      };
    }

    // 1. 提取当前时刻的核心因子
    const currentPrice = gold[gold.length - 1].close;
    
    // - 6个月动量
    const momentum6m = calculateMomentum(gold, 126) || 0;
    // - 12个月趋势 (YoY)
    const trend12m = calculateYoY(gold, 252) || 0;
    
    // - M2 同比及残差（简化的残差计算：金价同比 - M2同比）
    const m2YoY = m2 && m2.length > 12 ? calculateYoY(m2, 12) : 0;
    const m2Residual = trend12m - (m2YoY || 0); // 衡量央行购金带来的额外溢价

    // - 实际利率变化 (近1个月 Delta)
    const rateDelta = realRate && realRate.length ? calculateDelta(realRate, 21) : 0;
    const currentRate = realRate && realRate.length ? realRate[realRate.length - 1].close : 0;

    // - CFTC 净多头变化与拥挤度分位数
    const cftcDelta = cftc && cftc.length > 4 ? calculateDelta(cftc, 4) : 0; // 约4周
    let cftcContribution = 0;
    let cftcPercentile = 50;

    if (cftc && cftc.length > 0) {
      // 提取过去 156 周（约3年）的净多头数据
      const windowSize = 156;
      const startIndex = Math.max(0, cftc.length - windowSize);
      const recentCftc = cftc.slice(startIndex);
      const currentNetLong = recentCftc[recentCftc.length - 1].close;

      const minLong = Math.min(...recentCftc.map(d => d.close));
      const maxLong = Math.max(...recentCftc.map(d => d.close));

      if (maxLong > minLong) {
        cftcPercentile = ((currentNetLong - minLong) / (maxLong - minLong)) * 100;
      }

      // 拥挤度踩踏逻辑
      if (cftcPercentile > 90) {
        cftcContribution = -15; // 极度拥挤，多头踩踏预警
      } else if (cftcPercentile < 10) {
        cftcContribution = 15; // 极度悲观，酝酿大反弹
      } else {
        // 常态下，继续使用短期斜率作为辅助
        if (cftcDelta > 0) cftcContribution = 3;
        else if (cftcDelta < 0) cftcContribution = -3;
      }
    }

    // 2. 动态宏观周期识别 (Regime Detection)
    let regime = 'NORMAL';
    if (m2YoY > 8.0) {
      regime = 'M2_DRIVEN'; // 大放水时代
    } else if (currentRate > 1.5 && rateDelta > 0) {
      regime = 'RATE_DRIVEN'; // 高息压制时代
    } else if (m2YoY <= 8.0 && m2Residual > 5.0) {
      regime = 'CB_BUYING'; // 央行购金时代
    }

    // 3. 动态权重评分 (模拟统计概率分档)
    let baseScore3m = 61.5; 
    let baseScore6m = 72.0;

    // 基础贡献计算
    let m2Contribution = m2YoY > 0 ? (m2YoY * 100) * 0.2 : 0;
    let m2ResContribution = m2Residual > 0 ? (m2Residual * 100) * 0.5 : 0; 
    let rateContribution = rateDelta > 0 ? -(rateDelta * 10) : Math.abs(rateDelta * 5);
    let momentumContribution = momentum6m > 0 ? 5 : -5;
    let trendContribution = trend12m > 0 ? 5 : -5;

    // 根据时代环境进行权重换档
    switch(regime) {
      case 'M2_DRIVEN':
        m2Contribution *= 2.0; // M2主导
        break;
      case 'RATE_DRIVEN':
        rateContribution *= 2.0; // 利率压制主导
        break;
      case 'CB_BUYING':
        m2ResContribution *= 2.0; // 央行买盘溢价主导
        break;
      case 'NORMAL':
      default:
        momentumContribution *= 2.0; // 技术趋势主导
        trendContribution *= 2.0;
        break;
    }

    // 汇总模型评分
    let rawScore3m = baseScore3m + m2Contribution + m2ResContribution + rateContribution + momentumContribution + trendContribution + cftcContribution;
    let rawScore6m = baseScore6m + m2Contribution + m2ResContribution + rateContribution + momentumContribution + trendContribution + cftcContribution;

    // 限制在合理概率范围内 [0, 100]
    const prob3m = Math.min(Math.max(rawScore3m, 0), 100);
    const prob6m = Math.min(Math.max(rawScore6m, 0), 100);

    // 将因子输出用于分析展示
    const factorsOut = {
      regime,
      m2Residual,
      cftcDelta,
      cftcPercentile
    };

    // 3. 情景推演与信号生成
    let signal = 'NEUTRAL';
    let path = '等待观察';
    
    if (prob3m > 60) {
      signal = 'BULLISH';
      path = '基础上升路径 (逢低做多)';
    } else if (prob3m < 40) {
      signal = 'BEARISH';
      path = '下行清洗路径 (注意减仓)';
    }

    // 结合 Gamma 逼空防线
    let gammaSqueezeRisk = false;
    let resistanceWall = null;
    if (options && options.gammaWalls && options.gammaWalls.length > 0) {
      resistanceWall = options.gammaWalls[0].strike;
      // 如果当前价格逼近期权墙 (例如在墙下方 2% 以内)，或已经突破
      if (currentPrice >= resistanceWall * 0.98 && currentPrice <= resistanceWall * 1.05) {
        gammaSqueezeRisk = true;
        path = 'Gamma 逼空路径 (突破追涨，若假突破则减仓)';
      }
    }

    return {
      success: true,
      probability: {
        prob3m: prob3m.toFixed(1),
        prob6m: prob6m.toFixed(1),
        isHighConviction: prob3m > 60 && prob6m > 70
      },
      factors: {
        momentum6m: (momentum6m * 100).toFixed(2) + '%',
        trend12m: (trend12m * 100).toFixed(2) + '%',
        m2YoY: (m2YoY * 100).toFixed(2) + '%',
        m2Residual: (m2Residual * 100).toFixed(2) + '%',
        currentRate: currentRate.toFixed(2) + '%',
        rateDelta: rateDelta.toFixed(2),
        cftcDelta: cftcDelta,
        cftcPercentile: cftcPercentile.toFixed(1) + '%',
        regime: regime
      },
      contributions: {
        m2: m2Contribution.toFixed(1),
        rate: rateContribution.toFixed(1),
        momentum: momentumContribution.toFixed(1),
        cftc: cftcContribution.toFixed(1)
      },
      scenarios: {
        signal,
        path,
        gammaSqueezeRisk,
        resistanceWall
      }
    };
  }
}
