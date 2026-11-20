// ECharts — yalnız istifadə olunan modullar (tree-shaking, SPEC §4.1). SVG renderer: kəskin, çap üçün vektor, SVG export.
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, SankeyChart, ScatterChart, SunburstChart, TreemapChart } from 'echarts/charts';
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
  SVGRenderer,
]);

export { echarts };
