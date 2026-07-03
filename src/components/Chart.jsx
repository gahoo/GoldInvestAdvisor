import React, { useState, useMemo } from 'react';
import { ComposedChart, Area, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export function Chart({ data, trades = [], showTrades = false }) {
  const [timeRange, setTimeRange] = useState('1y'); // '1w' | '1m' | '1y'

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((d, index) => {
      // Find if there is a trade on this date
      const trade = trades.find(t => t.date === d.date);

      let ma20 = null;
      let ma60 = null;
      if (index >= 19) {
        let sum20 = 0;
        for (let i = 0; i < 20; i++) sum20 += data[index - i].close;
        ma20 = sum20 / 20;
      }
      if (index >= 59) {
        let sum60 = 0;
        for (let i = 0; i < 60; i++) sum60 += data[index - i].close;
        ma60 = sum60 / 60;
      }
      return { 
        ...d, 
        ma20, 
        ma60,
        buyPrice: trade && (trade.type === 'buy' || !trade.type) ? trade.price : null,
        sellPrice: trade && trade.type === 'sell' ? trade.price : null,
        buyGrams: trade && (trade.type === 'buy' || !trade.type) ? trade.grams : null,
        sellGrams: trade && trade.type === 'sell' ? trade.grams : null
      };
    });
  }, [data, trades]);

  const filteredData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    let daysToKeep = chartData.length;
    
    if (timeRange === '1w') daysToKeep = 5; // 一周约5个交易日
    else if (timeRange === '1m') daysToKeep = 22; // 一月约22个交易日
    else if (timeRange === '1y') daysToKeep = 250; // 一年约250个交易日
    
    return chartData.slice(Math.max(0, chartData.length - daysToKeep));
  }, [chartData, timeRange]);

  // 计算显示区间的最值，优化 Y 轴显示
  const domain = useMemo(() => {
    if (filteredData.length === 0) return ['auto', 'auto'];
    const min = Math.min(...filteredData.map(d => d.low)) * 0.99;
    const max = Math.max(...filteredData.map(d => d.high)) * 1.01;
    return [Math.floor(min), Math.ceil(max)];
  }, [filteredData]);

  return (
    <div className="chart-container" style={{ width: '100%', height: '350px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>价格走势</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`time-btn ${timeRange === '1w' ? 'active' : ''}`}
            onClick={() => setTimeRange('1w')}
          >
            1周
          </button>
          <button 
            className={`time-btn ${timeRange === '1m' ? 'active' : ''}`}
            onClick={() => setTimeRange('1m')}
          >
            1月
          </button>
          <button 
            className={`time-btn ${timeRange === '1y' ? 'active' : ''}`}
            onClick={() => setTimeRange('1y')}
          >
            1年
          </button>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="80%">
        <ComposedChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} 
            tickFormatter={(val) => val.substring(5)} // 只显示 MM-DD
            minTickGap={20}
          />
          <YAxis 
            domain={domain} 
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
            axisLine={false}
            tickLine={false}
          />
          <RechartsTooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
            labelStyle={{ color: 'var(--text-secondary)', marginBottom: '8px' }}
            formatter={(value, name, props) => {
              if (name === '买入点') return [`${value.toFixed(2)} (量: ${props.payload.buyGrams?.toFixed(2)}g)`, name];
              if (name === '卖出点') return [`${value.toFixed(2)} (量: ${props.payload.sellGrams?.toFixed(2)}g)`, name];
              return [typeof value === 'number' ? value.toFixed(2) : value, name];
            }}
          />
          
          <defs>
            <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-gold)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent-gold)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          
          <Area 
            type="monotone" 
            dataKey="close" 
            stroke="var(--accent-gold)" 
            fillOpacity={1} 
            fill="url(#colorClose)" 
            name="收盘价" 
            strokeWidth={2}
          />
          <Line type="monotone" dataKey="ma20" stroke="#F59E0B" dot={false} strokeWidth={1.5} name="MA20" />
          <Line type="monotone" dataKey="ma60" stroke="#3B82F6" dot={false} strokeWidth={1.5} name="MA60" />
          
          {showTrades && (
            <>
              <Scatter 
                dataKey="buyPrice" 
                fill="var(--color-down)" 
                name="买入点" 
                line={false} 
                shape="circle" 
                r={4}
              />
              <Scatter 
                dataKey="sellPrice" 
                fill="#EF4444" 
                name="卖出点" 
                line={false} 
                shape="triangle" 
                r={5}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
