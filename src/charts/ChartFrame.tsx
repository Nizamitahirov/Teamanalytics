import { useId, useRef, useState, type ReactNode } from 'react';
import { Download, FileImage, Info, Maximize2, Table2, BarChart3 } from 'lucide-react';
import { IconButton } from '../components/Button';
import { useI18n } from '../lib/i18n';
import { EChart, type EChartHandle } from './EChart';
import { downloadPng, downloadSvg } from './export';
import type { ChartSpec } from './theme';
import s from './ChartFrame.module.css';

/**
 * Qrafik çərçivəsi (SPEC §6, §12.3 ChartFrame): başlıq, ⓘ (nəyi göstərir, formula), "Cədvəl kimi bax"
 * (əlçatanlıq + dəqiq rəqəmlər), SVG/PNG yüklə, tam ekran. Ekran oxuyucu üçün avtomatik xülasə.
 */
export function ChartFrame({
  title,
  subtitle,
  info,
  spec,
  onClick,
  extra,
  className,
  testId,
  background,
}: {
  title: string;
  subtitle?: string;
  info: string;
  spec: ChartSpec;
  onClick?: Parameters<typeof EChart>[0]['onClick'];
  extra?: ReactNode;
  className?: string;
  testId?: string;
  background: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const frame = useRef<HTMLElement>(null);
  const chart = useRef<EChartHandle>(null);
  const [table, setTable] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <section
      ref={frame}
      className={`${s.frame} ${className ?? ''}`}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      data-testid={testId}
    >
      <div className={s.head}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id={`${id}-t`}>{title}</h2>
          {subtitle && <p className={s.sub}>{subtitle}</p>}
        </div>
        <div className={s.tools}>
          <IconButton size="sm" label={t('chart.info')} aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
            <Info size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            size="sm"
            label={table ? t('chart.asChart') : t('chart.asTable')}
            aria-pressed={table}
            onClick={() => setTable((v) => !v)}
          >
            {table ? <BarChart3 size={16} aria-hidden="true" /> : <Table2 size={16} aria-hidden="true" />}
          </IconButton>
          {!table && (
            <>
              <IconButton
                size="sm"
                label={t('chart.svg')}
                onClick={() => chart.current?.svg() && downloadSvg(chart.current.svg()!, title)}
              >
                <Download size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                size="sm"
                label={t('chart.png')}
                onClick={() => {
                  const svg = chart.current?.svg();
                  if (svg) void downloadPng(svg, title, background);
                }}
              >
                <FileImage size={16} aria-hidden="true" />
              </IconButton>
            </>
          )}
          <IconButton
            size="sm"
            label={t('chart.fullscreen')}
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen?.())}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      {showInfo && (
        <p className={s.info} role="note">
          {info}
        </p>
      )}
      <p id={`${id}-d`} className="visually-hidden">
        {spec.summary}
      </p>
      {extra && <div className={s.extra}>{extra}</div>}
      {table ? (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <caption className="visually-hidden">{title}</caption>
            <thead>
              <tr>
                {spec.table.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" style={{ fontWeight: 600, background: 'none', position: 'static' }}>
                        {v}
                      </th>
                    ) : (
                      <td key={j}>{v}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EChart ref={chart} option={spec.option} height={spec.height} onClick={onClick} label={spec.summary} />
      )}
    </section>
  );
}
