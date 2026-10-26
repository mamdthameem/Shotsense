import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Typography,
} from '@mui/material';
import { describeGatewayFailure, fetchPlcSettings, savePlcSettings } from '../services/gatewayService';
import type { GatewayPlcSettings } from '../types';

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** Mirrors the gateway's own rule (PlcEndpoint.Problem): plant-network addresses only. */
function problem(ip: string, rack: string, slot: string): string | null {
  if (!IPV4.test(ip.trim())) return "Enter the PLC's IPv4 address, for example 192.168.1.11.";
  const [a, b] = ip.trim().split('.').map(Number);
  if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) {
    return 'The PLC must be on the plant network: 10.x.x.x, 172.16–31.x.x or 192.168.x.x.';
  }
  const r = Number(rack), s = Number(slot);
  if (!Number.isInteger(r) || r < 0 || r > 7 || !Number.isInteger(s) || s < 0 || s > 31) {
    return 'Rack is 0 to 7 and slot 0 to 31. For an S7-1200 they are normally 0 and 1.';
  }
  return null;
}

/**
 * Where the client's gateway finds the PLC. The installer's answer is only the starting value: a
 * plant that re-addresses its PLC is fixed from here, and the gateway switches within seconds. This
 * still works while the PLC is unreachable, because the cloud reaches the gateway through the tunnel.
 */
export default function PlcSettingsDialog({ clientId, open, onClose, onSaved }: {
  clientId: string;
  open: boolean;
  onClose: () => void;
  /** After a save, so the page can pull fresh live data. */
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState<GatewayPlcSettings | null>(null);
  const [ip, setIp] = useState('');
  const [rack, setRack] = useState('0');
  const [slot, setSlot] = useState('1');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setOutcome(null);
    fetchPlcSettings(clientId).then(result => {
      if (!active) return;
      if (result.ok) {
        setCurrent(result.data);
        setIp(result.data.plc.ipAddress);
        setRack(String(result.data.plc.rack));
        setSlot(String(result.data.plc.slot));
      } else {
        setError(result.status === 404 || result.status === 405
          ? 'This gateway is too old to have its PLC address set from the cloud. Update the gateway first.'
          : describeGatewayFailure(result));
      }
    }).catch(e => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, clientId]);

  const invalid = problem(ip, rack, slot);
  const unchanged = current !== null && ip.trim() === current.plc.ipAddress &&
    Number(rack) === current.plc.rack && Number(slot) === current.plc.slot;

  async function save() {
    setSaving(true);
    setError(null);
    setOutcome(null);
    const previous = current?.plc;
    try {
      const result = await savePlcSettings(clientId, { ipAddress: ip.trim(), rack: Number(rack), slot: Number(slot) });
      if (!result.ok) {
        setError(describeGatewayFailure(result));
        return;
      }
      setCurrent(result.data);
      setOutcome(result.data.connected
        ? { ok: true, text: `Saved. The PLC answers at ${result.data.plc.ipAddress}.` }
        : {
            ok: false,
            text: `Saved, but the PLC does not answer at ${result.data.plc.ipAddress} yet. The gateway keeps trying. ` +
              'Check the address and that the PLC is on the same network as the gateway PC' +
              (previous ? `, or set the previous address back (${previous.ipAddress}).` : '.'),
          });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => { if (!saving) onClose(); }} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>PLC connection</DialogTitle>
      <DialogContent>
        {loading && <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box>}

        {current && (
          <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
            <Chip
              size="small"
              color={current.connected ? 'success' : 'error'}
              label={current.connected ? 'Connected' : 'Not connected'}
            />
            <Typography variant="caption" color="text.secondary">
              Now: {current.plc.ipAddress}, rack {current.plc.rack}, slot {current.plc.slot}
              {' · '}{current.source === 'cloud' ? 'set from the cloud' : 'set at installation'}
            </Typography>
          </Box>
        )}

        {!loading && (current || !error) && (
          <>
            <TextField
              label="PLC IP address"
              value={ip}
              onChange={e => setIp(e.target.value)}
              fullWidth
              size="small"
              margin="dense"
              disabled={saving}
              placeholder="192.168.1.11"
            />
            <Box display="flex" gap={2}>
              <TextField label="Rack" value={rack} onChange={e => setRack(e.target.value)} size="small" margin="dense" disabled={saving} fullWidth />
              <TextField label="Slot" value={slot} onChange={e => setSlot(e.target.value)} size="small" margin="dense" disabled={saving} fullWidth />
            </Box>
            <Typography variant="caption" color={invalid && ip ? 'error' : 'text.secondary'} display="block" sx={{ mt: 1 }}>
              {invalid && ip ? invalid : 'The gateway switches to the new address within seconds. While the address is wrong, nothing is recorded.'}
            </Typography>
          </>
        )}

        {outcome && <Alert severity={outcome.ok ? 'success' : 'warning'} sx={{ mt: 2 }}>{outcome.text}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Close</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || loading || !current || invalid !== null || unchanged}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {saving ? 'Connecting…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
