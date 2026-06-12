import { Alert, Empty, Spin } from "antd";
import * as echarts from "echarts";
import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if (loading || empty || error || !containerRef.current) {
      return undefined;
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option, true);
    const resizeChart = () => chart.resize();
    window.addEventListener("resize", resizeChart);

    return () => {
      window.removeEventListener("resize", resizeChart);
      chart.dispose();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, [empty, error, loading, option]);

  if (loading) {
    return (
      <div role="status" className="chart-state chart-loading">
        <Spin size="small" /> 图表加载中
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  if (empty) {
    return <Empty description="暂无图表数据" />;
  }

  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      data-testid={testId}
      role="img"
      style={{ width: "100%", height }}
    />
  );
}

export function hasChartData<T>(data?: T[]) {
  return Boolean(data?.length);
}
