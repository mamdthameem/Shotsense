import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Switch,
    FormControlLabel,
    Divider,
    IconButton,
    InputAdornment,
    Tooltip,
    Alert,
    CircularProgress,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import type { Client } from '../types';
import { addClient, updateClient, type ClientInput } from '../services/clientService';
import { uploadSiteProfile } from '../services/siteProfileService';
import { generateClientId, generateKey } from '../utils/keys';
import { buildInstallCode } from '../utils/installCode';
import { formatPlantDateTime } from '../utils/formatters';

interface Props {
    open: boolean;
    editingClient: Client | null;
    onClose: () => void;
}

interface FormState {
    name: string;
    staticIp: string;
    port: string;
    useTls: boolean;
    hostnameOverride: string;
    licenseKey: string;
    adminApiKey: string;
    licenseExpiresAt: string; // yyyy-mm-dd
    graceDays: string;
    suspended: boolean;
    tunnelToken: string;
}

/** The tag file's summary as the dialog shows it. The file's contents never reach the browser. */
interface ProfileSummary {
    fileName: string | null;
    tagCount: number | null;
    uploadedAt: Date | null;
}

const emptyForm = (): FormState => ({
    name: '',
    staticIp: '',
    port: '443',
    useTls: true,
    hostnameOverride: '',
    licenseKey: generateKey(),
    adminApiKey: generateKey(),
    licenseExpiresAt: '',
    graceDays: '0',
    suspended: false,
    tunnelToken: '',
});

const fromClient = (c: Client): FormState => ({
    name: c.name,
    staticIp: c.staticIp,
    port: String(c.port),
    useTls: c.useTls,
    hostnameOverride: c.hostnameOverride ?? '',
    licenseKey: c.licenseKey,
    adminApiKey: c.adminApiKey,
    licenseExpiresAt: c.licenseExpiresAt ? c.licenseExpiresAt.toISOString().split('T')[0] : '',
    graceDays: String(c.graceDays ?? 0),
    suspended: c.suspended,
    tunnelToken: c.tunnelToken ?? '',
});

const sameForm = (a: FormState | null, b: FormState) => a !== null && JSON.stringify(a) === JSON.stringify(b);

/**
 * Add/Edit client dialog: registry fields, keys, the Cloudflare tunnel token, the client's tag file,
 * and the one installation code that carries all of it to the client's PC.
 *
 * The code is offered only while the form matches what is saved, so a copied code always holds the
 * keys the cloud will accept. Saving keeps the dialog open on the code.
 */
export const ClientDialog: React.FC<Props> = ({ open, editingClient, onClose }) => {
    const [form, setForm] = useState<FormState>(emptyForm());
    const [newId, setNewId] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // What the cloud holds for this client right now; null until a new client is first saved.
    const [savedForm, setSavedForm] = useState<FormState | null>(null);
    const [savedNote, setSavedNote] = useState<string | null>(null);
    const [profile, setProfile] = useState<ProfileSummary>({ fileName: null, tagCount: null, uploadedAt: null });
    const [uploading, setUploading] = useState(false);
    const [profileNote, setProfileNote] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            const initial = editingClient ? fromClient(editingClient) : emptyForm();
            setForm(initial);
            setSavedForm(editingClient ? initial : null);
            setNewId(editingClient ? '' : generateClientId());
            setProfile({
                fileName: editingClient?.siteProfileFileName ?? null,
                tagCount: editingClient?.siteProfileTagCount ?? null,
                uploadedAt: editingClient?.siteProfileUploadedAt ?? null,
            });
            setError(null);
            setSavedNote(null);
            setProfileNote(null);
            setCopied(false);
        }
    }, [open, editingClient]);

    const clientId = editingClient?.id ?? newId;
    const isSaved = savedForm !== null;
    const unsaved = !sameForm(savedForm, form);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
        setSavedNote(null);
        setCopied(false);
    };

    const copy = (value: string) => {
        void navigator.clipboard.writeText(value);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.staticIp.trim() || !form.licenseExpiresAt) {
            setError('Name, gateway address and license expiry are required.');
            return;
        }
        // A pasted full address (e.g. a Cloudflare tunnel URL) sets host, port and HTTPS in one go.
        let host = form.staticIp.trim();
        let portText = form.port;
        let useTls = form.useTls;
        if (/^https?:\/\//i.test(host)) {
            let parsed: URL;
            try {
                parsed = new URL(host);
            } catch {
                setError('That gateway address is not a valid URL.');
                return;
            }
            host = parsed.hostname;
            useTls = parsed.protocol === 'https:';
            portText = parsed.port || (useTls ? '443' : '80');
        }
        const port = parseInt(portText, 10);
        if (!Number.isFinite(port) || port < 1 || port > 65535) {
            setError('Port must be between 1 and 65535.');
            return;
        }
        const input: ClientInput = {
            name: form.name.trim(),
            staticIp: host,
            port,
            useTls,
            hostnameOverride: form.hostnameOverride.trim() || null,
            licenseKey: form.licenseKey,
            adminApiKey: form.adminApiKey,
            licenseExpiresAt: new Date(form.licenseExpiresAt),
            graceDays: Math.max(0, parseInt(form.graceDays, 10) || 0),
            suspended: form.suspended,
            tunnelToken: form.tunnelToken.trim() || null,
        };
        setSaving(true);
        setError(null);
        try {
            if (isSaved) {
                await updateClient(clientId, input);
            } else {
                await addClient(clientId, input);
            }
            // The form now shows exactly what was stored (a pasted URL became host, port and HTTPS),
            // which is what makes the installation code below safe to copy.
            const stored: FormState = {
                ...form,
                name: input.name,
                staticIp: host,
                port: String(port),
                useTls,
                hostnameOverride: input.hostnameOverride ?? '',
                graceDays: String(input.graceDays),
                tunnelToken: input.tunnelToken ?? '',
            };
            setForm(stored);
            setSavedForm(stored);
            setSavedNote('Saved. The installation code below is ready to copy.');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleProfileFile = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true);
        setProfileNote(null);
        try {
            const result = await uploadSiteProfile(clientId, file);
            setProfile({ fileName: result.fileName, tagCount: result.tagCount, uploadedAt: new Date() });
            setProfileNote({
                severity: 'success',
                text: `Uploaded: ${result.tagCount} tags. The gateway picks it up at its next start, or within an hour while running.` +
                    (result.ignored.length ? ` Not stored (not part of a tag file): ${result.ignored.join(', ')}.` : ''),
            });
        } catch (err) {
            setProfileNote({ severity: 'error', text: (err as Error).message || 'The upload failed.' });
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const installCode = isSaved && !unsaved
        ? buildInstallCode({
            clientId,
            clientName: form.name.trim(),
            publicHostname: form.hostnameOverride.trim() || form.staticIp.trim(),
            licenseKey: form.licenseKey,
            adminApiKey: form.adminApiKey,
            tunnelToken: form.tunnelToken.trim() || null,
        })
        : null;

    const keyField = (label: string, key: 'licenseKey' | 'adminApiKey') => (
        <TextField
            label={label}
            fullWidth
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            helperText="Auto-generated. Paste a specific value to match an existing installation."
            InputProps={{
                sx: { fontFamily: 'var(--font-mono)', fontSize: '0.78rem' },
                endAdornment: (
                    <InputAdornment position="end">
                        <Tooltip title="Copy">
                            <IconButton size="small" onClick={() => copy(form[key])}>
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Regenerate key">
                            <IconButton size="small" onClick={() => set(key, generateKey())}>
                                <AutorenewIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </InputAdornment>
                ),
            }}
        />
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    transition: 'all 0.3s ease',
                }
            }}
        >
            <DialogTitle sx={{ fontWeight: 800, color: (theme) => theme.palette.text.primary }}>
                {isSaved ? 'Edit Client' : 'Add New Client'}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {savedNote && <Alert severity="success">{savedNote}</Alert>}

                    <TextField
                        label="Client Name"
                        fullWidth
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        placeholder="Company or site identifier"
                    />
                    <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
                        <TextField
                            label="Gateway Address"
                            fullWidth
                            value={form.staticIp}
                            onChange={(e) => set('staticIp', e.target.value)}
                            placeholder="IP, hostname, or https://… tunnel address"
                        />
                        <TextField
                            label="Port"
                            fullWidth
                            value={form.port}
                            onChange={(e) => set('port', e.target.value)}
                        />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={form.useTls}
                                    onChange={(e) => set('useTls', e.target.checked)}
                                />
                            }
                            label="HTTPS"
                            sx={{ '& .MuiTypography-root': { fontWeight: 700, fontSize: '0.9rem' } }}
                        />
                        <TextField
                            label="Hostname Override (optional)"
                            fullWidth
                            value={form.hostnameOverride}
                            onChange={(e) => set('hostnameOverride', e.target.value)}
                            placeholder="Only if the TLS certificate is issued to a hostname"
                        />
                    </Box>
                    {!form.useTls && !/^https:\/\//i.test(form.staticIp.trim()) && (
                        <Alert severity="warning">
                            HTTPS is off. The cloud refuses plain HTTP, because the API key would travel
                            unencrypted — turn HTTPS on (a Cloudflare tunnel address works).
                        </Alert>
                    )}
                    <TextField
                        label="Cloudflare Tunnel Token (optional)"
                        fullWidth
                        multiline
                        minRows={2}
                        value={form.tunnelToken}
                        onChange={(e) => set('tunnelToken', e.target.value.trim())}
                        placeholder="eyJhIjoi…"
                        helperText="Cloudflare Zero Trust → Networks → Tunnels → this client's tunnel: the long value after
                            'cloudflared.exe service install'. Set its public hostname to the Gateway Address above, service
                            http://localhost:5200. Leave empty for a plant-network-only install."
                        InputProps={{ sx: { fontFamily: 'var(--font-mono)', fontSize: '0.72rem', wordBreak: 'break-all' } }}
                    />

                    <Divider />

                    <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
                        <TextField
                            label="License Valid Until"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={form.licenseExpiresAt}
                            onChange={(e) => set('licenseExpiresAt', e.target.value)}
                        />
                        <TextField
                            label="Grace Days"
                            fullWidth
                            value={form.graceDays}
                            onChange={(e) => set('graceDays', e.target.value)}
                        />
                    </Box>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={form.suspended}
                                onChange={(e) => set('suspended', e.target.checked)}
                            />
                        }
                        label="Suspended (blocks license checks immediately)"
                        sx={{ '& .MuiTypography-root': { fontWeight: 700, fontSize: '0.9rem' } }}
                    />

                    <Divider />

                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} mb={2}>Keys</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {keyField('License Key (client → cloud)', 'licenseKey')}
                            {keyField('Admin API Key (cloud → client)', 'adminApiKey')}
                        </Box>
                    </Box>

                    <Divider />

                    {/* The tag file: this client's PLC tag list and recording rules. Uploaded here, fetched
                        by the gateway with its licence key. Only a summary is ever shown. */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} mb={1}>Tag Settings File</Typography>
                        {!isSaved ? (
                            <Typography variant="body2" color="text.secondary">
                                Save the client first, then upload its tag file here.
                            </Typography>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                                <Typography variant="body2" color={profile.tagCount ? 'text.primary' : 'warning.main'}>
                                    {profile.tagCount
                                        ? `${profile.fileName ?? 'Tag file'} · ${profile.tagCount} tags${profile.uploadedAt ? ` · uploaded ${formatPlantDateTime(profile.uploadedAt)}` : ''}`
                                        : 'No tag file yet. The gateway cannot record without one.'}
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
                                    disabled={uploading}
                                    onClick={() => fileInput.current?.click()}
                                    sx={{ borderRadius: 2, fontWeight: 700 }}
                                >
                                    {profile.tagCount ? 'Replace file' : 'Upload file'}
                                </Button>
                                <input
                                    ref={fileInput}
                                    type="file"
                                    accept=".json,application/json"
                                    hidden
                                    onChange={(e) => void handleProfileFile(e.target.files?.[0])}
                                />
                            </Box>
                        )}
                        {profileNote && <Alert severity={profileNote.severity} sx={{ mt: 1.5 }}>{profileNote.text}</Alert>}
                        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                            A JSON file with the client's "Tags" list (and optionally ScanIntervalMs, CovRules,
                            DataCollection, MaintenanceThresholds). Anything else in the file is not stored. Its
                            contents are never shown here or on the client's PC.
                        </Typography>
                    </Box>

                    <Divider />

                    {/* The one code pasted into the installer on the client's PC. */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} mb={1}>Installation Code</Typography>
                        {installCode === null ? (
                            <Typography variant="body2" color="text.secondary">
                                {isSaved ? 'Save your changes to get the installation code.' : 'Save the client to get its installation code.'}
                            </Typography>
                        ) : (
                            <>
                                <Box
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 2,
                                        border: (theme) => `1px solid ${theme.palette.divider}`,
                                        backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '0.68rem',
                                        wordBreak: 'break-all',
                                        maxHeight: 96,
                                        overflowY: 'auto',
                                        userSelect: 'all',
                                    }}
                                >
                                    {installCode}
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
                                    <Button
                                        variant="contained"
                                        startIcon={<ContentCopyIcon />}
                                        onClick={() => { copy(installCode); setCopied(true); }}
                                        sx={{ borderRadius: 2, fontWeight: 700 }}
                                    >
                                        {copied ? 'Copied' : 'Copy installation code'}
                                    </Button>
                                    <Typography variant="caption" color="text.secondary">
                                        Paste it into the installer's "Installation code" box. It holds every key for this client:
                                        share it only with the person installing.
                                    </Typography>
                                </Box>
                                {!profile.tagCount && (
                                    <Alert severity="warning" sx={{ mt: 1.5 }}>
                                        Upload the tag file before installing: the gateway fetches it when it starts.
                                    </Alert>
                                )}
                                {!form.tunnelToken.trim() && (
                                    <Alert severity="info" sx={{ mt: 1.5 }}>
                                        No tunnel token: the dashboard will be reachable on the plant network only, and this
                                        website cannot pull from the gateway.
                                    </Alert>
                                )}
                            </>
                        )}
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button
                    onClick={onClose}
                    sx={{
                        color: (theme) => theme.palette.text.secondary,
                        transition: 'all 0.3s ease',
                    }}
                >
                    {isSaved && !unsaved ? 'Close' : 'Cancel'}
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || (isSaved && !unsaved)}
                    sx={{ transition: 'all 0.3s ease' }}
                >
                    {saving ? 'Saving…' : 'Save Client'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
