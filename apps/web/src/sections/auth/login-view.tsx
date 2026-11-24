import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { CONFIG } from 'src/config-global';
import { homeFor, useAuth } from 'src/lib/auth';
import { api, errorText, isThaiMobile, normalizePhone } from 'src/lib/api';

import { Logo } from 'src/components/logo';

import { PinPad } from '../shared/keypad';

// ----------------------------------------------------------------------

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.neutral' }}>
      <Card sx={{ p: { xs: 3, sm: 5 }, width: 1, maxWidth: 440 }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Logo />
            <Typography variant="h5">{title}</Typography>
          </Stack>
          {children}
        </Stack>
      </Card>
    </Box>
  );
}

/** Six-box OTP entry (one input; digits shown in boxes). */
export function OtpField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      label="รหัส OTP 6 หลัก"
      autoFocus
      error={error}
      inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, style: { letterSpacing: 12, fontSize: 24, textAlign: 'center' } }}
      fullWidth
    />
  );
}

// ----------------------------------------------------------------------

/** Phone → PIN → (OTP on a new device). Used by HR, shops and employees on the web. */
export function LoginView({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [step, setStep] = useState<'phone' | 'pin' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<{ otpId: string; masked: string; code?: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);

  const finish = async (t: { accessToken: string; refreshToken: string }) => {
    const me = await signIn(t);
    if (onDone) onDone();
    else navigate(homeFor(me), { replace: true });
  };

  const submitPin = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(normalizePhone(phone), pin);
      if (r.otpRequired) {
        setOtp({ otpId: r.otpId, masked: r.maskedPhone, code: r.code });
        setStep('otp');
      } else await finish(r);
    } catch (e) {
      setError(errorText(e));
      setReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      await finish(await api.loginVerify(otp!.otpId, code));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="เข้าสู่ระบบ">
      {step === 'phone' && (
        <Stack spacing={2.5} component="form" onSubmit={(e) => { e.preventDefault(); if (isThaiMobile(phone)) setStep('pin'); }}>
          <TextField label="เบอร์โทรศัพท์" placeholder="08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} inputProps={{ inputMode: 'tel', autoComplete: 'tel' }} autoFocus fullWidth />
          <Button type="submit" size="large" variant="contained" disabled={!isThaiMobile(phone)}>
            ถัดไป
          </Button>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            ใช้ครั้งแรก?{' '}
            <Link component={RouterLink} to="/activate">
              เปิดใช้งานบัญชี
            </Link>
          </Typography>
        </Stack>
      )}

      {step === 'pin' && (
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            {normalizePhone(phone)} ·{' '}
            <Link component="button" type="button" onClick={() => setStep('phone')}>
              เปลี่ยน
            </Link>
          </Typography>
          <PinPad onComplete={submitPin} error={error} resetKey={reset} disabled={busy} />
        </Stack>
      )}

      {step === 'otp' && otp && (
        <Stack spacing={2.5}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            เครื่องนี้ยังไม่เคยเข้าสู่ระบบ ส่งรหัส OTP ไปที่ <strong>{otp.masked}</strong> แล้ว
          </Typography>
          <OtpField value={code} onChange={setCode} error={!!error} />
          {CONFIG.sandbox && otp.code && <Alert severity="info">Sandbox: รหัสคือ {otp.code}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <LoadingButton size="large" variant="contained" loading={busy} disabled={code.length !== 6} onClick={submitOtp}>
            ยืนยัน
          </LoadingButton>
        </Stack>
      )}
    </AuthShell>
  );
}
