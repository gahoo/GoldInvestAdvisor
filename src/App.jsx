import React, { useState, useEffect, useMemo } from 'react';
import { fetchGoldData, fetchMacroData } from './utils/api';
import { calculateAllIndicators } from './utils/indicators';
import { Tooltip } from './components/Tooltip';
import { Chart } from './components/Chart';

function App() {
  const [data, setData] = useState([]);
  const [indicators, setIndicators] = useState(null);
  const [macro, setMacro] = useState(null);
  const [strategy, setStrategy] = useState('grid');
  const [baseGrams, setBaseGrams] = useState(1); 
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchGoldData().then(result => {
      setData(result);
      setIndicators(calculateAllIndicators(result));
    }).catch(err => {
      setError(err.message);
    });

    fetchMacroData().then(res => {
      if (res) setMacro(res);
    });
  }, []);

  const isActive = (cardType) => {
    switch (strategy) {
      case 'grid': return ['atr', 'bias', 'price'].includes(cardType);
      case 'grid_drawdown': return ['bias', 'price'].includes(cardType);
      case 'grid_fib': return ['atr', 'fib', 'price'].includes(cardType);
      case 'mean_reversion': return ['rsi', 'fib', 'price'].includes(cardType);
      case 'calendar': return ['calendar', 'price'].includes(cardType);
      case 'macro': return ['macro', 'price'].includes(cardType);
      default: return true;
    }
  };

  const advice = useMemo(() => {
    if (!indicators) return null;
    
    let targetPrice = indicators.currentPrice;
    let multiplier = 1.0;
    let reason = '';

    if (strategy === 'grid') {
      targetPrice = indicators.currentPrice - (indicators.weeklyAtr * 0.5);
      if (indicators.bias > 0.05) { multiplier = 0.5; reason = '当前偏离均线较高，建议减少买入量。'; }
      else if (indicators.bias < -0.05) { multiplier = 2.0; reason = '处于深度回调区，建议双倍买入。'; }
      else if (indicators.bias < -0.02) { multiplier = 1.5; reason = '略微低估，建议 1.5 倍买入。'; }
      else { reason = '基于波动率预留安全垫，正常定投。'; }
    } else if (strategy === 'grid_drawdown') {
      targetPrice = indicators.referencePrice * (1 + (indicators.drawdown || 0));
      if (indicators.bias < -0.03) { multiplier = 1.5; reason = '已达历史典型回撤位，且乖离率偏低，加仓买入。'; }
      else { reason = '挂单在历史典型回撤位，防守性好，正常定投。'; }
    } else if (strategy === 'grid_fib') {
      if (indicators.currentPrice > indicators.fib?.level382) {
        targetPrice = indicators.currentPrice - (indicators.weeklyAtr * 0.382);
        reason = '处于强趋势上方，防守挂单偏浅（38.2% 波动率）。';
      } else {
        targetPrice = indicators.currentPrice - (indicators.weeklyAtr * 0.618);
        reason = '处于趋势下方，防守挂单较深（61.8% 波动率）。';
      }
    } else if (strategy === 'mean_reversion') {
      // 防止目标价高于现价
      targetPrice = Math.min(indicators.fib?.level618 || indicators.currentPrice, indicators.currentPrice);
      if (indicators.rsi < 30) { multiplier = 2.0; reason = 'RSI 超卖极值，且逼近强支撑，建议加倍抄底！'; }
      else if (indicators.rsi > 70) { multiplier = 0.0; reason = 'RSI 超买极值，建议观望等待回落。'; }
      else { reason = `正常波动区间，目标价放在近期 61.8% 支撑位 (${targetPrice.toFixed(2)}) 或现价。`; }
    } else if (strategy === 'calendar') {
      targetPrice = indicators.currentPrice * 0.998;
      const today = new Date().getDay() || 7;
      if (indicators.calendar?.bestBuyDay === today) {
        multiplier = 1.0;
        reason = '今天是历史统计的当周最低日，可略微打折挂单。';
      } else {
        multiplier = 0.0;
        reason = '今天不是历史最佳买入日，建议观望或大幅打折挂单。';
      }
    } else if (strategy === 'macro') {
      if (macro && macro.dxy?.change > 0 && macro.tnx?.change > 0) {
        targetPrice = indicators.currentPrice * 0.99;
        multiplier = 1.5;
        reason = '美元和美债双双飙升，黄金大概率承压，向下打折 1% 左侧接多。';
      } else {
        targetPrice = indicators.currentPrice;
        multiplier = 1.0;
        reason = '宏观因子未形成共振双涨，无额外压制，维持现价正常定投。';
      }
    }

    const grams = baseGrams * multiplier;

    return { targetPrice, grams, multiplier, reason };
  }, [indicators, macro, baseGrams, strategy]);

  if (error) {
    return (
      <div className="app-container" style={{ textAlign: 'center', marginTop: '100px' }}>
        <div className="card" style={{ borderTop: '4px solid var(--color-down)' }}>
          <h2 style={{ color: 'var(--color-down)', marginBottom: '16px' }}>数据加载失败</h2>
          <p>{error}</p>
          <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => window.location.reload()}>重试</button>
        </div>
      </div>
    );
  }

  if (!indicators) return <div className="loading">数据加载中...</div>;

  return (
    <div className="app-container">
      <header>
        <h1>智能黄金定投顾问</h1>
        <p className="subtitle">科学的量化交易策略，助您穿越周期</p>
      </header>

      <div className="two-column-layout">
        {/* 左侧：策略选择与指标监控 */}
        <div className="left-panel">
          <div className="card">
            <h3 className="section-title">投资策略</h3>
            <div className="strategy-selector" style={{ flexWrap: 'wrap', overflowX: 'visible', gap: '10px' }}>
              <button className={`strategy-btn ${strategy === 'grid' ? 'active' : ''}`} onClick={() => setStrategy('grid')}>基础网格</button>
              <button className={`strategy-btn ${strategy === 'grid_drawdown' ? 'active' : ''}`} onClick={() => setStrategy('grid_drawdown')}>历史典型回撤</button>
              <button className={`strategy-btn ${strategy === 'grid_fib' ? 'active' : ''}`} onClick={() => setStrategy('grid_fib')}>动态波动 (ATR+Fib)</button>
              <button className={`strategy-btn ${strategy === 'mean_reversion' ? 'active' : ''}`} onClick={() => setStrategy('mean_reversion')}>均值回归</button>
              <button className={`strategy-btn ${strategy === 'calendar' ? 'active' : ''}`} onClick={() => setStrategy('calendar')}>日历效应</button>
              <button className={`strategy-btn ${strategy === 'macro' ? 'active' : ''}`} onClick={() => setStrategy('macro')}>宏观因子</button>
            </div>
            
            <div className="strategy-description" style={{ marginTop: '16px', padding: '16px', backgroundColor: 'var(--bg-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              {strategy === 'grid' && (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>🧠 基础网格吃单 (经典版)</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <strong>逻辑：</strong>利用底层引擎合成的真实周 K 线，精确计算周级别的真实波动率 (Weekly ATR)，在现价下方预留半个真实波动空间作为防守安全垫。<br/>
                    <strong>算法：</strong>目标价 = 现价 - (真实周ATR × 0.5)。买入倍率受中长期均线 (MA60) 的乖离率动态调节。
                  </div>
                </>
              )}
              {strategy === 'grid_drawdown' && (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>🧠 保守网格：历史典型回撤预测法 (推荐🌟)</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <strong>逻辑：</strong>直接回溯过去 52 周的真实历史行情，计算每周“周一开局至当周极值”的典型跌幅（中位数）作为安全垫。<br/>
                    <strong>算法：</strong>目标价 = 本周基准锚点价 × (1 - 历史中位数跌幅)。基准锚点优先锁定“本周一收盘价”，遇到盘中或假期真空期会自动降级为当前现价。这完美贴合黄金“急跌慢涨”的非对称属性。
                  </div>
                </>
              )}
              {strategy === 'grid_fib' && (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>🧠 动态防守：ATR与斐波那契结合法</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <strong>逻辑：</strong>结合当前趋势强度（斐波那契回调位）和市场的极值恐慌度（真实周 ATR）来动态决定防守深度。<br/>
                    <strong>算法：</strong>如果在强支撑上方，目标价 = 现价 - 真实周ATR × 38.2%；如果跌破支撑陷入震荡，防守底线后撤至更极端的 61.8% 深位。
                  </div>
                </>
              )}
              {strategy === 'mean_reversion' && (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>🧠 均值回归</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <strong>逻辑：</strong>寻找极端超买超卖点的反转机会。<br/>
                    <strong>算法：</strong>目标价设在近期的 61.8% 斐波那契强支撑位。结合 RSI，超卖(&lt;30)两倍加仓，超买(&gt;70)观望不买。
                  </div>
                </>
              )}
              {strategy === 'calendar' && (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>🧠 日历效应叠加法</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <strong>逻辑：</strong>根据历史数据统计，一周当中哪一天黄金最容易遭到抛售产生低点？<br/>
                    <strong>算法：</strong>如果今天是全周最佳买入日，则现价买入；否则建议观望，并在现价上往下打折预期累计跌幅。
                  </div>
                </>
              )}
              {strategy === 'macro' && (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>🧠 宏观多因子跨市场套利</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <strong>逻辑：</strong>美元指数和美国十年期国债收益率是压制金价的两座大山。利用它们的数据预判黄金短线异动。<br/>
                    <strong>算法：</strong>如果 DXY 和 US10Y 盘中双双暴涨，预判黄金承压，目标挂单价向下打折 1%，并 1.5 倍加仓接多。
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="dashboard-grid">
            <div className={`indicator-card ${isActive('price') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header">
                <div className="indicator-title">当前金价 (CNY/g)</div>
              </div>
              <div className="indicator-value">{indicators.currentPrice.toFixed(2)}</div>
            </div>

            <div className={`indicator-card ${isActive('atr') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header">
                <div className="indicator-title">
                  周波动率预估 (ATR)
                  <Tooltip content="平均真实波动幅度 (Average True Range)。衡量近期震荡剧烈程度，指导挂单安全垫。"></Tooltip>
                </div>
              </div>
              <div className="indicator-value">{indicators.weeklyAtr.toFixed(2)}</div>
            </div>

            <div className={`indicator-card ${isActive('bias') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header">
                <div className="indicator-title">
                  MA60 乖离率 (BIAS)
                  <Tooltip content="当前价格偏离中长期均线的比例。用于动态决定加倍买入还是减少定投克数。"></Tooltip>
                </div>
              </div>
              <div className={`indicator-value ${indicators.bias > 0 ? 'up' : 'down'}`}>
                {(indicators.bias * 100).toFixed(2)}%
              </div>
            </div>

            <div className={`indicator-card ${isActive('rsi') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header">
                <div className="indicator-title">
                  相对强弱 (RSI)
                  <Tooltip content="数值在 0-100 之间，高于 70 为超买，低于 30 为超卖（左侧买入信号）。"></Tooltip>
                </div>
              </div>
              <div className="indicator-value">{indicators.rsi ? indicators.rsi.toFixed(1) : '--'}</div>
            </div>

            <div className={`indicator-card ${isActive('fib') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header">
                <div className="indicator-title">
                  斐波那契回调线 (Fib)
                  <Tooltip content="通过近期最高和最低点计算的回调支撑位。61.8% 常常是强趋势中非常坚固的支撑点，适合左侧抄底。"></Tooltip>
                </div>
              </div>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-primary)', fontWeight: '500', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>38.2% 支撑:</span>
                  <span>{indicators.fib?.level382.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>61.8% 强撑:</span>
                  <span className="highlight" style={{ color: 'var(--accent-gold)' }}>{indicators.fib?.level618.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className={`indicator-card ${isActive('macro') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header">
                <div className="indicator-title">
                  宏观因子 (DXY/US10Y)
                  <Tooltip content="实时抓取的美元指数和十年期美债收益率。双双走高时黄金短线承压，是左侧吸筹的机会。"></Tooltip>
                </div>
              </div>
              <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                {macro ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>DXY:</span>
                      <span className={macro.dxy?.change > 0 ? 'up' : 'down'} style={{ fontWeight: '600' }}>
                        {macro.dxy?.price?.toFixed(2)} ({macro.dxy?.changePercent > 0 ? '+' : ''}{macro.dxy?.changePercent?.toFixed(2)}%)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>US10Y:</span>
                      <span className={macro.tnx?.change > 0 ? 'up' : 'down'} style={{ fontWeight: '600' }}>
                        {macro.tnx?.price?.toFixed(3)}% ({macro.tnx?.changePercent > 0 ? '+' : ''}{macro.tnx?.changePercent?.toFixed(2)}%)
                      </span>
                    </div>
                  </>
                ) : '加载中...'}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：挂单建议 */}
        <div className="right-panel">
          <div className="card action-card">
            <h2 style={{ fontSize: '1.25rem' }}>本周操作建议</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.85rem' }}>
              基于所选的 <strong>策略</strong> 动态生成
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
               <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>基准金额:</span>
               <input 
                  type="number" 
                  value={baseGrams} 
                  onChange={(e) => setBaseGrams(Number(e.target.value) || 1)}
                  min="1"
                  style={{ width: '60px', padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', textAlign: 'center' }}
               />
               <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>克</span>
            </div>
            
            <div className="advice-box">
              <div className="advice-label">🎯 目标挂单买价</div>
              <div className="advice-value highlight">{advice?.targetPrice.toFixed(2)}</div>
              <div className="advice-sub">元/克</div>
            </div>

            <div className="advice-box">
              <div className="advice-label">⚖️ 建议购入克数</div>
              <div className="advice-value">
                {advice?.grams.toFixed(1)} g 
                <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  ({advice?.multiplier}x)
                </span>
              </div>
              <div className="advice-sub" style={{ marginTop: '12px', color: 'var(--text-primary)', fontWeight: '500', lineHeight: '1.5' }}>
                💡 {advice?.reason}
              </div>
            </div>
            
            <div style={{ marginTop: '30px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <strong>⚠️ 免责声明：</strong><br/>
              本工具为量化策略演示，算法输出基于历史统计与指标计算，<strong>不构成任何实际投资建议</strong>。市场有风险，过去的表现不代表未来收益，请根据自身风险承受能力独立判断，投资入市需谨慎。
            </div>

            <div className="footer-note" style={{ marginTop: '30px' }}>
              若未成交，说明未现期望低点，资金可留待下次定投。
            </div>
          </div>
        </div>
      </div>

      {/* 底部 K 线图 */}
      <div className="card" style={{ marginTop: '24px' }}>
        <Chart data={data} />
      </div>
    </div>
  );
}

export default App;
