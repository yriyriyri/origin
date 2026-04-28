type RuntimeMetricState = {
  count: number;
  maxMs: number;
  totalMs: number;
};

type RuntimeProfilerRow = {
  avgMs: number;
  maxMs: number;
  metric: string;
  samples: number;
};

type RuntimeProfilerReport = {
  capturedAtIso: string;
  elapsedMs: number;
  rows: RuntimeProfilerRow[];
};

type RuntimeProfilerExport = {
  generatedAtIso: string;
  href: string;
  label: string | null;
  reportIntervalMs: number;
  reports: RuntimeProfilerReport[];
  sessionStartedAtIso: string;
  userAgent: string;
  viewport: {
    devicePixelRatio: number;
    height: number;
    width: number;
  };
};

type RuntimeProfilerState = {
  lastReportAt: number;
  metrics: Record<string, RuntimeMetricState>;
  reports: RuntimeProfilerReport[];
  sessionStartedAt: number;
};

declare global {
  interface Window {
    __ORIGIN_RUNTIME_PROFILE_DOWNLOAD__?: (label?: string) => void;
    __ORIGIN_RUNTIME_PROFILE__?: boolean;
    __ORIGIN_RUNTIME_PROFILE_RESET__?: () => void;
    __ORIGIN_RUNTIME_PROFILE_SNAPSHOT__?: (label?: string) => RuntimeProfilerExport;
    __ORIGIN_RUNTIME_PROFILE_STATE__?: RuntimeProfilerState;
  }
}

const REPORT_INTERVAL_MS = 1500;

const sanitizeLabel = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "profile";

const sortRows = (rows: RuntimeProfilerRow[]) =>
  rows.sort((a, b) => {
    if (b.avgMs !== a.avgMs) {
      return b.avgMs - a.avgMs;
    }
    return a.metric.localeCompare(b.metric);
  });

const buildRows = (metrics: Record<string, RuntimeMetricState>) =>
  sortRows(
    Object.entries(metrics).map(([name, value]) => ({
      avgMs: Number((value.totalMs / Math.max(1, value.count)).toFixed(2)),
      maxMs: Number(value.maxMs.toFixed(2)),
      metric: name,
      samples: value.count,
    }))
  );

const createRuntimeProfilerExport = (
  state: RuntimeProfilerState,
  label?: string
): RuntimeProfilerExport => {
  const runtimeLabel = label?.trim() ? label.trim() : null;
  return {
    generatedAtIso: new Date().toISOString(),
    href: window.location.href,
    label: runtimeLabel,
    reportIntervalMs: REPORT_INTERVAL_MS,
    reports: state.reports.slice(),
    sessionStartedAtIso: new Date(performance.timeOrigin + state.sessionStartedAt).toISOString(),
    userAgent: navigator.userAgent,
    viewport: {
      devicePixelRatio: window.devicePixelRatio || 1,
      height: window.innerHeight,
      width: window.innerWidth,
    },
  };
};

const downloadRuntimeProfilerExport = (label?: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const state = window.__ORIGIN_RUNTIME_PROFILE_STATE__;
  if (!state) {
    return;
  }

  const payload = createRuntimeProfilerExport(state, label);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const labelPart = payload.label ? `${sanitizeLabel(payload.label)}-` : "";
  anchor.href = url;
  anchor.download = `origin-runtime-profile-${labelPart}${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const resetRuntimeProfilerState = () => {
  if (typeof window === "undefined") {
    return;
  }

  const now = performance.now();
  window.__ORIGIN_RUNTIME_PROFILE_STATE__ = {
    lastReportAt: now,
    metrics: {},
    reports: [],
    sessionStartedAt: now,
  };
};

const ensureRuntimeProfilerState = () => {
  if (typeof window === "undefined") {
    return null;
  }

  window.__ORIGIN_RUNTIME_PROFILE_DOWNLOAD__ = downloadRuntimeProfilerExport;
  window.__ORIGIN_RUNTIME_PROFILE_RESET__ = resetRuntimeProfilerState;
  window.__ORIGIN_RUNTIME_PROFILE_SNAPSHOT__ = (label?: string) => {
    const state = ensureRuntimeProfilerState();
    if (!state) {
      return {
        generatedAtIso: new Date().toISOString(),
        href: "",
        label: label?.trim() ? label.trim() : null,
        reportIntervalMs: REPORT_INTERVAL_MS,
        reports: [],
        sessionStartedAtIso: new Date().toISOString(),
        userAgent: "",
        viewport: {
          devicePixelRatio: 1,
          height: 0,
          width: 0,
        },
      };
    }
    return createRuntimeProfilerExport(state, label);
  };

  const existing = window.__ORIGIN_RUNTIME_PROFILE_STATE__;
  if (existing) {
    return existing;
  }

  const now = performance.now();
  const state: RuntimeProfilerState = {
    lastReportAt: now,
    metrics: {},
    reports: [],
    sessionStartedAt: now,
  };
  window.__ORIGIN_RUNTIME_PROFILE_STATE__ = state;
  return state;
};

const flushRuntimeProfiler = (state: RuntimeProfilerState, now: number) => {
  const rows = buildRows(state.metrics);
  if (rows.length > 0) {
    console.table(rows);
    state.reports.push({
      capturedAtIso: new Date(performance.timeOrigin + now).toISOString(),
      elapsedMs: Number((now - state.sessionStartedAt).toFixed(2)),
      rows,
    });
  }

  state.metrics = {};
  state.lastReportAt = now;
};

export const isRuntimeProfilerEnabled = () =>
  typeof window !== "undefined" && window.__ORIGIN_RUNTIME_PROFILE__ === true;

export const recordRuntimeMetric = (metric: string, durationMs: number) => {
  if (!isRuntimeProfilerEnabled() || typeof window === "undefined") {
    return;
  }

  const now = performance.now();
  const state = ensureRuntimeProfilerState();
  if (!state) {
    return;
  }

  const entry =
    state.metrics[metric] ??
    (state.metrics[metric] = {
      count: 0,
      maxMs: 0,
      totalMs: 0,
    });

  entry.count += 1;
  entry.totalMs += durationMs;
  entry.maxMs = Math.max(entry.maxMs, durationMs);

  if (now - state.lastReportAt < REPORT_INTERVAL_MS) {
    return;
  }

  flushRuntimeProfiler(state, now);
};
