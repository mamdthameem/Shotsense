import React from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandableMetricCard, { type TileChart } from './ExpandableMetricCard';
import ShotsBreakdownChart from './ShotsBreakdownChart';
import UtilityGraph from './UtilityGraph';
import ProductionGraph from './ProductionGraph';
import TrendMetricGraph from './TrendMetricGraph';
import { formatPlantTime } from '../utils/formatters';
import { LIFETIME_ORDER, formatParameterValue, paramLabel } from '../utils/unitConverters';
import type { GatewayLifetimeParam, GatewayShotsBreakdownEntry } from '../types';

/**
 * Which Section 1 tile opens which chart, and what each chart measures — the gateway
 * dashboard's GRAPHABLE map, with its info text verbatim.
 *
 * Energy per Casting has no chart on purpose: kWh/kg varies by thousandths across a bucket, so
 * any axis fitted to it turns rounding into an apparent trend.
 */
const GRAPHABLE: Record<string, { info: string; render: (clientId: string) => React.ReactNode }> = {
  machine_utility_pct: {
    info: 'Blast time as a percentage of machine on-time',
    render: id => <UtilityGraph clientId={id} />,
  },
  production_qty_kg: {
    info: 'Daily tonnage with running total',
    render: id => <ProductionGraph clientId={id} />,
  },
  energy_kwh_total: {
    info: 'Average impeller current × cycle duration, summed per day',
    render: id => <TrendMetricGraph clientId={id} metric="energy" />,
  },
  blast_time_sec: {
    info: 'Duration the blast was ON',
    render: id => <TrendMetricGraph clientId={id} metric="blastTime" />,
  },
  cycle_count: {
    info: 'Count of completed blast cycles',
    render: id => <TrendMetricGraph clientId={id} metric="cycleCount" />,
  },
};

/** The chart a Section 1 tile opens, or undefined when it has none. */
export function lifetimeTileChart(parameterName: string, clientId: string): TileChart | undefined {
  const graph = GRAPHABLE[parameterName];
  return graph ? { info: graph.info, render: () => graph.render(clientId) } : undefined;
}

/** Four tiles per row on wide screens. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

/** One lifetime parameter tile, with its all-history chart when it has one. */
export function LifetimeTile({ param, clientId }: { param: GatewayLifetimeParam; clientId: string }) {
  return (
    <ExpandableMetricCard
      label={paramLabel(param.parameterName)}
      value={formatParameterValue(param.parameterName, param.value)}
      timestamp={param.updatedAt}
      chart={lifetimeTileChart(param.parameterName, clientId)}
    />
  );
}

/** The lifetime parameters in the gateway dashboard's order; missing ones are skipped. */
export function orderedParams(lifetime: GatewayLifetimeParam[], order: readonly string[]): GatewayLifetimeParam[] {
  const byName = new Map(lifetime.map(p => [p.parameterName, p]));
  return order.flatMap(name => byName.get(name) ?? []);
}

interface Props {
  clientId: string;
  lifetime: GatewayLifetimeParam[];
  shotsBreakdown: GatewayShotsBreakdownEntry[];
  lastUpdated: Date | null;
  loading: boolean;
  onRefresh: () => void;
}

/** Lifetime Parameters (machine_status feeds the Machine Status tile instead), then the refill chart. */
export const LifetimeSection: React.FC<Props> = ({ clientId, lifetime, shotsBreakdown, lastUpdated, loading, onRefresh }) => {
  const params = orderedParams(lifetime, LIFETIME_ORDER);

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} gap={2}>
        <Typography variant="h6" fontWeight={700}>Lifetime Parameters</Typography>
        <Box display="flex" alignItems="center" gap={0.5}>
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">
              Last updated {formatPlantTime(lastUpdated)}
            </Typography>
          )}
          <Tooltip title="Refresh now">
            <span>
              <IconButton onClick={onRefresh} size="small" disabled={loading} aria-label="Refresh">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {params.length > 0 ? (
        <TileGrid>
          {params.map(p => <LifetimeTile key={p.parameterName} param={p} clientId={clientId} />)}
        </TileGrid>
      ) : loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress size={28} /></Box>
      ) : (
        <Typography color="text.secondary" variant="body2">No lifetime parameters reported by this client.</Typography>
      )}

      {/* Heading, caption and chart all go when there is nothing to plot — as on the gateway. */}
      {shotsBreakdown.length > 0 && (
        <Box mt={4}>
          <Typography variant="subtitle1" fontWeight={700}>Blast Cycles per Refill Interval</Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
            Cycles completed between consecutive refills.
          </Typography>
          <ShotsBreakdownChart data={shotsBreakdown} />
        </Box>
      )}
    </Box>
  );
};
