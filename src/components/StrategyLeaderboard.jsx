import React, { useState, useMemo } from 'react';

const StrategyLeaderboard = ({ data, onApply, currentStrategy, currentSellStrategies }) => {
  const [sortField, setSortField] = useState('annualizedReturn');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filters, setFilters] = useState({});

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

  const numericFields = ['annualizedReturn', 'absoluteReturn', 'netProfit', 'realizedProfit', 'finalValue', 'maxDrawdown', 'calmarRatio', 'totalInvested', 'tradeCount', 'winRate'];
  const lessThanFields = ['maxDrawdown', 'totalInvested', 'tradeCount'];

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

  const getBuyStrategyName = (id) => {
    const map = {
      'grid': '基准定投',
      'grid_drawdown': '历史典型回撤',
      'grid_fib': '斐波那契回撤',
      'mean_reversion': '均值回归',
      'calendar': '日历效应'
    };
    return map[id] || id;
  };

  const getSellStrategyName = (id) => {
    const map = {
      'rsi_scale_out': '均值回归高抛',
      'profit_scale_out': '目标收益减仓',
      'trend_break_clear': '破位清仓止损'
    };
    return map[id] || id;
  };

  const renderSortArrow = (field) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}>↕</span>;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const formatValue = (field, val) => {
    if (['annualizedReturn', 'absoluteReturn', 'maxDrawdown', 'winRate'].includes(field)) {
      return (val * 100).toFixed(1) + '%';
    }
    if (['netProfit', 'realizedProfit', 'finalValue', 'totalInvested'].includes(field)) {
      return (val / 1000).toFixed(1) + 'k';
    }
    if (field === 'calmarRatio') return val.toFixed(1);
    return Math.round(val);
  };

  const formatDisplayValue = (field, val) => {
    if (['annualizedReturn', 'absoluteReturn', 'maxDrawdown'].includes(field)) return (val * 100).toFixed(2) + '%';
    if (field === 'winRate') return (val * 100).toFixed(1) + '%';
    if (['netProfit', 'realizedProfit', 'finalValue', 'totalInvested'].includes(field)) return '¥' + val.toFixed(2);
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

  return (
    <div style={{ overflowX: 'auto', backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
      <style>
        {`
          .leaderboard-row:hover {
            background-color: rgba(255, 255, 255, 0.05) !important;
          }
          .leaderboard-row.current-row:hover {
            background-color: rgba(212, 175, 55, 0.2) !important;
          }
        `}
      </style>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', backgroundColor: 'var(--bg-color)' }}>
            <th style={{ padding: '12px 8px', whiteSpace: 'nowrap' }}>买入策略</th>
            <th style={{ padding: '12px 8px', minWidth: '120px' }}>卖出组合</th>
            
            <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('annualizedReturn')}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>年化收益 {renderSortArrow('annualizedReturn')}</div>
              {renderSlider('annualizedReturn')}
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

            <th style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={() => handleSort('totalInvested')}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>资金占用 {renderSortArrow('totalInvested')}</div>
              {renderSlider('totalInvested')}
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
                              (currentSellStrategies ? JSON.stringify([...currentSellStrategies].sort()) : '[]') === JSON.stringify([...row.sellStrategies].sort());
            
            return (
              <tr 
                key={idx} 
                className={`leaderboard-row ${isCurrent ? 'current-row' : ''}`}
                onClick={() => { if (!isCurrent) onApply(row.buyStrategy, row.sellStrategies); }}
                style={{ 
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: isCurrent ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                  transition: 'background-color 0.2s',
                  cursor: isCurrent ? 'default' : 'pointer'
                }}
              >
                <td style={{ padding: '12px 8px', fontWeight: '500', whiteSpace: 'nowrap' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {getBuyStrategyName(row.buyStrategy)}
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
                          {getSellStrategyName(s)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 8px', fontWeight: 'bold', color: row.annualizedReturn >= 0 ? 'var(--color-up)' : 'var(--color-down)', textAlign: 'right' }}>
                  {formatDisplayValue('annualizedReturn', row.annualizedReturn)}
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
                  {formatDisplayValue('totalInvested', row.totalInvested)}
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
  );
};

export default StrategyLeaderboard;
