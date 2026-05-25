import { duration } from "moment";
import { SparkJobStore } from "../interfaces/AppStore";
import { humanFileSize, humanizeTimeDiff } from "./FormatUtils";

export type MetricDirection = "lower-is-better" | "higher-is-better" | "neutral";

export interface CompareMetric {
  label: string;
  leftValue: string;
  rightValue: string;
  leftRaw: number;
  rightRaw: number;
  delta: string;
  deltaRaw: number;
  direction: MetricDirection;
}

export function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "N/A";
  return humanizeTimeDiff(duration(ms));
}

function formatCount(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "N/A";
  return n.toLocaleString();
}

function formatBytes(b: number | undefined): string {
  if (b === undefined || !Number.isFinite(b)) return "N/A";
  if (b === 0) return "0 B";
  return humanFileSize(b);
}

export function computeDelta(left: number, right: number): { delta: string; deltaRaw: number } {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return { delta: "N/A", deltaRaw: 0 };
  }
  const diff = right - left;
  if (left === 0 && right === 0) {
    return { delta: "0%", deltaRaw: 0 };
  }
  if (left === 0) {
    return { delta: diff > 0 ? "+∞" : "-∞", deltaRaw: diff };
  }
  const pct = (diff / Math.abs(left)) * 100;
  const sign = pct > 0 ? "+" : "";
  return { delta: `${sign}${pct.toFixed(1)}%`, deltaRaw: diff };
}

function buildMetric(
  label: string,
  leftRaw: number,
  rightRaw: number,
  formatter: (v: number | undefined) => string,
  direction: MetricDirection,
): CompareMetric {
  const { delta, deltaRaw } = computeDelta(leftRaw, rightRaw);
  return {
    label,
    leftValue: formatter(leftRaw),
    rightValue: formatter(rightRaw),
    leftRaw,
    rightRaw,
    delta,
    deltaRaw,
    direction,
  };
}

export function buildCompareMetrics(left: SparkJobStore, right: SparkJobStore): CompareMetric[] {
  return [
    buildMetric("Duration", left.duration ?? 0, right.duration ?? 0, formatDurationMs, "lower-is-better"),
    buildMetric("Executor Run Time", left.metrics.executorRunTime, right.metrics.executorRunTime, formatDurationMs, "lower-is-better"),
    buildMetric("Total Tasks", left.numTasks, right.numTasks, formatCount, "neutral"),
    buildMetric("Completed Tasks", left.numCompletedTasks, right.numCompletedTasks, formatCount, "neutral"),
    buildMetric("Failed Tasks", left.numFailedTasks, right.numFailedTasks, formatCount, "lower-is-better"),
    buildMetric("Skipped Tasks", left.numSkippedTasks, right.numSkippedTasks, formatCount, "neutral"),
    buildMetric("Completed Stages", left.numCompletedStages, right.numCompletedStages, formatCount, "neutral"),
    buildMetric("Failed Stages", left.numFailedStages, right.numFailedStages, formatCount, "lower-is-better"),
    buildMetric("Input", left.metrics.inputBytes, right.metrics.inputBytes, formatBytes, "neutral"),
    buildMetric("Output", left.metrics.outputBytes, right.metrics.outputBytes, formatBytes, "neutral"),
    buildMetric("Shuffle Read", left.metrics.shuffleReadBytes, right.metrics.shuffleReadBytes, formatBytes, "lower-is-better"),
    buildMetric("Shuffle Write", left.metrics.shuffleWriteBytes, right.metrics.shuffleWriteBytes, formatBytes, "lower-is-better"),
    buildMetric("Disk Spill", left.metrics.diskBytesSpilled, right.metrics.diskBytesSpilled, formatBytes, "lower-is-better"),
  ];
}

export function getDeltaColor(metric: CompareMetric): string | undefined {
  if (metric.deltaRaw === 0 || metric.direction === "neutral") return undefined;
  if (metric.direction === "lower-is-better") {
    return metric.deltaRaw < 0 ? "#2e7d32" : "#c62828";
  }
  // higher-is-better
  return metric.deltaRaw > 0 ? "#2e7d32" : "#c62828";
}
