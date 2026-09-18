import { useState, useEffect } from 'react';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchHistory, describeGatewayFailure } from '../services/gatewayService';
import { PARAM_META } from '../utils/unitConverters';

interface Props {
  clientId: string;
  metric: string;
  windowStart: string;
  windowEnd: string;
  limit?: number;
}

/** One on-demand history pull rendered with the client dashboard's graph styling. */
export default function HistoryGraph({ clientId, metric, windowStart, windowEnd, limit = 2000 }: Props) {
  const [data, setData]       = useState<{ label: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const metricLabel = PARAM_META[metric]?.label ?? metric;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchHistory(clientId, metric, new Date(windowStart), new Date(windowEnd), limit)
      .then(result => {
        if (!active) return;
        if (!result.ok) {
          setError(describeGatewayFailure(result));
          setLoading(false);
          return;
        }
        const chartData = result.data.points
          .map(p => {
            const v = p.value === null ? NaN : parseFloat(p.value);
            return isFinite(v) ? {
              label: new Date(p.timestamp).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              }),
              value: v,
            } : null;
          })
          .filter((x): x is { label: string; value: number } => x !== null);
        setData(chartData);
        setLoading(false);
      })
      .catch(e => {
        if (!active) return;
        setError((e as Error).message);
        setLoading(false);
      });

    return () => { active = false; };
  }, [clientId, metric, windowStart, windowEnd, limit]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error)   return <Alert severity="error">{error}</Alert>;
  if (!data.length) return <Typography color="text.secondary">No data for this period.</Typography>;

  return (
    <Box sx={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [Number(v ?? 0).toLocaleString(), metricLabel]} />
          <Line type="monotone" dataKey="value" stroke="#1d4ed8" dot={false} strokeWidth={2} name={metricLabel} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
