import { Box, Typography } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { GatewayTrendPoint } from '../types';

type TrendField = 'utilityPct' | 'productionKg' | 'energyKwh' | 'efficiencyKwhPerKg';

interface Props {
  trends: GatewayTrendPoint[];
  field: TrendField;
  label: string;
  color?: string;
}

/** Whole-history graph — plots data fetched once via /api/admin/trends, no per-click call. */
export default function TrendsGraph({ trends, field, label, color = '#1d4ed8' }: Props) {
  if (trends.length === 0) {
    return <Typography color="text.secondary">No trend data available.</Typography>;
  }

  const data = trends.map(t => ({
    label: new Date(t.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    value: t[field] ?? 0,
  }));

  return (
    <Box sx={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [Number(v ?? 0).toLocaleString(), label]} />
          <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} name={label} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
