import React, { useState } from 'react';
import { Activity } from 'lucide-react';

export const TradingViewConnectModal = ({ isOpen, onClose, onFetch, isFetching }) => {
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

  const handleFetch = async () => {
    setErrorMsg(null);
    try {
      await onFetch();
    } catch (err) {
      if (err.name === 'CORSError') {
        setErrorMsg('抓取失败：请求被浏览器拦截。请确保您已开启 Allow CORS 插件。');
      } else {
        setErrorMsg(`抓取失败: ${err.message}`);
      }
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)',
        borderRadius: '12px', padding: '24px', maxWidth: '450px', width: '90%',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-gold)', marginBottom: '16px' }}>
          <Activity size={24} />
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>接入 TradingView 期权数据</h3>
        </div>
        
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ marginBottom: '1.5rem', lineHeight: '1.6', color: '#ccc' }}>
            <p style={{ margin: '0 0 10px 0' }}>
              为了获取 <strong style={{ color: '#EAB308' }}>COMEX黄金</strong> 的期权 Gamma 逼空防线，并绕过极为严格的 TLS/CORS 防护，我们采用 <strong>Tampermonkey 脚本桥接</strong> 方案。
            </p>
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              padding: '12px',
              borderRadius: '8px',
              marginTop: '12px',
              fontSize: '0.9em'
            }}>
              <p style={{ margin: '0 0 8px 0', color: '#60A5FA', fontWeight: 'bold' }}>油猴脚本 (Tampermonkey) 配置说明：</p>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#9CA3AF' }}>
                <li>请确保浏览器已安装 <strong>Tampermonkey</strong> 插件。</li>
                <li>复制我刚刚发给你的 <strong>“TradingView 跨域桥接脚本”</strong> 代码。</li>
                <li>在 Tampermonkey 中 <strong>添加新脚本</strong>，粘贴并保存。</li>
                <li>刷新本测试页面。当脚本生效后，即可无缝、带 Cookie 抓取任何高级数据！</li>
              </ul>
            </div>
          </div>
          
          {errorMsg && (
            <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171', borderRadius: '6px' }}>
              {errorMsg}
            </div>
          )}
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            onClick={onClose}
            style={{
              padding: '8px 16px', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button 
            onClick={handleFetch}
            disabled={isFetching}
            style={{
              padding: '8px 16px', fontSize: '0.9rem', fontWeight: '500', 
              backgroundColor: 'rgba(251, 191, 36, 0.2)', color: 'var(--accent-gold)', 
              border: '1px solid rgba(251, 191, 36, 0.5)', borderRadius: '8px',
              cursor: isFetching ? 'not-allowed' : 'pointer', opacity: isFetching ? 0.6 : 1
            }}
          >
            {isFetching ? '正在抓取...' : '一键抓取数据'}
          </button>
        </div>
      </div>
    </div>
  );
};
