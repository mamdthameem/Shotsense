import { Box, Typography } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { GatewaySection2AmpPoint } from '../types';
import { impellerLabel, impellerNumber } from './AmpsPanel';

const IMPELLER_COLORS = [
  '#1d4ed8', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4338ca',
];

/**
 * Historical impeller current within the active filter window — plots
 * section2.ampsHistory exactly as delivered, one line per impeller. Driven by
 * the same page-level filter as the rest of Section 2; no control of its own.
 */
export default function AmpsHistoryChart({ data }: { data: GatewaySection2AmpPoint[] }) {
  if (data.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">No impeller current recorded in this filter window.</Typography>
      </Box>
    );
  }

  const impellers = Array.from(new Set(data.map(p => p.parameterName)))
    .sort((a, b) => impellerNumber(a) - impellerNumber(b));

  const rows = [...data]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(p => ({
      label: new Date(p.timestamp).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
      [p.parameterName]: parseFloat(p.value),   // parsed only to plot
      [`${p.parameterName}__raw`]: p.value,       // shown in the tooltip, as sent
    }));

  return (
    <Box sx={{ width: '100%', height: 340 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(_v, name, item) => [
              `${(item?.payload as Record<string, string> | undefined)?.[`${name}__raw`] ?? '—'} A`,
              impellerLabel(String(name)),
            ]}
          />
          <Legend formatter={(name) => impellerLabel(String(name))} wrapperStyle={{ fontSize: '0.72rem' }} />
          {impellers.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name}
              stroke={IMPELLER_COLORS[i % IMPELLER_COLORS.length]}
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
