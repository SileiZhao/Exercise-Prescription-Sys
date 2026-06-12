import { Alert, Empty, Spin } from "antd";
import * as echarts from "echarts";
import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef, useState } from "react";

export type ChartStateProps<T> = {
  data?: T[];
  loading?: boolean;
  error?: string | null;
  height?: number;
};

export type BaseEChartProps = {
  ariaLabel: string;
  testId: string;
  option: EChartsOption;
  loading?: boolean;
  empty?: boolean;
  error?: string | null;
  height?: number;
};

export function BaseEChart({
  ariaLabel,
  testId,
  option,
  loading = false,
  empty = false,
  error = null,
  height = 280
}: BaseEChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 640 : false
  );
  const effectiveHeight = isCompactViewport ? Math.max(200, Math.round(height * 0.82)) : height;

  useEffect(() => {
    const updateViewport = () => {
      setIsCompactViewport(window.innerWidth <= 640);
      chartRef.current?.resize();
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (loading || empty || error || !containerRef.current) {
      return undefined;
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option, true);

    return () => {
      chart.dispose();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, [empty, error, loading, option]);

  useEffect(() => {
    chartRef.current?.resize();
  }, [effectiveHeight]);

  if (loading) {
    return (
      <div role="status" className="chart-state chart-loading" style={{ minHeight: effectiveHeight }}>
        <Spin size="small" /> 图表加载中
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  if (empty) {
    return <div className="chart-state" style={{ minHeight: effectiveHeight }}><Empty description="暂无图表数据" /></div>;
  }

  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      data-testid={testId}
      role="img"
      style={{ width: "100%", height: effectiveHeight }}
    />
  );
}

export function hasChartData<T>(data?: T[]) {
  return Boolean(data?.length);
}
