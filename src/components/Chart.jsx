import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createChart, AreaSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';

export function Chart({ data, trades = [], showTrades = false }) {
  const chartContainerRef = useRef(null);
  const [timeRange, setTimeRange] = useState('1y'); // '1w' | '1m' | '1y'

  // $O(N)$ 降维算法优化：将散装的 trades 转换为基于日期的哈希映射 (Hash Map)
  const tradesByDate = useMemo(() => {
    const map = new Map();
    trades.forEach(t => {
      if (!map.has(t.date)) {
        map.set(t.date, []);
      }
      map.get(t.date).push(t);
    });
    return map;
  }, [trades]);

  const coverageDays = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const firstDate = new Date(data[0].date);
    const lastDate = new Date(data[data.length - 1].date);
    return (lastDate - firstDate) / (1000 * 3600 * 24);
  }, [data]);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 350,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: 'rgba(197, 203, 206, 0.2)' },
        horzLines: { color: 'rgba(197, 203, 206, 0.2)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: 1, // Magnet mode
      }
    });

    // 1. 主价格线 (面积图)
    const mainSeries = chart.addSeries(AreaSeries, {
      lineColor: '#d4af37',
      topColor: 'rgba(212, 175, 55, 0.3)',
      bottomColor: 'rgba(212, 175, 55, 0)',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // 2. MA20 均线
    const ma20Series = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1.5,
      title: 'MA20',
      crosshairMarkerVisible: false,
    });

    // 3. MA60 均线
    const ma60Series = chart.addSeries(LineSeries, {
      color: '#3B82F6',
      lineWidth: 1.5,
      title: 'MA60',
      crosshairMarkerVisible: false,
    });

    const mainData = [];
    const ma20Data = [];
    const ma60Data = [];
    const markers = [];

    // 单次循环完成所有的计算和拼装 (O(N) 复杂度)
    data.forEach((d, index) => {
      mainData.push({ time: d.date, value: d.close });

      // 计算均线
      if (index >= 19) {
        let sum = 0;
        for (let i = 0; i < 20; i++) sum += data[index - i].close;
        ma20Data.push({ time: d.date, value: sum / 20 });
      }
      if (index >= 59) {
        let sum = 0;
        for (let i = 0; i < 60; i++) sum += data[index - i].close;
        ma60Data.push({ time: d.date, value: sum / 60 });
      }

      // 生成买卖点 Markers
      if (showTrades && tradesByDate.has(d.date)) {
        const dayTrades = tradesByDate.get(d.date);
        dayTrades.forEach(t => {
          if (t.type === 'buy' || !t.type) {
            markers.push({
              time: d.date,
              position: 'belowBar',
              color: '#10B981', // 绿色
              shape: 'arrowUp',
              text: '买入',
              size: 1.5,
            });
          } else if (t.type === 'sell') {
            markers.push({
              time: d.date,
              position: 'aboveBar',
              color: '#EF4444', // 红色
              shape: 'arrowDown',
              text: '卖出',
              size: 1.5,
            });
          }
        });
      }
    });

    mainSeries.setData(mainData);
    ma20Series.setData(ma20Data);
    ma60Series.setData(ma60Data);
    
    if (markers.length > 0) {
      createSeriesMarkers(mainSeries, markers);
    }

    // 处理时间区间控制，使用图表引擎原生的可见区域设置，不再强制截取数组！
    if (timeRange !== 'all') {
      let targetDate = new Date(data[data.length - 1].date);
      if (timeRange === '1w') targetDate.setDate(targetDate.getDate() - 7);
      else if (timeRange === '1m') targetDate.setMonth(targetDate.getMonth() - 1);
      else if (timeRange === '3m') targetDate.setMonth(targetDate.getMonth() - 3);
      else if (timeRange === '6m') targetDate.setMonth(targetDate.getMonth() - 6);
      else if (timeRange === '1y') targetDate.setFullYear(targetDate.getFullYear() - 1);
      else if (timeRange === '3y') targetDate.setFullYear(targetDate.getFullYear() - 3);
      else if (timeRange === '5y') targetDate.setFullYear(targetDate.getFullYear() - 5);
      else if (timeRange === '10y') targetDate.setFullYear(targetDate.getFullYear() - 10);
      else if (timeRange === '20y') targetDate.setFullYear(targetDate.getFullYear() - 20);

      const targetDateStr = targetDate.toISOString().split('T')[0];
      const startIndex = data.findIndex(d => d.date >= targetDateStr);
      if (startIndex !== -1) {
        // 轻微延迟以确保图表已完成初始化计算
        setTimeout(() => {
          chart.timeScale().setVisibleRange({
            from: data[startIndex].date,
            to: data[data.length - 1].date,
          });
        }, 50);
      }
    } else {
      setTimeout(() => {
        chart.timeScale().fitContent();
      }, 50);
    }

    // 响应式 Resize
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) return;
      const newRect = entries[0].contentRect;
      chart.applyOptions({ width: newRect.width });
    });
    
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, showTrades, tradesByDate, timeRange]);

  return (
    <div className="chart-container" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>价格走势</h3>
        <div className="time-btn-group" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {['1w', '1m', '3m', '6m', '1y'].map(range => (
            <button key={range} className={`time-btn ${timeRange === range ? 'active' : ''}`} onClick={() => setTimeRange(range)}>
              {range === '1w' ? '1周' : range === '1m' ? '1月' : range === '3m' ? '3月' : range === '6m' ? '6月' : '1年'}
            </button>
          ))}
          {coverageDays >= 365 * 3 && <button className={`time-btn ${timeRange === '3y' ? 'active' : ''}`} onClick={() => setTimeRange('3y')}>3年</button>}
          {coverageDays >= 365 * 5 && <button className={`time-btn ${timeRange === '5y' ? 'active' : ''}`} onClick={() => setTimeRange('5y')}>5年</button>}
          {coverageDays >= 365 * 10 && <button className={`time-btn ${timeRange === '10y' ? 'active' : ''}`} onClick={() => setTimeRange('10y')}>10年</button>}
          {coverageDays >= 365 * 20 && <button className={`time-btn ${timeRange === '20y' ? 'active' : ''}`} onClick={() => setTimeRange('20y')}>20年</button>}
          <button className={`time-btn ${timeRange === 'all' ? 'active' : ''}`} onClick={() => setTimeRange('all')}>全部</button>
        </div>
      </div>
      
      {/* 图表挂载点 */}
      <div ref={chartContainerRef} style={{ width: '100%', height: '350px' }} />
    </div>
  );
}
