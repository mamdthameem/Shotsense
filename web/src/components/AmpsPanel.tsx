import { useState, type ReactNode } from 'react';
import {
  Alert, Box, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Paper,
  Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import CloseIcon from '@mui/icons-material/Close';
import AmpsGraph from './AmpsGraph';
import FilteredAmpsGraph from './FilteredAmpsGraph';
import { formatPlantDateTime, formatTileTimestamp } from '../utils/formatters';
import { formatNumber, parseValue } from '../utils/unitConverters';
import type { GatewayAmpReading, GatewaySection2Amp } from '../types';

export function impellerNumber(paramName: string): number {
  const m = paramName.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
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

/** Five fixed-width tiles per row on wide screens, centred as a block (9 impellers sit as 5 + 4). */
function ImpellerGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(3, minmax(0, 200px))',
          md: 'repeat(5, minmax(0, 200px))',
        },
        gap: 1.5,
        justifyContent: 'center',
      }}
    >
      {children}
    </Box>
  );
}

function ImpellerTile({ n, value, valueColor, children, onOpen }: {
  n: number;
  value: string;
  valueColor: string;
  children?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <Paper
      variant="outlined"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Impeller ${n}: open chart`}
      sx={{
        p: 1.5, borderRadius: 2, position: 'relative', cursor: 'pointer', textAlign: 'center',
        transition: 'box-shadow 0.15s', '&:hover': { boxShadow: 4 },
      }}
    >
      <BarChartIcon sx={{ position: 'absolute', top: 8, right: 8, color: 'text.disabled', fontSize: 16 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
        Impeller {n}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.2rem', color: valueColor, mt: 0.25 }}>{value}</Typography>
      {children}
    </Paper>
  );
}

/**
 * The chart dialog both panels open. Recharts' ResponsiveContainer sizes itself from its parent,
 * so a chart mounted mid-transition can measure zero width and draw nothing; `onEntered` holds it
 * back until the dialog has settled. Copied from the gateway dashboard's AmpsPanel.
 */
function ImpellerChartDialog({ open, onClose, title, maxWidth, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth: 'md' | 'lg';
  children: (ready: boolean) => ReactNode;
}) {
  const [chartReady, setChartReady] = useState(false);
  const close = () => { setChartReady(false); onClose(); };

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth={maxWidth}
      fullWidth
      slotProps={{ transition: { onEntered: () => setChartReady(true), onExited: () => setChartReady(false) } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        <IconButton onClick={close} size="small" aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {children(chartReady) ?? null}
      </DialogContent>
    </Dialog>
  );
}

function ChartPlaceholder() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <CircularProgress />
    </Box>
  );
}

function PlcWarning({ children }: { children: ReactNode }) {
  return <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>{children}</Alert>;
}

interface LiveProps {
  clientId: string;
  amps: GatewayAmpReading[];
  ampsLastCycle: GatewayAmpReading[];
  selected?: number[];
  plcConnected: boolean;
  lastScanAt: string | null;
}

/**
 * Live impeller current. The headline is always the live reading; under 1 A
 * the impeller is idle, and the tile adds what it ran at over the last
 * completed cycle (ampsLastCycle, matched by parameterName) for context.
 */
export default function AmpsPanel({ clientId, amps, ampsLastCycle, selected, plcConnected, lastScanAt }: LiveProps) {
  const [open, setOpen] = useState(false);
  const [impeller, setImpeller] = useState<number | null>(null);
  // An older gateway orders amps[] by text (1, 10, 2 …), so sort by number.
  const sorted = [...amps].sort((a, b) => impellerNumber(a.parameterName) - impellerNumber(b.parameterName));
  const lastCycle = new Map(ampsLastCycle.map(a => [a.parameterName, a]));

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} mb={0.5}>Impeller Current</Typography>
      <SelectedImpellersNote selected={selected} />
      {!plcConnected && (
        <PlcWarning>
          PLC disconnected. Showing the last values read at {formatPlantDateTime(lastScanAt)}. These are not live.
        </PlcWarning>
      )}

      {sorted.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No amp readings reported.</Typography>
      ) : (
        <ImpellerGrid>
          {sorted.map(r => {
            const n = impellerNumber(r.parameterName);
            const amps = parseValue(r.value);
            const idle = Number.isFinite(amps) && amps < 1;
            const ranAt = parseValue(lastCycle.get(r.parameterName)?.value);
            return (
              <ImpellerTile
                key={r.parameterName}
                n={n}
                value={Number.isFinite(amps) ? `${formatNumber(amps, 2)} A` : r.value || '—'}
                valueColor={idle ? 'text.disabled' : 'primary.main'}
                onOpen={() => { setImpeller(n); setOpen(true); }}
              >
                {idle ? (
                  <Box display="flex" alignItems="center" justifyContent="center" gap={0.75} mt={0.25} flexWrap="wrap">
                    {Number.isFinite(ranAt) && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        ran at {formatNumber(ranAt, 1)} A
                      </Typography>
                    )}
                    <Chip label="Idle" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }} />
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem', display: 'block' }}>
                    {formatTileTimestamp(r.lastUpdated)}
                  </Typography>
                )}
              </ImpellerTile>
            );
          })}
        </ImpellerGrid>
      )}

      <ImpellerChartDialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        title={`Impeller ${impeller}: Average Current per Cycle (A)`}
      >
        {ready => (impeller !== null && ready
          ? <AmpsGraph key={impeller} clientId={clientId} impellerNumber={impeller} />
          : <ChartPlaceholder />)}
      </ImpellerChartDialog>
    </Box>
  );
}

interface FilteredProps {
  clientId: string;
  requestId: number;
  amps: GatewaySection2Amp[];
}

/**
 * Impeller Current (Filtered): section2.amps[] as tiles. The per-cycle points behind a tile's
 * chart come from filter/{requestId}/amps, fetched by FilteredAmpsGraph when the dialog opens.
 */
export function FilteredAmpsPanel({ clientId, requestId, amps }: FilteredProps) {
  const [open, setOpen] = useState(false);
  const [impeller, setImpeller] = useState<number | null>(null);

  const openTile = (n: number) => { setImpeller(n); setOpen(true); };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Impeller Current (Filtered)</Typography>
      {amps.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No impeller current was recorded for the cycles in this filter.</Typography>
      ) : (
        <ImpellerGrid>
          {amps.map(a => (
            <ImpellerTile
              key={a.impellerNumber}
              n={a.impellerNumber}
              value={a.overallAvgAmps == null ? '—' : `${formatNumber(a.overallAvgAmps, 2)} A`}
              valueColor="primary.main"
              onOpen={() => openTile(a.impellerNumber)}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block' }}>
                Filter average
              </Typography>
            </ImpellerTile>
          ))}
        </ImpellerGrid>
      )}

      {/* The gateway's FilteredAmpsPanel sizes this dialog md, not lg — matched deliberately. */}
      <ImpellerChartDialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        title={`Impeller ${impeller}: Filtered Current (A)`}
      >
        {ready => (impeller !== null && ready
          ? <FilteredAmpsGraph key={impeller} clientId={clientId} requestId={requestId} impellerNumber={impeller} />
          : <ChartPlaceholder />)}
      </ImpellerChartDialog>
    </Box>
  );
}
