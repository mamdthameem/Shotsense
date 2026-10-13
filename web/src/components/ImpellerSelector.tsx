import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { describeGatewayFailure, saveImpellerSelection } from '../services/gatewayService';

const MAX_IMPELLERS = 10;
const ALL = Array.from({ length: MAX_IMPELLERS }, (_, i) => i + 1);

/**
 * Picks which impellers a client's site includes. This is the ONLY place it can be changed: the
 * gateway's own dashboard no longer has these buttons (decided 2026-10-13), and any cloud admin
 * may use them. Ported from the gateway dashboard's former ImpellerSelector.
 *
 * The choice is machine-wide on that gateway: it decides which impellers every panel shows AND
 * which ones the calculations count (energy, the filtered current split, spare monitoring).
 * Saving recalculates the energy of every recorded cycle, which moves long-standing headline
 * figures, so it asks first. Nothing is deleted — selecting an impeller again brings its figures
 * straight back.
 */
export default function ImpellerSelector({ clientId, selected, onSaved }: {
  clientId: string;
  /** What the gateway reports now (live.impellers.selected). */
  selected: number[];
  /** Called after a save, so the page can pull the recalculated figures. */
  onSaved: () => void;
}) {
  const savedKey = [...selected].sort((a, b) => a - b).join(',');
  const [draft, setDraft] = useState<number[]>(selected);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the gateway when its selection changes underneath us (a save from another admin).
  useEffect(() => { setDraft(savedKey ? savedKey.split(',').map(Number) : []); }, [savedKey]);

  const ordered = [...draft].sort((a, b) => a - b);
  const dirty = ordered.join(',') !== savedKey;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await saveImpellerSelection(clientId, ordered);
      if (!result.ok) {
        setError(result.status === 404 || result.status === 405
          ? 'This gateway is too old to have its impellers set from the cloud. Update the gateway first.'
          : describeGatewayFailure(result));
        return;
      }
      setConfirmOpen(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        Impellers
      </Typography>
      <ToggleButtonGroup
        size="small"
        value={draft}
        onChange={(_, value: number[]) => setDraft(value)}
        disabled={saving}
        aria-label="Impellers included"
      >
        {ALL.map(n => (
          <ToggleButton key={n} value={n} sx={{ minWidth: 34, px: 1, py: 0.25, fontWeight: 700 }}>
            {n}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Button size="small" onClick={() => setDraft(ALL)} disabled={saving}>All</Button>
      <Button size="small" onClick={() => setDraft([])} disabled={saving}>None</Button>
      <Button
        size="small"
        variant="contained"
        onClick={() => { setError(null); setConfirmOpen(true); }}
        disabled={!dirty || draft.length === 0 || saving}
      >
        Save
      </Button>
      {draft.length === 0 && (
        <Typography variant="caption" color="warning.main">Select at least one impeller</Typography>
      )}
      {error && !confirmOpen && (
        <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => { if (!saving) setConfirmOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Include impellers {ordered.join(', ')}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Only these impellers will be shown and counted, for everyone using this client's gateway
            and this website. The energy of every recorded cycle is recalculated from the stored
            current readings, so the energy totals, energy per casting and the energy graphs all
            change. Spare monitoring covers only these impellers.
          </DialogContentText>
          <DialogContentText sx={{ mt: 1.5 }}>
            No readings are deleted, and this can be changed back at any time. Filter results already
            on screen are not updated; apply the filter again to see them with this selection.
          </DialogContentText>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {saving ? 'Recalculating…' : 'Save and recalculate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
