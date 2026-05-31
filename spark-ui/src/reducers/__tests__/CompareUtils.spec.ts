import { SparkJobStore, SparkMetricsStore } from "../../interfaces/AppStore";
import {
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

function makeJob(id: number, overrides?: Partial<SparkJobStore>): SparkJobStore {
  return {
    jobId: id,
    name: `Job ${id}`,
    description: "",
    stageIds: [0],
    status: "SUCCEEDED",
    numTasks: 100,
    numCompletedTasks: 100,
    numFailedTasks: 0,
    numSkippedTasks: 0,
    numCompletedStages: 1,
    numFailedStages: 0,
    duration: 5000,
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
    const left = makeJob(1);
    const right = makeJob(2);
    const metrics = buildCompareMetrics(left, right);

    const labels = metrics.map((m) => m.label);
    // Overview
    expect(labels).toContain("Duration (Wall Clock)");
    expect(labels).toContain("Total Tasks");
    expect(labels).toContain("Failed Tasks");
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
    expect(metrics.length).toBe(26);
  });

  it("returns 5 category groups", () => {
    const groups = buildCompareMetricGroups(makeJob(1), makeJob(2));
    const categories = groups.map((g) => g.category);
    expect(categories).toEqual([
      "Overview",
      "Time Breakdown",
      "Input / Output",
      "Shuffle",
      "Memory & Spill",
    ]);
  });

  it("computes zero delta when jobs are identical", () => {
    const left = makeJob(1);
    const right = makeJob(2);
    const metrics = buildCompareMetrics(left, right);

    metrics.forEach((m) => {
      expect(m.deltaRaw).toBe(0);
    });
  });

  it("detects increased failed tasks", () => {
    const left = makeJob(1, { numFailedTasks: 0 });
    const right = makeJob(2, { numFailedTasks: 10 });
    const metrics = buildCompareMetrics(left, right);
    const failedMetric = metrics.find((m) => m.label === "Failed Tasks")!;
    expect(failedMetric.deltaRaw).toBe(10);
    expect(failedMetric.direction).toBe("lower-is-better");
  });

  it("detects GC time regression", () => {
    const left = makeJob(1, { metrics: makeMetrics({ jvmGcTime: 1000 }) });
    const right = makeJob(2, { metrics: makeMetrics({ jvmGcTime: 5000 }) });
    const metrics = buildCompareMetrics(left, right);
    const gcMetric = metrics.find((m) => m.label === "JVM GC Time")!;
    expect(gcMetric.deltaRaw).toBe(4000);
    expect(gcMetric.direction).toBe("lower-is-better");
    expect(getDeltaColor(gcMetric)).toBe("#c62828"); // red = regression
  });

  it("detects shuffle improvement", () => {
    const left = makeJob(1, { metrics: makeMetrics({ shuffleReadBytes: 10000 }) });
    const right = makeJob(2, { metrics: makeMetrics({ shuffleReadBytes: 5000 }) });
    const metrics = buildCompareMetrics(left, right);
    const shuffleMetric = metrics.find((m) => m.label === "Shuffle Read Bytes")!;
    expect(shuffleMetric.deltaRaw).toBe(-5000);
    expect(getDeltaColor(shuffleMetric)).toBe("#2e7d32"); // green = improvement
  });
});

describe("getDeltaColor", () => {
  it("returns undefined for neutral direction", () => {
    const metric = buildCompareMetrics(
      makeJob(1, { numTasks: 100 }),
      makeJob(2, { numTasks: 200 }),
    ).find((m) => m.label === "Total Tasks")!;
    expect(getDeltaColor(metric)).toBeUndefined();
  });

  it("returns green when lower-is-better metric decreases", () => {
    const metric = buildCompareMetrics(
      makeJob(1, { numFailedTasks: 10 }),
      makeJob(2, { numFailedTasks: 5 }),
    ).find((m) => m.label === "Failed Tasks")!;
    expect(getDeltaColor(metric)).toBe("#2e7d32");
  });

  it("returns red when lower-is-better metric increases", () => {
    const metric = buildCompareMetrics(
      makeJob(1, { numFailedTasks: 5 }),
      makeJob(2, { numFailedTasks: 15 }),
    ).find((m) => m.label === "Failed Tasks")!;
    expect(getDeltaColor(metric)).toBe("#c62828");
  });

  it("returns undefined when delta is zero", () => {
    const metric = buildCompareMetrics(
      makeJob(1, { numFailedTasks: 5 }),
      makeJob(2, { numFailedTasks: 5 }),
    ).find((m) => m.label === "Failed Tasks")!;
    expect(getDeltaColor(metric)).toBeUndefined();
  });
});
