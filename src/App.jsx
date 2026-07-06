import React, { useState, useEffect, useMemo } from 'react';
import { fetchGoldData, fetchMacroData, fetchHistoricalMacroData, mergeMacroIntoGoldData } from './utils/api';
import { calculateAllIndicators } from './utils/indicators';
import { Tooltip } from './components/Tooltip';
import { Chart } from './components/Chart';
import { evaluateStrategy, evaluateSellStrategy } from './utils/strategies';
import { runBacktest } from './utils/backtest';
import { BacktestPanel } from './components/BacktestPanel';
import TradeTable from './components/TradeTable';
import StrategyLeaderboard from './components/StrategyLeaderboard';

function App() {
  const [data, setData] = useState([]);
  const [indicators, setIndicators] = useState(null);
  const [macro, setMacro] = useState(null);
  const [strategy, setStrategy] = useState('grid');
  const [baseGrams, setBaseGrams] = useState(1);
  const [atrPeriod, setAtrPeriod] = useState(14);
  const [returnMethod, setReturnMethod] = useState('xirr');
  const [buyMode, setBuyMode] = useState('dynamic');
  const [tradeFrequency, setTradeFrequency] = useState('weekly');
  const [showTradePoints, setShowTradePoints] = useState(true);
  const [activeTab, setActiveTab] = useState('indicators'); // 'indicators' or 'backtest'
  const [allowSell, setAllowSell] = useState(false);
  const [sellFee, setSellFee] = useState(0.01);
  const [sellStrategies, setSellStrategies] = useState(['profit_scale_out']);
  const [minTradeVolume, setMinTradeVolume] = useState(1);
  const [bottomTab, setBottomTab] = useState('trades'); // 'trades' | 'leaderboard'
  const [error, setError] = useState(null);

  const toggleSellStrategy = (strat) => {
    setSellStrategies(prev => 
      prev.includes(strat) ? prev.filter(x => x !== strat) : [...prev, strat]
    );
  };

  const strategyLeaderboardData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const testBuyStrategies = ['grid', 'grid_drawdown', 'grid_fib', 'mean_reversion', 'calendar', 'macro'];
    const allSellStrats = ['rsi_scale_out', 'profit_scale_out', 'trend_break_clear'];
    
    // Generate power set of sell strategies
    const powerSet = (arr) => arr.reduce((subsets, value) => subsets.concat(subsets.map(set => [value, ...set])), [[]]);
    const sellCombinations = powerSet(allSellStrats);

    const leaderboard = [];
    testBuyStrategies.forEach(buyStrat => {
      sellCombinations.forEach(sellStrats => {
        const tempAllowSell = sellStrats.length > 0;
        const result = runBacktest(data, buyStrat, baseGrams, { 
          returnMethod, buyMode, tradeFrequency, atrPeriod, 
          allowSell: tempAllowSell, sellFee, sellStrategies: sellStrats, minTradeVolume 
        });
        
        if (result && result.trades) { // Check if valid result
          leaderboard.push({
            buyStrategy: buyStrat,
            sellStrategies: sellStrats,
            ...result
          });
        }
      });
    });
    return leaderboard;
  }, [data, baseGrams, returnMethod, buyMode, tradeFrequency, atrPeriod, sellFee, minTradeVolume]);

  const bestStrategy = useMemo(() => {
    if (!strategyLeaderboardData || strategyLeaderboardData.length === 0) return 'grid';
    // Find best buy strategy only, matching current behavior of showing crown on buy buttons
    const buyOnlyResults = strategyLeaderboardData.filter(r => r.sellStrategies.length === 0);
    if (buyOnlyResults.length === 0) return 'grid';
    return buyOnlyResults.reduce((best, curr) => curr.annualizedReturn > best.annualizedReturn ? curr : best).buyStrategy;
  }, [strategyLeaderboardData]);

  useEffect(() => {
    Promise.all([
      fetchGoldData(),
      fetchHistoricalMacroData('10y')
    ]).then(([goldResult, macroHistoryResult]) => {
      if (goldResult.length < 60) {
        throw new Error('历史数据不足 60 条，无法进行指标计算。');
      }
      
      let finalData = goldResult;
      if (macroHistoryResult) {
        finalData = mergeMacroIntoGoldData(goldResult, macroHistoryResult);
      }
      setData(finalData);
    }).catch(err => {
      setError(err.message);
    });

    // 依然保留获取最新一天数据用于实时指标面板展示
    fetchMacroData().then(res => {
      if (res) setMacro(res);
    });
  }, []);

  useEffect(() => {
    if (data.length >= 60) {
      setIndicators(calculateAllIndicators(data, { atrPeriod }));
    }
  }, [data, atrPeriod]);

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
    const adv = evaluateStrategy(indicators, macro, strategy, baseGrams, new Date().getDay() || 7);
    if (adv.grams > 0 && adv.grams < minTradeVolume) {
      adv.grams = 0;
      adv.multiplier = 0;
      adv.reason += '（未达到最低买卖量，跳过）';
    }
    return adv;
  }, [indicators, macro, baseGrams, strategy, minTradeVolume]);

  const backtestResult = useMemo(() => {
    return runBacktest(data, strategy, baseGrams, { returnMethod, buyMode, tradeFrequency, atrPeriod, allowSell, sellFee, sellStrategies, minTradeVolume });
  }, [data, strategy, baseGrams, returnMethod, buyMode, tradeFrequency, atrPeriod, allowSell, sellFee, sellStrategies, minTradeVolume]);

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
      <div className="two-column-layout">
        {/* 左侧：策略选择与指标监控 */}
        <div className="left-panel">
          <div className="card">
            <h3 className="section-title">买入策略</h3>
            <div className="strategy-selector" style={{ flexWrap: 'wrap', overflowX: 'visible', gap: '10px' }}>
              <button className={`strategy-btn ${strategy === 'grid' ? 'active' : ''}`} onClick={() => setStrategy('grid')}>
                基础网格 {bestStrategy === 'grid' && <span title="本段历史收益最高" style={{marginLeft: '4px'}}>👑</span>}
              </button>
              <button className={`strategy-btn ${strategy === 'grid_drawdown' ? 'active' : ''}`} onClick={() => setStrategy('grid_drawdown')}>
                历史典型回撤 {bestStrategy === 'grid_drawdown' && <span title="本段历史收益最高" style={{marginLeft: '4px'}}>👑</span>}
              </button>
              <button className={`strategy-btn ${strategy === 'grid_fib' ? 'active' : ''}`} onClick={() => setStrategy('grid_fib')}>
                动态波动 {bestStrategy === 'grid_fib' && <span title="本段历史收益最高" style={{marginLeft: '4px'}}>👑</span>}
              </button>
              <button className={`strategy-btn ${strategy === 'mean_reversion' ? 'active' : ''}`} onClick={() => setStrategy('mean_reversion')}>
                均值回归 {bestStrategy === 'mean_reversion' && <span title="本段历史收益最高" style={{marginLeft: '4px'}}>👑</span>}
              </button>
              <button className={`strategy-btn ${strategy === 'calendar' ? 'active' : ''}`} onClick={() => setStrategy('calendar')}>
                日历效应 {bestStrategy === 'calendar' && <span title="本段历史收益最高" style={{marginLeft: '4px'}}>👑</span>}
              </button>
              <button className={`strategy-btn ${strategy === 'macro' ? 'active' : ''}`} onClick={() => setStrategy('macro')}>
                宏观因子
              </button>
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

          <div className="card" style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="section-title" style={{ margin: 0 }}>卖出套现配置 (全局)</h3>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}>
                <input type="checkbox" checked={allowSell} onChange={e => setAllowSell(e.target.checked)} style={{ marginRight: '8px', transform: 'scale(1.2)' }} />
                启用卖出功能
              </label>
            </div>
            
            {allowSell && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>卖出策略组合 (支持多选)</div>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                    卖出手续费: 
                    <input type="number" step="0.1" value={sellFee * 100} onChange={e => setSellFee(Number(e.target.value) / 100)} style={{ width: '60px', marginLeft: '6px', marginRight: '4px', padding: '4px 6px', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                    %
                  </label>
                </div>
                <div className="strategy-selector" style={{ flexWrap: 'wrap', overflowX: 'visible', gap: '10px' }}>
                  <button className={`strategy-btn ${sellStrategies.includes('rsi_scale_out') ? 'active' : ''}`} onClick={() => toggleSellStrategy('rsi_scale_out')}>
                    [压舱石] 均值回归高抛
                  </button>
                  <button className={`strategy-btn ${sellStrategies.includes('profit_scale_out') ? 'active' : ''}`} onClick={() => toggleSellStrategy('profit_scale_out')}>
                    [压舱石] 目标收益减仓
                  </button>
                  <button className={`strategy-btn ${sellStrategies.includes('trend_break_clear') ? 'active' : ''}`} onClick={() => toggleSellStrategy('trend_break_clear')}>
                    [防守] 破位清仓止损
                  </button>
                </div>
                
                {sellStrategies.length > 0 && (
                  <div className="strategy-description" style={{ marginTop: '16px', padding: '16px', backgroundColor: 'var(--bg-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    {sellStrategies.includes('rsi_scale_out') && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>📉 [压舱石] 均值回归高抛</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                          当 RSI 大于 70（超买）且当前处于浮盈状态时，卖出 30% 持仓锁定利润，保留 70% 作为压舱石底仓。
                        </div>
                      </div>
                    )}
                    {sellStrategies.includes('profit_scale_out') && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>📉 [压舱石] 目标收益减仓</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                          当浮盈比例超过 10% 时，卖出 50% 持仓，收回大部分本金，剩余 50% 继续跟随趋势。
                        </div>
                      </div>
                    )}
                    {sellStrategies.includes('trend_break_clear') && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>🛡️ [防守] 破位清仓止损</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                          当价格跌破 MA60 中期均线，且当前仍处于浮盈状态时，清仓（卖出 100%）以规避长期下跌风险。
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '24px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <button 
              onClick={() => setActiveTab('indicators')}
              style={{ 
                background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', padding: '4px 8px',
                color: activeTab === 'indicators' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'indicators' ? '600' : '400',
                borderBottom: activeTab === 'indicators' ? '2px solid var(--accent-gold)' : 'none'
              }}
            >
              实时指标
            </button>
            <button 
              onClick={() => setActiveTab('backtest')}
              style={{ 
                background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', padding: '4px 8px',
                color: activeTab === 'backtest' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'backtest' ? '600' : '400',
                borderBottom: activeTab === 'backtest' ? '2px solid var(--accent-gold)' : 'none'
              }}
            >
              历史回测
            </button>
          </div>

          {activeTab === 'indicators' ? (
            <div className="dashboard-grid">
              <div className={`indicator-card ${isActive('price') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header">
                <div className="indicator-title">当前金价 (CNY/g)</div>
              </div>
              <div className="indicator-value">{indicators.currentPrice.toFixed(2)}</div>
            </div>

            <div className={`indicator-card ${isActive('atr') ? 'active' : 'dimmed'}`}>
              <div className="indicator-header" style={{ alignItems: 'flex-start' }}>
                <div className="indicator-title">
                  周波动率预估 (ATR)
                  <Tooltip content="平均真实波动幅度 (Average True Range)。衡量近期震荡剧烈程度，指导挂单安全垫。"></Tooltip>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input 
                    type="number" 
                    value={atrPeriod} 
                    onChange={e => setAtrPeriod(Number(e.target.value) || 1)} 
                    min="1" max="52" 
                    style={{ width: '40px', padding: '2px 4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.8rem', textAlign: 'center' }} 
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>周</span>
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
          ) : (
            <BacktestPanel 
              result={backtestResult} 
              strategy={strategy} 
              returnMethod={returnMethod}
              setReturnMethod={setReturnMethod}
              buyMode={buyMode}
              setBuyMode={setBuyMode}
              tradeFrequency={tradeFrequency}
              setTradeFrequency={setTradeFrequency}
              showTradePoints={showTradePoints}
              setShowTradePoints={setShowTradePoints}
            />
          )}
        </div>

        {/* 右侧：挂单建议 */}
        <div className="right-panel">
          <div className="card action-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>本周测算参考</h2>
            {/* 决策标签 */}
            {advice && indicators && (
              <div>
                {(() => {
                  let sellTag = null;
                  if (allowSell && backtestResult && backtestResult.totalGrams > 0) {
                    const sellAdvice = evaluateSellStrategy(indicators, backtestResult.totalGrams, backtestResult.averageCost, sellStrategies);
                    if (sellAdvice.shouldSell && backtestResult.totalGrams * sellAdvice.sellRatio >= minTradeVolume) {
                      sellTag = (
                        <span style={{ padding: '6px 12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 'bold' }}>
                          📉 止盈卖出
                        </span>
                      );
                    }
                  }
                  
                  if (sellTag) return sellTag;
                  
                  if (advice.multiplier === 0) {
                    return (
                      <span style={{ padding: '6px 12px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 'bold' }}>
                        ⏸️ 观望跳过
                      </span>
                    );
                  } else if (indicators.currentPrice <= advice.targetPrice) {
                    return (
                      <span style={{ padding: '6px 12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 'bold' }}>
                        ✅ 现价参考
                      </span>
                    );
                  } else {
                    return (
                      <span style={{ padding: '6px 12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#D97706', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 'bold' }}>
                        ⏳ 挂单等待
                      </span>
                    );
                  }
                })()}
              </div>
            )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>基础定投克数 (g)</span>
              <input 
                type="number" 
                value={baseGrams} 
                onChange={e => setBaseGrams(Number(e.target.value) || 1)} 
                min="0.1" step="0.1" 
                style={{ width: '70px', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'right' }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>最低买卖量限制 (g)</span>
              <input 
                type="number" 
                value={minTradeVolume} 
                onChange={e => setMinTradeVolume(Number(e.target.value) || 0)} 
                min="0" step="0.1" 
                style={{ width: '70px', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'right' }} 
              />
            </div>

            <div className="advice-box">
              <div className="advice-label">🎯 测算挂单买价</div>
              <div className="advice-value highlight">{advice?.targetPrice.toFixed(2)}</div>
              <div className="advice-sub">元/克</div>
            </div>

            <div className="advice-box">
              <div className="advice-label">⚖️ 测算购入克数</div>
              <div className="advice-value">
                {advice?.grams.toFixed(2)} g 
                <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  ({advice?.multiplier.toFixed(2)}x)
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
        <Chart data={data} trades={backtestResult?.trades || []} showTrades={showTradePoints} />
      </div>

      {/* 交易明细表格与策略排行榜 (只在回测模式下显示) */}
      {activeTab === 'backtest' && backtestResult?.trades?.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <button 
              onClick={() => setBottomTab('trades')}
              style={{ 
                background: 'none', border: 'none', padding: '8px 4px', 
                cursor: 'pointer', fontWeight: bottomTab === 'trades' ? 'bold' : 'normal',
                color: bottomTab === 'trades' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                borderBottom: bottomTab === 'trades' ? '2px solid var(--accent-gold)' : '2px solid transparent',
                marginBottom: '-9px'
              }}
            >
              📑 回测交易明细
            </button>
            <button 
              onClick={() => setBottomTab('leaderboard')}
              style={{ 
                background: 'none', border: 'none', padding: '8px 4px', 
                cursor: 'pointer', fontWeight: bottomTab === 'leaderboard' ? 'bold' : 'normal',
                color: bottomTab === 'leaderboard' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                borderBottom: bottomTab === 'leaderboard' ? '2px solid var(--accent-gold)' : '2px solid transparent',
                marginBottom: '-9px'
              }}
            >
              🏆 策略排行榜
            </button>
          </div>
          
          {bottomTab === 'trades' ? (
            showTradePoints && <TradeTable trades={backtestResult.trades} />
          ) : (
            <StrategyLeaderboard 
              data={strategyLeaderboardData} 
              currentStrategy={strategy}
              currentSellStrategies={allowSell ? sellStrategies : []}
              onApply={(buyStrat, sellStrats) => {
                setStrategy(buyStrat);
                if (sellStrats.length > 0) {
                  setAllowSell(true);
                  setSellStrategies(sellStrats);
                } else {
                  setAllowSell(false);
                  setSellStrategies([]);
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
