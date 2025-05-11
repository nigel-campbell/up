import React, { useEffect, useRef, useState } from 'react';
import {
  select,
  scaleTime,
  scaleLinear,
  axisBottom,
  axisLeft,
  line as d3line,
  extent,
  max,
  schemeCategory10,
  pointer,
  curveMonotoneX,
  ScaleTime,
  ScaleLinear,
} from 'd3';
import ConfigPanel from './ConfigPanel';

interface StatusData {
  Timestamp: string;
  Status: 'up' | 'down';
  LatencyMs: number;
  Target: string;
}

interface ProcessedData {
  timestamp: Date;
  latency_ms: number | null;
  target: string;
}

interface Dimensions {
  width: number;
  height: number;
}

interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface TableSize {
  size_bytes: number;
}

interface UptimeData {
  target: string;
  uptime_pct: number;
  total_checks: number;
  window_hours: number;
}

interface SpeedTestData {
  Timestamp: string;
  DownloadMbps: number;
  UploadMbps: number;
  LatencyMs: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Add moving average window function
const calculateMovingAverage = (data: ProcessedData[], windowSize: number): ProcessedData[] => {
  const result: ProcessedData[] = [];
  const window: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    if (current.latency_ms === null) {
      result.push(current);
      window.length = 0;
      continue;
    }
    
    window.push(current.latency_ms);
    if (window.length > windowSize) {
      window.shift();
    }
    
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    result.push({
      ...current,
      latency_ms: avg
    });
  }
  
  return result;
};

const Dashboard: React.FC = () => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<StatusData[]>([]);
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0 });
  const [tableSize, setTableSize] = useState<number>(0);
  const [uptimeData, setUptimeData] = useState<UptimeData[]>([]);
  const [refreshRate, setRefreshRate] = useState<number>(10000);
  const [windowSize, setWindowSize] = useState<number>(60);
  const [speedTestData, setSpeedTestData] = useState<SpeedTestData[]>([]);

  const aspectRatio = 2;
  const margin: Margin = { top: 20, right: 50, bottom: 40, left: 50 };

  const fetchData = async (): Promise<void> => {
    try {
      const response = await fetch('/status');
      const jsonData = await response.json();
      setData(jsonData);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchTableSize = async (): Promise<void> => {
    try {
      console.log('Fetching table size...');
      const response = await fetch('/size');
      const data: TableSize = await response.json();
      console.log('Table size response:', data);
      setTableSize(data.size_bytes);
    } catch (error) {
      console.error('Error fetching table size:', error);
    }
  };

  const fetchUptimeData = async (): Promise<void> => {
    try {
      const response = await fetch('/uptime');
      const data: UptimeData[] = await response.json();
      setUptimeData(data);
    } catch (error) {
      console.error('Error fetching uptime data:', error);
    }
  };

  const fetchSpeedTestData = async (): Promise<void> => {
    try {
      const response = await fetch('/speedtest');
      const data: SpeedTestData[] = await response.json();
      setSpeedTestData(data);
    } catch (error) {
      console.error('Error fetching speed test data:', error);
    }
  };

  useEffect(() => {
    const handleResize = (): void => {
      if (chartRef.current) {
        const width = chartRef.current.offsetWidth;
        setDimensions({
          width,
          height: Math.round(width / aspectRatio),
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchData();
    fetchTableSize();
    fetchUptimeData();
    fetchSpeedTestData();
    const dataInterval = setInterval(fetchData, refreshRate);
    const sizeInterval = setInterval(fetchTableSize, 60000);
    const uptimeInterval = setInterval(fetchUptimeData, refreshRate);
    const speedTestInterval = setInterval(fetchSpeedTestData, refreshRate);
    return () => {
      clearInterval(dataInterval);
      clearInterval(sizeInterval);
      clearInterval(uptimeInterval);
      clearInterval(speedTestInterval);
    };
  }, [refreshRate]);

  useEffect(() => {
    if (!data.length || !dimensions.width) return;

    select(chartRef.current).selectAll('*').remove();

    const { width, height } = dimensions;

    const svg = select(chartRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMinYMin meet');

    const x = scaleTime<number, number>().range([margin.left, width - margin.right]);
    const y = scaleLinear().range([height - margin.bottom, margin.top]);

    svg
      .append('defs')
      .append('clipPath')
      .attr('id', 'clip')
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom);

    const processedData: ProcessedData[] = data.map(d => ({
      timestamp: new Date(d.Timestamp),
      latency_ms: d.Status === 'up' ? d.LatencyMs : null,
      target: d.Target,
    }));

    const smoothedData = calculateMovingAverage(processedData, windowSize);

    const xExtent = extent(smoothedData, d => d.timestamp.getTime()) as [number, number];
    x.domain(xExtent);
    y.domain([0, max(smoothedData, d => d.latency_ms || 0) || 0]);

    const xAxis = svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(axisBottom(x).ticks(6));
    xAxis.selectAll('text').attr('transform', 'rotate(-40)').style('text-anchor', 'end');

    const yAxis = svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(axisLeft(y));

    // Add y-axis label
    svg
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', margin.left - 40)
      .attr('x', -(height / 2))
      .attr('text-anchor', 'middle')
      .text('Latency (ms)');

    const targets = [...new Set(processedData.map(d => d.target))];
    const color = schemeCategory10;

    const lineGen = d3line<ProcessedData>()
      .defined(d => d.latency_ms !== null)
      .x(d => x(d.timestamp.getTime()))
      .y(d => y(d.latency_ms ?? 0))
      .curve(curveMonotoneX);

    targets.forEach((target, i) => {
      const targetData = smoothedData.filter(d => d.target === target);
      svg
        .append('path')
        .datum(targetData)
        .attr('clip-path', 'url(#clip)')
        .attr('fill', 'none')
        .attr('stroke', color[i % color.length])
        .attr('stroke-width', 2)
        .attr('d', lineGen)
        .attr('class', `line-${target.replace(/[^a-z0-9]/g, '-')}`);
    });

    const tooltip = select(chartRef.current)
      .append('div')
      .attr('class', 'd3-tooltip')
      .style('position', 'absolute')
      .style('background', '#222')
      .style('color', '#fff')
      .style('border', '1px solid #444')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    svg
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', function (event: MouseEvent) {
        const [mx] = pointer(event, this);
        const mouseTime = x.invert(mx);
        let closest: ProcessedData | undefined,
          minDist = Infinity;
        smoothedData.forEach(d => {
          if (d.latency_ms !== null) {
            const dist = Math.abs(d.timestamp.getTime() - mouseTime.getTime());
            if (dist < minDist) {
              minDist = dist;
              closest = d;
            }
          }
        });
        if (closest) {
          tooltip.transition().duration(100).style('opacity', 0.95);
          tooltip
            .html(
              `<strong>Target:</strong> ${closest.target}<br>` +
                `<strong>Latency:</strong> ${closest.latency_ms} ms<br>` +
                `<strong>Time:</strong> ${closest.timestamp.toLocaleString()}`
            )
            .style('left', event.offsetX + 20 + 'px')
            .style('top', event.offsetY + 20 + 'px');
        }
      })
      .on('mouseleave', function () {
        tooltip.transition().duration(200).style('opacity', 0);
      });
  }, [data, dimensions, windowSize]);

  return (
    <div className="dashboard">
      <div className="header">
        <h1>Uptime Monitor</h1>
      </div>
      <ConfigPanel
        refreshRate={refreshRate}
        onRefreshRateChange={setRefreshRate}
        windowSize={windowSize}
        onWindowSizeChange={setWindowSize}
      />
      <div ref={chartRef} className="chart" />
      <div className="stats">
        <div className="stat">
          <span className="label">Database Size:</span>
          <span className="value">{formatBytes(tableSize)}</span>
        </div>
        {uptimeData.map((uptime) => (
          <div key={uptime.target} className="stat">
            <span className="label">{uptime.target} Uptime:</span>
            <span className="value">{uptime.uptime_pct.toFixed(2)}%</span>
            <span className="subtext">({uptime.window_hours.toFixed(1)}h window)</span>
          </div>
        ))}
        {speedTestData.length > 0 && (
          <div className="speedtest-stats">
            <h3>Speed Test Results</h3>
            <div className="stat">
              <span className="label">Download:</span>
              <span className="value">{speedTestData[0].DownloadMbps.toFixed(2)} Mbps</span>
            </div>
            <div className="stat">
              <span className="label">Upload:</span>
              <span className="value">{speedTestData[0].UploadMbps.toFixed(2)} Mbps</span>
            </div>
            <div className="stat">
              <span className="label">Latency:</span>
              <span className="value">{speedTestData[0].LatencyMs} ms</span>
            </div>
            <div className="subtext">
              Last updated: {new Date(speedTestData[0].Timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
