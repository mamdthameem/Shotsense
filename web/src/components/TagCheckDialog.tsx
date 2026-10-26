import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { describeGatewayFailure, fetchTagCheck } from '../services/gatewayService';
import { formatPlantDateTime } from '../utils/formatters';
import type { GatewayTagCheck } from '../types';

const AUTO_REFRESH_MS = 5000;

/**
 * Tag check: every tag in the client's tag file with the value the gateway last read for it, so a
 * wrong address or type shows up at once when compared with TIA Portal's online view. Office only —
 * the tag list is private to ShotSense, which is why this lives in the cloud and never on the
 * gateway's own dashboard.
 */
export default function TagCheckDialog({ clientId, open, onClose }: {
  clientId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<GatewayTagCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [auto, setAuto] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTagCheck(clientId);
      if (result.ok) { setData(result.data); setError(null); }
      else setError(result.status === 404
        ? 'This gateway is too old for the tag check. Update the gateway first.'
        : describeGatewayFailure(result));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!open) return;
    void load();
    if (!auto) return;
    const id = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [open, auto, load]);

  const needle = search.trim().toLowerCase();
  const rows = (data?.tags ?? []).filter(t =>
    !needle || t.name.toLowerCase().includes(needle) || t.address.toLowerCase().includes(needle));
  const neverRead = (data?.tags ?? []).filter(t => t.value === null).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Tag check</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          What the gateway reads from the PLC right now, tag by tag. Compare a suspicious value with TIA Portal
          (online, the same data block): if TIA shows a number and this shows 0 or nothing, the tag's address or type
          is wrong in the tag file.
        </Typography>

        {data && (
          <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} mb={1.5}>
            <Chip
              size="small"
              color={data.plcConnected ? 'success' : 'error'}
              label={data.plcConnected ? 'PLC connected' : 'PLC not connected'}
            />
            <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)' }}>
              PLC {data.plc.ipAddress} · rack {data.plc.rack} · slot {data.plc.slot}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              · {data.tags.length} tags{neverRead > 0 ? ` (${neverRead} never read)` : ''}
              {data.lastScanAt ? ` · last scan ${formatPlantDateTime(data.lastScanAt)}` : ''}
              {data.tagFileVersion ? ` · tag file ${data.tagFileVersion}` : ''}
            </Typography>
          </Box>
        )}

        <Box display="flex" alignItems="center" gap={2} mb={1.5} flexWrap="wrap">
          <TextField
            size="small"
            placeholder="Search name or address"
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ minWidth: 260 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={auto} onChange={e => setAuto(e.target.checked)} />}
            label="Refresh every 5 s"
            sx={{ '& .MuiTypography-root': { fontSize: '0.8rem', fontWeight: 600 } }}
          />
          {loading && <CircularProgress size={16} />}
        </Box>

        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

        {!data && !error && loading && (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        )}

        {data && (
          <TableContainer sx={{ maxHeight: '60vh', border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Tag</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Address</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Value</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Last read</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(t => (
                  <TableRow key={`${t.address}|${t.name}`} hover>
                    <TableCell>{t.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{t.address}</TableCell>
                    <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{t.dataType}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {t.value === null
                        ? <Typography component="span" variant="caption" color="warning.main">never read</Typography>
                        : t.value === '' ? <Typography component="span" variant="caption" color="text.secondary">(empty)</Typography>
                        : t.value}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {t.lastUpdated ? formatPlantDateTime(t.lastUpdated) : '—'}
                      {t.isStale && <Chip size="small" label="stale" color="warning" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      {data.tags.length === 0 ? 'This gateway has no tags.' : 'No tag matches the search.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button startIcon={<RefreshIcon />} onClick={() => void load()} disabled={loading}>Refresh</Button>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
