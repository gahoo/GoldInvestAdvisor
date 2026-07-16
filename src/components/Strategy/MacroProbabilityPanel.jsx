import React, { useState, useEffect } from 'react';
import { MacroProbabilityModel } from '../../utils/strategy/MacroProbabilityModel';
import { Tooltip } from '../Tooltip';

export function MacroProbabilityPanel({ dataContext }) {
  const [modelResult, setModelResult] = useState(null);

  useEffect(() => {
    // 自动重新计算
    if (dataContext) {
      const result = MacroProbabilityModel.evaluate(dataContext);
      setModelResult(result);
    }
  }, [dataContext]);

  if (!modelResult) {
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>需要更多宏观数据以启动概率模型...</div>;
  }

  if (!modelResult.success) {
    return (
      <div style={{ padding: '20px', color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
        模型评估失败: {modelResult.error}
      </div>
    );
  }

  const { probability, factors, contributions, scenarios } = modelResult;

  const renderGauge = (probStr) => {
    const prob = parseFloat(probStr);
    let color = '#3B82F6';
    if (prob > 60) color = '#10B981'; // Green
    if (prob < 40) color = '#EF4444'; // Red
    
    return (
      <div style={{ flex: 1, textAlign: 'center', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: color }}>{probStr}%</div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '8px' }}>模型评分</div>
      </div>
    );
  };

  const MetricItem = ({ label, tooltip, value, subtext, color = 'var(--text-primary)' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color }}>{value}</span>
        {subtext && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subtext}</span>}
      </div>
    </div>
  );

  return (
    <div style={{
      background: '#ffffff', border: '1px solid var(--border-color)',
      borderRadius: '8px', padding: '20px', marginTop: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          宏观概率与情绪模型 
          {probability.isHighConviction && <span style={{ padding: '2px 8px', background: '#10B981', color: '#fff', fontSize: '0.7rem', borderRadius: '12px' }}>高确定性区间</span>}
        </h3>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
        {renderGauge(probability.prob3m)}
        <div style={{ flex: 2, background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>交易路径推演</h4>
          <div style={{ fontSize: '1.2rem', fontWeight: '500', color: scenarios.signal === 'BULLISH' ? '#10B981' : scenarios.signal === 'BEARISH' ? '#EF4444' : 'var(--text-primary)' }}>
            {scenarios.path}
          </div>
          {scenarios.gammaSqueezeRisk && (
            <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', borderRadius: '4px', fontSize: '0.9rem' }}>
              ⚠️ 当前价格逼近 Gamma 防御墙 ({scenarios.resistanceWall})，警惕逼空行情或假突破。
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* 宏观因子面板 */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>核心宏观因子</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-gold)' }}>
              <span>当前时代: {factors.regime}</span>
              <Tooltip content={
                factors.regime === 'M2_DRIVEN' ? "大放水时代：M2同比>8%。模型大幅增加对M2流动性的敏感度。" :
                factors.regime === 'RATE_DRIVEN' ? "高息压制时代：TIPS实际利率>1.5%且攀升。模型极度放大利率的拖累效应。" :
                factors.regime === 'CB_BUYING' ? "央行购金时代：M2低迷但金价逆势上涨。模型将主要权重转移给神秘的购金溢价底座。" :
                "平淡震荡期：无极端宏观数据。模型回归传统技术分析，由动量和趋势主导方向。"
              } />
            </div>
          </div>
          <MetricItem 
            label="M2 货币供应量同比" 
            tooltip="M2货币超发速度。在大放水时代（如次贷危机），这是支撑金价的最强底层逻辑。"
            value={factors.m2YoY} 
          />
          <MetricItem 
            label="M2 残差 (央行购金溢价)" 
            tooltip="金价同比与M2同比之差。反映脱离美元信用体系的'非美元计价黄金'溢价（如中国央行持续购金支撑的底座）。正值表示有溢价支撑。"
            value={factors.m2Residual} 
            subtext={`模型贡献: ${contributions.m2}`} 
            color={parseFloat(contributions.m2) > 0 ? '#10B981' : 'var(--text-primary)'} 
          />
          <MetricItem 
            label="10Y TIPS 实际利率" 
            tooltip="十年期美债实际收益率（名义利率-通胀预期）。作为黄金的持有'机会成本'，TIPS升高往往打压金价。"
            value={factors.currentRate} 
            subtext={`变化率: ${factors.rateDelta} | 贡献: ${contributions.rate}`} 
            color={parseFloat(contributions.rate) < 0 ? '#EF4444' : 'var(--text-primary)'} 
          />
          <MetricItem 
            label="12个月长期趋势" 
            tooltip="过去一年的价格年化涨幅。用于判断当前是处于大牛市结构还是大熊市结构。"
            value={factors.trend12m} 
          />
          <MetricItem 
            label="6个月动量" 
            tooltip="过去半年的价格惯性。黄金作为趋势极强的资产，当半年动量强劲时，顺势做多的胜率通常远高于左侧接飞刀。"
            value={factors.momentum6m} 
            subtext={`模型贡献: ${contributions.momentum}`} 
          />
        </div>

        {/* 情绪与仓位面板 */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>资金面与极值情绪</div>
          <MetricItem 
            label="CFTC 拥挤度 (3年滚动分位数)" 
            tooltip="当前净多头在过去3年历史中所处的位置。高于90%极度拥挤（看跌踩踏），低于10%极度悲观（看涨底背离）。"
            value={factors.cftcPercentile} 
            color={parseFloat(factors.cftcPercentile) > 90 ? '#EF4444' : parseFloat(factors.cftcPercentile) < 10 ? '#10B981' : 'var(--text-primary)'}
          />
          <MetricItem 
            label="CFTC 管理资金净多头变化" 
            tooltip="对冲基金在期货市场的仓位变动速度（近四周斜率）。大幅增加代表聪明钱在建仓。"
            value={factors.cftcDelta > 0 ? `+${factors.cftcDelta}` : factors.cftcDelta} 
            subtext={`模型贡献: ${contributions.cftc}`} 
          />
          <MetricItem 
            label="期权 Gamma 逼空防线" 
            tooltip="期权做市商在哪个价位持有最集中的空头敞口。当价格逼近该防线时，做市商为了对冲风险被迫买入现货，极易引发'Gamma Squeeze'（向上逼空暴涨）行情。"
            value={scenarios.resistanceWall ? `$${scenarios.resistanceWall}` : '数据未接入'} 
            subtext="做市商最大看涨期权空头堆积区" 
            color="var(--accent-gold)" 
          />
          <MetricItem 
            label="模型状态" 
            value={scenarios.signal} 
            subtext={`多空倾向`} 
            color={scenarios.signal === 'BULLISH' ? '#10B981' : 'var(--text-secondary)'} 
          />
        </div>
      </div>
    </div>
  );
}
