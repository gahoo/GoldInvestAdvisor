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

    // - CFTC 净多头变化 (近1个月 Delta)
    const cftcDelta = cftc && cftc.length > 4 ? calculateDelta(cftc, 4) : 0; // 约4周
    let cftcScore = 0;
    if (cftcDelta > 0) {
      cftcScore = 3;
    } else if (cftcDelta < 0) {
      cftcScore = -3;
    } else {
      cftcScore = 0;
    }

    // 2. 动态权重评分 (模拟统计概率分档)
    // 基础胜率 (基于历史数据统计的基准)
    let baseScore3m = 61.5; 
    let baseScore6m = 72.0;

    // 因子贡献权重 (当前周期的权重设置：2020-至今 央行购金周期)
    // M2 残差的正向驱动
    const m2Contribution = m2Residual > 0 ? (m2Residual * 100) * 0.5 : 0; 
    
    // 实际利率的负向拖累
    const rateContribution = rateDelta > 0 ? - (rateDelta * 10) : Math.abs(rateDelta * 5);
    
    // 动量顺风车
    const momentumContribution = momentum6m > 0 ? 5 : -5;

    // 拥挤度 (如果多头下降斜率减缓或反弹，为正向)
    const cftcContribution = cftcScore;

    // 汇总模型评分 (这反映了当前状态在历史统计中的胜率档位)
    let rawScore3m = baseScore3m + m2Contribution + rateContribution + momentumContribution + cftcContribution;
    let rawScore6m = baseScore6m + m2Contribution + rateContribution + momentumContribution + cftcContribution;

    // 限制在合理概率范围内 [0, 100]
    const prob3m = Math.min(Math.max(rawScore3m, 0), 100);
    const prob6m = Math.min(Math.max(rawScore6m, 0), 100);

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
        m2Residual: (m2Residual * 100).toFixed(2) + '%',
        currentRate: currentRate.toFixed(2) + '%',
        rateDelta: rateDelta.toFixed(2),
        cftcDelta: cftcDelta
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
