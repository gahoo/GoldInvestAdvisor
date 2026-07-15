import React, { useState, useEffect } from 'react';
import { dbStore } from '../../services/storage/IndexedDBStore';
import { importCSV, exportToCSV } from '../../utils/csvParser';
import { X, Search, Download, Upload, Trash2, RefreshCw } from 'lucide-react';

export function DataSourcePanel({ onClose, onSelectSymbol, onRemoveRecent, onClearRecent }) {
  const [cachedItems, setCachedItems] = useState([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [newSource, setNewSource] = useState('yahoo'); // yahoo, fund, ccb
  const [newRange, setNewRange] = useState('max');
  const [isImporting, setIsImporting] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const loadCache = async () => {
    const items = await dbStore.getAllSeriesMetadata();
    setCachedItems(items);
  };

  useEffect(() => {
    loadCache();
  }, []);

  const handleAddSymbol = () => {
    if (!newSymbol.trim()) return;
    const symbolStr = newSymbol.trim().toUpperCase();
    let assetType = 'stock';
    if (newSource === 'fund') assetType = 'fund';
    if (newSource === 'ccb') assetType = 'commodity';
    if (symbolStr.startsWith('^') || symbolStr.includes('=')) assetType = 'macro';

    onSelectSymbol({
      source: newSource,
      symbol: symbolStr,
      assetType,
      name: symbolStr,
      range: newRange
    });
    setNewSymbol('');
    onClose();
  };

  const handleClearCache = async () => {
    setConfirmAction({
      message: '确定要清空所有本地数据缓存吗？清空后将从网络重新拉取全量数据，并且所有的常用标的也将被清空。',
      onConfirm: async () => {
        await dbStore.clearAll();
        if (onClearRecent) onClearRecent();
        await loadCache();
        window.location.reload();
      }
    });
  };

  const handleDeleteItem = async (cacheKey) => {
    setConfirmAction({
      message: '确定删除该标的缓存吗？对应的常用标的记录也会被移除。',
      onConfirm: async () => {
        await dbStore.deleteSeries(cacheKey);
        if (onRemoveRecent) onRemoveRecent(cacheKey);
        await loadCache();
      }
    });
  };

  const handleExport = async (cacheKey) => {
    const record = await dbStore.getSeries(cacheKey);
    if (record && record.data) {
      exportToCSV(record.data, `${cacheKey.replace(/:/g, '_')}.csv`);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      const data = await importCSV(file);
      // 弹出框让用户输入缓存 key 信息
      const symbol = window.prompt("请输入该导入数据的标的代码 (如 AAPL):", file.name.split('.')[0]);
      if (!symbol) { setIsImporting(false); return; }
      
      const cacheKey = `imported:unknown:${symbol.toUpperCase()}:1d:unadj`;
      
      const metadata = {
        coverageStart: data[0].date,
        coverageEnd: data[data.length - 1].date,
        lastFullRefreshAt: Date.now()
      };
      
      await dbStore.saveSeries(cacheKey, metadata, data);
      alert('导入成功！');
      await loadCache();
    } catch (err) {
      alert(`导入失败: ${err.message}`);
    } finally {
      setIsImporting(false);
      e.target.value = ''; // clear input
    }
  };

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, 
      backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)',
      borderRadius: '8px', zIndex: 100, padding: '20px', 
      boxShadow: '0 10px 25px rgba(0,0,0,0.5)', marginTop: '8px',
      maxHeight: '400px', overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>数据源管理面板</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <select 
          value={newSource} 
          onChange={e => setNewSource(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        >
          <option value="yahoo">Yahoo Finance (股票/指数/外汇/原油)</option>
          <option value="fund">天天基金 (国内公募基金)</option>
          <option value="ccb">建行纸黄金</option>
          <option value="fred">FRED API (宏观经济数据)</option>
          <option value="cftc">CFTC COT (持仓报告)</option>
        </select>
        <input 
          type="text" 
          placeholder={
            newSource === 'yahoo' ? "如 AAPL, GC=F, CL=F" : 
            newSource === 'fund' ? "如 110011" : 
            newSource === 'fred' ? "如 M2SL, DFII10" :
            newSource === 'cftc' ? "如 gold" :
            "输入代码"
          }
          value={newSymbol}
          onChange={e => setNewSymbol(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddSymbol()}
          style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <select 
          value={newRange} 
          onChange={e => setNewRange(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        >
          <option value="max">全部历史</option>
          <option value="20y">近20年</option>
          <option value="10y">近10年</option>
          <option value="5y">近5年</option>
          <option value="3y">近3年</option>
          <option value="1y">近1年</option>
        </select>
        <button onClick={handleAddSymbol} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Search size={16} /> 加载并切换
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '12px' }}>
        <h4 style={{ margin: 0 }}>本地缓存库 ({cachedItems.length})</h4>
        <div style={{ display: 'flex', gap: '12px' }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-gold)', fontSize: '0.9rem' }}>
            <Upload size={14} /> 导入 CSV
            <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} disabled={isImporting} />
          </label>
          <button onClick={handleClearCache} style={{ background: 'none', border: 'none', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>
            <Trash2 size={14} /> 清空全部
          </button>
        </div>
      </div>

      {cachedItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
          暂无缓存数据，尝试搜索并加载一个标的。
        </div>
      ) : (
        <table style={{ width: '100%', fontSize: '0.9rem', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '8px 0' }}>缓存主键</th>
              <th style={{ padding: '8px 0' }}>数据范围 (Coverage)</th>
              <th style={{ padding: '8px 0' }}>最后同步</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {cachedItems.map(item => (
              <tr key={item.cacheKey} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '12px 0', color: 'var(--text-primary)', fontWeight: '500' }}>
                  {item.metadata.name ? `${item.metadata.name} (${item.cacheKey})` : item.cacheKey}
                </td>
                <td style={{ padding: '12px 0', color: 'var(--text-secondary)' }}>
                  {item.metadata.coverageStart} ~ {item.metadata.coverageEnd}
                </td>
                <td style={{ padding: '12px 0', color: 'var(--text-secondary)' }}>
                  {new Date(item.updatedAt).toLocaleString()}
                </td>
                <td style={{ padding: '12px 0', textAlign: 'right' }}>
                  <button onClick={() => {
                    const parts = item.cacheKey.split(':');
                    onSelectSymbol({
                      source: parts[0], assetType: parts[1], symbol: parts[2], name: parts[2]
                    });
                    onClose();
                  }} title="切换至此标的" style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', marginRight: '8px' }}>
                    <RefreshCw size={16} />
                  </button>
                  <button onClick={() => handleExport(item.cacheKey)} title="导出为 CSV" style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', marginRight: '8px' }}>
                    <Download size={16} />
                  </button>
                  <button onClick={() => handleDeleteItem(item.cacheKey)} title="删除缓存" style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      {confirmAction && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-color)', padding: '24px', borderRadius: '8px', minWidth: '300px', maxWidth: '400px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>操作确认</h4>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', lineHeight: '1.5' }}>{confirmAction.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setConfirmAction(null)} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>取消</button>
              <button onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer' }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
