import { useState } from 'react';
import { Paper, Typography, Box, Tabs, Tab, ButtonGroup, Button, TextField, Alert } from '@mui/material';
import type { GatewayFilterRequest } from '../types';

type TimePreset = 'hour' | 'shift' | 'day' | 'week' | 'month' | 'year' | 'custom';
type FilterTab = 'time' | 'cycle' | 'metal';

const PRESET_LABELS: Record<TimePreset, string> = {
  hour: 'Hour', shift: 'Shift', day: 'Day', week: 'Week', month: 'Month', year: 'Year', custom: 'Custom',
};

// Shift length is a guess (8h) — plants may run different shift lengths; confirm before relying on it.
const PRESET_HOURS: Partial<Record<TimePreset, number>> = {
  hour: 1, shift: 8, day: 24, week: 24 * 7, month: 24 * 30, year: 24 * 365,
};

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Props {
  onApply: (req: GatewayFilterRequest) => void;
  loading?: boolean;
  disabled?: boolean;
}

/** Time/Cycle/Metal filter trigger — mirrors the local dashboard's FilterBar layout. */
export default function FilterBar({ onApply, loading, disabled }: Props) {
  const [tab, setTab] = useState<FilterTab>('time');
  const [preset, setPreset] = useState<TimePreset>('custom');
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() - 7 * 86_400_000)));
  const [end, setEnd] = useState(toLocalInput(new Date()));
  const [cycleFrom, setCycleFrom] = useState('');
  const [cycleTo, setCycleTo] = useState('');
  const [metalName, setMetalName] = useState('');

  const pickPreset = (p: TimePreset) => {
    setPreset(p);
    const hours = PRESET_HOURS[p];
    if (hours) {
      const now = new Date();
      setStart(toLocalInput(new Date(now.getTime() - hours * 3_600_000)));
      setEnd(toLocalInput(now));
    }
  };

  const apply = () => {
    if (tab === 'time') {
      onApply({
        filterBy: 'time',
        filterStart: new Date(start).toISOString(),
        filterEnd: new Date(end).toISOString(),
        periodLabel: preset === 'custom' ? undefined : preset,
      });
    } else if (tab === 'cycle') {
      const from = parseInt(cycleFrom, 10);
      const to = parseInt(cycleTo, 10);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return;
      onApply({ filterBy: 'cycle', filterCycleFrom: from, filterCycleTo: to });
    } else {
      if (!metalName.trim()) return;
      onApply({ filterBy: 'metal', filterMetalName: metalName.trim() });
    }
  };

  const cycleFromNum = parseInt(cycleFrom, 10);
  const cycleToNum = parseInt(cycleTo, 10);
  const cycleRangeInvalid =
    tab === 'cycle' && cycleFrom.trim() !== '' && cycleTo.trim() !== '' &&
    Number.isFinite(cycleFromNum) && Number.isFinite(cycleToNum) && cycleFromNum > cycleToNum;

  const applyDisabled =
    Boolean(disabled) ||
    Boolean(loading) ||
    (tab === 'cycle' && (!cycleFrom.trim() || !cycleTo.trim() || cycleRangeInvalid)) ||
    (tab === 'metal' && !metalName.trim());

  return (
    <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
      <Typography variant="subtitle2" fontWeight={700} mb={2}>Filter Parameters</Typography>

      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        Applying a filter here also updates the "Latest Filtered Calculation" on this client's own
        local dashboard — the two share the same result until either side computes a different filter.
      </Alert>

      <Tabs value={tab} onChange={(_, v: FilterTab) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
        <Tab value="time" label="Time Range" sx={{ minHeight: 36, fontWeight: 700 }} />
        <Tab value="cycle" label="Cycle Range" sx={{ minHeight: 36, fontWeight: 700 }} />
        <Tab value="metal" label="Metal" sx={{ minHeight: 36, fontWeight: 700 }} />
      </Tabs>

      {tab === 'time' && (
        <Box display="flex" flexDirection="column" gap={2}>
          <ButtonGroup variant="outlined" size="small" sx={{ flexWrap: 'wrap' }}>
            {(Object.keys(PRESET_LABELS) as TimePreset[]).map(p => (
              <Button key={p} variant={preset === p ? 'contained' : 'outlined'} onClick={() => pickPreset(p)}>
                {PRESET_LABELS[p]}
              </Button>
            ))}
          </ButtonGroup>
          <Box display="flex" gap={2} flexWrap="wrap">
            <TextField
              label="Start" type="datetime-local" size="small" InputLabelProps={{ shrink: true }}
              value={start} disabled={preset !== 'custom'} onChange={(e) => setStart(e.target.value)}
            />
            <TextField
              label="End" type="datetime-local" size="small" InputLabelProps={{ shrink: true }}
              value={end} disabled={preset !== 'custom'} onChange={(e) => setEnd(e.target.value)}
            />
          </Box>
        </Box>
      )}

      {tab === 'cycle' && (
        <Box display="flex" flexDirection="column" gap={1}>
          <Box display="flex" gap={2} flexWrap="wrap">
            <TextField
              label="Cycle From" size="small" value={cycleFrom} error={cycleRangeInvalid}
              onChange={(e) => setCycleFrom(e.target.value)}
            />
            <TextField
              label="Cycle To" size="small" value={cycleTo} error={cycleRangeInvalid}
              onChange={(e) => setCycleTo(e.target.value)}
            />
          </Box>
          {cycleRangeInvalid && (
            <Typography variant="caption" color="error">Cycle From must be less than or equal to Cycle To.</Typography>
          )}
        </Box>
      )}

      {tab === 'metal' && (
        <TextField
          label="Metal Name" size="small" fullWidth
          value={metalName} onChange={(e) => setMetalName(e.target.value)}
          sx={{ maxWidth: 320 }}
        />
      )}

      <Button
        variant="contained"
        onClick={apply}
        disabled={applyDisabled}
        sx={{ mt: 3, borderRadius: 2, fontWeight: 700 }}
      >
        {loading ? 'Applying…' : 'Apply Filter'}
      </Button>
    </Paper>
  );
}
