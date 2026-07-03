import React, { useState, useEffect } from 'react';

function TradeTable({ trades }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!trades || trades.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>暂无交易记录</div>;
  }

  const exportCSV = () => {
    const headers = ['日期', '类型', '成交价(元/克)', '成交量(克)', '单笔金额(元)', '手续费(元)', '交易收益(元)', '收益率(%)', '期后持仓量(克)', '原因'];
    const rows = trades.map(t => {
      const type = t.type === 'buy' ? '买入' : '卖出';
      const amount = t.type === 'buy' ? t.cost.toFixed(2) : t.netRevenue.toFixed(2);
      const fee = t.type === 'sell' ? t.fee.toFixed(2) : '0.00';
      const profit = t.type === 'sell' ? t.profit.toFixed(2) : '';
      const profitRatio = t.type === 'sell' ? (t.profitRatio * 100).toFixed(2) + '%' : '';
      const holdings = t.holdings ? t.holdings.toFixed(2) : '';

      return [
        t.date,
        type,
        t.price.toFixed(2),
        t.grams.toFixed(2),
        amount,
        fee,
        profit,
        profitRatio,
        holdings,
        `"${(t.reason || '').replace(/"/g, '""')}"`
      ].join(',');
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "黄金定投_回测交易记录.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ overflowX: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.25rem' }}>回测交易明细</h3>
        <button onClick={exportCSV} style={{ padding: '6px 12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
          ⬇️ 导出 CSV
        </button>
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {trades.map((t, i) => (
            <div key={i} style={{ 
              border: `1px solid ${t.type === 'buy' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, 
              borderRadius: '8px', 
              padding: '12px',
              backgroundColor: t.type === 'buy' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold' }}>{t.date}</span>
                <span style={{ fontWeight: 'bold', color: t.type === 'buy' ? 'var(--color-down)' : '#EF4444' }}>
                  {t.type === 'buy' ? '🟢 买入' : '🔴 卖出'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>成交价</span>
                  <span style={{ fontWeight: '500' }}>¥{t.price.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>成交量</span>
                  <span style={{ fontWeight: '500' }}>{t.grams.toFixed(2)}g</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>单笔金额</span>
                  <span style={{ fontWeight: '500' }}>¥{t.type === 'buy' ? t.cost.toFixed(2) : t.netRevenue.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>手续费</span>
                  <span style={{ fontWeight: '500' }}>{t.type === 'sell' ? '¥' + t.fee.toFixed(2) : '-'}</span>
                </div>
                {t.type === 'sell' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>交易收益</span>
                      <span style={{ fontWeight: 'bold', color: t.profit >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                        {t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>收益率</span>
                      <span style={{ fontWeight: 'bold', color: t.profitRatio >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                        {t.profitRatio >= 0 ? '+' : ''}{(t.profitRatio * 100).toFixed(2)}%
                      </span>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>期后持仓</span>
                  <span style={{ fontWeight: '500' }}>{t.holdings ? t.holdings.toFixed(2) + 'g' : '-'}</span>
                </div>
              </div>
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                💡 {t.reason}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '12px 8px' }}>日期</th>
                <th style={{ padding: '12px 8px' }}>类型</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>成交价</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>成交量(g)</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>单笔金额</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>手续费</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>交易收益</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>收益率</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>期后持仓(g)</th>
                <th style={{ padding: '12px 8px' }}>原因</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: t.type === 'buy' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)' }}>
                  <td style={{ padding: '12px 8px', whiteSpace: 'nowrap' }}>{t.date}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 'bold', color: t.type === 'buy' ? 'var(--color-down)' : '#EF4444' }}>
                    {t.type === 'buy' ? '买入' : '卖出'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{t.price.toFixed(2)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{t.grams.toFixed(2)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    {t.type === 'buy' ? t.cost.toFixed(2) : t.netRevenue.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    {t.type === 'sell' ? t.fee.toFixed(2) : '-'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500', color: t.type === 'sell' ? (t.profit >= 0 ? 'var(--color-up)' : 'var(--color-down)') : 'inherit' }}>
                    {t.type === 'sell' ? t.profit.toFixed(2) : '-'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500', color: t.type === 'sell' ? (t.profitRatio >= 0 ? 'var(--color-up)' : 'var(--color-down)') : 'inherit' }}>
                    {t.type === 'sell' ? (t.profitRatio * 100).toFixed(2) + '%' : '-'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '500' }}>
                    {t.holdings ? t.holdings.toFixed(2) : '-'}
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', minWidth: '150px' }}>{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TradeTable;
