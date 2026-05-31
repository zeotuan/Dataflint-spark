import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Fade,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import * as React from "react";
import { useAppSelector } from "../Hooks";
import { useAppCompare } from "../hooks/useAppCompare";
import { sumMetricStores } from "../reducers/MetricsReducer";
import {
  AppCompareData,
  buildCompareMetricGroups,
  getDeltaColor,
} from "../utils/CompareUtils";

/** Build AppCompareData for the current app from Redux store */
function buildCurrentAppData(
  runMetadata: { appId: string; appName: string; sparkVersion: string; endTime?: number; startTime: number },
  status: { duration: number } | undefined,
  jobs: { numTasks: number; numCompletedTasks: number; numFailedTasks: number; numSkippedTasks: number; numCompletedStages: number; numFailedStages: number; metrics: any }[] | undefined,
  stages: { stageId: number; metrics: any }[] | undefined,
  executors: { id: string }[] | undefined,
): AppCompareData {
  const allMetrics = (stages ?? []).map((s) => s.metrics);
  const aggregated = sumMetricStores(allMetrics);

  let totalTasks = 0, completedTasks = 0, failedTasks = 0, skippedTasks = 0;
  let completedStages = 0, failedStages = 0;
  for (const job of (jobs ?? [])) {
    totalTasks += job.numTasks ?? 0;
    completedTasks += job.numCompletedTasks ?? 0;
    failedTasks += job.numFailedTasks ?? 0;
    skippedTasks += job.numSkippedTasks ?? 0;
    completedStages += job.numCompletedStages ?? 0;
    failedStages += job.numFailedStages ?? 0;
  }
  let skippedStages = (stages?.length ?? 0) - completedStages - failedStages;
  if (skippedStages < 0) skippedStages = 0;

  return {
    appId: runMetadata.appId,
    appName: runMetadata.appName,
    duration: status?.duration,
    totalJobs: jobs?.length ?? 0,
    totalStages: stages?.length ?? 0,
    totalExecutors: executors?.filter((e) => e.id !== "driver").length ?? 0,
    totalTasks,
    completedTasks,
    failedTasks,
    skippedTasks,
    completedStages,
    failedStages,
    skippedStages,
    status: runMetadata.endTime ? "COMPLETED" : "RUNNING",
    sparkVersion: runMetadata.sparkVersion,
    metrics: aggregated,
  };
}

function ComparisonView({
  left,
  right,
  onBack,
}: {
  left: AppCompareData;
  right: AppCompareData;
  onBack: () => void;
}) {
  const groups = React.useMemo(() => buildCompareMetricGroups(left, right), [left, right]);

  return (
    <Fade in>
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2, gap: 1 }}>
          <Tooltip title="Back to selection">
            <IconButton onClick={onBack} size="small">
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6">Application Comparison</Typography>
        </Box>

        {/* App header cards */}
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          {[
            { label: "Current App (Left)", data: left },
            { label: "Compare App (Right)", data: right },
          ].map(({ label, data }) => (
            <Paper key={label} sx={{ flex: 1, p: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2" fontWeight={600} noWrap>
                {data.appName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {data.appId}
              </Typography>
              <Box sx={{ mt: 0.5, display: "flex", gap: 1, alignItems: "center" }}>
                <Chip
                  label={data.status}
                  color={data.status === "COMPLETED" ? "success" : "info"}
                  size="small"
                />
                {data.sparkVersion && (
                  <Chip label={`Spark ${data.sparkVersion}`} size="small" variant="outlined" />
                )}
              </Box>
            </Paper>
          ))}
        </Box>

        {/* Metrics by category */}
        {groups.map((group) => (
          <TableContainer component={Paper} key={group.category} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell colSpan={4} sx={{ bgcolor: "action.hover" }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {group.category}
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Metric</TableCell>
                  <TableCell align="right">Current App</TableCell>
                  <TableCell align="right">Compare App</TableCell>
                  <TableCell align="right">Delta</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.metrics.map((m) => {
                  const color = getDeltaColor(m);
                  return (
                    <TableRow key={m.label}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {m.label}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{m.leftValue}</TableCell>
                      <TableCell align="right">{m.rightValue}</TableCell>
                      <TableCell
                        align="right"
                        sx={{ color: color ?? "text.secondary", fontWeight: color ? 600 : 400 }}
                      >
                        {m.delta}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ))}
      </Box>
    </Fade>
  );
}

export function JobCompareTab() {
  const runMetadata = useAppSelector((state) => state.spark.runMetadata);
  const status = useAppSelector((state) => state.spark.status);
  const jobs = useAppSelector((state) => state.spark.jobs);
  const stages = useAppSelector((state) => state.spark.stages);
  const executors = useAppSelector((state) => state.spark.executors);

  const {
    apps,
    appsLoading,
    appsError,
    compareData,
    compareLoading,
    compareError,
    fetchCompareData,
    clearCompareData,
  } = useAppCompare();

  const [selectedAppId, setSelectedAppId] = React.useState<string | null>(null);
  const [comparing, setComparing] = React.useState(false);

  const availableApps = React.useMemo(
    () => apps.filter((a) => a.id !== runMetadata?.appId),
    [apps, runMetadata?.appId],
  );

  const currentAppData = React.useMemo(() => {
    if (!runMetadata) return undefined;
    return buildCurrentAppData(runMetadata, status, jobs, stages, executors);
  }, [runMetadata, status, jobs, stages, executors]);

  const handleCompare = () => {
    if (!selectedAppId) return;
    const app = apps.find((a) => a.id === selectedAppId);
    const attemptId = app?.attempts?.[app.attempts.length - 1]?.attemptId;
    fetchCompareData(selectedAppId, attemptId);
    setComparing(true);
  };

  const handleBack = () => {
    setComparing(false);
    clearCompareData();
  };

  if (!runMetadata || !currentAppData) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">Waiting for application data…</Typography>
      </Box>
    );
  }

  if (comparing && compareData && currentAppData) {
    return (
      <ComparisonView left={currentAppData} right={compareData} onBack={handleBack} />
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Compare Applications
      </Typography>

      {/* Current app info */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Current Application
        </Typography>
        <Typography variant="body1" fontWeight={600}>
          {currentAppData.appName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {currentAppData.appId}
        </Typography>
        <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
          <Chip label={currentAppData.status} color="success" size="small" />
          {currentAppData.sparkVersion && (
            <Chip label={`Spark ${currentAppData.sparkVersion}`} size="small" variant="outlined" />
          )}
          <Chip label={`${currentAppData.totalJobs} jobs`} size="small" variant="outlined" />
          <Chip label={`${currentAppData.totalStages} stages`} size="small" variant="outlined" />
        </Box>
      </Paper>

      {/* Select second app */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Select Application to Compare
        </Typography>

        {appsError && (
          <Typography color="error" sx={{ mb: 1 }}>
            Failed to load applications: {appsError}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
          <Autocomplete
            sx={{ flex: 1 }}
            options={availableApps}
            loading={appsLoading}
            getOptionLabel={(option) =>
              `${option.name} (${option.id.substring(option.id.length - 8)})`
            }
            renderOption={(props, option) => {
              const attempt = option.attempts?.[option.attempts.length - 1];
              return (
                <li {...props} key={option.id}>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {option.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.id} • {attempt?.appSparkVersion ?? "unknown"} •{" "}
                      {attempt?.startTime ?? ""}
                    </Typography>
                  </Box>
                </li>
              );
            }}
            onChange={(_, value) => setSelectedAppId(value?.id ?? null)}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search applications…"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {appsLoading && <CircularProgress size={20} />}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <Button
            variant="contained"
            disabled={!selectedAppId || compareLoading}
            onClick={handleCompare}
            sx={{ minWidth: 120 }}
          >
            {compareLoading ? <CircularProgress size={20} /> : "Compare"}
          </Button>
        </Box>

        {compareError && (
          <Typography color="error" sx={{ mt: 1 }}>
            Failed to fetch comparison data: {compareError}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
