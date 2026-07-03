import React from 'react';
import { Tooltip } from './Tooltip';

export function BacktestPanel({ 
  result, strategy, 
  returnMethod, setReturnMethod,
  buyMode, setBuyMode,
  tradeFrequency, setTradeFrequency,
  showTradePoints, setShowTradePoints,
  allowSell, setAllowSell,
  sellFee, setSellFee
}) {
  if (strategy === 'macro') {
    return (
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="section-title">回测结果 (模拟)</h3>
        <p style={{ color: 'var(--text-secondary)' }}>由于缺乏历史宏观因子数据 (DXY/US10Y)，宏观策略暂不支持回测。</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="section-title">回测结果 (模拟)</h3>
        <p style={{ color: 'var(--text-secondary)' }}>计算中或数据不足...</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: '0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
        <div>
          <h3 className="section-title">策略回测结果 ({result.totalDays.toFixed(0)} 天)</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            基于历史 K 线数据，模拟该策略每天的实际挂单与成交情况。（仅供参考）
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={tradeFrequency} onChange={e => setTradeFrequency(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="weekly">每周最多一笔</option>
            <option value="twice_weekly">每周最多两笔</option>
            <option value="biweekly">每两周一笔</option>
            <option value="monthly">每月最多一笔</option>
          </select>
          <select value={buyMode} onChange={e => setBuyMode(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="dynamic">动态倍率</option>
            <option value="fixed">固定克数</option>
          </select>
          <select value={returnMethod} onChange={e => setReturnMethod(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="xirr">XIRR</option>
            <option value="simple">简单年化</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allowSell} onChange={e => setAllowSell(e.target.checked)} style={{ marginRight: '6px' }} />
            允许卖出(波段)
          </label>
          {allowSell && (
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              手续费: 
              <input type="number" step="0.1" value={sellFee * 100} onChange={e => setSellFee(Number(e.target.value) / 100)} style={{ width: '45px', marginLeft: '4px', marginRight: '2px', padding: '2px 4px', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
              %
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={showTradePoints} onChange={e => setShowTradePoints(e.target.checked)} style={{ marginRight: '6px' }} />
            图表显示买卖点
          </label>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="indicator-card active">
          <div className="indicator-header">
            <div className="indicator-title">
              最大资金占用
              <Tooltip content="由于存在卖出操作回收本金，这是历史回测中您账户最多需要准备的资金（Max Capital Deployed）。" />
            </div>
          </div>
          <div className="indicator-value">¥ {result.totalInvested.toFixed(2)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            累计买入流水: ¥ {result.totalBuyAmount?.toFixed(2) || '0.00'}
          </div>
        </div>

        <div className="indicator-card active">
          <div className="indicator-header">
            <div className="indicator-title">期末持仓市值</div>
          </div>
          <div className="indicator-value">¥ {result.finalValue.toFixed(2)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>当前剩余持仓: {result.totalGrams.toFixed(2)} g</div>
        </div>

        <div className="indicator-card active">
          <div className="indicator-header">
            <div className="indicator-title">
              总净利润
              <Tooltip content="总净利润 = 现存底仓的浮盈 + 已经落袋的卖出利润。" />
            </div>
          </div>
          <div className={`indicator-value ${result.netProfit >= 0 ? 'up' : 'down'}`}>
            ¥ {result.netProfit.toFixed(2)}
          </div>
          {allowSell && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              含已落袋: ¥ {result.realizedProfit.toFixed(2)}
            </div>
          )}
        </div>

        <div className="indicator-card active">
          <div className="indicator-header">
            <div className="indicator-title">
              绝对收益率
              <Tooltip content="总净利润 / 最大资金占用" />
            </div>
          </div>
          <div className={`indicator-value ${result.absoluteReturn >= 0 ? 'up' : 'down'}`}>
            {(result.absoluteReturn * 100).toFixed(2)}%
          </div>
        </div>

        <div className="indicator-card active" style={{ borderColor: 'var(--accent-gold)', borderStyle: 'dashed' }}>
          <div className="indicator-header">
            <div className="indicator-title">
              年化收益率
              <Tooltip content="根据设置面板中的算法（XIRR 或 简单年化）计算得出" />
            </div>
          </div>
          <div className={`indicator-value highlight ${result.annualizedReturn >= 0 ? 'up' : 'down'}`}>
            {(result.annualizedReturn * 100).toFixed(2)}%
          </div>
        </div>

        <div className="indicator-card active">
          <div className="indicator-header">
            <div className="indicator-title">交易统计</div>
          </div>
          <div className="indicator-value">{result.tradeCount} 笔</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            买入: {result.buyCount} 笔
            {allowSell && ` | 卖出: ${result.sellCount} 笔 (胜率 ${(result.winRate * 100).toFixed(1)}%)`}
          </div>
        </div>
      </div>
    </div>
  );
}
