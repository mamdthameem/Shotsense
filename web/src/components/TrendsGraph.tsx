import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { GatewayTrendPoint, TrendSeries } from '../types';

type TrendField = 'utilityPct' | 'productionKg' | 'energyKwh' | 'efficiencyKwhPerKg';
type Bucket = 'month' | 'day';

interface Props {
  trends: TrendSeries;
  field: TrendField;
  label: string;
  unit?: string;
  color?: string;
}

function bucketLabel(day: string, bucket: Bucket): string {
  const d = new Date(day);
  return bucket === 'month'
    ? d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Whole-history graph — plots the gateway's /api/admin/trends series exactly
 * as sent (both buckets fetched once per dashboard load, nothing summed or
 * averaged here). The daily series includes empty days as their own points,
 * so quiet days show as zeros instead of being skipped over. A null value is
 * drawn as a gap, never replaced with 0.
 */
export default function TrendsGraph({ trends, field, label, unit, color = '#1d4ed8' }: Props) {
  const [bucket, setBucket] = useState<Bucket>('month');
  const points: GatewayTrendPoint[] = trends[bucket];

  const data = points.map(t => ({ label: bucketLabel(t.day, bucket), value: t[field] }));

  return (
    <Box>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={bucket}
        onChange={(_, v: Bucket | null) => v && setBucket(v)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="month">Monthly</ToggleButton>
        <ToggleButton value="day">Daily</ToggleButton>
      </ToggleButtonGroup>

      {points.length === 0 ? (
        <Typography color="text.secondary">No trend data available.</Typography>
      ) : (
        <Box sx={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v == null ? '—' : unit ? `${v} ${unit}` : String(v), label]} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                dot={bucket === 'month'}
                strokeWidth={2}
                name={label}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
}
