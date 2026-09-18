import { Box, Grid, Paper, Typography } from '@mui/material';
import type { GatewayAmpReading } from '../types';
import { withUnit } from '../utils/unitConverters';

export function impellerNumber(paramName: string): number {
  const m = paramName.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

export function impellerLabel(paramName: string): string {
  const n = impellerNumber(paramName);
  return n ? `Impeller ${n}` : paramName;
}

/** One line naming the impellers the gateway shows, when it tells us (impellers.selected). */
export function SelectedImpellersNote({ selected }: { selected?: number[] }) {
  if (!selected) return null;
  const list = [...selected].sort((a, b) => a - b).join(', ');
  return (
    <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
      {selected.length === 0
        ? 'The gateway is set to show no impellers.'
        : `Showing impeller${selected.length === 1 ? '' : 's'} ${list} — the others are hidden in the gateway's settings.`}
    </Typography>
  );
}

/**
 * Live impeller current — mirrors the client dashboard's amps grid, fed by the
 * live snapshot's `amps[]`, which only holds the impellers the gateway is set
 * to show. The payload orders lexicographically; we sort by the numeric suffix
 * for display. Values are shown exactly as sent.
 */
export default function AmpsPanel({ amps, selected }: { amps: GatewayAmpReading[]; selected?: number[] }) {
  const sorted = [...amps].sort((a, b) => impellerNumber(a.parameterName) - impellerNumber(b.parameterName));

  return (
    <Box>
      <Typography variant="h6" mb={selected ? 0.5 : 2}>Live Impeller Current (A)</Typography>
      <SelectedImpellersNote selected={selected} />

      {sorted.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No amp readings reported.</Typography>
      ) : (
        <Grid container spacing={2}>
          {sorted.map(r => {
            const display = withUnit(r.value, 'A');
            return (
              <Grid key={r.parameterName} size={{ xs: 6, sm: 4, md: 2 }}>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}
                  >
                    {impellerLabel(r.parameterName)}
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 700, color: 'primary.main', fontSize: '1.1rem', textAlign: 'center', mt: 0.5 }}
                  >
                    {display}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block', textAlign: 'center' }}>
                    {new Date(r.lastUpdated).toLocaleTimeString()}
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
