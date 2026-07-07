import React, { useState, useEffect, useMemo } from 'react';
import { parse } from 'mathjs';
import { fetchGoldData, fetchMacroData, fetchHistoricalMacroData, mergeMacroIntoGoldData } from './utils/api';
import { calculateAllIndicators } from './utils/indicators';
import { BUILT_IN_BUY_STRATEGIES, BUILT_IN_SELL_STRATEGIES } from './utils/builtin_formulas';
import { Tooltip } from './components/Tooltip';
import { Chart } from './components/Chart';
import { evaluateStrategy, evaluateSellStrategy } from './utils/strategies';
import { runBacktest } from './utils/backtest';
import { BacktestPanel } from './components/BacktestPanel';
import TradeTable from './components/TradeTable';
import StrategyLeaderboard from './components/StrategyLeaderboard';
import { StrategyEditor } from './components/StrategyEditor';
import { MultiSelectDropdown } from './components/MultiSelectDropdown';
import { ConfirmModal } from './components/ConfirmModal';

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
  const [sellFee, setSellFee] = useState(0.01);
  const [sellStrategies, setSellStrategies] = useState([]);
  const allowSell = sellStrategies.length > 0;
  const [minTradeVolume, setMinTradeVolume] = useState(1);
  const [bottomTab, setBottomTab] = useState('trades'); // 'trades' | 'leaderboard'
  const [error, setError] = useState(null);

  const [customBuyStrategies, setCustomBuyStrategies] = useState(() => JSON.parse(localStorage.getItem('customBuyStrategies') || '[]'));
  const [editingBuyStrategy, setEditingBuyStrategy] = useState(null);
  const [usedIndicators, setUsedIndicators] = useState([]);

  const [customSellStrategies, setCustomSellStrategies] = useState(() => JSON.parse(localStorage.getItem('customSellStrategies') || '[]'));
  const [editingSellStrategy, setEditingSellStrategy] = useState(null);

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const allBuyOptions = useMemo(() => [...Object.keys(BUILT_IN_BUY_STRATEGIES), ...customBuyStrategies.map(s => s.id)], [customBuyStrategies]);
  const allSellOptions = useMemo(() => [...Object.keys(BUILT_IN_SELL_STRATEGIES), ...customSellStrategies.map(s => s.id)], [customSellStrategies]);
  const [leaderboardBuyFilter, setLeaderboardBuyFilter] = useState(allBuyOptions);
  const [leaderboardSellFilter, setLeaderboardSellFilter] = useState(allSellOptions);

  useEffect(() => {
    setLeaderboardBuyFilter(prev => {
      const validPrev = prev.filter(o => allBuyOptions.includes(o));
      const missing = allBuyOptions.filter(o => !validPrev.includes(o) && !localStorage.getItem(`unselected_buy_${o}`));
      if (validPrev.length === prev.length && missing.length === 0) return prev;
      return [...validPrev, ...missing];
    });
  }, [allBuyOptions]);

  useEffect(() => {
    setLeaderboardSellFilter(prev => {
      const validPrev = prev.filter(o => allSellOptions.includes(o));
      const missing = allSellOptions.filter(o => !validPrev.includes(o) && !localStorage.getItem(`unselected_sell_${o}`));
      if (validPrev.length === prev.length && missing.length === 0) return prev;
      return [...validPrev, ...missing];
    });
  }, [allSellOptions]);

  const toggleLeaderboardBuy = (opt) => {
    setLeaderboardBuyFilter(prev => {
      if (prev.includes(opt)) {
        localStorage.setItem(`unselected_buy_${opt}`, '1');
        return prev.filter(x => x !== opt);
      } else {
        localStorage.removeItem(`unselected_buy_${opt}`);
        return [...prev, opt];
      }
    });
  };

  const toggleLeaderboardSell = (opt) => {
    setLeaderboardSellFilter(prev => {
      if (prev.includes(opt)) {
        localStorage.setItem(`unselected_sell_${opt}`, '1');
        return prev.filter(x => x !== opt);
      } else {
        localStorage.removeItem(`unselected_sell_${opt}`);
        return [...prev, opt];
      }
    });
  };

  useEffect(() => {
    localStorage.setItem('customBuyStrategies', JSON.stringify(customBuyStrategies));
  }, [customBuyStrategies]);

  useEffect(() => {
    localStorage.setItem('customSellStrategies', JSON.stringify(customSellStrategies));
  }, [customSellStrategies]);

  useEffect(() => {
    if (strategy.startsWith('custom_buy_')) {
      const customStrat = customBuyStrategies.find(s => s.id === strategy);
      if (customStrat) {
        try {
          const node = parse(customStrat.script);
          const vars = node.filter(n => n.isSymbolNode).map(n => n.name);
          setUsedIndicators(vars);
        } catch (err) {}
      }
    }
  }, [strategy, customBuyStrategies]);

  const toggleSellStrategy = (strat) => {
    setSellStrategies(prev => 
      prev.includes(strat) ? prev.filter(x => x !== strat) : [...prev, strat]
    );
  };

  const strategyLeaderboardData = useMemo(() => {
    if (!data || data.length === 0) return [];
    if (leaderboardBuyFilter.length === 0) return [];

    const powerSet = (arr) => arr.reduce((subsets, value) => subsets.concat(subsets.map(set => [value, ...set])), [[]]);
    const sellCombinations = powerSet(leaderboardSellFilter);

    const leaderboard = [];
    leaderboardBuyFilter.forEach(buyStrat => {
      sellCombinations.forEach(sellStrats => {
        const tempAllowSell = sellStrats.length > 0;
        const result = runBacktest(data, buyStrat, baseGrams, { 
          returnMethod, buyMode, tradeFrequency, atrPeriod, 
          allowSell: tempAllowSell, sellFee, sellStrategies: sellStrats, minTradeVolume 
        });
        
        if (result && result.trades) {
          leaderboard.push({
            buyStrategy: buyStrat,
            sellStrategies: sellStrats,
            buyName: buyStrat.startsWith('custom_buy_') ? (customBuyStrategies.find(s => s.id === buyStrat)?.name || buyStrat) : buyStrat,
            sellNames: sellStrats.map(s => s.startsWith('custom_sell_') ? (customSellStrategies.find(c => c.id === s)?.name || s) : s),
            ...result
          });
        }
      });
    });
    return leaderboard;
  }, [data, baseGrams, returnMethod, buyMode, tradeFrequency, atrPeriod, sellFee, minTradeVolume, leaderboardBuyFilter, leaderboardSellFilter, customBuyStrategies, customSellStrategies]);

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
    if (strategy.startsWith('custom_buy_')) {
      if (cardType === 'price') return true; 
      if (cardType === 'atr' && usedIndicators.includes('weeklyAtr')) return true;
      if (cardType === 'bias' && usedIndicators.includes('bias')) return true;
      if (cardType === 'rsi' && usedIndicators.includes('rsi')) return true;
      if (cardType === 'fib' && (usedIndicators.includes('fib_level382') || usedIndicators.includes('fib_level618'))) return true;
      if (cardType === 'calendar' && usedIndicators.includes('calendar_bestBuyDay')) return true;
      if (cardType === 'macro' && (usedIndicators.includes('macro_dxy_changePercent') || usedIndicators.includes('macro_tnx_changePercent') || usedIndicators.includes('macro_valid'))) return true;
      return false;
    }

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
      <ConfirmModal 
        {...confirmDialog} 
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))} 
      />
      <div className="two-column-layout">
        {/* 左侧：策略选择与指标监控 */}
        <div className="left-panel">
          <div className="card">
            <h3 className="section-title">买入策略</h3>
            <div className="strategy-selector" style={{ flexWrap: 'wrap', overflowX: 'visible', gap: '10px' }}>
              {Object.keys(BUILT_IN_BUY_STRATEGIES).map(key => (
                <button key={key} className={`strategy-btn ${strategy === key ? 'active' : ''}`} onClick={() => setStrategy(key)}>
                  {BUILT_IN_BUY_STRATEGIES[key].name} {bestStrategy === key && <span title="本段历史收益最高" style={{marginLeft: '4px'}}>👑</span>}
                </button>
              ))}
              
              {customBuyStrategies.map(strat => (
                <button key={strat.id} className={`strategy-btn ${strategy === strat.id ? 'active' : ''}`} onClick={() => { setStrategy(strat.id); setEditingBuyStrategy(null); }}>
                  [自定义] {strat.name} {bestStrategy === strat.id && <span title="本段历史收益最高" style={{marginLeft: '4px'}}>👑</span>}
                </button>
              ))}

              <button className={`strategy-btn ${editingBuyStrategy === 'new' ? 'active' : ''}`} onClick={() => setEditingBuyStrategy('new')}>
                [+] 新建策略
              </button>
            </div>
            
            <div style={{ marginTop: '16px' }}>
              {(() => {
                const isNew = editingBuyStrategy === 'new';
                const activeStratId = isNew ? null : strategy;
                let stratObj = null;
                let isBuiltIn = false;
                let readOnly = true;

                if (isNew) {
                  stratObj = null;
                  isBuiltIn = false;
                  readOnly = false;
                } else if (BUILT_IN_BUY_STRATEGIES[activeStratId]) {
                  stratObj = { id: activeStratId, ...BUILT_IN_BUY_STRATEGIES[activeStratId] };
                  isBuiltIn = true;
                  readOnly = true;
                } else {
                  stratObj = customBuyStrategies.find(s => s.id === activeStratId) || { id: activeStratId, name: activeStratId, description: '', script: '' };
                  isBuiltIn = false;
                  readOnly = editingBuyStrategy !== activeStratId;
                }

                if (!stratObj && !isNew) return null;

                return (
                  <StrategyEditor
                    type="buy"
                    strategy={stratObj}
                    isBuiltIn={isBuiltIn}
                    readOnly={readOnly}
                    onEdit={() => setEditingBuyStrategy(activeStratId)}
                    onDelete={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: '删除策略',
                        message: `确定要删除买入策略「${stratObj.name}」吗？`,
                        onConfirm: () => {
                          setCustomBuyStrategies(prev => prev.filter(s => s.id !== activeStratId));
                          setStrategy('grid');
                          setEditingBuyStrategy(null);
                        }
                      });
                    }}
                    onSave={(newStrat) => {
                      setCustomBuyStrategies(prev => {
                        const idx = prev.findIndex(s => s.id === newStrat.id);
                        if (idx >= 0) {
                          const next = [...prev];
                          next[idx] = newStrat;
                          return next;
                        }
                        return [...prev, newStrat];
                      });
                      setStrategy(newStrat.id);
                      setEditingBuyStrategy(null);
                    }}
                    onCancel={() => setEditingBuyStrategy(null)}
                  />
                );
              })()}
            </div>
          </div>

          <div className="card" style={{ marginTop: '16px' }}>
            <h3 className="section-title" style={{ margin: 0, marginBottom: '16px' }}>卖出套现配置 (全局)</h3>
            
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>卖出策略组合 (支持多选)</div>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                    卖出手续费: 
                    <input type="number" step="0.1" value={sellFee * 100} onChange={e => setSellFee(Number(e.target.value) / 100)} style={{ width: '60px', marginLeft: '6px', marginRight: '4px', padding: '4px 6px', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                    %
                  </label>
                </div>
                <div className="strategy-selector" style={{ flexWrap: 'wrap', overflowX: 'visible', gap: '10px' }}>
                  {Object.keys(BUILT_IN_SELL_STRATEGIES).map(key => (
                    <button key={key} className={`strategy-btn ${sellStrategies.includes(key) ? 'active' : ''}`} onClick={() => toggleSellStrategy(key)}>
                      {BUILT_IN_SELL_STRATEGIES[key].name}
                    </button>
                  ))}
                  
                  {customSellStrategies.map(strat => (
                    <button key={strat.id} className={`strategy-btn ${sellStrategies.includes(strat.id) ? 'active' : ''}`} onClick={() => toggleSellStrategy(strat.id)}>
                      [自定义] {strat.name}
                    </button>
                  ))}

                  <button className={`strategy-btn ${editingSellStrategy === 'new' ? 'active' : ''}`} onClick={() => setEditingSellStrategy('new')}>
                    [+] 新建卖出策略
                  </button>
                </div>
                
                {(sellStrategies.length > 0 || editingSellStrategy) && (
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sellStrategies.map(stratId => {
                      let stratObj = null;
                      let isBuiltIn = false;
                      let readOnly = editingSellStrategy?.id !== stratId;

                      if (BUILT_IN_SELL_STRATEGIES[stratId]) {
                        stratObj = { id: stratId, ...BUILT_IN_SELL_STRATEGIES[stratId] };
                        isBuiltIn = true;
                        readOnly = true;
                      } else {
                        stratObj = customSellStrategies.find(s => s.id === stratId);
                        if (!stratObj) return null;
                      }

                      return (
                        <StrategyEditor
                          key={stratId}
                          type="sell"
                          strategy={stratObj}
                          isBuiltIn={isBuiltIn}
                          readOnly={readOnly}
                          onEdit={() => setEditingSellStrategy(stratObj)}
                          onDelete={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: '删除卖出策略',
                              message: `确定要删除卖出策略「${stratObj.name}」吗？`,
                              onConfirm: () => {
                                setCustomSellStrategies(prev => prev.filter(s => s.id !== stratId));
                                setSellStrategies(prev => prev.filter(s => s !== stratId));
                              }
                            });
                          }}
                          onSave={(newStrat) => {
                            setCustomSellStrategies(prev => {
                              const idx = prev.findIndex(s => s.id === newStrat.id);
                              if (idx >= 0) {
                                const next = [...prev];
                                next[idx] = newStrat;
                                return next;
                              }
                              return [...prev, newStrat];
                            });
                            if (!sellStrategies.includes(newStrat.id)) {
                              setSellStrategies(prev => [...prev, newStrat.id]);
                            }
                            setEditingSellStrategy(null);
                          }}
                          onCancel={() => setEditingSellStrategy(null)}
                        />
                      );
                    })}

                    {editingSellStrategy === 'new' && (
                      <StrategyEditor
                        type="sell"
                        strategy={null}
                        isBuiltIn={false}
                        readOnly={false}
                        onSave={(newStrat) => {
                          setCustomSellStrategies(prev => [...prev, newStrat]);
                          setSellStrategies(prev => [...prev, newStrat.id]);
                          setEditingSellStrategy(null);
                        }}
                        onCancel={() => setEditingSellStrategy(null)}
                      />
                    )}
                  </div>
                )}
              </div>
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
                leaderboardBuyFilter={leaderboardBuyFilter}
                setLeaderboardBuyFilter={(newSelection) => {
                  setLeaderboardBuyFilter(newSelection);
                  allBuyOptions.forEach(opt => {
                    if (newSelection.includes(opt)) localStorage.removeItem(`unselected_buy_${opt}`);
                    else localStorage.setItem(`unselected_buy_${opt}`, '1');
                  });
                }}
                allBuyOptions={allBuyOptions}
                allSellOptions={allSellOptions}
                leaderboardSellFilter={leaderboardSellFilter}
                setLeaderboardSellFilter={(newSelection) => {
                  setLeaderboardSellFilter(newSelection);
                  allSellOptions.forEach(opt => {
                    if (newSelection.includes(opt)) localStorage.removeItem(`unselected_sell_${opt}`);
                    else localStorage.setItem(`unselected_sell_${opt}`, '1');
                  });
                }}
                getOptionLabelBuy={opt => opt.startsWith('custom_buy_') ? (customBuyStrategies.find(s => s.id === opt)?.name || opt) : (BUILT_IN_BUY_STRATEGIES[opt]?.name || opt)}
                getOptionLabelSell={opt => opt.startsWith('custom_sell_') ? (customSellStrategies.find(s => s.id === opt)?.name || opt) : (BUILT_IN_SELL_STRATEGIES[opt]?.name || opt)}
                onApply={(buyStrat, sellStrats) => {
                  setStrategy(buyStrat);
                  setSellStrategies(sellStrats);
                }}
              />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
