import React from 'react';
import {
  Box, Typography, CircularProgress, IconButton, Tooltip, Divider, Paper,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandableMetricCard from './ExpandableMetricCard';
import ShotsBreakdownChart from './ShotsBreakdownChart';
import HistoryGraph from './HistoryGraph';
import type { GatewayLifetimeParam, GatewayShotsBreakdownEntry } from '../types';

// Parameters that get graph dialogs — backed by on-demand history pulls.
const GRAPHABLE: Record<string, { title: string; days: number }> = {
  machine_utility_pct: { title: 'Daily Utility (last 30 days)', days: 30 },
  production_qty_kg:   { title: 'Production Over Time (last 7 days)', days: 7 },
};

function ShotsUsageTile({ shotsData }: { shotsData: GatewayShotsBreakdownEntry[] }) {
  const latest = shotsData.length > 0 ? shotsData[shotsData.length - 1] : null;
  return (
    <Paper sx={{ p: 2.5, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.07em', fontSize: '0.68rem', textTransform: 'uppercase' }}
      >
        Effective Shots Usage
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.3rem', lineHeight: 1.2, mt: 0.5 }}>
        {latest !== null ? `${latest.blastCount} ${latest.blastCount === 1 ? 'cycle' : 'cycles'}` : '—'}
      </Typography>
      {latest && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem', mt: 'auto' }}>
          Refilled {new Date(latest.refillTimestamp).toLocaleString()}
        </Typography>
      )}
    </Paper>
  );
}

interface Props {
  clientId: string;
  lifetime: GatewayLifetimeParam[];
  shotsBreakdown: GatewayShotsBreakdownEntry[];
  lastFetched: Date | null;
  loading: boolean;
  onRefresh: () => void;
}

/** Mirrors the client dashboard's lifetime section, fed by one live pull. */
export const LifetimeSection: React.FC<Props> = ({ clientId, lifetime, shotsBreakdown, lastFetched, loading, onRefresh }) => {
  const now = new Date();

  // Exclude machine_status (shown separately by MachineStatusTile).
  const displayParams = lifetime.filter(p => p.parameterName !== 'machine_status');

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1rem' }}>
            Lifetime Parameters
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Cumulative since commissioning · pulled on demand
            {lastFetched && ` · last updated ${lastFetched.toLocaleTimeString()}`}
          </Typography>
        </Box>
        <Tooltip title="Refresh now">
          <span>
            <IconButton onClick={onRefresh} size="small" disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {loading && displayParams.length === 0 && (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress size={28} /></Box>
      )}

      {(displayParams.length > 0 || shotsBreakdown.length > 0) && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(4,1fr)' },
            gap: 2,
            mb: 3,
          }}
        >
          {displayParams.map(p => {
            const graphDef = GRAPHABLE[p.parameterName];
            const windowStart = graphDef
              ? new Date(now.getTime() - graphDef.days * 24 * 3_600_000).toISOString()
              : '';
            return (
              <ExpandableMetricCard
                key={p.parameterName}
                parameterName={p.parameterName}
                value={p.value}
                updatedAt={p.updatedAt}
                graphTitle={graphDef?.title}
                renderGraph={graphDef ? () => (
                  <HistoryGraph
                    clientId={clientId}
                    metric={p.parameterName}
                    windowStart={windowStart}
                    windowEnd={now.toISOString()}
                  />
                ) : undefined}
              />
            );
          })}
          {shotsBreakdown.length > 0 && <ShotsUsageTile shotsData={shotsBreakdown} />}
        </Box>
      )}

      {shotsBreakdown.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Blast Cycles per Refill Interval
          </Typography>
          <ShotsBreakdownChart data={shotsBreakdown} />
        </>
      )}

      {!loading && displayParams.length === 0 && shotsBreakdown.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No lifetime parameters reported by this client.
        </Typography>
      )}
    </Box>
  );
};
