import { Paper, Typography, Chip, Box } from '@mui/material';

interface Props {
  plcConnected: boolean | null;
  lastScanAt: string | null;
}

/** Mirrors the client dashboard's status tile; here it shows the PLC link state. */
export default function MachineStatusTile({ plcConnected, lastScanAt }: Props) {
  const connected = plcConnected === true;
  const label = plcConnected === null ? '—' : connected ? 'Connected' : 'Disconnected';

  return (
    <Paper sx={{ p: 2.5, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.07em', fontSize: '0.68rem', textTransform: 'uppercase' }}
      >
        PLC Link
      </Typography>
      <Box mt={0.5}>
        <Chip
          label={label}
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: '0.85rem',
            backgroundColor: connected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: connected ? '#22c55e' : '#ef4444',
            border: `1px solid ${connected ? '#22c55e' : '#ef4444'}`,
          }}
        />
      </Box>
      {lastScanAt && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem', mt: 'auto' }}>
          Last scan {new Date(lastScanAt).toLocaleTimeString()}
        </Typography>
      )}
    </Paper>
  );
}
