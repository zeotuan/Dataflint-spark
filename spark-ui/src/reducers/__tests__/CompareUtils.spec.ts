import { SparkJobStore, SparkMetricsStore } from "../../interfaces/AppStore";
import {
  buildCompareMetrics,
  computeDelta,
  formatDurationMs,
  getDeltaColor,
} from "../../utils/CompareUtils";

function makeMetrics(overrides?: Partial<SparkMetricsStore>): SparkMetricsStore {
  return {
    totalTasks: 100,
    executorRunTime: 60000,
    diskBytesSpilled: 0,
    inputBytes: 1024 * 1024,
    outputBytes: 512 * 1024,
    shuffleReadBytes: 2048,
    shuffleWriteBytes: 1024,
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
  it("returns all expected metrics", () => {
    const left = makeJob(1);
    const right = makeJob(2);
    const metrics = buildCompareMetrics(left, right);

    const labels = metrics.map((m) => m.label);
    expect(labels).toContain("Duration");
    expect(labels).toContain("Executor Run Time");
    expect(labels).toContain("Total Tasks");
    expect(labels).toContain("Failed Tasks");
    expect(labels).toContain("Disk Spill");
    expect(labels).toContain("Input");
    expect(labels).toContain("Shuffle Read");
    expect(metrics.length).toBe(13);
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
