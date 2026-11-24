import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';

import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { CONFIG } from 'src/config-global';
import { homeFor, useAuth } from 'src/lib/auth';
import { api, errorText, isThaiMobile, normalizePhone } from 'src/lib/api';

import { PinPad } from '../shared/keypad';
import { OtpField, AuthShell } from './login-view';

// ----------------------------------------------------------------------

/** First use of an account HR created: phone → OTP → choose PIN twice. */
export function ActivateView() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp' | 'pin' | 'confirm'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<{ otpId: string; code?: string } | null>(null);
  const [code, setCode] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);

  const sendOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      setOtp(await api.activateOtp(normalizePhone(phone)));
      setStep('otp');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onPin = async (pin: string) => {
    setReset((n) => n + 1);
    if (step === 'pin') {
      setFirst(pin);
      setError(null);
      setStep('confirm');
      return;
    }
    if (pin !== first) {
      setError('PIN ไม่ตรงกัน ตั้งใหม่อีกครั้ง');
      setStep('pin');
      return;
    }
    setBusy(true);
    try {
      const me = await signIn(await api.activate(otp!.otpId, code, pin));
      navigate(homeFor(me), { replace: true });
    } catch (e) {
      setError(errorText(e));
      setStep(String((e as { code?: string }).code ?? '').startsWith('OTP_') ? 'otp' : 'pin');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="เปิดใช้งานบัญชี">
      {step === 'phone' && (
        <Stack spacing={2.5}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            ใช้เบอร์โทรที่ให้ไว้กับฝ่ายบุคคล
          </Typography>
          <TextField label="เบอร์โทรศัพท์" placeholder="08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} inputProps={{ inputMode: 'tel' }} autoFocus fullWidth />
          {error && <Alert severity="error">{error}</Alert>}
          <LoadingButton size="large" variant="contained" loading={busy} disabled={!isThaiMobile(phone)} onClick={sendOtp}>
            ขอรหัส OTP
          </LoadingButton>
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            <Link component={RouterLink} to="/login">
              กลับไปเข้าสู่ระบบ
            </Link>
          </Typography>
        </Stack>
      )}
      {step === 'otp' && (
        <Stack spacing={2.5}>
          <OtpField value={code} onChange={setCode} error={!!error} />
          {CONFIG.sandbox && otp?.code && <Alert severity="info">Sandbox: รหัสคือ {otp.code}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <LoadingButton size="large" variant="contained" disabled={code.length !== 6} onClick={() => { setError(null); setStep('pin'); }}>
            ถัดไป
          </LoadingButton>
        </Stack>
      )}
      {(step === 'pin' || step === 'confirm') && (
        <PinPad
          title={step === 'pin' ? 'ตั้ง PIN 6 หลัก' : 'ยืนยัน PIN อีกครั้ง'}
          onComplete={onPin}
          error={error}
          resetKey={reset}
          disabled={busy}
        />
      )}
    </AuthShell>
  );
}
