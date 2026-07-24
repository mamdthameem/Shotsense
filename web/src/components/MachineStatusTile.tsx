import { Paper, Typography, Chip, Box } from '@mui/material';
import type { GatewayMachineStatus } from '../types';

/** Running/stopped tile — mirrors the client dashboard's machine-status tile.
 *  Uses `running` exactly as delivered (do not re-derive per the contract). */
export function MachineStatusTile({ machineStatus }: { machineStatus: GatewayMachineStatus | null }) {
  const running = machineStatus?.running === true;
  const label = machineStatus === null ? '—' : running ? 'Running' : 'Stopped';

  return (
    <Paper sx={{ p: 2.5, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.07em', fontSize: '0.68rem', textTransform: 'uppercase' }}
      >
        Machine Status
      </Typography>
      <Box mt={0.5} display="flex" alignItems="center" gap={1}>
        <Chip
          label={label}
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: '0.85rem',
            backgroundColor: running ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: running ? '#22c55e' : '#ef4444',
            border: `1px solid ${running ? '#22c55e' : '#ef4444'}`,
          }}
        />
        {machineStatus?.isStale && (
          <Chip label="STALE" size="small" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }} />
        )}
      </Box>
      {machineStatus?.lastUpdated && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem', mt: 'auto' }}>
          {new Date(machineStatus.lastUpdated).toLocaleTimeString()}
        </Typography>
      )}
    </Paper>
  );
}

/** PLC link tile — Connected/Disconnected + last scan time. */
export function PlcLinkTile({ plcConnected, lastScanAt }: { plcConnected: boolean | null; lastScanAt: string | null }) {
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

export default MachineStatusTile;
