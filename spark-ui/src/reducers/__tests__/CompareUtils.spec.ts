import { SparkMetricsStore } from "../../interfaces/AppStore";
import {
  AppCompareData,
  buildCompareMetricGroups,
  buildCompareMetrics,
  computeDelta,
  formatDurationMs,
  getDeltaColor,
} from "../../utils/CompareUtils";

function makeMetrics(overrides?: Partial<SparkMetricsStore>): SparkMetricsStore {
  return {
    totalTasks: 100,
    executorRunTime: 60000,
    executorCpuTime: 50000,
    executorDeserializeTime: 2000,
    resultSerializationTime: 500,
    jvmGcTime: 3000,
    peakExecutionMemory: 256 * 1024 * 1024,
    memoryBytesSpilled: 0,
    diskBytesSpilled: 0,
    inputBytes: 1024 * 1024,
    inputRecords: 10000,
    outputBytes: 512 * 1024,
    outputRecords: 5000,
    shuffleReadBytes: 2048,
    shuffleReadRecords: 200,
    shuffleFetchWaitTime: 1000,
    shuffleWriteBytes: 1024,
    shuffleWriteTime: 800,
    shuffleWriteRecords: 100,
    resultSize: 4096,
    ...overrides,
  };
}

function makeApp(id: string, overrides?: Partial<AppCompareData>): AppCompareData {
  return {
    appId: id,
    appName: `App ${id}`,
    duration: 5000,
    totalJobs: 3,
    totalStages: 5,
    totalExecutors: 4,
    totalTasks: 100,
    completedTasks: 100,
    failedTasks: 0,
    skippedTasks: 0,
    completedStages: 5,
    failedStages: 0,
    skippedStages: 0,
    status: "COMPLETED",
    sparkVersion: "3.4.4",
    metrics: makeMetrics(),
    ...overrides,
  };
}

describe("computeDelta", () => {
  it("returns 0% when both values are zero", () => {
    const { delta, deltaRaw } = computeDelta(0, 0);
    expect(delta).toBe("0%");
    expect(deltaRaw).toBe(0);
  });

  it("returns +∞ when left is zero and right is positive", () => {
    const { delta } = computeDelta(0, 100);
    expect(delta).toBe("+∞");
  });

  it("returns -∞ when left is zero and right is negative", () => {
    const { delta } = computeDelta(0, -10);
    expect(delta).toBe("-∞");
  });

  it("computes positive percentage correctly", () => {
    const { delta, deltaRaw } = computeDelta(100, 150);
    expect(delta).toBe("+50.0%");
    expect(deltaRaw).toBe(50);
  });

  it("computes negative percentage correctly", () => {
    const { delta, deltaRaw } = computeDelta(200, 100);
    expect(delta).toBe("-50.0%");
    expect(deltaRaw).toBe(-100);
  });

  it("returns N/A for non-finite inputs", () => {
    expect(computeDelta(NaN, 100).delta).toBe("N/A");
    expect(computeDelta(100, Infinity).delta).toBe("N/A");
  });

  it("returns 0% delta when values are equal", () => {
    const { delta, deltaRaw } = computeDelta(50, 50);
    expect(delta).toBe("0.0%");
    expect(deltaRaw).toBe(0);
  });
});

describe("formatDurationMs", () => {
  it("formats milliseconds", () => {
    expect(formatDurationMs(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDurationMs(5000)).toBe("5.0s");
  });

  it("returns N/A for undefined", () => {
    expect(formatDurationMs(undefined)).toBe("N/A");
  });

  it("returns N/A for NaN", () => {
    expect(formatDurationMs(NaN)).toBe("N/A");
  });

  it("returns N/A for negative", () => {
    expect(formatDurationMs(-1)).toBe("N/A");
  });
});

describe("buildCompareMetrics", () => {
  it("returns all expected metrics across categories", () => {
    const left = makeApp("app-1");
    const right = makeApp("app-2");
    const metrics = buildCompareMetrics(left, right);

    const labels = metrics.map((m) => m.label);
    // Overview
    expect(labels).toContain("Duration (Wall Clock)");
    expect(labels).toContain("Total Tasks");
    expect(labels).toContain("Failed Tasks");
    expect(labels).toContain("Total Jobs");
    expect(labels).toContain("Total Stages");
    expect(labels).toContain("Total Executors");
    expect(labels).toContain("Skipped Stages");
    // Time Breakdown
    expect(labels).toContain("Executor Run Time");
    expect(labels).toContain("Executor CPU Time");
    expect(labels).toContain("JVM GC Time");
    expect(labels).toContain("Executor Deserialize Time");
    expect(labels).toContain("Result Serialization Time");
    // I/O
    expect(labels).toContain("Input Bytes");
    expect(labels).toContain("Input Records");
    expect(labels).toContain("Output Bytes");
    expect(labels).toContain("Output Records");
    // Shuffle
    expect(labels).toContain("Shuffle Read Bytes");
    expect(labels).toContain("Shuffle Read Records");
    expect(labels).toContain("Shuffle Fetch Wait Time");
    expect(labels).toContain("Shuffle Write Bytes");
    expect(labels).toContain("Shuffle Write Time");
    expect(labels).toContain("Shuffle Write Records");
    // Memory & Spill
    expect(labels).toContain("Peak Execution Memory");
    expect(labels).toContain("Memory Bytes Spilled");
    expect(labels).toContain("Disk Bytes Spilled");
    expect(labels).toContain("Result Size");
    expect(metrics.length).toBe(30);
  });

  it("returns 5 category groups", () => {
    const groups = buildCompareMetricGroups(makeApp("app-1"), makeApp("app-2"));
    const categories = groups.map((g) => g.category);
    expect(categories).toEqual([
      "Overview",
      "Time Breakdown",
      "Input / Output",
      "Shuffle",
      "Memory & Spill",
    ]);
  });

  it("computes zero delta when apps are identical", () => {
    const left = makeApp("app-1");
    const right = makeApp("app-2");
    const metrics = buildCompareMetrics(left, right);

    metrics.forEach((m) => {
      expect(m.deltaRaw).toBe(0);
    });
  });

  it("detects increased failed tasks", () => {
    const left = makeApp("app-1", { failedTasks: 0 });
    const right = makeApp("app-2", { failedTasks: 10 });
    const metrics = buildCompareMetrics(left, right);
    const failedMetric = metrics.find((m) => m.label === "Failed Tasks")!;
    expect(failedMetric.deltaRaw).toBe(10);
    expect(failedMetric.direction).toBe("lower-is-better");
  });

  it("detects GC time regression", () => {
    const left = makeApp("app-1", { metrics: makeMetrics({ jvmGcTime: 1000 }) });
    const right = makeApp("app-2", { metrics: makeMetrics({ jvmGcTime: 5000 }) });
    const metrics = buildCompareMetrics(left, right);
    const gcMetric = metrics.find((m) => m.label === "JVM GC Time")!;
    expect(gcMetric.deltaRaw).toBe(4000);
    expect(gcMetric.direction).toBe("lower-is-better");
    expect(getDeltaColor(gcMetric)).toBe("#c62828"); // red = regression
  });

  it("detects shuffle improvement", () => {
    const left = makeApp("app-1", { metrics: makeMetrics({ shuffleReadBytes: 10000 }) });
    const right = makeApp("app-2", { metrics: makeMetrics({ shuffleReadBytes: 5000 }) });
    const metrics = buildCompareMetrics(left, right);
    const shuffleMetric = metrics.find((m) => m.label === "Shuffle Read Bytes")!;
    expect(shuffleMetric.deltaRaw).toBe(-5000);
    expect(getDeltaColor(shuffleMetric)).toBe("#2e7d32"); // green = improvement
  });

  it("compares app-level overview metrics correctly", () => {
    const left = makeApp("app-1", { totalJobs: 5, totalStages: 10, totalExecutors: 2 });
    const right = makeApp("app-2", { totalJobs: 8, totalStages: 15, totalExecutors: 4 });
    const metrics = buildCompareMetrics(left, right);

    const jobsMetric = metrics.find((m) => m.label === "Total Jobs")!;
    expect(jobsMetric.leftRaw).toBe(5);
    expect(jobsMetric.rightRaw).toBe(8);
    expect(jobsMetric.deltaRaw).toBe(3);

    const execMetric = metrics.find((m) => m.label === "Total Executors")!;
    expect(execMetric.leftRaw).toBe(2);
    expect(execMetric.rightRaw).toBe(4);
  });

  it("handles missing duration gracefully", () => {
    const left = makeApp("app-1", { duration: undefined });
    const right = makeApp("app-2", { duration: 10000 });
    const metrics = buildCompareMetrics(left, right);
    const durMetric = metrics.find((m) => m.label === "Duration (Wall Clock)")!;
    expect(durMetric.leftRaw).toBe(0);
    expect(durMetric.rightRaw).toBe(10000);
  });
});

describe("getDeltaColor", () => {
  it("returns undefined for neutral direction", () => {
    const metric = buildCompareMetrics(
      makeApp("app-1", { totalTasks: 100 }),
      makeApp("app-2", { totalTasks: 200 }),
    ).find((m) => m.label === "Total Tasks")!;
    expect(getDeltaColor(metric)).toBeUndefined();
  });

  it("returns green when lower-is-better metric decreases", () => {
    const metric = buildCompareMetrics(
      makeApp("app-1", { failedTasks: 10 }),
      makeApp("app-2", { failedTasks: 5 }),
    ).find((m) => m.label === "Failed Tasks")!;
    expect(getDeltaColor(metric)).toBe("#2e7d32");
  });

  it("returns red when lower-is-better metric increases", () => {
    const metric = buildCompareMetrics(
      makeApp("app-1", { failedTasks: 5 }),
      makeApp("app-2", { failedTasks: 15 }),
    ).find((m) => m.label === "Failed Tasks")!;
    expect(getDeltaColor(metric)).toBe("#c62828");
  });

  it("returns undefined when delta is zero", () => {
    const metric = buildCompareMetrics(
      makeApp("app-1", { failedTasks: 5 }),
      makeApp("app-2", { failedTasks: 5 }),
    ).find((m) => m.label === "Failed Tasks")!;
    expect(getDeltaColor(metric)).toBeUndefined();
  });
});
