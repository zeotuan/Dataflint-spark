import * as React from "react";
import { SparkMetricsStore } from "../interfaces/AppStore";
import { SparkStage } from "../interfaces/SparkStages";
import { stageApiToMetrics, sumMetricStores } from "../reducers/MetricsReducer";
import { AppCompareData } from "../utils/CompareUtils";
import { BASE_PATH } from "../utils/UrlConsts";

interface AppListEntry {
  id: string;
  name: string;
  attempts: {
    startTime: string;
    endTime?: string;
    duration: number;
    completed: boolean;
    appSparkVersion?: string;
    attemptId?: string;
  }[];
}

export interface UseAppCompareResult {
  /** All available apps from History Server */
  apps: AppListEntry[];
  appsLoading: boolean;
  appsError: string | undefined;
  /** Fetched comparison data for the selected app */
  compareData: AppCompareData | undefined;
  compareLoading: boolean;
  compareError: string | undefined;
  /** Fetch comparison data for a specific app */
  fetchCompareData: (appId: string, attemptId?: string) => void;
  clearCompareData: () => void;
}

/** Deduplicate stages: keep only the latest attempt per stageId */
function deduplicateStages(stages: SparkStage[]): SparkStage[] {
  const latestByStageId = new Map<number, SparkStage>();
  for (const stage of stages) {
    const existing = latestByStageId.get(stage.stageId);
    if (!existing || stage.attemptId > existing.attemptId) {
      latestByStageId.set(stage.stageId, stage);
    }
  }
  return Array.from(latestByStageId.values());
}

function aggregateStageMetrics(stages: SparkStage[]): SparkMetricsStore {
  const nonSkipped = stages.filter((s) => s.status !== "SKIPPED");
  const deduplicated = deduplicateStages(nonSkipped);
  const metricsList = deduplicated.map(stageApiToMetrics);
  return sumMetricStores(metricsList);
}

export function useAppCompare(): UseAppCompareResult {
  const [apps, setApps] = React.useState<AppListEntry[]>([]);
  const [appsLoading, setAppsLoading] = React.useState(false);
  const [appsError, setAppsError] = React.useState<string | undefined>();

  const [compareData, setCompareData] = React.useState<AppCompareData | undefined>();
  const [compareLoading, setCompareLoading] = React.useState(false);
  const [compareError, setCompareError] = React.useState<string | undefined>();

  const abortRef = React.useRef<AbortController | null>(null);

  // Load applications list on mount
  React.useEffect(() => {
    let cancelled = false;
    setAppsLoading(true);
    setAppsError(undefined);

    fetch(`${BASE_PATH}/api/v1/applications`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: AppListEntry[]) => {
        if (!cancelled) setApps(data);
      })
      .catch((err) => {
        if (!cancelled) setAppsError(err.message);
      })
      .finally(() => {
        if (!cancelled) setAppsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const fetchCompareData = React.useCallback((appId: string, attemptId?: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    setCompareLoading(true);
    setCompareError(undefined);
    setCompareData(undefined);

    const appPath = attemptId
      ? `${BASE_PATH}/api/v1/applications/${appId}/${attemptId}`
      : `${BASE_PATH}/api/v1/applications/${appId}`;

    Promise.all([
      fetch(`${appPath}/stages`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`Stages: HTTP ${r.status}`);
        return r.json() as Promise<SparkStage[]>;
      }),
      fetch(`${appPath}/jobs`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`Jobs: HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`${appPath}/allexecutors`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`Executors: HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`${BASE_PATH}/api/v1/applications/${appId}`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`App info: HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([stages, jobs, executors, appInfo]) => {
        if (signal.aborted) return;

        const attempt = attemptId
          ? appInfo.attempts?.find((a: any) => a.attemptId === attemptId)
          : appInfo.attempts?.[appInfo.attempts.length - 1];

        const metrics = aggregateStageMetrics(stages);

        // Aggregate task/stage counts from jobs
        let totalTasks = 0, completedTasks = 0, failedTasks = 0, skippedTasks = 0;
        let completedStages = 0, failedStages = 0, skippedStages = 0;
        for (const job of jobs) {
          totalTasks += job.numTasks ?? 0;
          completedTasks += job.numCompletedTasks ?? 0;
          failedTasks += job.numFailedTasks ?? 0;
          skippedTasks += job.numSkippedTasks ?? 0;
          completedStages += job.numCompletedStages ?? 0;
          failedStages += job.numFailedStages ?? 0;
          skippedStages += job.numSkippedStages ?? 0;
        }

        const data: AppCompareData = {
          appId,
          attemptId,
          appName: appInfo.name ?? appId,
          duration: attempt?.duration,
          totalJobs: jobs.length,
          totalStages: stages.length,
          totalExecutors: executors.filter((e: any) => e.id !== "driver").length,
          totalTasks,
          completedTasks,
          failedTasks,
          skippedTasks,
          completedStages,
          failedStages,
          skippedStages,
          status: attempt?.completed ? "COMPLETED" : "RUNNING",
          sparkVersion: attempt?.appSparkVersion,
          metrics,
        };

        setCompareData(data);
      })
      .catch((err) => {
        if (!signal.aborted) {
          setCompareError(err.message);
        }
      })
      .finally(() => {
        if (!signal.aborted) {
          setCompareLoading(false);
        }
      });
  }, []);

  const clearCompareData = React.useCallback(() => {
    abortRef.current?.abort();
    setCompareData(undefined);
    setCompareError(undefined);
    setCompareLoading(false);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return {
    apps,
    appsLoading,
    appsError,
    compareData,
    compareLoading,
    compareError,
    fetchCompareData,
    clearCompareData,
  };
}
