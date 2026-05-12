import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import * as echarts from 'echarts';
import { planningV2Api } from '../services/planning-v2.api';
import { PlanningTechDashboardResponse } from '../types/planning-v2.types';
import './sw-tech-dashboard.css';

type StatusTone = 'ok' | 'warn' | 'bad';

type DashboardCardProps = {
  title: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
  onClick?: () => void;
};

function formatInt(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(Math.round(value));
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽`;
}

function getTone(pct: number): StatusTone {
  if (pct >= 80) return 'ok';
  if (pct >= 60) return 'warn';
  return 'bad';
}

function DashboardCard({ title, value, hint, tone, onClick }: DashboardCardProps) {
  return (
    <Paper
      className="sw-tech-card"
      variant="outlined"
      onClick={onClick}
      sx={onClick ? { cursor: 'pointer' } : undefined}
    >
      <Typography className="sw-tech-card-title">{title}</Typography>
      <Typography className={`sw-tech-card-value sw-tech-${tone ?? 'ok'}`}>{value}</Typography>
      <Typography className="sw-tech-card-hint">{hint ?? ' '}</Typography>
    </Paper>
  );
}

type DailySegmentCode = 'KTK_VVO' | 'KTK_MOW' | 'AUTO' | 'RAIL' | 'EXTRA' | 'TO';
type ClassicKpiItem = {
  title: string;
  value: string;
  hint: string;
  tone: StatusTone;
  segmentCode?: DailySegmentCode;
  target?: 'totals';
};

export default function SWTechDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const now = new Date();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const year = Number(query.get('year')) || currentYear;
  const month = Number(query.get('month')) || currentMonth;
  const safeMonth = Math.max(1, Math.min(12, month));
  const formatIsoLocal = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const asOfDate = formatIsoLocal(new Date(year, safeMonth, 0));
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlanningTechDashboardResponse | null>(null);
  const [chartsReady, setChartsReady] = useState<boolean>(false);
  const [layoutMode, setLayoutMode] = useState<'compact' | 'regular' | 'expanded'>('regular');

  const monthlyChartRef = useRef<HTMLDivElement | null>(null);
  const aprilChartRef = useRef<HTMLDivElement | null>(null);
  const waitChartRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    const recalcLayoutMode = () => {
      const rect = rootEl.getBoundingClientRect();
      const availableHeight = Math.max(1, window.innerHeight - rect.top - 14);
      rootEl.style.setProperty('--sw-tech-available-h', `${availableHeight}px`);
      if (availableHeight <= 720) {
        setLayoutMode('compact');
        return;
      }
      if (availableHeight >= 960) {
        setLayoutMode('expanded');
        return;
      }
      setLayoutMode('regular');
    };

    recalcLayoutMode();
    window.addEventListener('resize', recalcLayoutMode);
    return () => window.removeEventListener('resize', recalcLayoutMode);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setChartsReady(false);
      const response = await planningV2Api.getTechDashboard({ year, month: safeMonth, asOfDate });
      setData(response);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить SW Tech Dashboard');
    } finally {
      setLoading(false);
    }
  }, [year, safeMonth, asOfDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!data) {
      setChartsReady(false);
      return;
    }

    let isCancelled = false;
    let rafId: number | null = null;
    let idleId: number | null = null;

    const markReady = () => {
      if (!isCancelled) {
        setChartsReady(true);
      }
    };

    const win = window as any;
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(
        () => {
          rafId = window.requestAnimationFrame(markReady);
        },
        { timeout: 300 },
      );
    } else {
      rafId = window.requestAnimationFrame(() => {
        window.setTimeout(markReady, 0);
      });
    }

    return () => {
      isCancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
    };
  }, [data]);

  useEffect(() => {
    if (!data || !chartsReady) return;

    const instances: echarts.ECharts[] = [];
    const observers: ResizeObserver[] = [];
    const resizeTimers: number[] = [];

    const monthSegments = data.month_segments ?? data.april_segments;
    const monthlyLabels = data.monthly.map((item) => item.month);
    const monthlyPlan = data.monthly.map((item) => item.plan);
    const monthlyFact = data.monthly.map((item) => item.fact);
    const monthlyPct = data.monthly.map((item) => item.pct);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const pctVisibleUntilMonth = data.year < currentYear ? 12 : (data.year > currentYear ? 0 : currentMonth);
    const monthlyPctVisible = monthlyPct.map((value, index) => (index + 1 <= pctVisibleUntilMonth ? value : null));
    const monthlyMax = Math.max(1, ...monthlyPlan, ...monthlyFact);
    const monthlyAxisMax = Math.ceil(monthlyMax / 500) * 500;
    const monthlyAxisStep = Math.max(100, Math.round(monthlyAxisMax / 6 / 100) * 100);

    const buildMonthly = (width: number): echarts.EChartsOption => {
      const scale = Math.max(0.72, Math.min(1.08, width / 880));
      const axisFont = Math.max(9, Math.round(12 * scale));
      const labelFont = Math.max(8, Math.round(10 * scale));
      const legendFont = Math.max(10, Math.round(12 * scale));
      const isNarrow = width < 760;

      return ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove',
        enterable: false,
        confine: true,
        showDelay: 0,
        hideDelay: 80,
        transitionDuration: 0,
        formatter: (params: any) => {
          const rows = Array.isArray(params) ? params : [params];
          if (!rows.length) return '';
          const title = rows[0]?.axisValueLabel ?? rows[0]?.name ?? '';
          const body = rows.map((item: any) => {
            const isPct = item?.seriesName === 'Выполнение %';
            const raw = Number(item?.value ?? 0);
            const value = isPct ? `${Math.round(raw)}%` : formatInt(raw);
            return `${item?.marker ?? ''}${item?.seriesName ?? ''} ${value}`;
          }).join('<br/>');
          return `${title}<br/>${body}`;
        },
      },
      legend: {
        orient: 'vertical',
        right: 4,
        top: 'middle',
        itemWidth: 18,
        itemHeight: 10,
        textStyle: { color: '#5f6f87', fontSize: legendFont },
      },
      grid: {
        left: Math.round(34 * scale),
        right: Math.max(120, Math.round(130 * scale)),
        top: Math.round(22 * scale),
        bottom: Math.round(8 * scale),
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: monthlyLabels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#bfc9d8' } },
        axisLabel: {
          color: '#5d6d86',
          interval: 0,
          hideOverlap: false,
          rotate: isNarrow ? 28 : 18,
          margin: Math.max(10, Math.round(12 * scale)),
          fontSize: axisFont,
        },
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: monthlyAxisMax,
          interval: monthlyAxisStep,
          axisLine: { show: false },
          axisLabel: { color: '#6a7a93', fontSize: axisFont, formatter: (value: number) => (value === 0 ? '' : formatInt(value)) },
          splitLine: { lineStyle: { color: '#dbe3ee', type: 'dashed' } },
        },
        {
          type: 'value',
          min: 0,
          max: 150,
          position: 'right',
          axisLine: { show: false },
          axisLabel: { color: '#6a7a93', fontSize: axisFont, formatter: (value: number) => `${value}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'План',
          type: 'bar',
          data: monthlyPlan,
          barMaxWidth: Math.max(10, Math.round(20 * scale)),
          itemStyle: { color: '#2bc36d', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', distance: 2, color: '#43607a', fontSize: labelFont },
        },
        {
          name: 'Факт',
          type: 'bar',
          data: monthlyFact,
          barMaxWidth: Math.max(10, Math.round(20 * scale)),
          itemStyle: { color: '#8ea0b9', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', distance: 2, color: '#506382', fontSize: labelFont },
        },
        {
          name: 'Выполнение %',
          type: 'line',
          yAxisIndex: 1,
          data: monthlyPctVisible,
          smooth: true,
          symbol: 'circle',
          symbolSize: Math.max(4, Math.round(6 * scale)),
          lineStyle: { width: Math.max(1.5, 2 * scale), color: '#ff9f6a' },
          itemStyle: { color: '#ff9f6a' },
        },
      ],
    })};

    const buildApril = (width: number): echarts.EChartsOption => {
      const scale = Math.max(0.72, Math.min(1.05, width / 900));
      const axisFont = Math.max(9, Math.round(12 * scale));
      const labelFont = Math.max(8, Math.round(10 * scale));
      const legendFont = Math.max(10, Math.round(12 * scale));
      const yLabelMaxWidth = Math.max(92, Math.round(150 * scale));
      const aprilCategories = monthSegments.map((x) => {
        if (x.name === 'Москва') return 'КТК Москва';
        if (x.name === 'Владивосток') return 'КТК Владивосток';
        return x.name;
      });

      return ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove',
        enterable: false,
        confine: true,
        showDelay: 0,
        hideDelay: 80,
        transitionDuration: 0,
        formatter: (params: any) => {
          const rows = Array.isArray(params) ? params : [params];
          if (!rows.length) return '';
          const title = rows[0]?.axisValueLabel ?? rows[0]?.name ?? '';
          const body = rows.map((item: any) => {
            const value = formatInt(Number(item?.value ?? 0));
            return `${item?.marker ?? ''}${item?.seriesName ?? ''} ${value}`;
          }).join('<br/>');
          return `${title}<br/>${body}`;
        },
      },
      legend: {
        orient: 'vertical',
        right: 4,
        top: 'middle',
        itemWidth: 18,
        itemHeight: 10,
        textStyle: { color: '#5f6f87', fontSize: legendFont },
      },
      grid: {
        left: Math.max(30, Math.round(40 * scale)),
        right: Math.max(96, Math.round(108 * scale)),
        top: Math.round(10 * scale),
        bottom: Math.round(8 * scale),
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#6a7a93', fontSize: axisFont },
        splitLine: { lineStyle: { color: '#dbe3ee', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: aprilCategories,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#bfc9d8' } },
        axisLabel: { color: '#5d6d86', fontSize: axisFont, width: yLabelMaxWidth, overflow: 'truncate' },
      },
      series: [
        {
          name: 'План',
          type: 'bar',
          data: monthSegments.map((x) => x.plan),
          barMaxWidth: Math.max(10, Math.round(16 * scale)),
          itemStyle: { color: '#27b8ff', borderRadius: [0, 7, 7, 0] },
          label: { show: true, position: 'right', color: '#3f5877', fontSize: labelFont },
        },
        {
          name: 'Факт',
          type: 'bar',
          data: monthSegments.map((x) => x.fact),
          barMaxWidth: Math.max(10, Math.round(16 * scale)),
          itemStyle: { color: '#9eaac0', borderRadius: [0, 7, 7, 0] },
          label: { show: true, position: 'right', color: '#506382', fontSize: labelFont },
        },
      ],
    })};

    const buildWait = (width: number): echarts.EChartsOption => {
      const scale = Math.max(0.72, Math.min(1.08, width / 760));
      const labelFont = Math.max(9, Math.round(12 * scale));
      const isNarrow = width < 520;
      return ({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        enterable: false,
        confine: true,
        showDelay: 0,
        hideDelay: 80,
        transitionDuration: 0,
        formatter: (params: any) => `${params.name}: ${formatInt(Number(params.value || 0))}`,
      },
      legend: { show: false },
      series: [
        {
          type: 'pie',
          radius: isNarrow ? ['52%', '80%'] : ['62%', '90%'],
          center: ['50%', isNarrow ? '48%' : '50%'],
          label: { color: '#4f617b', fontSize: labelFont },
          data: [
            { value: data.kpi.auto.waiting_truck, name: 'Автовозы', itemStyle: { color: '#33d7ff' } },
            { value: data.kpi.auto.waiting_ktk, name: 'Авто в КТК', itemStyle: { color: '#8d7dff' } },
            { value: data.kpi.auto.waiting_curtain, name: 'Шторы', itemStyle: { color: '#26d3a1' } },
            { value: data.kpi.rail.waiting_total, name: 'ЖД', itemStyle: { color: '#ffbd57' } },
          ],
        },
      ],
    })};

    const renderAllCharts = () => {
      if (instances.length < 3) return;
      const monthly = instances[0];
      const april = instances[1];
      const wait = instances[2];
      monthly.setOption(buildMonthly(monthly.getWidth()), true);
      april.setOption(buildApril(april.getWidth()), true);
      wait.setOption(buildWait(wait.getWidth()), true);
      instances.forEach((chart) => chart.resize());
    };

    if (monthlyChartRef.current) {
      const chart = echarts.init(monthlyChartRef.current);
      chart.setOption(buildMonthly(monthlyChartRef.current.clientWidth || 900));
      instances.push(chart);
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(monthlyChartRef.current);
      observers.push(observer);
    }

    if (aprilChartRef.current) {
      const chart = echarts.init(aprilChartRef.current);
      chart.setOption(buildApril(aprilChartRef.current.clientWidth || 900));
      instances.push(chart);
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(aprilChartRef.current);
      observers.push(observer);
    }

    if (waitChartRef.current) {
      const chart = echarts.init(waitChartRef.current);
      chart.setOption(buildWait(waitChartRef.current.clientWidth || 760));
      instances.push(chart);
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(waitChartRef.current);
      observers.push(observer);
    }

    const resizeAll = () => renderAllCharts();

    const scheduleResizeStabilization = () => {
      [0, 80, 180, 320].forEach((delay) => {
        const timer = window.setTimeout(() => resizeAll(), delay);
        resizeTimers.push(timer);
      });
    };

    const onResize = () => scheduleResizeStabilization();
    const onTransitionEnd = (event: TransitionEvent) => {
      const property = event.propertyName;
      if (property === 'width' || property === 'margin-left' || property === 'left' || property === 'transform') {
        scheduleResizeStabilization();
      }
    };

    const pageObserver = pageRef.current
      ? new ResizeObserver(() => scheduleResizeStabilization())
      : null;
    if (pageObserver && pageRef.current) {
      pageObserver.observe(pageRef.current);
      observers.push(pageObserver);
    }

    scheduleResizeStabilization();
    window.addEventListener('resize', onResize);
    document.addEventListener('transitionend', onTransitionEnd, true);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('transitionend', onTransitionEnd, true);
      observers.forEach((observer) => observer.disconnect());
      resizeTimers.forEach((timer) => window.clearTimeout(timer));
      instances.forEach((chart) => chart.dispose());
    };
  }, [data, chartsReady]);

  const classicKpi = useMemo<ClassicKpiItem[]>(() => {
    if (!data) return [];
    const monthSegments = data.month_segments ?? data.april_segments;
    const monthLabel = new Date(data.year, data.month - 1, 1).toLocaleString('ru-RU', { month: 'long' });
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    return [
      {
        title: 'Автовозы и шторы, % план/факт',
        value: `${data.computed.auto_pct.toFixed(1)}%`,
        hint: `Факт ${formatInt(monthSegments.find((row) => row.name === 'Автовозы')?.fact ?? 0)} / План ${formatInt(monthSegments.find((row) => row.name === 'Автовозы')?.plan ?? 0)}`,
        tone: getTone(data.computed.auto_pct),
        segmentCode: 'AUTO',
      },
      {
        title: 'Авто в КТК, % план/факт',
        value: `${data.computed.auto_ktk_pct.toFixed(1)}%`,
        hint: `Факт ${formatInt(monthSegments.find((row) => row.name === 'Авто в ктк')?.fact ?? 0)} / План ${formatInt(monthSegments.find((row) => row.name === 'Авто в ктк')?.plan ?? 0)}`,
        tone: getTone(data.computed.auto_ktk_pct),
        segmentCode: 'AUTO',
      },
      {
        title: 'ТО авто, % план/факт',
        value: `${monthSegments.find((row) => row.name === 'ТО авто')?.pct.toFixed(1) ?? '0.0'}%`,
        hint: `Факт ${formatInt(data.kpi.to.fact_month)} / План ${formatInt(data.kpi.to.plan_month)}`,
        tone: getTone(monthSegments.find((row) => row.name === 'ТО авто')?.pct ?? 0),
        segmentCode: 'TO',
      },
      {
        title: `Итого за ${monthLabelCap}, % план/факт`,
        value: `${data.computed.total_pct.toFixed(1)}%`,
        hint: `План ${formatInt(data.computed.total_plan)} / Факт ${formatInt(data.computed.total_fact)}`,
        tone: getTone(data.computed.total_pct),
        target: 'totals',
      },
    ];
  }, [data]);

  const openDaily = useCallback((segmentCode: DailySegmentCode) => {
    if (!data) return;
    navigate(`/plans?segment=${segmentCode}&year=${data.year}&month=${data.month}`);
  }, [data, navigate]);

  const openTotals = useCallback(() => {
    if (!data) return;
    navigate(`/plans/totals?year=${data.year}`);
  }, [data, navigate]);

  const riskRows = useMemo(() => {
    if (!data) return [];
    const monthSegments = data.month_segments ?? data.april_segments;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const today = now.getDate();
    const monthDays = new Date(data.year, data.month, 0).getDate();
    const elapsedDays = data.year < currentYear
      ? monthDays
      : data.year > currentYear
        ? 0
        : data.month < currentMonth
          ? monthDays
          : data.month > currentMonth
            ? 0
            : Math.max(0, Math.min(monthDays, today - 1));
    const isPastMonth = data.year < currentYear || (data.year === currentYear && data.month < currentMonth);
    const isCurrentMonth = data.year === currentYear && data.month === currentMonth;

    return [...monthSegments]
      .map((row) => {
        const normalizedName = row.name === 'Владивосток'
          ? 'КТК Владивосток'
          : row.name === 'Москва'
            ? 'КТК Москва'
            : row.name === 'Автовозы'
              ? 'Автовозы и шторы'
              : row.name;
        const expectedFact = monthDays > 0
          ? Number(((row.plan / monthDays) * elapsedDays).toFixed(1))
          : 0;
        const isRisk = isPastMonth
          ? row.fact < row.plan
          : row.fact < expectedFact;
        const ratioBase = isPastMonth ? row.plan : expectedFact;
        const ratioPct = ratioBase > 0
          ? Number(((row.fact / ratioBase) * 100).toFixed(1))
          : (row.fact > 0 ? 100 : 0);
        const reportDate = new Date(now);
        reportDate.setDate(today - 1);
        const reportDateLabel = reportDate.toLocaleDateString('ru-RU');
        const ratioLabel = isCurrentMonth ? `выполнение на ${reportDateLabel}` : 'выполнение месяца';
        const comment = `${ratioPct.toFixed(1)}% ${ratioLabel}`;
        return {
          ...row,
          name: normalizedName,
          expectedFact,
          elapsedDays,
          monthDays,
          isRisk,
          comment,
        };
      })
      .sort((a, b) => Number(a.isRisk) - Number(b.isRisk) || b.expectedFact - a.expectedFact);
  }, [data]);

  const selectedMonthTitle = useMemo(() => {
    if (!data) return '';
    const monthLabel = new Date(data.year, data.month - 1, 1).toLocaleString('ru-RU', { month: 'long' });
    return monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  }, [data]);

  const extraTotal = useMemo(() => {
    if (!data) return 0;
    return (
      Number(data.kpi.extra.groupage ?? 0)
      + Number(data.kpi.extra.curtains ?? 0)
      + Number(data.kpi.extra.forwarding ?? 0)
      + Number(data.kpi.extra.repack ?? 0)
    );
  }, [data]);

  return (
    <Box className={`sw-tech-root sw-tech-layout-${layoutMode}`} ref={rootRef}>
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {loading || !data ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <Box className="sw-tech-page" ref={pageRef}>
          <section className="sw-tech-section">
            <div className="sw-tech-grid-4">
              <DashboardCard
                title="КТК Владивосток, % план/факт"
                value={`${data.kpi.vvo.completion_month.toFixed(1)}%`}
                hint={`Факт ${formatInt(data.kpi.vvo.fact_month)} / План ${formatInt(data.kpi.vvo.plan_month)}`}
                tone={getTone(data.kpi.vvo.completion_month)}
                onClick={() => openDaily('KTK_VVO')}
              />
              <DashboardCard
                title="КТК Москва, % план/факт"
                value={`${data.kpi.msk.completion_month.toFixed(1)}%`}
                hint={`Факт ${formatInt(data.kpi.msk.fact_month)} / План ${formatInt(data.kpi.msk.plan_month)}`}
                tone={getTone(data.kpi.msk.completion_month)}
                onClick={() => openDaily('KTK_MOW')}
              />
              <DashboardCard
                title="ЖД, % план/факт"
                value={`${data.kpi.rail.completion_month.toFixed(1)}%`}
                hint={`Факт ${formatInt(data.kpi.rail.fact_month)} / План ${formatInt(data.kpi.rail.plan_month)}`}
                tone={getTone(data.kpi.rail.completion_month)}
                onClick={() => openDaily('RAIL')}
              />
              <DashboardCard
                title="Доп.услуги, Итого"
                value={formatInt(extraTotal)}
                hint={`Сборный ${formatInt(data.kpi.extra.groupage)} · Шторы ${formatInt(data.kpi.extra.curtains)} · Экспедирование ${formatInt(data.kpi.extra.forwarding)} · Перетарка ${formatInt(data.kpi.extra.repack)}`}
                onClick={() => openDaily('EXTRA')}
              />
            </div>
          </section>

          <section className="sw-tech-section">
            <div className="sw-tech-grid-4">
              {classicKpi.map((item) => (
                <DashboardCard
                  key={item.title}
                  title={item.title}
                  value={item.value}
                  hint={item.hint}
                  tone={item.tone}
                  onClick={() => {
                    if (item.target === 'totals') {
                      openTotals();
                      return;
                    }
                    if (item.segmentCode) {
                      openDaily(item.segmentCode);
                    }
                  }}
                />
              ))}
            </div>
          </section>

          <section className="sw-tech-section sw-tech-grid-2">
            <Paper className="sw-tech-card sw-tech-chart-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Динамика года: План / Факт / Выполнение %</Typography>
              <div ref={monthlyChartRef} className="sw-tech-chart" />
            </Paper>

            <Paper className="sw-tech-card sw-tech-chart-card" variant="outlined">
              <Typography className="sw-tech-chart-title">{selectedMonthTitle}: направления (План vs Факт)</Typography>
              <div ref={aprilChartRef} className="sw-tech-chart" />
            </Paper>
          </section>

          <section className="sw-tech-section sw-tech-grid-2">
            <Paper className="sw-tech-card" variant="outlined">
              <Typography className="sw-tech-chart-title">В ожидании отгрузки</Typography>
              <div className="sw-tech-wait-grid">
                <div ref={waitChartRef} className="sw-tech-chart-sm" />
                <div className="sw-tech-wait-side">
                  <div className="sw-tech-wait-metrics">
                    <div>
                      <Typography className="sw-tech-pill-label">Отправка Авто</Typography>
                      <Typography
                        className="sw-tech-pill-value sw-tech-warn"
                        title={`Автовозы ${formatInt(data.kpi.auto.waiting_truck)} · Авто в КТК ${formatInt(data.kpi.auto.waiting_ktk)} · Шторы ${formatInt(data.kpi.auto.waiting_curtain)}`}
                      >
                        {formatInt(data.kpi.auto.waiting_total)}
                      </Typography>
                    </div>
                    <div>
                      <Typography className="sw-tech-pill-label">Жд</Typography>
                      <Typography className="sw-tech-pill-value sw-tech-warn">{formatInt(data.kpi.rail.waiting_total)}</Typography>
                    </div>
                  </div>
                  <div className="sw-tech-wait-legend">
                    <span className="sw-tech-wait-legend-item"><i style={{ background: '#33d7ff' }} />Автовозы</span>
                    <span className="sw-tech-wait-legend-item"><i style={{ background: '#8d7dff' }} />Авто в КТК</span>
                    <span className="sw-tech-wait-legend-item"><i style={{ background: '#26d3a1' }} />Шторы</span>
                    <span className="sw-tech-wait-legend-item"><i style={{ background: '#ffbd57' }} />ЖД</span>
                  </div>
                </div>
              </div>
            </Paper>

            <Paper className="sw-tech-card sw-tech-equal-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Финансовые показатели</Typography>
              <Table className="sw-tech-table" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Показатель</TableCell>
                    <TableCell>Владивосток</TableCell>
                    <TableCell>Москва</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>Вал общий</TableCell>
                    <TableCell>{formatMoney(data.kpi.vvo.gross)}</TableCell>
                    <TableCell>{formatMoney(data.kpi.msk.gross)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Вал средний</TableCell>
                    <TableCell>{formatMoney(data.kpi.vvo.gross_avg)}</TableCell>
                    <TableCell>{formatMoney(data.kpi.msk.gross_avg)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Средняя стоимость заявки</TableCell>
                    <TableCell>{formatMoney(data.kpi.vvo.avg_ticket)}</TableCell>
                    <TableCell>{formatMoney(data.kpi.msk.avg_ticket)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Отправка авто / Δ ДЗ/КЗ</TableCell>
                    <TableCell colSpan={2}>{formatMoney(data.kpi.auto.debt_delta)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>
          </section>

          <section className="sw-tech-section sw-tech-grid-2">
            <Paper className="sw-tech-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Контроль качества данных</Typography>
              <Table className="sw-tech-table" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Проверка</TableCell>
                    <TableCell>Статус</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(data.checks).map(([name, ok]) => (
                    <TableRow key={name}>
                      <TableCell>{name}</TableCell>
                      <TableCell>
                        <span className={`sw-tech-badge ${ok ? 'sw-tech-badge-ok' : 'sw-tech-badge-bad'}`}>
                          {ok ? 'OK' : 'Ошибка'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Paper className="sw-tech-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Ключевые риски</Typography>
              <Table className="sw-tech-table sw-tech-risk-table" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell align="left">Зона</TableCell>
                    <TableCell align="center">Статус</TableCell>
                    <TableCell align="right">Комментарий</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {riskRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell align="left">{row.name}</TableCell>
                      <TableCell align="center">
                        <span className={`sw-tech-badge ${row.isRisk ? 'sw-tech-badge-bad' : 'sw-tech-badge-ok'}`}>
                          {row.isRisk ? 'Риск' : 'Норма'}
                        </span>
                      </TableCell>
                      <TableCell align="right">{row.comment}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </section>
        </Box>
      )}
    </Box>
  );
}
