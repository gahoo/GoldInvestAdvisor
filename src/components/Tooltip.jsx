import React from 'react';
import { HelpCircle } from 'lucide-react';

export function Tooltip({ content, children }) {
  return (
    <div className="tooltip-container">
      {children}
      <HelpCircle className="tooltip-icon" size={16} />
      <div className="tooltip-popup">
        {content}
      </div>
    </div>
  );
}
