import React from 'react';
import { Tooltip } from './Tooltip';

export function BacktestPanel({ 
  result, 
  buyMode, setBuyMode,
  tradeFrequency, setTradeFrequency,
  showTradePoints, setShowTradePoints,
  enableLadderOrders, setEnableLadderOrders,
  orderValidity, setOrderValidity,
  backtestRange, setBacktestRange
}) {


  if (!result || result._error) {
    return (
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="section-title">回测结果 (模拟)</h3>
        {result?._error ? (
          <div style={{ color: 'red', padding: '10px', background: '#ffebee', borderRadius: '4px' }}>
            <p><strong>回测计算发生严重错误:</strong></p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result._error}</pre>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>计算中或数据不足...</p>
        )}
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
          <select value={backtestRange} onChange={e => setBacktestRange(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="max">时间范围: 全部历史</option>
            <option value="20y">近20年回测</option>
            <option value="10y">近10年回测</option>
            <option value="5y">近5年回测</option>
            <option value="3y">近3年回测</option>
            <option value="1y">近1年回测</option>
          </select>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: 'auto' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={enableLadderOrders} onChange={e => setEnableLadderOrders(e.target.checked)} style={{ marginRight: '6px' }} />
              启用多档阶梯挂单 (扩展)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <span>挂单有效期:</span>
              <input 
                type="number" 
                min="1" 
                max="6" 
                value={orderValidity} 
                onChange={e => setOrderValidity(Math.max(1, Math.min(6, parseInt(e.target.value) || 6)))} 
                className="input-field" 
                style={{ width: '60px', padding: '2px 4px', fontSize: '0.85rem' }} 
              />
              <span>个交易日</span>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: '12px' }}>
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
          <div className="indicator-value">¥ {result.maxCapitalDeployed.toFixed(2)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            累计买入流水: ¥ {result.totalBuyAmount?.toFixed(2) || '0.00'}
          </div>
        </div>

        <div className="indicator-card active">
          <div className="indicator-header">
            <div className="indicator-title">期末持仓市值</div>
          </div>
          <div className="indicator-value">¥ {result.finalValue.toFixed(2)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>当前剩余持仓数量: {result.totalGrams.toFixed(2)}</div>
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
          {result.sellCount > 0 && (
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
              <Tooltip content={
                <>
                  <div style={{ marginBottom: '8px' }}><strong>简单年化</strong>: <br/>(总净利润 ÷ 最大资金占用) ÷ (回测天数 ÷ 365)。<br/>算法简单直接，适合衡量总投入的绝对回报速度。</div>
                  <div><strong>XIRR</strong>: <br/>根据每笔买入和卖出的确切发生时间和金额，计算出的资金内部收益率。它更科学地反映了资金的时间价值和资金在真实交易过程中的周转效率。</div>
                </>
              } />
            </div>
          </div>
          {result.annualizedReturn === null ? (
            <div className="indicator-value" style={{ color: 'var(--text-secondary)' }}>
              计算失败
            </div>
          ) : (
            <>
              <div className={`indicator-value highlight ${result.annualizedReturn >= 0 ? 'up' : 'down'}`}>
                {(result.annualizedReturn * 100).toFixed(2)}%
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                XIRR: {result.xirr === null || result.xirr === undefined || isNaN(result.xirr) ? '计算失败' : (result.xirr * 100).toFixed(2) + '%'}
              </div>
            </>
          )}
        </div>

        <div className="indicator-card active">
          <div className="indicator-header">
            <div className="indicator-title">交易统计</div>
          </div>
          <div className="indicator-value">{result.tradeCount} 笔</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            买入: {result.buyCount} 笔
            {result.sellCount > 0 && ` | 卖出: ${result.sellCount} 笔 (胜率 ${(result.winRate * 100).toFixed(1)}%)`}
          </div>
        </div>
      </div>
    </div>
  );
}
