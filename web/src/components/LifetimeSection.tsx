import React from 'react';
import {
  Box, Typography, CircularProgress, IconButton, Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandableMetricCard from './ExpandableMetricCard';
import HistoryGraph from './HistoryGraph';
import type { GatewayLifetimeParam } from '../types';

// Parameters that get graph dialogs — backed by on-demand history pulls.
const GRAPHABLE: Record<string, { title: string; days: number }> = {
  machine_utility_pct: { title: 'Daily Utility (last 30 days)', days: 30 },
  production_qty_kg:   { title: 'Production Over Time (last 7 days)', days: 7 },
};

interface Props {
  clientId: string;
  lifetime: GatewayLifetimeParam[];
  lastFetched: Date | null;
  loading: boolean;
  onRefresh: () => void;
}

/** Mirrors the client dashboard's lifetime grid, fed by one proxy pull. */
export const LifetimeSection: React.FC<Props> = ({ clientId, lifetime, lastFetched, loading, onRefresh }) => {
  const now = new Date();

  // Exclude machine_status (shown separately by MachineStatusTile)
  const displayParams = lifetime.filter(p => p.parameter !== 'machine_status');

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

      {displayParams.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(4,1fr)' },
            gap: 2,
            mb: 3,
          }}
        >
          {displayParams.map(p => {
            const graphDef = GRAPHABLE[p.parameter];
            const windowStart = graphDef
              ? new Date(now.getTime() - graphDef.days * 24 * 3_600_000).toISOString()
              : '';
            return (
              <ExpandableMetricCard
                key={p.parameter}
                parameterName={p.parameter}
                value={p.value === null ? 'NaN' : String(p.value)}
                updatedAt={p.updatedAt}
                graphTitle={graphDef?.title}
                renderGraph={graphDef ? () => (
                  <HistoryGraph
                    clientId={clientId}
                    metric={p.parameter}
                    windowStart={windowStart}
                    windowEnd={now.toISOString()}
                  />
                ) : undefined}
              />
            );
          })}
        </Box>
      )}

      {!loading && displayParams.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No lifetime parameters reported by this client.
        </Typography>
      )}
    </Box>
  );
};
