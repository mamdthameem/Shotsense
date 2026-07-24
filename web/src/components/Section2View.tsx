import { useState } from 'react';
import {
  Box, Typography, Divider, Chip, IconButton, Tooltip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import ExpandableMetricCard from './ExpandableMetricCard';
import ShotsBreakdownChart from './ShotsBreakdownChart';
import type { GatewaySection2, GatewaySection2Cycle } from '../types';

function metalCell(name: string | null, weight: number | null): string {
  if (!name) return '—';
  return weight != null ? `${name} ${weight.toFixed(1)} kg` : name;
}

/** Per-cycle production & energy — plots values delivered by the gateway (no recompute). */
function CyclesChart({ cycles }: { cycles: GatewaySection2Cycle[] }) {
  const data = cycles.map(c => ({
    label: `#${c.cycleNumber}`,
    production: c.productionKg,
    energy: c.energyKwh,
  }));
  return (
    <Box sx={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <RTooltip />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="production" name="Production (kg)" stroke="#2e7d32" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="energy" name="Energy (kWh)" stroke="#1d4ed8" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

function CycleTable({ cycles }: { cycles: GatewaySection2Cycle[] }) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto', maxHeight: 420 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Cycle #</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>End</TableCell>
            <TableCell>Metal 1</TableCell>
            <TableCell>Metal 2</TableCell>
            <TableCell>Metal 3</TableCell>
            <TableCell>Metal 4</TableCell>
            <TableCell align="right">Production (kg)</TableCell>
            <TableCell align="right">Energy (kWh)</TableCell>
            <TableCell align="right">Shots Usage</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {cycles.map(c => (
            <TableRow key={c.cycleNumber}>
              <TableCell>{c.cycleNumber}</TableCell>
              <TableCell>{new Date(c.blastStart).toLocaleString()}</TableCell>
              <TableCell>{new Date(c.blastEnd).toLocaleString()}</TableCell>
              <TableCell>{metalCell(c.metal1Name, c.metal1WeightKg)}</TableCell>
              <TableCell>{metalCell(c.metal2Name, c.metal2WeightKg)}</TableCell>
              <TableCell>{metalCell(c.metal3Name, c.metal3WeightKg)}</TableCell>
              <TableCell>{metalCell(c.metal4Name, c.metal4WeightKg)}</TableCell>
              <TableCell align="right">{c.productionKg.toFixed(2)}</TableCell>
              <TableCell align="right">{c.energyKwh.toFixed(3)}</TableCell>
              <TableCell align="right">{c.shotsUsage.toFixed(4)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function scopeLabel(s: GatewaySection2): string {
  if (s.filterBy === 'cycle') return `Cycles ${s.filterCycleFrom}–${s.filterCycleTo}`;
  if (s.filterBy === 'metal') return `Metal: ${s.filterMetalName ?? '—'}`;
  if (s.periodLabel) return s.periodLabel.charAt(0).toUpperCase() + s.periodLabel.slice(1);
  return 'Custom range';
}

/**
 * Latest completed filtered calculation — mirrors the client dashboard's
 * FilterResultsView, but read-only from the live payload's `section2` (the
 * gateway already computed it; there is no filter form here).
 */
export default function Section2View({ section2 }: { section2: GatewaySection2 }) {
  const [showRaw, setShowRaw] = useState(false);
  const s = section2;

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1rem' }}>
          Latest Filtered Calculation
          <Chip label={scopeLabel(s)} size="small" sx={{ ml: 1.5, borderRadius: 1, fontSize: '0.65rem', fontWeight: 700 }} />
        </Typography>
        <Tooltip title="Show raw JSON">
          <IconButton size="small" onClick={() => setShowRaw(v => !v)} color={showRaw ? 'primary' : 'default'}>
            <CodeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" mb={2}>
        Request #{s.requestId}
        {s.filterBy === 'time' && ` · ${new Date(s.filterStart).toLocaleString()} → ${new Date(s.filterEnd).toLocaleString()}`}
        {s.processedAt && ` · computed ${new Date(s.processedAt).toLocaleString()}`}
      </Typography>

      {showRaw && (
        <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
          <Box component="pre" sx={{ m: 0, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', overflowX: 'auto', userSelect: 'text', maxHeight: 320 }}>
            {JSON.stringify(s, null, 2)}
          </Box>
        </Paper>
      )}

      {/* Scalar parameter grid (5 params). Values rendered verbatim, no dialogs. */}
      {s.results.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(4,1fr)' },
            gap: 2,
            mb: 3,
          }}
        >
          {s.results.map(r => (
            <ExpandableMetricCard key={r.parameterName} parameterName={r.parameterName} value={r.value} />
          ))}
        </Box>
      )}

      {/* Cycle breakdown */}
      {s.cycles.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Cycle Breakdown ({s.cycles.length} cycles)
          </Typography>
          <CyclesChart cycles={s.cycles} />
          <Box mt={2}>
            <CycleTable cycles={s.cycles} />
          </Box>
        </>
      )}

      {/* Filtered shots chart */}
      {s.shotsBreakdown.length > 0 && (
        <>
          <Divider sx={{ mt: 3, mb: 2 }} />
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Blast Cycles per Refill Interval
          </Typography>
          <ShotsBreakdownChart data={s.shotsBreakdown} />
        </>
      )}
    </Box>
  );
}
