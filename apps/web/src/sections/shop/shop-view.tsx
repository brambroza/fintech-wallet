import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import List from '@mui/material/List';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import ListItem from '@mui/material/ListItem';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { useAuth } from 'src/lib/auth';
import { api, baht, newKey, type Tx, ApiError, toSatang, errorText, type QuickAmount } from 'src/lib/api';

import { Logo } from 'src/components/logo';
import { Iconify } from 'src/components/iconify';

import { QrScan } from '../shared/qr-scan';
import { Keypad, PinPad, pushAmountKey, displayAmount } from '../shared/keypad';

// ----------------------------------------------------------------------

type ShopInfo = Awaited<ReturnType<typeof api.shop>>;

function AmountEntry({ value, onChange, onNext, label }: { value: string; onChange: (v: string) => void; onNext: () => void; label: string }) {
  const amt = toSatang(value || '0') ?? 0;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (/^[\d.]$/.test(e.key)) onChange(pushAmountKey(value, e.key));
      else if (e.key === 'Backspace') onChange(value.slice(0, -1));
      else if (e.key === 'Enter' && amt) onNext();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [value, amt, onChange, onNext]);
  return (
    <Stack spacing={2}>
      <Typography variant="h1" sx={{ textAlign: 'center', fontSize: { xs: 48, md: 64 } }} aria-live="polite">
        ฿{displayAmount(value)}
      </Typography>
      <Keypad extra="." size={72} onKey={(k) => onChange(pushAmountKey(value, k))} onDelete={() => onChange(value.slice(0, -1))} />
      <Button size="large" variant="contained" disabled={!amt} onClick={onNext} sx={{ height: 56, typography: 'h6' }}>
        {label}
      </Button>
    </Stack>
  );
}

function Paid({ amount, payer, onNext }: { amount: number; payer?: string | null; onNext: () => void }) {
  useEffect(() => {
    const t = setTimeout(onNext, 4000);
    return () => clearTimeout(t);
  }, [onNext]);
  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
      <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: 'success.lighter', color: 'success.dark', display: 'grid', placeItems: 'center' }}>
        <Iconify icon="solar:check-circle-bold" width={64} />
      </Box>
      <Typography variant="h3">รับเงินแล้ว {baht(amount)}</Typography>
      {payer && <Typography variant="h6" sx={{ color: 'text.secondary' }}>{payer}</Typography>}
      <Button variant="contained" size="large" onClick={onNext}>
        รายการถัดไป
      </Button>
    </Stack>
  );
}

// ---------- mode 1: shop shows a one-time QR, employee scans it ----------
function ChargeMode({ onPaid, quick, onEditQuick }: { onPaid: () => void; quick: QuickAmount[]; onEditQuick: () => void }) {
  const [value, setValue] = useState('');
  const [charge, setCharge] = useState<{ chargeId: string; qr: string; amount: number; expiresAt: string } | null>(null);
  const [status, setStatus] = useState<{ status: string; payer: string | null } | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setCharge(null);
    setStatus(null);
    setValue('');
    setError(null);
  }, []);

  const create = async (amount = toSatang(value)!) => {
    setError(null);
    try {
      const c = await api.createCharge(amount);
      setLeft(Math.max(0, Math.round((new Date(c.expiresAt).getTime() - Date.now()) / 1000)));
      setCharge(c);
    } catch (e) {
      setError(errorText(e));
    }
  };

  useEffect(() => {
    if (!charge || status?.status === 'paid') return undefined;
    const tick = setInterval(async () => {
      setLeft(Math.max(0, Math.round((new Date(charge.expiresAt).getTime() - Date.now()) / 1000)));
      try {
        const s = await api.charge(charge.chargeId);
        if (s.status !== 'open') {
          setStatus(s);
          if (s.status === 'paid') onPaid();
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(tick);
  }, [charge, status, onPaid]);

  if (charge && status?.status === 'paid') return <Paid amount={charge.amount} payer={status.payer} onNext={reset} />;

  if (charge) {
    const expired = status?.status === 'expired' || status?.status === 'cancelled';
    return (
      <Stack spacing={2} alignItems="center">
        <Typography variant="h2">{baht(charge.amount)}</Typography>
        <Box sx={{ p: 2, bgcolor: 'common.white', borderRadius: 2, opacity: expired ? 0.2 : 1 }}>
          <QRCodeSVG value={charge.qr} size={280} level="M" />
        </Box>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          {expired ? 'QR หมดอายุแล้ว' : `ให้พนักงานสแกนด้วย LINE หรือแอป · เหลือ ${left} วินาที`}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            color="inherit"
            onClick={async () => {
              await api.cancelCharge(charge.chargeId).catch(() => {});
              reset();
            }}
          >
            ยกเลิก
          </Button>
          {expired && (
            <Button variant="contained" onClick={() => create(charge.amount)}>
              สร้าง QR ใหม่
            </Button>
          )}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {quick.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1 }}>
          {quick.map((q) => (
            <Button key={`${q.label}-${q.amount}`} variant="outlined" color="inherit" onClick={() => create(q.amount)} sx={{ py: 1.5, flexDirection: 'column', lineHeight: 1.3 }}>
              <Typography variant="subtitle1" noWrap sx={{ maxWidth: 1 }}>
                {q.label}
              </Typography>
              <Typography variant="h6">{baht(q.amount)}</Typography>
            </Button>
          ))}
        </Box>
      )}
      <AmountEntry value={value} onChange={setValue} onNext={() => create()} label="แสดง QR รับเงิน" />
      <Button size="small" color="inherit" onClick={onEditQuick} startIcon={<Iconify icon="solar:pen-bold" />}>
        {quick.length ? 'แก้ปุ่มราคาด่วน' : 'ตั้งปุ่มราคาด่วน เช่น ข้าว 1 อย่าง 35 บาท'}
      </Button>
    </Stack>
  );
}

// ---------- mode 2: employee without phone — scan badge, employee types PIN ----------
function BadgeMode({ onPaid }: { onPaid: () => void }) {
  const [step, setStep] = useState<'amount' | 'scan' | 'pin' | 'done'>('amount');
  const [value, setValue] = useState('');
  const [badge, setBadge] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState<Tx | null>(null);
  const key = useRef(newKey());
  const scanInput = useRef<HTMLInputElement>(null);

  const restart = useCallback(() => {
    setStep('amount');
    setValue('');
    setBadge('');
    setTyped('');
    setError(null);
    setPaid(null);
    key.current = newKey();
  }, []);

  useEffect(() => {
    if (step === 'scan') setTimeout(() => scanInput.current?.focus(), 50);
  }, [step]);

  const gotBadge = (v: string) => {
    if (!v.startsWith('CWB1:')) {
      setError('นี่ไม่ใช่บัตรพนักงาน');
      return;
    }
    setError(null);
    setBadge(v);
    setStep('pin');
  };

  const pay = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const t = await api.badgePay({ badge, amount: toSatang(value)!, pin, idempotencyKey: key.current });
      setPaid(t);
      setStep('done');
      onPaid();
    } catch (e) {
      setError(errorText(e));
      setReset((n) => n + 1);
      if (e instanceof ApiError && !['PIN_INVALID'].includes(e.code)) setTimeout(restart, 2500);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done' && paid) return <Paid amount={paid.amount} payer={paid.counterparty?.name} onNext={restart} />;

  return (
    <Stack spacing={2}>
      {step === 'amount' && <AmountEntry value={value} onChange={setValue} onNext={() => setStep('scan')} label="ถัดไป: สแกนบัตร" />}
      {step === 'scan' && (
        <>
          <Typography variant="h4" sx={{ textAlign: 'center' }}>
            {baht(toSatang(value)!)} · สแกนบัตรพนักงาน
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <QrScan onResult={gotBadge} />
          <TextField
            inputRef={scanInput}
            label="หรือใช้เครื่องสแกนบาร์โค้ด (ยิงที่ช่องนี้)"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed) {
                gotBadge(typed.trim());
                setTyped('');
              }
            }}
            autoComplete="off"
          />
          <Button color="inherit" onClick={restart}>
            ยกเลิก
          </Button>
        </>
      )}
      {step === 'pin' && (
        <>
          <Alert severity="info">ยื่นเครื่องให้พนักงานกด PIN เอง · {baht(toSatang(value)!)}</Alert>
          <PinPad title="พนักงานใส่ PIN" onComplete={pay} error={error} resetKey={reset} disabled={busy} />
          <Button color="inherit" onClick={restart}>
            ยกเลิก
          </Button>
        </>
      )}
    </Stack>
  );
}


// ---------- preset price buttons ----------
function QuickEditor({ open, items, onClose, onSaved }: { open: boolean; items: QuickAmount[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<{ label: string; price: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setRows(items.length ? items.map((i) => ({ label: i.label, price: String(i.amount / 100) })) : [{ label: '', price: '' }]);
      setError(null);
    }
  }, [open, items]);

  const filled = rows.filter((r) => r.label.trim() || r.price.trim());
  const valid = filled.every((r) => r.label.trim() && toSatang(r.price));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setQuickAmounts(filled.map((r) => ({ label: r.label.trim(), amount: toSatang(r.price)! })));
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>ปุ่มราคาด่วน</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {rows.map((r, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                label="ชื่อปุ่ม"
                value={r.label}
                inputProps={{ maxLength: 30 }}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                sx={{ flex: 2 }}
              />
              <TextField
                size="small"
                label="ราคา (บาท)"
                value={r.price}
                inputProps={{ inputMode: 'decimal' }}
                error={!!r.price && !toSatang(r.price)}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                sx={{ flex: 1 }}
              />
              <IconButton aria-label="ลบปุ่ม" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Iconify icon="solar:trash-bin-trash-bold" />
              </IconButton>
            </Stack>
          ))}
          {rows.length < 12 && (
            <Button color="inherit" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setRows([...rows, { label: '', price: '' }])}>
              เพิ่มปุ่ม
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button variant="contained" disabled={!valid || busy} onClick={save}>
          บันทึก
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- today's list + refund ----------
const CHANNEL: Record<string, string> = { badge: 'บัตร', liff: 'LINE', app: 'แอป', manual: 'บันทึกย้อนหลัง' };
const REFUND_HOURS = 24;

function TodayList({ items, onChanged }: { items: Tx[]; onChanged: () => void }) {
  const [target, setTarget] = useState<Tx | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doRefund = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api.refund(target.id, reason.trim());
      setTarget(null);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const label = (t: Tx) => {
    if (t.type === 'merchant_payout') return 'บริษัทจ่ายเงินร้าน';
    if (t.type === 'refund') return `คืนเงิน · ${t.counterparty?.name ?? ''}`;
    return t.counterparty?.name ?? '';
  };
  const canRefund = (t: Tx) => t.type === 'purchase' && !t.refunded && Date.now() - new Date(t.createdAt).getTime() < REFUND_HOURS * 3600_000;

  return (
    <>
      <List disablePadding>
        {items.map((t) => (
          <ListItem
            key={t.id}
            divider
            disableGutters
            secondaryAction={
              canRefund(t) ? (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => {
                    setTarget(t);
                    setReason('');
                    setError(null);
                  }}
                >
                  คืนเงิน
                </Button>
              ) : undefined
            }
            sx={{ pr: canRefund(t) ? 9 : 0 }}
          >
            <ListItemText
              primary={label(t)}
              secondary={`${new Date(t.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}${t.channel ? ` · ${CHANNEL[t.channel] ?? ''}` : ''}${t.refunded ? ' · คืนเงินแล้ว' : ''}`}
            />
            <Typography
              variant="subtitle1"
              sx={{ color: t.delta < 0 || t.refunded ? 'text.secondary' : 'text.primary', textDecoration: t.refunded ? 'line-through' : 'none', ml: 1 }}
            >
              {baht(t.delta, true)}
            </Typography>
          </ListItem>
        ))}
        {!items.length && (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
            ยังไม่มีรายการวันนี้
          </Typography>
        )}
      </List>
      <Dialog open={!!target} onClose={() => setTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>คืนเงิน {target ? baht(target.amount) : ''}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              คืนเงินเต็มจำนวนให้ <b>{target?.counterparty?.name}</b> ยอดจะกลับเข้าบัญชีพนักงานทันที และหักออกจากยอดที่บริษัทค้างจ่ายร้าน ทำแล้วยกเลิกไม่ได้
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="เหตุผล (ไม่บังคับ)" placeholder="เช่น กดยอดผิด" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 100 }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setTarget(null)}>
            ไม่คืน
          </Button>
          <Button variant="contained" color="error" disabled={busy} onClick={doRefund}>
            ยืนยันคืนเงิน
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ----------------------------------------------------------------------

export function ShopView() {
  const { signOut } = useAuth();
  const [info, setInfo] = useState<ShopInfo | null>(null);
  const [tab, setTab] = useState<'qr' | 'badge' | 'today'>('qr');
  const [today, setToday] = useState<Tx[]>([]);
  const [editQuick, setEditQuick] = useState(false);

  const load = useCallback(() => {
    api.shop().then(setInfo).catch(() => {});
    api.shopTx().then(setToday).catch(() => {});
  }, []);
  useEffect(load, [load]);

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.neutral' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Logo width={32} height={32} disableLink />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>
            {info?.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            วันนี้ {info ? `${baht(info.today.total)} · ${info.today.count} รายการ` : ''}
          </Typography>
        </Box>
        <Button size="small" color="inherit" onClick={signOut}>
          ออก
        </Button>
      </Stack>
      <Box sx={{ maxWidth: 520, mx: 'auto', p: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 2 }}>
          <Tab value="qr" label="QR รับเงิน" />
          <Tab value="badge" label="สแกนบัตร" />
          <Tab value="today" label="ยอดวันนี้" />
        </Tabs>
        <Card sx={{ p: { xs: 2, sm: 3 } }}>
          {tab === 'qr' && <ChargeMode onPaid={load} quick={info?.quickAmounts ?? []} onEditQuick={() => setEditQuick(true)} />}
          {tab === 'badge' && <BadgeMode onPaid={load} />}
          {tab === 'today' && (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="h5">{info ? baht(info.today.total) : ''}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  บริษัทค้างจ่ายร้าน {info ? baht(info.payable) : ''}
                </Typography>
              </Stack>
              <TodayList items={today} onChanged={load} />
              {info && (
                <Stack alignItems="center" spacing={1} sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2">QR ประจำร้าน (พนักงานกรอกยอดเอง)</Typography>
                  <QRCodeSVG value={info.staticQr} size={160} />
                  <Button size="small" onClick={() => window.print()} startIcon={<Iconify icon="solar:printer-linear" />}>
                    พิมพ์ติดหน้าร้าน
                  </Button>
                </Stack>
              )}
            </Stack>
          )}
        </Card>
      </Box>
      <QuickEditor open={editQuick} items={info?.quickAmounts ?? []} onClose={() => setEditQuick(false)} onSaved={load} />
    </Box>
  );
}
