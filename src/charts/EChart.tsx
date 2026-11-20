import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { echarts } from './echarts';

export type EChartHandle = { svg: () => string | null };
type ClickParams = { dataType?: string; dataIndex: number; name: string; data: unknown; seriesType?: string };

/** ECharts sarğısı: SVG renderer, ölçü dəyişəndə yenidən çəkmə, klik hadisəsi, SVG export üçün handle. */
export const EChart = forwardRef<
  EChartHandle,
  { option: Record<string, unknown>; height: number; onClick?: (p: ClickParams) => void; label: string }
>(function EChart({ option, height, onClick, label }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, null, { renderer: 'svg' });
    inst.current = c;
    c.on('click', (p) => clickRef.current?.(p as unknown as ClickParams));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    inst.current?.resize();
  }, [height]);

  useImperativeHandle(ref, () => ({
    svg: () => (inst.current ? inst.current.renderToSVGString() : null),
  }));

  return <div ref={el} style={{ height, width: '100%' }} role="img" aria-label={label} data-chart />;
});
