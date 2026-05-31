import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Box,
  Button,
  Checkbox,
  Chip,
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
import { useSearchParams } from "react-router-dom";
import { useAppSelector } from "../Hooks";
import { SparkJobStore } from "../interfaces/AppStore";
import {
  buildCompareMetricGroups,
  getDeltaColor,
} from "../utils/CompareUtils";

function statusColor(status: string): "success" | "error" | "warning" | "info" | "default" {
  switch (status.toUpperCase()) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
      return "error";
    case "RUNNING":
      return "info";
    default:
      return "default";
  }
}

function JobSelectionTable({
  jobs,
  selected,
  onToggle,
  onCompare,
}: {
  jobs: SparkJobStore[];
  selected: Set<number>;
  onToggle: (jobId: number) => void;
  onCompare: () => void;
}) {
  const [filter, setFilter] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!filter) return jobs;
    const lower = filter.toLowerCase();
    return jobs.filter(
      (j) =>
        j.jobId.toString().includes(lower) ||
        j.name.toLowerCase().includes(lower) ||
        j.description.toLowerCase().includes(lower),
    );
  }, [jobs, filter]);

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2, gap: 2 }}>
        <Typography variant="h6">Select two jobs to compare</Typography>
        <TextField
          size="small"
          placeholder="Filter by ID or name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ ml: "auto", width: 250 }}
        />
        <Button
          variant="contained"
          disabled={selected.size !== 2}
          onClick={onCompare}
        >
          Compare
        </Button>
      </Box>
      <TableContainer component={Paper} sx={{ maxHeight: "calc(100vh - 200px)" }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Job ID</TableCell>
              <TableCell>Name / Description</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Tasks</TableCell>
              <TableCell align="right">Stages</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((job) => {
              const isSelected = selected.has(job.jobId);
              const disabled = !isSelected && selected.size >= 2;
              return (
                <TableRow
                  key={job.jobId}
                  hover
                  onClick={() => !disabled && onToggle(job.jobId)}
                  sx={{ cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox checked={isSelected} disabled={disabled} />
                  </TableCell>
                  <TableCell>{job.jobId}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 400 }}>
                      {job.name || job.description || `Job ${job.jobId}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={job.status} color={statusColor(job.status)} size="small" />
                  </TableCell>
                  <TableCell align="right">{job.numTasks.toLocaleString()}</TableCell>
                  <TableCell align="right">{job.stageIds.length}</TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary" sx={{ py: 4 }}>
                    {jobs.length === 0 ? "No jobs available" : "No jobs match filter"}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function ComparisonView({
  left,
  right,
  onBack,
}: {
  left: SparkJobStore;
  right: SparkJobStore;
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
          <Typography variant="h6">
            Job {left.jobId} vs Job {right.jobId}
          </Typography>
        </Box>

        {/* Job header info */}
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <Paper sx={{ flex: 1, p: 1.5 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Job {left.jobId} (Left)
            </Typography>
            <Typography variant="body2" noWrap>
              {left.name || left.description || `Job ${left.jobId}`}
            </Typography>
            <Chip label={left.status} color={statusColor(left.status)} size="small" sx={{ mt: 0.5 }} />
          </Paper>
          <Paper sx={{ flex: 1, p: 1.5 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Job {right.jobId} (Right)
            </Typography>
            <Typography variant="body2" noWrap>
              {right.name || right.description || `Job ${right.jobId}`}
            </Typography>
            <Chip label={right.status} color={statusColor(right.status)} size="small" sx={{ mt: 0.5 }} />
          </Paper>
        </Box>

        {/* Metrics comparison by category */}
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
                  <TableCell align="right">Job {left.jobId}</TableCell>
                  <TableCell align="right">Job {right.jobId}</TableCell>
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
                      <TableCell align="right" sx={{ color: color ?? "text.secondary", fontWeight: color ? 600 : 400 }}>
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
  const jobs = useAppSelector((state) => state.spark.jobs);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  // Hydrate selection from URL on mount
  const leftParam = searchParams.get("left");
  const rightParam = searchParams.get("right");
  const comparing = leftParam !== null && rightParam !== null;

  const leftJob = comparing
    ? jobs?.find((j) => j.jobId === Number(leftParam))
    : undefined;
  const rightJob = comparing
    ? jobs?.find((j) => j.jobId === Number(rightParam))
    : undefined;

  const handleToggle = (jobId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else if (next.size < 2) {
        next.add(jobId);
      }
      return next;
    });
  };

  const handleCompare = () => {
    const ids = Array.from(selected).sort((a, b) => a - b);
    if (ids.length === 2) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("left", String(ids[0]));
      newParams.set("right", String(ids[1]));
      setSearchParams(newParams);
    }
  };

  const handleBack = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("left");
    newParams.delete("right");
    setSearchParams(newParams);
    setSelected(new Set());
  };

  if (!jobs || jobs.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No jobs available yet</Typography>
      </Box>
    );
  }

  if (comparing && leftJob && rightJob) {
    return <ComparisonView left={leftJob} right={rightJob} onBack={handleBack} />;
  }

  return (
    <JobSelectionTable
      jobs={jobs}
      selected={selected}
      onToggle={handleToggle}
      onCompare={handleCompare}
    />
  );
}
