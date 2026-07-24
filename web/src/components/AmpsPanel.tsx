import { Box, Grid, Paper, Typography } from '@mui/material';
import type { GatewayAmpReading } from '../types';

function impellerNumber(paramName: string): number {
  const m = paramName.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function impellerLabel(paramName: string): string {
  const n = impellerNumber(paramName);
  return n ? `Impeller ${n}` : paramName;
}

/**
 * Live impeller current — mirrors the client dashboard's amps grid, fed by the
 * live snapshot's `amps[]`. The payload orders lexicographically; we sort by the
 * numeric suffix for 1…10 display. Snapshot only (no per-impeller history — that
 * is not part of the admin-live contract).
 */
export default function AmpsPanel({ amps }: { amps: GatewayAmpReading[] }) {
  const sorted = [...amps].sort((a, b) => impellerNumber(a.parameterName) - impellerNumber(b.parameterName));

  return (
    <Box>
      <Typography variant="h6" mb={2}>Live Impeller Current (A)</Typography>

      {sorted.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No amp readings reported.</Typography>
      ) : (
        <Grid container spacing={2}>
          {sorted.map(r => {
            const amp = parseFloat(r.value);
            const display = isFinite(amp) ? `${amp.toFixed(2)} A` : r.value;
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
