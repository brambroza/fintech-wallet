import { useRef, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import List from '@mui/material/List';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';
import LinearProgress from '@mui/material/LinearProgress';

import { useAuth } from 'src/lib/auth';
import { api, baht, newKey, type Tx, ApiError, toSatang, errorText } from 'src/lib/api';

import { Iconify } from 'src/components/iconify';

import { QrScan } from '../shared/qr-scan';
import { Keypad, PinPad, pushAmountKey, displayAmount } from '../shared/keypad';

// ----------------------------------------------------------------------

type Target = { merchantId: string; merchantName: string; amount: number | null; chargeId: string | null };
type Step = { s: 'home' } | { s: 'scan' } | { s: 'amount'; t: Target } | { s: 'pin'; t: Target; amount: number } | { s: 'done'; tx: Tx; name: string };

const TYPE_LABEL: Record<string, string> = {
  purchase: 'ซื้ออาหาร',
  welfare: 'สวัสดิการ',
  payroll_settle: 'หักเงินเดือนแล้ว',
  topup: 'เติมเงิน',
  refund: 'คืนเงิน',
  offboard: 'ปิดบัญชี (ลาออก)',
};

/**
 * Employee pages (LINE LIFF and browser). `scan` lets LIFF use LINE's own scanner;
 * otherwise the camera scanner is used.
 */
export function EmployeeApp({ channel, scan }: { channel: 'liff' | 'app'; scan?: () => Promise<string | null> }) {
  const { me, reload, signOut } = useAuth();
  const [step, setStep] = useState<Step>({ s: 'home' });
  const [history, setHistory] = useState<Tx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);
  const [amount, setAmount] = useState('');
  const key = useRef(newKey());

  const load = useCallback(() => {
    reload();
    api.myTx().then((r) => setHistory(r.items)).catch(() => {});
  }, [reload]);
  useEffect(load, [load]);

  const w = me?.wallet;
  if (!me) return <LinearProgress />;
  if (!w) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">บัญชีนี้ยังไม่ได้เป็นพนักงานของบริษัทไหน ติดต่อฝ่ายบุคคล</Alert>
        <Button sx={{ mt: 2 }} onClick={signOut}>
          ออกจากระบบ
        </Button>
      </Box>
    );
  }

  const onQr = async (qr: string) => {
    setError(null);
    try {
      const t = await api.resolve(qr);
      key.current = newKey();
      setAmount('');
      setStep(t.amount ? { s: 'pin', t, amount: t.amount } : { s: 'amount', t });
    } catch (e) {
      setError(errorText(e));
      setStep({ s: 'home' });
    }
  };

  const startScan = async () => {
    setError(null);
    if (scan) {
      try {
        const v = await scan();
        if (v) await onQr(v);
        return;
      } catch {
        /* fall back to camera */
      }
    }
    setStep({ s: 'scan' });
  };

  const pay = async (pin: string) => {
    if (step.s !== 'pin') return;
    setBusy(true);
    setError(null);
    try {
      const tx = await api.pay({ merchantId: step.t.merchantId, chargeId: step.t.chargeId, amount: step.amount, pin, idempotencyKey: key.current, channel });
      setStep({ s: 'done', tx, name: step.t.merchantName });
      load();
    } catch (e) {
      setError(errorText(e));
      setReset((n) => n + 1);
      if (e instanceof ApiError && e.code !== 'PIN_INVALID') setStep({ s: 'home' });
    } finally {
      setBusy(false);
    }
  };

  const wrap = (children: React.ReactNode) => <Box sx={{ minHeight: '100dvh', bgcolor: 'background.neutral', p: 2, maxWidth: 480, mx: 'auto' }}>{children}</Box>;

  if (step.s === 'scan') {
    return wrap(
      <Stack spacing={2}>
        <Typography variant="h5">สแกน QR ที่ร้าน</Typography>
        <QrScan onResult={onQr} />
        <Button size="large" color="inherit" onClick={() => setStep({ s: 'home' })}>
          ยกเลิก
        </Button>
      </Stack>
    );
  }

  if (step.s === 'amount') {
    const amt = toSatang(amount || '0') ?? 0;
    return wrap(
      <Stack spacing={2}>
        <Typography variant="h5">จ่ายให้ {step.t.merchantName}</Typography>
        <Typography variant="h1" sx={{ textAlign: 'center' }}>
          ฿{displayAmount(amount)}
        </Typography>
        <Typography variant="body2" sx={{ textAlign: 'center', color: amt > w.available ? 'error.main' : 'text.secondary' }}>
          ใช้ได้ {baht(w.available)}
        </Typography>
        <Keypad extra="." onKey={(k) => setAmount((v) => pushAmountKey(v, k))} onDelete={() => setAmount((v) => v.slice(0, -1))} />
        <Button size="large" variant="contained" disabled={!amt || amt > w.available} onClick={() => setStep({ s: 'pin', t: step.t, amount: amt })}>
          ถัดไป
        </Button>
        <Button color="inherit" onClick={() => setStep({ s: 'home' })}>
          ยกเลิก
        </Button>
      </Stack>
    );
  }

  if (step.s === 'pin') {
    return wrap(
      <Stack spacing={3} sx={{ pt: 2 }}>
        <Card sx={{ p: 2.5, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            จ่ายให้
          </Typography>
          <Typography variant="h5">{step.t.merchantName}</Typography>
          <Typography variant="h2" sx={{ mt: 1 }}>
            {baht(step.amount)}
          </Typography>
        </Card>
        <PinPad title="ใส่ PIN เพื่อยืนยัน" onComplete={pay} error={error} resetKey={reset} disabled={busy} />
        <Button color="inherit" onClick={() => setStep({ s: 'home' })}>
          ยกเลิก
        </Button>
      </Stack>
    );
  }

  if (step.s === 'done') {
    return wrap(
      <Stack spacing={2} alignItems="center" sx={{ pt: 8 }}>
        <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: 'success.lighter', color: 'success.dark', display: 'grid', placeItems: 'center' }}>
          <Iconify icon="solar:check-circle-bold" width={64} />
        </Box>
        <Typography variant="h4">จ่ายแล้ว {baht(step.tx.amount)}</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          {step.name} · {new Date(step.tx.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </Typography>
        <Button size="large" variant="contained" onClick={() => setStep({ s: 'home' })} sx={{ mt: 2 }}>
          เสร็จสิ้น
        </Button>
      </Stack>
    );
  }

  const usedPct = Math.min(100, (w.spentToday / w.dailyLimit) * 100);
  return wrap(
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="subtitle1">{me.displayName}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {w.orgName}
          </Typography>
        </Box>
        <Button size="small" color="inherit" onClick={signOut}>
          ออก
        </Button>
      </Stack>

      <Card sx={{ p: 2.5, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          ใช้ได้
        </Typography>
        <Typography variant="h2">{baht(w.available)}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {w.mode === 'credit'
            ? w.balance >= 0
              ? `สวัสดิการคงเหลือ ${baht(w.balance)} · วงเงินใช้เกิน ${baht(w.creditLimit)}`
              : `ใช้เกินสวัสดิการ ${baht(-w.balance)} (หักเงินเดือนรอบนี้)`
            : `ยอดเงินคงเหลือ`}
        </Typography>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      <Button size="large" variant="contained" onClick={startScan} startIcon={<Iconify icon="solar:qr-code-bold" width={28} />} sx={{ height: 64, typography: 'h5' }}>
        สแกนจ่าย
      </Button>

      <Card sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2">ใช้วันนี้ {baht(w.spentToday)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            วงเงินต่อวัน {baht(w.dailyLimit)}
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={usedPct} sx={{ mt: 1, height: 8, borderRadius: 1 }} />
      </Card>

      <Card>
        <Typography variant="subtitle1" sx={{ px: 2, pt: 2 }}>
          รายการล่าสุด
        </Typography>
        <List>
          {history.map((t) => (
            <ListItem key={t.id} divider>
              <ListItemText
                primary={t.type === 'purchase' ? (t.counterparty?.name ?? 'ร้านค้า') : t.type === 'refund' ? `คืนเงิน · ${t.counterparty?.name ?? ''}` : TYPE_LABEL[t.type] ?? t.type}
                secondary={new Date(t.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              />
              <Typography variant="subtitle1" sx={{ color: t.delta > 0 ? 'success.main' : 'text.primary' }}>
                {baht(t.delta, true)}
              </Typography>
            </ListItem>
          ))}
          {!history.length && (
            <Typography variant="body2" sx={{ color: 'text.secondary', p: 2 }}>
              ยังไม่มีรายการ
            </Typography>
          )}
        </List>
      </Card>
    </Stack>
  );
}
