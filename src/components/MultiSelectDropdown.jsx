import React, { useState, useRef, useEffect } from 'react';

export function MultiSelectDropdown({ label, options = [], selectedOptions = [], onChange, getOptionLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (opt) => {
    if (selectedOptions.includes(opt)) {
      onChange(selectedOptions.filter(x => x !== opt));
    } else {
      onChange([...selectedOptions, opt]);
    }
  };

  const toggleAll = () => {
    if (selectedOptions.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--card-bg)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
          {selectedOptions.length === 0 ? `未选择${label}` : `已选择 ${selectedOptions.length} 个${label}`}
        </span>
        <span style={{ fontSize: '0.7rem', opacity: 0.6, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginLeft: '4px' }}>▼</span>
      </div>
      
      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxHeight: '300px', overflowY: 'auto' }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>全选</span>
            <input 
              type="checkbox" 
              checked={selectedOptions.length === options.length && options.length > 0}
              onChange={toggleAll}
              style={{ cursor: 'pointer' }}
            />
          </div>
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>
              <input 
                type="checkbox" 
                checked={selectedOptions.includes(opt)}
                onChange={() => toggleOption(opt)}
                style={{ marginRight: '8px' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{getOptionLabel ? getOptionLabel(opt) : opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
