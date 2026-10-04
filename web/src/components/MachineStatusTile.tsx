import { Box, Chip, Paper, Tooltip, Typography } from '@mui/material';
import { formatPlantDateTime, formatTileTimestamp } from '../utils/formatters';
import type { GatewayMachineStatus } from '../types';

const GREEN = '#22C55E';
const RED = '#EF4444';

// Amber, one step darker on the light theme so the small text stays readable.
const amber = { color: (t: { palette: { mode: string } }) => (t.palette.mode === 'dark' ? '#FBBF24' : '#B45309') };

interface Props {
  machineStatus: GatewayMachineStatus | null;
  plcConnected: boolean;
  lastScanAt: string | null;
}

/**
 * Running / Loading / Stopped, as the gateway dashboard shows it. `running` is
 * used as delivered. With the PLC unreachable the gateway forces the machine
 * OFF, so the tile says Stopped and flags the lost link.
 */
export default function MachineStatusTile({ machineStatus, plcConnected, lastScanAt }: Props) {
  const state = !plcConnected ? 'Stopped' : machineStatus?.running ? 'Running' : 'Loading';
  const color = state === 'Running' ? GREEN : RED;

  return (
    <Paper sx={{ p: 2.25, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 0.75, height: '100%' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem' }}>
        Machine Status
      </Typography>
      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
        <Chip label={state} size="small" sx={{ fontWeight: 700, fontSize: '0.85rem', backgroundColor: color, color: '#fff' }} />
        {!plcConnected && (
          <Tooltip title={`Last successful PLC scan: ${formatPlantDateTime(lastScanAt)}`}>
            <Chip
              label="PLC Disconnected"
              size="small"
              variant="outlined"
              sx={{ fontWeight: 700, borderColor: '#F59E0B', ...amber }}
            />
          </Tooltip>
        )}
      </Box>
      {!plcConnected && (
        <Typography variant="caption" sx={{ fontSize: '0.72rem', lineHeight: 1.4, ...amber }}>
          Machine reported OFF because the gateway cannot reach the PLC. Recording continues.
        </Typography>
      )}
      {machineStatus?.lastUpdated && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', mt: 'auto' }}>
          {formatTileTimestamp(machineStatus.lastUpdated)}
        </Typography>
      )}
    </Paper>
  );
}
