import { Alert, Empty, Spin } from "antd";
import * as echarts from "echarts";
import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef } from "react";

export type ChartDataRow = {
  label: string;
  values: Array<{
    label: string;
    value: string | number | null | undefined;
  }>;
};

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
  dataRows?: ChartDataRow[];
  dataSummary?: string;
};

export function BaseEChart({
  ariaLabel,
  testId,
  option,
  loading = false,
  empty = false,
  error = null,
  height = 280,
  dataRows = [],
  dataSummary
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
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeChart) : null;
    resizeObserver?.observe(containerRef.current);
    window.addEventListener("resize", resizeChart);

    return () => {
      resizeObserver?.disconnect();
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
    <div className="chart-figure">
      <div
        ref={containerRef}
        aria-label={dataSummary ? `${ariaLabel}。${dataSummary}` : ariaLabel}
        data-testid={testId}
        role="img"
        style={{ width: "100%", height }}
      />
      {dataRows.length ? (
        <details className="chart-data-fallback">
          <summary>查看数据</summary>
          <div className="chart-data-table-wrap">
            <table className="chart-data-table">
              <caption>{dataSummary ?? ariaLabel}</caption>
              <thead>
                <tr>
                  <th scope="col">项目</th>
                  {dataRows[0]?.values.map((item) => (
                    <th scope="col" key={item.label}>{item.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((item) => (
                      <td key={`${row.label}-${item.label}`}>{item.value ?? "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function hasChartData<T>(data?: T[]) {
  return Boolean(data?.length);
}
