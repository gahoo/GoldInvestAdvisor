import React, { useState, useMemo, useEffect } from 'react';
import { MultiSelectDropdown } from './MultiSelectDropdown';

const StrategyLeaderboard = ({ data, onApply, currentStrategy, currentSellStrategies, currentParams, leaderboardBuyFilter, setLeaderboardBuyFilter, allBuyOptions, allSellOptions, leaderboardSellFilter, setLeaderboardSellFilter, getOptionLabelBuy, getOptionLabelSell, pinnedRowKeys = [], togglePin }) => {
  const [sortField, setSortField] = useState('annualizedReturn');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filters, setFilters] = useState({});
  const [buyFilter, setBuyFilter] = useState('');
  const [sellFilter, setSellFilter] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [showOnlyPinned, setShowOnlyPinned] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const numericFields = ['annualizedReturn', 'absoluteReturn', 'netProfit', 'realizedProfit', 'finalValue', 'maxDrawdown', 'calmarRatio', 'maxCapitalDeployed', 'tradeCount', 'winRate'];
  const lessThanFields = ['maxDrawdown', 'maxCapitalDeployed', 'tradeCount'];

  const getBuyStrategyName = (id, row) => {
    if (row && row.buyName && row.buyName !== id) return row.buyName;
    return getOptionLabelBuy ? getOptionLabelBuy(id) : id;
  };

  const getSellStrategyName = (id, row) => {
    if (row && row.sellNames) {
      const idx = row.sellStrategies.indexOf(id);
      if (idx !== -1 && row.sellNames[idx] && row.sellNames[idx] !== id) return row.sellNames[idx];
    }
    return getOptionLabelSell ? getOptionLabelSell(id) : id;
  };

  const minMax = useMemo(() => {
    const mm = {};
    numericFields.forEach(f => {
      const vals = data.map(d => d[f]).filter(v => v !== undefined && !isNaN(v));
      if (vals.length > 0) {
        mm[f] = { min: Math.min(...vals), max: Math.max(...vals) };
      } else {
        mm[f] = { min: 0, max: 0 };
      }
    });
    return mm;
  }, [data]);

  const filteredData = data.filter(row => {
    if (showOnlyPinned && !pinnedRowKeys.includes(row.cacheKey)) return false;

    // Text Filters
    if (buyFilter) {
      const buyName = getBuyStrategyName(row.buyStrategy, row);
      if (!buyName.includes(buyFilter) && !row.buyStrategy.includes(buyFilter)) {
        return false;
      }
    }
    if (sellFilter) {
      if (sellFilter === '无' && row.sellStrategies.length > 0) return false;
      if (sellFilter !== '无') {
        const hasMatch = row.sellStrategies.some(s => {
          const sName = getSellStrategyName(s, row);
          return sName.includes(sellFilter) || s.includes(sellFilter);
        });
        if (!hasMatch) return false;
      }
    }

    // Desktop multi-select filters
    if (leaderboardBuyFilter && leaderboardBuyFilter.length > 0) {
      if (!leaderboardBuyFilter.includes(row.buyStrategy)) return false;
    }
    
    if (leaderboardSellFilter && leaderboardSellFilter.length > 0) {
      if (leaderboardSellFilter.includes('NONE')) {
        if (leaderboardSellFilter.length === 1) {
          if (row.sellStrategies.length > 0) return false;
        } else {
          return false; // Impossible condition: NONE + other strategies
        }
      } else {
        const matchesAll = leaderboardSellFilter.every(s => row.sellStrategies.includes(s));
        if (!matchesAll) return false;
      }
    }

    // Numeric Filters
    for (const field of numericFields) {
      if (filters[field] !== undefined) {
        if (lessThanFields.includes(field)) {
          if (row[field] > filters[field]) return false;
        } else {
          if (row[field] < filters[field]) return false;
        }
      }
    }
    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (sortOrder === 'asc') {
      return valA > valB ? 1 : valA < valB ? -1 : 0;
    } else {
      return valA < valB ? 1 : valA > valB ? -1 : 0;
    }
  });

  const renderSortArrow = (field) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}>↕</span>;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const formatValue = (field, val) => {
    if (val === null || val === undefined || Number.isNaN(val)) return '-';
    if (['annualizedReturn', 'absoluteReturn', 'maxDrawdown', 'winRate'].includes(field)) {
      return (val * 100).toFixed(1) + '%';
    }
    if (['netProfit', 'realizedProfit', 'finalValue', 'maxCapitalDeployed'].includes(field)) {
      return (val / 1000).toFixed(1) + 'k';
    }
    if (field === 'calmarRatio') return val.toFixed(1);
    return Math.round(val);
  };

  const formatDisplayValue = (field, val) => {
    if (val === null || val === undefined || Number.isNaN(val)) return '-';
    if (['annualizedReturn', 'absoluteReturn', 'maxDrawdown'].includes(field)) return (val * 100).toFixed(2) + '%';
    if (field === 'winRate') return (val * 100).toFixed(1) + '%';
    if (['netProfit', 'realizedProfit', 'finalValue', 'maxCapitalDeployed'].includes(field)) return '¥' + val.toFixed(2);
    if (field === 'calmarRatio') return val > 0 ? val.toFixed(2) : '-';
    return val;
  };

  const renderSlider = (field) => {
    const mm = minMax[field];
    if (!mm || mm.min === mm.max) return null;
    
    const isLessThan = lessThanFields.includes(field);
    const step = (mm.max - mm.min) / 50 || 1;
    const value = filters[field] !== undefined ? filters[field] : (isLessThan ? mm.max : mm.min);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: '6px' }} onClick={e => e.stopPropagation()}>
        <input 
          type="range" 
          min={mm.min} 
          max={mm.max} 
          step={step}
          value={value}
          onChange={(e) => handleFilterChange(field, Number(e.target.value))}
          style={{ width: '60px', height: '4px', cursor: 'pointer' }}
        />
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: 'normal' }}>
          {isLessThan ? '≤' : '≥'} {formatValue(field, value)}
        </span>
      </div>
    );
  };

  const FunnelIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path fill="currentColor" d="M3 4c0-.55.45-1 1-1h16c.55 0 1 .45 1 1v2c0 .28-.11.55-.3.75L15 12.5v7.25c0 .38-.2.73-.52.92l-4 2.33a1.002 1.002 0 0 1-1.48-.87v-9.6L3.3 4.75A1 1 0 0 1 3 4z" />
    </svg>
  );

  return (
    <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: isMobile ? '12px' : '0' }}>
      <style>
        {`
          .leaderboard-row:hover {
            background-color: rgba(255, 255, 255, 0.05) !important;
          }
          .leaderboard-row.current-row:hover {
            background-color: rgba(212, 175, 55, 0.2) !important;
          }
          .leaderboard-card {
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            background-color: var(--bg-secondary);
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
          }
          .leaderboard-card:active {
            transform: scale(0.98);
          }
          .leaderboard-card.current-card {
            background-color: rgba(212, 175, 55, 0.15);
            border-color: var(--accent-gold);
            cursor: default;
          }
          .mobile-filter-summary {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px;
            background-color: var(--bg-color);
            border-radius: 8px;
            cursor: pointer;
            user-select: none;
            margin-bottom: 12px;
            font-weight: bold;
            color: var(--text-primary);
          }
          .micro-tag {
            font-size: 0.7rem;
            padding: 2px 4px;
            background-color: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-secondary);
            white-space: nowrap;
          }
        `}
      </style>

      <datalist id="buy-strategies-list">
        <option value="基准定投" />
        <option value="历史典型回撤" />
        <option value="斐波那契回撤" />
        <option value="均值回归" />
        <option value="日历效应" />
        <option value="宏观因子" />
      </datalist>
      <datalist id="sell-strategies-list">
        <option value="无" />
        <option value="均值回归高抛" />
        <option value="目标收益减仓" />
        <option value="破位清仓止损" />
      </datalist>

      {isMobile ? (
        // === MOBILE CARD VIEW ===
        <div>
          <details open={mobileFilterOpen} onToggle={(e) => setMobileFilterOpen(e.target.open)} style={{ marginBottom: '16px' }}>
            <summary className="mobile-filter-summary">
              <FunnelIcon /> 
              <span style={{ marginLeft: '8px' }}>{mobileFilterOpen ? '收起控制面板' : '展开漏斗进行筛选排序'}</span>
            </summary>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={showOnlyPinned} onChange={e => setShowOnlyPinned(e.target.checked)} style={{ marginRight: '8px', transform: 'scale(1.2)' }} />
                  ⭐ 只显示收藏 (Pinned)
                </label>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>买入策略过滤</label>
                <input 
                  list="buy-strategies-list"
                  value={buyFilter} 
                  onChange={e => setBuyFilter(e.target.value)} 
                  placeholder="全部 / 搜索..."
                  style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} 
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>卖出组合过滤</label>
                <input 
                  list="sell-strategies-list"
                  value={sellFilter} 
                  onChange={e => setSellFilter(e.target.value)} 
                  placeholder="包含... / 无"
                  style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }} 
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>选择主排序指标</label>
                <select 
                  value={sortField}
                  onChange={e => handleSort(e.target.value)}
                  style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}
                >
                  <option value="annualizedReturn">年化收益</option>
                  <option value="absoluteReturn">绝对收益</option>
                  <option value="netProfit">总净利润</option>
                  <option value="realizedProfit">落袋利润</option>
                  <option value="finalValue">期末市值</option>
                  <option value="maxDrawdown">最大回撤</option>
                  <option value="calmarRatio">收益回撤比</option>
                  <option value="winRate">波段胜率</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {numericFields.map(field => (
                  <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
                    <span style={{ fontSize: '0.75rem' }}>
                      {field === 'annualizedReturn' ? '年化' : 
                       field === 'absoluteReturn' ? '绝对' :
                       field === 'netProfit' ? '净利' :
                       field === 'realizedProfit' ? '落袋' :
                       field === 'finalValue' ? '期末' :
                       field === 'maxDrawdown' ? '回撤' :
                       field === 'calmarRatio' ? '回撤比' :
                       field === 'maxCapitalDeployed' ? '最大投入' :
                       field === 'tradeCount' ? '笔数' : '胜率'}
                    </span>
                    {renderSlider(field)}
                  </div>
                ))}
              </div>
            </div>
          </details>

          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '8px', textAlign: 'center' }}>
            共筛选出 {sortedData.length} 套策略，点击卡片即刻应用
          </div>

          <div className="mobile-card-list">
            {sortedData.map((row, idx) => {
              const isCurrent = currentStrategy === row.buyStrategy && 
                                (currentSellStrategies ? JSON.stringify([...currentSellStrategies].sort()) : '[]') === JSON.stringify([...row.sellStrategies].sort()) &&
                                (!row.paramsSnapshot || !currentParams || JSON.stringify(row.paramsSnapshot) === JSON.stringify(currentParams));
              return (
                <div 
                  key={idx} 
                  className={`leaderboard-card ${isCurrent ? 'current-card' : ''}`}
                  onClick={() => { if (!isCurrent) onApply(row.buyStrategy, row.sellStrategies, row.paramsSnapshot); }}
                  style={{ position: 'relative' }}
                >
                  <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                    <span 
                      onClick={(e) => { e.stopPropagation(); togglePin(row.cacheKey); }} 
                      style={{ cursor: 'pointer', fontSize: '1.4rem', color: pinnedRowKeys.includes(row.cacheKey) ? 'var(--accent-gold)' : 'var(--text-secondary)' }}
                    >
                      {pinnedRowKeys.includes(row.cacheKey) ? '⭐' : '☆'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '12px', paddingRight: '30px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                      {getBuyStrategyName(row.buyStrategy, row)}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {row.sellStrategies.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>无 (仅买入持仓)</span>
                    ) : row.sellStrategies.map(s => (
                      <span key={s} style={{ fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        🏷️ {getSellStrategyName(s, row)}
                      </span>
                    ))}
                  </div>

                  {row.paramsSnapshot && (
                    <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <span className="micro-tag">频:{row.paramsSnapshot.tradeFrequency === 'daily' ? '每日' : row.paramsSnapshot.tradeFrequency === 'weekly' ? '每周' : row.paramsSnapshot.tradeFrequency === 'twice_weekly' ? '周二/四' : row.paramsSnapshot.tradeFrequency === 'biweekly' ? '双周' : '每月'}</span>
                      <span className="micro-tag">模:{row.paramsSnapshot.buyMode === 'dynamic' ? '动态倍率' : '固定克数'}</span>
                      {row.paramsSnapshot.enableLadderOrders && <span className="micro-tag">阶梯:开</span>}
                      <span className="micro-tag">期:{row.paramsSnapshot.orderValidity}天</span>
                      <span className="micro-tag">基:{row.paramsSnapshot.baseGrams}</span>
                      {row.paramsSnapshot.sellFee !== undefined && <span className="micro-tag">费:{row.paramsSnapshot.sellFee * 100}%</span>}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>简单年化</span>
                      <span style={{ fontWeight: 'bold', color: row.annualizedReturn === null ? 'var(--text-secondary)' : (row.annualizedReturn >= 0 ? 'var(--color-up)' : 'var(--color-down)') }}>{formatDisplayValue('annualizedReturn', row.annualizedReturn)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>XIRR</span>
                      <span style={{ fontWeight: 'bold', color: row.xirr === null || isNaN(row.xirr) ? 'var(--text-secondary)' : (row.xirr >= 0 ? 'var(--color-up)' : 'var(--color-down)') }}>{row.xirr === null || isNaN(row.xirr) ? '-' : (row.xirr * 100).toFixed(2) + '%'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>最大回撤</span>
                      <span style={{ fontWeight: 'bold', color: row.maxDrawdown > 0 ? 'var(--color-down)' : 'inherit' }}>{formatDisplayValue('maxDrawdown', row.maxDrawdown)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>总净利润</span>
                      <span style={{ fontWeight: 'bold' }}>{formatDisplayValue('netProfit', row.netProfit)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>回撤比</span>
                      <span style={{ fontWeight: 'bold' }}>{formatDisplayValue('calmarRatio', row.calmarRatio)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>波段胜率</span>
                      <span style={{ fontWeight: 'bold' }}>{row.sellStrategies.length > 0 ? formatDisplayValue('winRate', row.winRate) : '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>交易笔数</span>
                      <span style={{ fontWeight: 'bold' }}>{row.tradeCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // === DESKTOP TABLE VIEW ===
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', backgroundColor: 'var(--bg-color)' }}>
                <th 
                  style={{ padding: '12px 4px', width: '50px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setShowOnlyPinned(!showOnlyPinned)}
                  title={showOnlyPinned ? "取消只看收藏" : "点击只看收藏"}
                >
                  <div style={{ fontSize: '1.2rem', color: showOnlyPinned ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
                    {showOnlyPinned ? '⭐' : '☆'}
                  </div>
                </th>
                <th style={{ padding: '12px 8px', whiteSpace: 'nowrap', verticalAlign: 'top', minWidth: '180px' }}>
                  <div style={{ marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>买入策略 (作为基准)</div>
                  <MultiSelectDropdown 
                    label="买入策略"
                    options={allBuyOptions}
                    selectedOptions={leaderboardBuyFilter}
                    getOptionLabel={getOptionLabelBuy}
                    onChange={setLeaderboardBuyFilter}
                  />
                </th>
                <th style={{ padding: '12px 8px', minWidth: '180px', verticalAlign: 'top' }}>
                  <div style={{ marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>卖出策略 (自由组合)</div>
                  <MultiSelectDropdown 
                    label="卖出策略"
                    options={['NONE', ...allSellOptions]}
                    selectedOptions={leaderboardSellFilter}
                    getOptionLabel={opt => opt === 'NONE' ? '【无卖出策略】' : (getOptionLabelSell ? getOptionLabelSell(opt) : opt)}
                    onChange={setLeaderboardSellFilter}
                  />
                </th>
                
                <th style={{ padding: '12px 8px', minWidth: '140px', verticalAlign: 'top' }}>
                  <div style={{ marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>参数组合</div>
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('annualizedReturn')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>简单年化 {renderSortArrow('annualizedReturn')}</div>
                  {renderSlider('annualizedReturn')}
                </th>
                
                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('xirr')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>XIRR {renderSortArrow('xirr')}</div>
                  {renderSlider('xirr')}
                </th>
                
                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('absoluteReturn')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>绝对收益 {renderSortArrow('absoluteReturn')}</div>
                  {renderSlider('absoluteReturn')}
                </th>
                
                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('netProfit')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>总净利润 {renderSortArrow('netProfit')}</div>
                  {renderSlider('netProfit')}
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('realizedProfit')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>落袋利润 {renderSortArrow('realizedProfit')}</div>
                  {renderSlider('realizedProfit')}
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('finalValue')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>期末市值 {renderSortArrow('finalValue')}</div>
                  {renderSlider('finalValue')}
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('maxDrawdown')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>最大回撤 {renderSortArrow('maxDrawdown')}</div>
                  {renderSlider('maxDrawdown')}
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('calmarRatio')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>收益回撤比 {renderSortArrow('calmarRatio')}</div>
                  {renderSlider('calmarRatio')}
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('maxCapitalDeployed')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>资金占用 {renderSortArrow('maxCapitalDeployed')}</div>
                  {renderSlider('maxCapitalDeployed')}
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('tradeCount')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>总笔数 {renderSortArrow('tradeCount')}</div>
                  {renderSlider('tradeCount')}
                </th>

                <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('winRate')}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>波段胜率 {renderSortArrow('winRate')}</div>
                  {renderSlider('winRate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, idx) => {
                const isCurrent = currentStrategy === row.buyStrategy && 
                                  (currentSellStrategies ? JSON.stringify([...currentSellStrategies].sort()) : '[]') === JSON.stringify([...row.sellStrategies].sort()) &&
                                  (!row.paramsSnapshot || !currentParams || JSON.stringify(row.paramsSnapshot) === JSON.stringify(currentParams));
                
                return (
                  <tr 
                    key={idx} 
                    className={`leaderboard-row ${isCurrent ? 'current-row' : ''}`}
                    onClick={() => { if (!isCurrent) onApply(row.buyStrategy, row.sellStrategies, row.paramsSnapshot); }}
                    style={{ 
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: isCurrent ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                      transition: 'background-color 0.2s',
                      cursor: 'pointer'
                    }}
                  >
                    <td style={{ padding: '12px 4px', textAlign: 'center' }}>
                      <span 
                        onClick={(e) => { e.stopPropagation(); togglePin(row.cacheKey); }} 
                        style={{ cursor: 'pointer', fontSize: '1.2rem', color: pinnedRowKeys.includes(row.cacheKey) ? 'var(--accent-gold)' : 'var(--text-secondary)' }}
                      >
                        {pinnedRowKeys.includes(row.cacheKey) ? '⭐' : '☆'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', fontWeight: '500', whiteSpace: 'nowrap' }}>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {getBuyStrategyName(row.buyStrategy, row)}
                        {isCurrent && <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--accent-gold)' }}>(当前)</span>}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {row.sellStrategies.length === 0 ? (
                        <span style={{ color: 'var(--text-secondary)' }}>无 (仅买入)</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {row.sellStrategies.map(s => (
                            <span key={s} style={{ 
                              fontSize: '0.75rem', 
                              padding: '2px 6px', 
                              backgroundColor: 'var(--border-color)', 
                              borderRadius: '4px',
                              whiteSpace: 'nowrap'
                            }}>
                              {getSellStrategyName(s, row)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {row.paramsSnapshot && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '180px' }}>
                          <span className="micro-tag">频:{row.paramsSnapshot.tradeFrequency === 'daily' ? '每日' : row.paramsSnapshot.tradeFrequency === 'weekly' ? '每周' : row.paramsSnapshot.tradeFrequency === 'twice_weekly' ? '周二/四' : row.paramsSnapshot.tradeFrequency === 'biweekly' ? '双周' : '每月'}</span>
                          <span className="micro-tag">模:{row.paramsSnapshot.buyMode === 'dynamic' ? '动态倍率' : '固定克数'}</span>
                          {row.paramsSnapshot.enableLadderOrders && <span className="micro-tag">阶梯:开</span>}
                          <span className="micro-tag">期:{row.paramsSnapshot.orderValidity}天</span>
                          <span className="micro-tag">基:{row.paramsSnapshot.baseGrams}</span>
                          {row.paramsSnapshot.sellFee !== undefined && <span className="micro-tag">费:{row.paramsSnapshot.sellFee * 100}%</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', fontWeight: 'bold', color: row.annualizedReturn === null ? 'var(--text-secondary)' : (row.annualizedReturn >= 0 ? 'var(--color-up)' : 'var(--color-down)'), textAlign: 'right' }}>
                      {formatDisplayValue('annualizedReturn', row.annualizedReturn)}
                    </td>
                    <td style={{ padding: '12px 8px', fontWeight: 'bold', color: row.xirr === null || isNaN(row.xirr) ? 'var(--text-secondary)' : (row.xirr >= 0 ? 'var(--color-up)' : 'var(--color-down)'), textAlign: 'right' }}>
                      {row.xirr === null || isNaN(row.xirr) ? '-' : (row.xirr * 100).toFixed(2) + '%'}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: row.absoluteReturn >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                      {formatDisplayValue('absoluteReturn', row.absoluteReturn)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {formatDisplayValue('netProfit', row.netProfit)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {formatDisplayValue('realizedProfit', row.realizedProfit)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {formatDisplayValue('finalValue', row.finalValue)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: row.maxDrawdown > 0 ? 'var(--color-down)' : 'inherit' }}>
                      {formatDisplayValue('maxDrawdown', row.maxDrawdown)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {formatDisplayValue('calmarRatio', row.calmarRatio)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {formatDisplayValue('maxCapitalDeployed', row.maxCapitalDeployed)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {row.tradeCount}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {row.sellStrategies.length > 0 ? formatDisplayValue('winRate', row.winRate) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StrategyLeaderboard;
