import { useState } from 'react';
import {
  Alert, Box, Button, ButtonGroup, Checkbox, Chip, FormControlLabel, LinearProgress, Paper, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import { fromPlantFields, plantFields, type PlantFields } from '../utils/formatters';
import type { FilterParameterKey, GatewayFilterRequest } from '../types';

type TimePreset = 'hour' | 'shift' | 'day' | 'week' | 'month' | 'year' | 'custom';
type FilterTab = 'time' | 'cycle' | 'metal';

// The key is also the periodLabel sent to the gateway ("day" is shown as Yesterday).
const PRESETS: { key: TimePreset; label: string }[] = [
  { key: 'hour', label: 'Hour' },
  { key: 'shift', label: 'Shift' },
  { key: 'day', label: 'Yesterday' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

const PARAMETERS: { key: FilterParameterKey; label: string }[] = [
  { key: 'machine_utility_pct', label: 'Machine Utility' },
  { key: 'production_qty_kg', label: 'Production (Item Weight)' },
  { key: 'energy_kwh_total', label: 'Total Energy' },
  { key: 'energy_per_casting_kwh_kg', label: 'Energy per Casting' },
  { key: 'blast_time_sec', label: 'Blast Time' },
  { key: 'cycle_count', label: 'Blast Cycles' },
  { key: 'impeller_current', label: 'Impeller Current' },
];

const ALL_TICKED = Object.fromEntries(PARAMETERS.map(p => [p.key, true])) as Record<FilterParameterKey, boolean>;
const NONE_TICKED = Object.fromEntries(PARAMETERS.map(p => [p.key, false])) as Record<FilterParameterKey, boolean>;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The same plant date-time `months` earlier, clamped to the month's last day (31 Mar → 28/29 Feb). */
function monthsEarlier(f: PlantFields, months: number): Date {
  const total = f.year * 12 + f.month - months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromPlantFields({ ...f, year, month, day: Math.min(f.day, lastDay) });
}

/** A preset's window in plant time (IST), worked out when Apply is pressed. */
function presetWindow(preset: Exclude<TimePreset, 'custom'>, now: Date): [Date, Date] {
  const end = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const f = plantFields(end)!;
  switch (preset) {
    case 'hour': return [new Date(end.getTime() - HOUR_MS), end];
    case 'shift': return [new Date(end.getTime() - 8 * HOUR_MS), end];
    case 'week': return [new Date(end.getTime() - 7 * DAY_MS), end];
    case 'month': return [monthsEarlier(f, 1), end];
    case 'year': return [monthsEarlier(f, 12), end];
    case 'day': {
      // The whole previous plant calendar day, 00:00–24:00 IST.
      const todayStart = fromPlantFields({ ...f, hour: 0, minute: 0, second: 0 });
      return [new Date(todayStart.getTime() - DAY_MS), todayStart];
    }
  }
}

const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A date-time picker value (`2026-09-18T06:00`) for the given instant, in plant time. */
function toPlantInput(d: Date): string {
  const f = plantFields(d)!;
  return `${f.year}-${pad2(f.month + 1)}-${pad2(f.day)}T${pad2(f.hour)}:${pad2(f.minute)}`;
}

/** A date-time picker value read as plant time. */
function fromPlantInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return null;
  return fromPlantFields({
    year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]),
    hour: Number(m[4]), minute: Number(m[5]), second: Number(m[6] ?? 0),
  });
}

interface Props {
  onApply: (req: GatewayFilterRequest) => void;
  onReset: () => void;
  loading: boolean;
  appliedName: string | null;   // chip text once a filter is applied
  error: string | null;
}

/** Time / Cycle / Item filter and the parameters to compute — mirrors the gateway dashboard's Filters. */
export default function FilterBar({ onApply, onReset, loading, appliedName, error }: Props) {
  const [tab, setTab] = useState<FilterTab>('time');
  const [preset, setPreset] = useState<TimePreset>('day');
  const [customStart, setCustomStart] = useState(() => toPlantInput(presetWindow('day', new Date())[0]));
  const [customEnd, setCustomEnd] = useState(() => toPlantInput(presetWindow('day', new Date())[1]));
  const [cycleFrom, setCycleFrom] = useState('');
  const [cycleTo, setCycleTo] = useState('');
  const [itemName, setItemName] = useState('');
  const [ticked, setTicked] = useState(ALL_TICKED);
  const [message, setMessage] = useState<string | null>(null);

  // Machine on-time cannot be attributed to one casting item, so the Item tab never computes it.
  const available = (key: FilterParameterKey) => !(tab === 'metal' && key === 'machine_utility_pct');
  const selectedParameters = PARAMETERS.filter(p => ticked[p.key] && available(p.key)).map(p => p.key);
  const total = PARAMETERS.filter(p => available(p.key)).length;

  const apply = () => {
    let req: GatewayFilterRequest;
    if (tab === 'time') {
      let window: [Date, Date];
      if (preset === 'custom') {
        const start = fromPlantInput(customStart);
        const end = fromPlantInput(customEnd);
        if (!start || !end) return setMessage('Enter both start and end.');
        if (start >= end) return setMessage('Start must be before End.');
        window = [start, end];
      } else {
        window = presetWindow(preset, new Date());
      }
      req = {
        filterBy: 'time',
        filterStart: isoSeconds(window[0]),
        filterEnd: isoSeconds(window[1]),
        ...(preset === 'custom' ? {} : { periodLabel: preset }),
        selectedParameters,
      };
    } else if (tab === 'cycle') {
      const from = Number(cycleFrom);
      const to = Number(cycleTo);
      if (!cycleFrom.trim() || !cycleTo.trim() || !Number.isInteger(from) || !Number.isInteger(to)) {
        return setMessage('Enter both cycle from and to numbers.');
      }
      if (from > to) return setMessage('Cycle From must be ≤ Cycle To.');
      req = { filterBy: 'cycle', filterCycleFrom: from, filterCycleTo: to, selectedParameters };
    } else {
      if (!itemName.trim()) return setMessage('Enter an item name.');
      req = { filterBy: 'metal', filterMetalName: itemName.trim(), selectedParameters };
    }
    setMessage(null);
    onApply(req);
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
      <Typography variant="h6" fontWeight={700} mb={2}>Filters</Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 280px' }, gap: 3 }}>
        <Box>
          <Tabs
            value={tab}
            onChange={(_, v: FilterTab) => { setTab(v); setMessage(null); }}
            sx={{ mb: 2, minHeight: 36 }}
          >
            <Tab value="time" label="Time Range" sx={{ minHeight: 36, fontWeight: 700 }} />
            <Tab value="cycle" label="Cycle Range" sx={{ minHeight: 36, fontWeight: 700 }} />
            <Tab value="metal" label="Item" sx={{ minHeight: 36, fontWeight: 700 }} />
          </Tabs>

          {tab === 'time' && (
            <Box display="flex" flexDirection="column" gap={2}>
              <ButtonGroup variant="outlined" size="small" sx={{ flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <Button key={p.key} variant={preset === p.key ? 'contained' : 'outlined'} onClick={() => setPreset(p.key)}>
                    {p.label}
                  </Button>
                ))}
              </ButtonGroup>
              {preset === 'custom' && (
                <Box display="flex" gap={2} flexWrap="wrap">
                  <TextField
                    label="Start" type="datetime-local" size="small" slotProps={{ inputLabel: { shrink: true } }}
                    value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  />
                  <TextField
                    label="End" type="datetime-local" size="small" slotProps={{ inputLabel: { shrink: true } }}
                    value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </Box>
              )}
            </Box>
          )}

          {tab === 'cycle' && (
            <Box display="flex" gap={2} flexWrap="wrap">
              <TextField label="Cycle From" type="number" size="small" value={cycleFrom} onChange={(e) => setCycleFrom(e.target.value)} />
              <TextField label="Cycle To" type="number" size="small" value={cycleTo} onChange={(e) => setCycleTo(e.target.value)} />
            </Box>
          )}

          {tab === 'metal' && (
            <TextField
              label="Item Name" size="small" fullWidth placeholder="e.g. Aluminium"
              value={itemName} onChange={(e) => setItemName(e.target.value)}
              helperText="Matches the declared casting item name exactly. Every selected parameter is then computed from only the cycles that declared it."
              sx={{ maxWidth: 420 }}
            />
          )}

          <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap" mt={3}>
            <Button
              variant="contained"
              onClick={apply}
              disabled={loading || selectedParameters.length === 0}
              sx={{ borderRadius: 2, fontWeight: 700 }}
            >
              {loading ? 'Calculating…' : 'Apply Filter'}
            </Button>
            {appliedName && (
              <>
                <Chip label={appliedName} color="primary" sx={{ fontWeight: 700 }} />
                <Button variant="outlined" onClick={onReset} disabled={loading} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  Reset
                </Button>
              </>
            )}
          </Box>

          {loading && (
            <Box mt={2}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
                Calculating, please wait…
              </Typography>
            </Box>
          )}
          {(message ?? error) && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{message ?? error}</Alert>
          )}
        </Box>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, alignSelf: 'start' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Typography variant="subtitle2" fontWeight={700}>Parameters</Typography>
            <Chip label={`${selectedParameters.length}/${total}`} size="small" sx={{ fontWeight: 700 }} />
          </Box>
          <Box display="flex" flexDirection="column">
            {PARAMETERS.map(p => (
              <FormControlLabel
                key={p.key}
                label={p.label}
                disabled={!available(p.key)}
                control={
                  <Checkbox
                    size="small"
                    checked={ticked[p.key] && available(p.key)}
                    onChange={(e) => setTicked(t => ({ ...t, [p.key]: e.target.checked }))}
                  />
                }
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.85rem' } }}
              />
            ))}
          </Box>
          <Box display="flex" gap={1} mt={1}>
            <Button size="small" onClick={() => setTicked(ALL_TICKED)}>Select All</Button>
            <Button size="small" onClick={() => setTicked(NONE_TICKED)}>Clear All</Button>
          </Box>
        </Paper>
      </Box>
    </Paper>
  );
}
