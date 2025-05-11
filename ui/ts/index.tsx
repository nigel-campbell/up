import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './components/Dashboard';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>
);

// TODO(nigel): Move styles to a separate CSS file. The grid card isn't rendering correctly unless I define the styles here.
const style = document.createElement('style');
style.textContent = `
  .dashboard {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  }

  .header {
    margin-bottom: 20px;
  }

  .header h1 {
    color: #e0e0e0;
    margin: 0;
  }

  .chart {
    margin-bottom: 20px;
    background: #1a1a1a;
    border-radius: 8px;
    padding: 20px;
    border: 1px solid #404040;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    background: #1a1a1a;
    border-radius: 8px;
    padding: 20px;
    border: 1px solid #404040;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .label {
    color: #888;
    font-size: 0.9em;
  }

  .value {
    color: #e0e0e0;
    font-size: 1.2em;
    font-weight: 500;
  }

  .subtext {
    color: #666;
    font-size: 0.8em;
  }

  .speedtest-stats {
    grid-column: 1 / -1;
    background: #2d2d2d;
    border-radius: 8px;
    padding: 15px;
    border: 1px solid #404040;
  }

  .speedtest-stats h3 {
    color: #e0e0e0;
    margin: 0 0 15px 0;
    font-size: 1.1em;
  }

  .speedtest-stats .stat {
    margin-bottom: 10px;
  }

  .speedtest-stats .value {
    color: #4CAF50;
  }

  .d3-tooltip {
    font-size: 0.9em;
    line-height: 1.4;
  }
`;
document.head.appendChild(style);

