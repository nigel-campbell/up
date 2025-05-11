import React from 'react';

interface ConfigPanelProps {
  refreshRate: number;
  windowSize: number;
  onRefreshRateChange: (rate: number) => void;
  onWindowSizeChange: (size: number) => void;
}

const REFRESH_RATE_OPTIONS = [
  { value: 5000, label: '5 seconds' },
  { value: 10000, label: '10 seconds' },
  { value: 15000, label: '15 seconds' },
  { value: 30000, label: '30 seconds' },
];

const WINDOW_SIZE_OPTIONS = [
  { value: 30, label: '5 minutes' },
  { value: 60, label: '10 minutes' },
  { value: 90, label: '15 minutes' },
  { value: 120, label: '20 minutes' },
];

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  refreshRate,
  windowSize,
  onRefreshRateChange,
  onWindowSizeChange,
}) => {
  return (
    <div style={{
      width: '100%',
      display: 'flex',
      gap: '20px',
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#2d2d2d',
      borderRadius: '8px',
      border: '1px solid #404040',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label htmlFor="refresh-rate" style={{ color: '#e0e0e0' }}>Refresh Rate:</label>
        <select
          id="refresh-rate"
          value={refreshRate}
          onChange={(e) => onRefreshRateChange(Number(e.target.value))}
          style={{
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            border: '1px solid #404040',
            padding: '5px 10px',
            borderRadius: '4px',
          }}
        >
          {REFRESH_RATE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label htmlFor="window-size" style={{ color: '#e0e0e0' }}>Time Window:</label>
        <select
          id="window-size"
          value={windowSize}
          onChange={(e) => onWindowSizeChange(Number(e.target.value))}
          style={{
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            border: '1px solid #404040',
            padding: '5px 10px',
            borderRadius: '4px',
          }}
        >
          {WINDOW_SIZE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default ConfigPanel; 