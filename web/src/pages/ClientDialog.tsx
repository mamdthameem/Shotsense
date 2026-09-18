import React, { useEffect, useState } from 'react';
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
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import type { Client } from '../types';
import { addClient, updateClient, type ClientInput } from '../services/clientService';
import { generateClientId, generateKey } from '../utils/keys';
import { licenseCheckUrl } from '../firebase';

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
});

/** Add/Edit client dialog — registry fields, keys, and the config snippet the
 *  client installation must be configured with. */
export const ClientDialog: React.FC<Props> = ({ open, editingClient, onClose }) => {
    const [form, setForm] = useState<FormState>(emptyForm());
    const [newId, setNewId] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setForm(editingClient ? fromClient(editingClient) : emptyForm());
            setNewId(editingClient ? '' : generateClientId());
            setError(null);
        }
    }, [open, editingClient]);

    const clientId = editingClient?.id ?? newId;

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm(prev => ({ ...prev, [key]: value }));

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
        };
        setSaving(true);
        setError(null);
        try {
            if (editingClient) {
                await updateClient(editingClient.id, input);
            } else {
                await addClient(newId, input);
            }
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

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

    const configSnippet = [
        `"License": {`,
        `  "CheckUrl": "${licenseCheckUrl(clientId)}",`,
        `  "Key": "${form.licenseKey}"`,
        `},`,
        `"Admin": {`,
        `  "ApiKey": "${form.adminApiKey}"`,
        `}`,
    ].join('\n');

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
                {editingClient ? 'Edit Client' : 'Add New Client'}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
                    {error && <Alert severity="error">{error}</Alert>}

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

                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle2" fontWeight={700}>
                                Client Installation Config
                            </Typography>
                            <Tooltip title="Copy snippet">
                                <IconButton size="small" onClick={() => copy(configSnippet)}>
                                    <ContentCopyIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                        <Box
                            component="pre"
                            sx={{
                                m: 0,
                                p: 2,
                                borderRadius: 2,
                                border: (theme) => `1px solid ${theme.palette.divider}`,
                                backgroundColor: (theme) => theme.palette.mode === 'dark'
                                    ? 'rgba(255,255,255,0.03)'
                                    : 'rgba(0,0,0,0.03)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.72rem',
                                overflowX: 'auto',
                                userSelect: 'text',
                            }}
                        >
                            {configSnippet}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            Client ID: <code>{clientId}</code> — paste these values into the client installation's settings.
                        </Typography>
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
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving}
                    sx={{ transition: 'all 0.3s ease' }}
                >
                    {saving ? 'Saving…' : 'Save Client'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
