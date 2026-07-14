import React, { useState, useEffect, useMemo, useRef } from 'react';
import { parse } from 'mathjs';
import { dataManager } from './services/data/DataManager';
import { fetchMacroData, fetchHistoricalMacroData, mergeMacroIntoGoldData } from './utils/api';
import { dbStore } from './services/storage/IndexedDBStore';
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
import { ConfirmModal } from './components/ConfirmModal';
import { TopBar } from './components/DataManagement/TopBar';

function App() {
  const [currentSymbolConfig, setCurrentSymbolConfig] = useState({
    source: 'ccb', symbol: 'gold', assetType: 'commodity', name: '黄金(建行)', range: 'max'
  });
  const [data, setData] = useState([]);
  const [indicators, setIndicators] = useState(null);
  const [macro, setMacro] = useState(null);
  const [strategy, setStrategy] = useState('grid');
  const [baseGrams, setBaseGrams] = useState(1);
  const [atrPeriod, setAtrPeriod] = useState(14);
  const [buyMode, setBuyMode] = useState('dynamic');
  const [tradeFrequency, setTradeFrequency] = useState('weekly');
  const [enableLadderOrders, setEnableLadderOrders] = useState(false);
  const [orderValidity, setOrderValidity] = useState(6);
  const [showTradePoints, setShowTradePoints] = useState(true);
  const [activeTab, setActiveTab] = useState('indicators'); // 'indicators' or 'backtest'
  const [sellFee, setSellFee] = useState(0.01);
  const [sellStrategies, setSellStrategies] = useState([]);
  const allowSell = sellStrategies.length > 0;
  const [minTradeVolume, setMinTradeVolume] = useState(1);
  const [lotSize, setLotSize] = useState(0.01);
  const [bottomTab, setBottomTab] = useState('trades'); // 'trades' | 'leaderboard'
  const [backtestRange, setBacktestRange] = useState('max');
  const [error, setError] = useState(null);

  const [customBuyStrategies, setCustomBuyStrategies] = useState(() => {
    try { return JSON.parse(localStorage.getItem('customBuyStrategies') || '[]'); } catch { return []; }
  });
  const [editingBuyStrategy, setEditingBuyStrategy] = useState(null);
  const [usedIndicators, setUsedIndicators] = useState([]);

  const [customSellStrategies, setCustomSellStrategies] = useState(() => {
    try { return JSON.parse(localStorage.getItem('customSellStrategies') || '[]'); } catch { return []; }
  });
  const [editingSellStrategy, setEditingSellStrategy] = useState(null);

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const allBuyOptions = useMemo(() => [...Object.keys(BUILT_IN_BUY_STRATEGIES), ...customBuyStrategies.map(s => s.id)], [customBuyStrategies]);
  const allSellOptions = useMemo(() => [...Object.keys(BUILT_IN_SELL_STRATEGIES), ...customSellStrategies.map(s => s.id)], [customSellStrategies]);
  const [leaderboardBuyFilter, setLeaderboardBuyFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem('leaderboardBuyFilter') || '[]'); } catch { return []; }
  });
  const [leaderboardSellFilter, setLeaderboardSellFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem('leaderboardSellFilter') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('leaderboardBuyFilter', JSON.stringify(leaderboardBuyFilter));
  }, [leaderboardBuyFilter]);

  useEffect(() => {
    localStorage.setItem('leaderboardSellFilter', JSON.stringify(leaderboardSellFilter));
  }, [leaderboardSellFilter]);

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

  const [strategyLeaderboardData, setStrategyLeaderboardData] = useState([]);
  const [pinnedRowKeys, setPinnedRowKeys] = useState([]);
  const leaderboardCacheRef = useRef(new Map());
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardProgress, setLeaderboardProgress] = useState(0);

  useEffect(() => {
    leaderboardCacheRef.current.clear();
    setStrategyLeaderboardData([]);
    setPinnedRowKeys([]);
  }, [data]);

  useEffect(() => {
    if (!data || data.length === 0) {
      return;
    }

    const powerSet = (arr) => arr.reduce((subsets, value) => subsets.concat(subsets.map(set => [value, ...set])), [[]]);
    const sellCombinations = powerSet(allSellOptions);
    const totalCombinations = allBuyOptions.length * sellCombinations.length;
    
    if (totalCombinations === 0) {
      return;
    }

    setLeaderboardLoading(true);
    setLeaderboardProgress(0);

    let buyIdx = 0;
    let sellIdx = 0;
    let cancelled = false;

    const paramsSnapshot = { tradeFrequency, buyMode, enableLadderOrders, orderValidity, baseGrams, sellFee, minTradeVolume, atrPeriod };
    const paramsKeyStr = JSON.stringify(paramsSnapshot);

    const computeChunk = () => {
      if (cancelled) return;
      
      const chunkEndTime = performance.now() + 15; // 15ms per frame
      while (performance.now() < chunkEndTime) {
        if (buyIdx >= allBuyOptions.length) {
          setStrategyLeaderboardData(Array.from(leaderboardCacheRef.current.values()));
          setLeaderboardLoading(false);
          setLeaderboardProgress(100);
          return;
        }

        const buyStrat = allBuyOptions[buyIdx];
        const sellStrats = sellCombinations[sellIdx];
        const tempAllowSell = sellStrats.length > 0;
        
        const cacheKey = `${buyStrat}_${sellStrats.join(',')}_${paramsKeyStr}`;

        if (!leaderboardCacheRef.current.has(cacheKey)) {
          const result = runBacktest(data, buyStrat, baseGrams, { 
            buyMode, tradeFrequency, atrPeriod, 
            allowSell: tempAllowSell, sellFee, sellStrategies: sellStrats, minTradeVolume, lotSize, enableLadderOrders, orderValidity
          });
          
          if (result && result.trades) {
            leaderboardCacheRef.current.set(cacheKey, {
              cacheKey,
              buyStrategy: buyStrat,
              sellStrategies: sellStrats,
              buyName: buyStrat.startsWith('custom_buy_') ? (customBuyStrategies.find(s => s.id === buyStrat)?.name || buyStrat) : buyStrat,
              sellNames: sellStrats.map(s => s.startsWith('custom_sell_') ? (customSellStrategies.find(c => c.id === s)?.name || s) : s),
              paramsSnapshot,
              ...result
            });
          }
        }

        sellIdx++;
        if (sellIdx >= sellCombinations.length) {
          sellIdx = 0;
          buyIdx++;
        }
      }
      
      const computed = buyIdx * sellCombinations.length + sellIdx;
      setLeaderboardProgress(Math.floor((computed / totalCombinations) * 100));
      
      if (buyIdx < allBuyOptions.length) {
        requestAnimationFrame(computeChunk);
      } else {
        setStrategyLeaderboardData(Array.from(leaderboardCacheRef.current.values()));
        setLeaderboardLoading(false);
        setLeaderboardProgress(100);
      }
    };

    requestAnimationFrame(computeChunk);

    return () => {
      cancelled = true;
    };
  }, [data, baseGrams, buyMode, tradeFrequency, atrPeriod, sellFee, minTradeVolume, enableLadderOrders, orderValidity, leaderboardBuyFilter, leaderboardSellFilter, customBuyStrategies, customSellStrategies]);

  const togglePin = (key) => {
    setPinnedRowKeys(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

  const bestStrategy = useMemo(() => {
    if (!strategyLeaderboardData || strategyLeaderboardData.length === 0) return 'grid';
    // Find best buy strategy only, matching current behavior of showing crown on buy buttons
    const buyOnlyResults = strategyLeaderboardData.filter(r => r.sellStrategies.length === 0);
    if (buyOnlyResults.length === 0) return 'grid';
    return buyOnlyResults.reduce((best, curr) => curr.annualizedReturn > best.annualizedReturn ? curr : best).buyStrategy;
  }, [strategyLeaderboardData]);

  const lastFetchKey = useRef(null);

  useEffect(() => {
    // 根据资产类型推断 lotSize
    if (currentSymbolConfig.assetType === 'commodity') {
      setLotSize(0.01);
    } else if (currentSymbolConfig.assetType === 'fund') {
      setLotSize(1);
    } else if (currentSymbolConfig.assetType === 'stock') {
      if (currentSymbolConfig.symbol.endsWith('.SS') || currentSymbolConfig.symbol.endsWith('.SZ')) {
        setLotSize(100);
      } else {
        setLotSize(1);
      }
    }

    const fetchKey = `${currentSymbolConfig.source}-${currentSymbolConfig.symbol}-${currentSymbolConfig.range}`;
    // 如果只是因为名称更新导致的 currentSymbolConfig 变化，无需重新拉取数据
    if (lastFetchKey.current === fetchKey && data.length > 0) {
      return;
    }
    lastFetchKey.current = fetchKey;

    // 切换数据源时清空缓存的数据
    setData([]);
    setIndicators(null);
    setError(null);

    Promise.all([
      dataManager.fetchData({ 
        source: currentSymbolConfig.source, 
        symbol: currentSymbolConfig.symbol, 
        assetType: currentSymbolConfig.assetType, 
        interval: '1d', 
        adj: 'unadj',
        range: currentSymbolConfig.range || 'max'
      }),
      fetchHistoricalMacroData('10y')
    ]).then(([goldData, macroHistoryResult]) => {
      if (goldData.length < 60) {
        throw new Error('历史数据不足 60 条，无法进行指标计算。');
      }
      
      // 合并历史宏观数据到金价数据中，供宏观策略回测使用
      let finalData = goldData;
      if (macroHistoryResult) {
        finalData = mergeMacroIntoGoldData(goldData, macroHistoryResult);
      }
      
      // 若后端返回了标准名称且不等于当前名称，则更新
      if (goldData.name && goldData.name !== currentSymbolConfig.name) {
        setCurrentSymbolConfig(prev => ({ ...prev, name: goldData.name }));
      }

      setData(finalData);
    }).catch(err => {
      setError(err.message);
    });

    // 获取最新一天宏观数据用于实时指标面板展示
    fetchMacroData().then(res => {
      if (res) setMacro(res);
    }).catch(err => {
      console.error("获取宏观数据失败:", err);
    });
  }, [currentSymbolConfig]);

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
    const adv = evaluateStrategy(indicators, macro, strategy, baseGrams, new Date().getDay() || 7, enableLadderOrders);
    if (adv.grams > 0 && adv.grams < minTradeVolume) {
      adv.grams = 0;
      adv.multiplier = 0;
      adv.reason += '（未达到最低买卖量，跳过）';
      adv.orders = [];
    }
    return adv;
  }, [indicators, macro, baseGrams, strategy, minTradeVolume, enableLadderOrders, orderValidity]);

  const backtestResult = useMemo(() => {
    if (!data || data.length === 0 || !indicators) return null;
    const allowSell = sellStrategies.length > 0;
    try {
      // 根据 backtestRange 截取时间窗口
      let daysToKeep = data.length;
      if (backtestRange === '1y') daysToKeep = 250;
      else if (backtestRange === '3y') daysToKeep = 750;
      else if (backtestRange === '5y') daysToKeep = 1250;
      else if (backtestRange === '10y') daysToKeep = 2500;
      else if (backtestRange === '20y') daysToKeep = 5000;
      
      const rangeData = data.slice(Math.max(0, data.length - daysToKeep));

      // 严格剔除未固化的盘中数据，确保回测一致性
      const backtestData = rangeData.filter(d => d.isFinal);
      return runBacktest(backtestData, strategy, baseGrams, { buyMode, tradeFrequency, atrPeriod, allowSell, sellFee, sellStrategies, minTradeVolume, lotSize, enableLadderOrders, orderValidity });
    } catch (e) {
      return { _error: e.toString() };
    }
  }, [data, strategy, baseGrams, buyMode, tradeFrequency, atrPeriod, sellStrategies, sellFee, minTradeVolume, lotSize, enableLadderOrders, orderValidity, indicators, backtestRange]);

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
      <TopBar 
        currentSymbolConfig={currentSymbolConfig} 
        onSelectSymbol={setCurrentSymbolConfig} 
      />
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
                <div className="indicator-title">
                  {currentSymbolConfig.assetType === 'fund' ? '最新净值' : '当前价格'}
                  {currentSymbolConfig.assetType === 'commodity' ? ' (CNY/g)' : currentSymbolConfig.assetType === 'fund' ? '' : ' (本币)'}
                </div>
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
              buyMode={buyMode}
              setBuyMode={setBuyMode}
              tradeFrequency={tradeFrequency}
              setTradeFrequency={setTradeFrequency}
              showTradePoints={showTradePoints}
              setShowTradePoints={setShowTradePoints}
              enableLadderOrders={enableLadderOrders}
              setEnableLadderOrders={setEnableLadderOrders}
              orderValidity={orderValidity}
              setOrderValidity={setOrderValidity}
              backtestRange={backtestRange}
              setBacktestRange={setBacktestRange}
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
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>基础单笔数量 ({currentSymbolConfig.assetType === 'commodity' ? 'g' : '份/股'})</span>
              <input 
                type="number" 
                value={baseGrams} 
                onChange={e => setBaseGrams(Number(e.target.value) || 1)} 
                min="0.1" step="0.1" 
                style={{ width: '70px', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'right' }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>最低买卖量限制 ({currentSymbolConfig.assetType === 'commodity' ? 'g' : '份/股'})</span>
              <input 
                type="number" 
                value={minTradeVolume} 
                onChange={e => setMinTradeVolume(Number(e.target.value) || 0)} 
                min="0" step="0.1" 
                style={{ width: '70px', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'right' }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>交易步进单位 ({currentSymbolConfig.assetType === 'commodity' ? 'g' : '份/股'})</span>
              <input 
                type="number" 
                value={lotSize} 
                onChange={e => setLotSize(Number(e.target.value) || 0)} 
                min="0" step="0.01" 
                style={{ width: '70px', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'right' }} 
              />
            </div>

            {advice?.orders && advice.orders.length > 1 ? (
              <div className="advice-box" style={{ gridColumn: 'span 2' }}>
                <div className="advice-label" style={{ marginBottom: '12px' }}>策略建议 - 阶梯多档挂单</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {advice.orders.map((o, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--color-down)', fontWeight: 'bold' }}>{o.label || `档位 ${idx + 1}`}</span>
                      <div>
                        <span className="micro-tag">基:{o.params?.baseGrams}</span>
                        <span>买入: {o.grams.toFixed(2)} {currentSymbolConfig.assetType === 'commodity' ? '克' : '份/股'} ({(o.multiplier || 0).toFixed(2)}x)</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.85rem' }}>
                  <div className="advice-value buy-advice">
                    <span>买入</span>
                    <span>{advice.grams.toFixed(2)} {currentSymbolConfig.assetType === 'commodity' ? '克' : '份/股'} (共 {advice.orders.length} 档)</span>
                  </div>
                </div>
                <div className="advice-sub" style={{ marginTop: '12px', color: 'var(--text-primary)', fontWeight: '500', lineHeight: '1.5', fontSize: '0.85rem' }}>
                  {advice.reason}
                </div>
              </div>
            ) : (
              <>
                <div className="advice-box">
                  <div className="advice-label">🎯 测算挂单买价</div>
                  <div className="advice-value highlight">{advice?.targetPrice.toFixed(2)}</div>
                  <div className="advice-sub">
                    {currentSymbolConfig.assetType === 'commodity' ? 'CNY/g' : currentSymbolConfig.assetType === 'fund' ? '单位净值' : '本币价格'}
                  </div>
                </div>

                <div className="advice-box">
                  <div className="advice-value sell-advice">
                    <span>{advice?.multiplier > 0 ? '买入' : '操作'}</span>
                    <span>
                      {advice?.grams.toFixed(2)} {currentSymbolConfig.assetType === 'commodity' ? '克' : '份/股'} 
                      <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                        ({advice?.multiplier.toFixed(2)}x)
                      </span>
                    </span>
                  </div>
                  <div className="advice-sub" style={{ marginTop: '12px', color: 'var(--text-primary)', fontWeight: '500', lineHeight: '1.5' }}>
                    💡 {advice?.reason}
                  </div>
                </div>
              </>
            )}
            
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
            leaderboardLoading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ marginBottom: '16px', fontSize: '1.1rem' }}>正在计算策略组合回测数据...</div>
                <div style={{ width: '80%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', margin: '0 auto', overflow: 'hidden' }}>
                  <div style={{ width: `${leaderboardProgress}%`, height: '100%', background: 'var(--accent-gold)', transition: 'width 0.2s' }}></div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>{leaderboardProgress}%</div>
              </div>
            ) : (
              <StrategyLeaderboard 
                data={strategyLeaderboardData} 
                pinnedRowKeys={pinnedRowKeys}
                togglePin={togglePin}
                currentStrategy={strategy}
                currentSellStrategies={allowSell ? sellStrategies : []}
                leaderboardBuyFilter={leaderboardBuyFilter}
                setLeaderboardBuyFilter={setLeaderboardBuyFilter}
                allBuyOptions={allBuyOptions}
                allSellOptions={allSellOptions}
                leaderboardSellFilter={leaderboardSellFilter}
                setLeaderboardSellFilter={setLeaderboardSellFilter}
                getOptionLabelBuy={opt => opt.startsWith('custom_buy_') ? (customBuyStrategies.find(s => s.id === opt)?.name || opt) : (BUILT_IN_BUY_STRATEGIES[opt]?.name || opt)}
                getOptionLabelSell={opt => opt.startsWith('custom_sell_') ? (customSellStrategies.find(s => s.id === opt)?.name || opt) : (BUILT_IN_SELL_STRATEGIES[opt]?.name || opt)}
                onApply={(buyStrat, sellStrats, paramsSnapshot) => {
                  setStrategy(buyStrat);
                  setSellStrategies(sellStrats);
                  if (paramsSnapshot) {
                    if (paramsSnapshot.tradeFrequency) setTradeFrequency(paramsSnapshot.tradeFrequency);
                    if (paramsSnapshot.buyMode) setBuyMode(paramsSnapshot.buyMode);
                    if (paramsSnapshot.enableLadderOrders !== undefined) setEnableLadderOrders(paramsSnapshot.enableLadderOrders);
                    if (paramsSnapshot.orderValidity !== undefined) setOrderValidity(paramsSnapshot.orderValidity);
                    if (paramsSnapshot.baseGrams !== undefined) setBaseGrams(paramsSnapshot.baseGrams);
                    if (paramsSnapshot.sellFee !== undefined) setSellFee(paramsSnapshot.sellFee);
                    if (paramsSnapshot.minTradeVolume !== undefined) setMinTradeVolume(paramsSnapshot.minTradeVolume);
                    if (paramsSnapshot.atrPeriod !== undefined) setAtrPeriod(paramsSnapshot.atrPeriod);
                  }
                }}
                currentParams={{ tradeFrequency, buyMode, enableLadderOrders, orderValidity, baseGrams, sellFee, minTradeVolume, atrPeriod }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

export default App;
