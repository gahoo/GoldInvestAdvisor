import React, { useState, useEffect } from 'react';
import { DataSourcePanel } from './DataSourcePanel';
import { Database, Plus } from 'lucide-react';

export function TopBar({ currentSymbolConfig, onSelectSymbol }) {
  const [showPanel, setShowPanel] = useState(false);
  
  // recentSymbols: Array<{source, symbol, assetType, name}>
  const [recentSymbols, setRecentSymbols] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('recentSymbols')) || [
        { source: 'ccb', symbol: 'gold', assetType: 'commodity', name: '黄金(建行)' }
      ];
    } catch {
      return [{ source: 'ccb', symbol: 'gold', assetType: 'commodity', name: '黄金(建行)' }];
    }
  });

  useEffect(() => {
    localStorage.setItem('recentSymbols', JSON.stringify(recentSymbols));
  }, [recentSymbols]);

  // 当外部传入的 currentSymbolConfig 改变时，确保它在 recentSymbols 中且处于第一位
  useEffect(() => {
    if (!currentSymbolConfig) return;
    
    setRecentSymbols(prev => {
      // 防止重复添加
      const existsIdx = prev.findIndex(item => 
        item.source === currentSymbolConfig.source && item.symbol === currentSymbolConfig.symbol
      );
      
      let nextList = [...prev];
      if (existsIdx >= 0) {
        // 如果存在，移到最前面
        const [existing] = nextList.splice(existsIdx, 1);
        nextList.unshift(existing);
      } else {
        // 不存在，加到最前面，并限制最多 5 个
        nextList.unshift(currentSymbolConfig);
        if (nextList.length > 5) {
          nextList.pop();
        }
      }
      return nextList;
    });
  }, [currentSymbolConfig]);

  const handleSelectSymbol = (config) => {
    onSelectSymbol(config);
  };

  const handleRemoveRecentByCacheKey = (cacheKey) => {
    const parts = cacheKey.split(':');
    if (parts.length >= 3) {
      const source = parts[0];
      const symbol = parts[2];
      setRecentSymbols(prev => prev.filter(item => !(item.source === source && item.symbol === symbol)));
    }
  };

  const handleClearRecent = () => {
    setRecentSymbols([]);
  };

  return (
    <div style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', gap: '16px', 
      padding: '12px 20px', 
      backgroundColor: 'var(--bg-color)', 
      borderBottom: '1px solid var(--border-color)',
      marginBottom: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-gold)' }}>
        <Database size={20} />
        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>数据中心</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '20px', flex: 1 }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>常用标的:</span>
        {recentSymbols.map((item, idx) => {
          const isActive = currentSymbolConfig?.source === item.source && currentSymbolConfig?.symbol === item.symbol;
          return (
            <button
              key={`${item.source}-${item.symbol}-${idx}`}
              onClick={() => handleSelectSymbol(item)}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                border: isActive ? '1px solid var(--accent-gold)' : '1px solid var(--border-color)',
                backgroundColor: isActive ? 'rgba(212, 175, 55, 0.1)' : 'var(--bg-secondary)',
                color: isActive ? 'var(--accent-gold)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: isActive ? 'bold' : 'normal',
                transition: 'all 0.2s'
              }}
            >
              {item.name}
            </button>
          );
        })}

        <button 
          onClick={() => setShowPanel(!showPanel)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', borderRadius: '20px',
            border: '1px dashed var(--border-color)',
            background: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', marginLeft: '8px'
          }}
        >
          <Plus size={16} /> 管理/添加
        </button>
      </div>

      {showPanel && (
        <DataSourcePanel 
          onClose={() => setShowPanel(false)} 
          onSelectSymbol={handleSelectSymbol} 
          onRemoveRecent={handleRemoveRecentByCacheKey}
          onClearRecent={handleClearRecent}
        />
      )}
    </div>
  );
}
