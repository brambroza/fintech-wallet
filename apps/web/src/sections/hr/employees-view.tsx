import { QRCodeSVG } from 'qrcode.react';
import { Link as RouterLink } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Menu from '@mui/material/Menu';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import TableRow from '@mui/material/TableRow';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import InputAdornment from '@mui/material/InputAdornment';
import TableContainer from '@mui/material/TableContainer';

import { parseCsv } from 'src/lib/csv';
import { PageHeader } from 'src/layouts/hr-layout';
import { api, baht, newKey, toSatang, type Org, type Shop, errorText, type Employee, normalizePhone } from 'src/lib/api';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { PinPad } from '../shared/keypad';

// ----------------------------------------------------------------------

type Row = { code: string; name: string; department: string; phone: string };

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { code: string; message: string }[] } | null>(null);

  const rows: Row[] = parseCsv(text)
    .filter((r, i) => !(i === 0 && /รหัส|code/i.test(r[0] ?? '')))
    .map((r) => ({ code: r[0] ?? '', name: r[1] ?? '', department: r[2] ?? '', phone: normalizePhone(r[3] ?? '') }));
  const bad = rows.filter((r) => !r.code || !r.name || (r.phone && !/^0[689]\d{8}$/.test(r.phone)));

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.importEmployees(rows.map((x) => ({ code: x.code, name: x.name, department: x.department || null, phone: x.phone || null })));
      setResult(r);
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setText('');
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <DialogTitle>นำเข้ารายชื่อพนักงาน</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            วางจาก Excel หรือเลือกไฟล์ CSV · คอลัมน์: <strong>รหัสพนักงาน, ชื่อ-นามสกุล, แผนก, เบอร์โทร</strong> (เบอร์เว้นว่างได้ สำหรับคนใช้บัตรอย่างเดียว) · รหัสเดิมจะอัปเดตข้อมูล
          </Typography>
          <Button component="label" variant="outlined" startIcon={<Iconify icon="solar:upload-linear" />} sx={{ alignSelf: 'flex-start' }}>
            เลือกไฟล์ CSV
            <input hidden type="file" accept=".csv,text/csv" onChange={async (e) => setText(await (e.target.files?.[0]?.text() ?? Promise.resolve('')))} />
          </Button>
          <TextField multiline minRows={6} maxRows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'E001,สมชาย ใจดี,ผลิต,0812345678\nE002,สมหญิง รักงาน,QC,'} fullWidth />
          {!!rows.length && (
            <Alert severity={bad.length ? 'warning' : 'info'}>
              พบ {rows.length.toLocaleString('th-TH')} คน{bad.length ? ` · ข้อมูลไม่ครบหรือเบอร์ไม่ถูกต้อง ${bad.length} แถว (เช่น ${bad[0].code || '(ไม่มีรหัส)'})` : ''}
            </Alert>
          )}
          {result && (
            <Alert severity={result.errors.length ? 'warning' : 'success'}>
              เพิ่มใหม่ {result.created} · อัปเดต {result.updated}
              {result.errors.map((e) => (
                <div key={e.code}>
                  {e.code}: {e.message}
                </div>
              ))}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="inherit">
          ปิด
        </Button>
        <LoadingButton variant="contained" loading={busy} disabled={!rows.length || !!bad.length || !!result} onClick={submit}>
          นำเข้า {rows.length ? rows.length.toLocaleString('th-TH') : ''} คน
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}


// ---------- employee leaves ----------
function OffboardDialog({ e, mode, onClose, onDone }: { e: Employee | null; mode: Org['moneyMode'] | undefined; onClose: () => void; onDone: () => void }) {
  const [leftover, setLeftover] = useState<'cash_out' | 'forfeit'>('forfeit');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (e) setLeftover(mode === 'prepaid' ? 'cash_out' : 'forfeit');
  }, [e, mode]);

  const submit = async () => {
    if (!e) return;
    setBusy(true);
    try {
      const r = await api.offboard(e.id, leftover);
      if (r.finalDeduct) toast.success(`ทำเรื่องลาออกแล้ว · หักเงินเดือนงวดสุดท้าย ${baht(r.finalDeduct)} (อยู่ในหน้าหักเงินเดือน)`);
      else if (r.moved && r.leftover === 'cash_out') toast.success(`ทำเรื่องลาออกแล้ว · จ่ายเงินสดคืนพนักงาน ${baht(r.moved)}`);
      else toast.success('ทำเรื่องลาออกแล้ว');
      onDone();
      onClose();
    } catch (x) {
      toast.error(errorText(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!e} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>ทำเรื่องลาออก · {e?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">บัญชีและบัตร QR ของพนักงานจะใช้จ่ายไม่ได้ทันที</Typography>
          {e && e.balance < 0 && (
            <Alert severity="warning">
              ค้างชำระ <b>{baht(-e.balance)}</b> ยอดนี้จะอยู่ในหน้า &quot;หักเงินเดือน&quot; ให้หักจากเงินเดือนงวดสุดท้าย แล้วกดบันทึกว่าหักแล้วตามปกติ
            </Alert>
          )}
          {e && e.balance === 0 && <Alert severity="info">ไม่มียอดคงค้าง</Alert>}
          {e && e.balance > 0 && (
            <>
              <Alert severity="info">
                มียอดคงเหลือ <b>{baht(e.balance)}</b> เลือกว่าจะจัดการอย่างไร
              </Alert>
              <RadioGroup value={leftover} onChange={(ev) => setLeftover(ev.target.value as 'cash_out' | 'forfeit')}>
                <FormControlLabel value="cash_out" control={<Radio />} label={`จ่ายเงินสดคืนพนักงาน ${baht(e.balance)} ที่ฝ่ายบุคคล`} />
                <FormControlLabel value="forfeit" control={<Radio />} label="คืนเป็นงบสวัสดิการบริษัท (ไม่จ่ายเงินสด)" />
              </RadioGroup>
              {mode === 'prepaid' && leftover === 'forfeit' && (
                <Alert severity="warning">โหมดเติมเงินล่วงหน้า ยอดนี้อาจเป็นเงินที่พนักงานเติมเอง ควรจ่ายเงินสดคืน</Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          ยกเลิก
        </Button>
        <LoadingButton variant="contained" color="error" loading={busy} onClick={submit}>
          ยืนยันลาออก
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}

// ---------- back-entry of paper slips after an outage ----------
function ManualPurchaseDialog({ e, onClose, onDone }: { e: Employee | null; onClose: () => void; onDone: () => void }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [f, setF] = useState({ shop: '', amount: '', note: '', key: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!e) return;
    setF({ shop: '', amount: '', note: '', key: newKey() });
    api
      .shops()
      .then((s) => setShops(s.filter((x) => x.status === 'active')))
      .catch(() => {});
  }, [e]);

  const amt = toSatang(f.amount);
  const submit = async () => {
    if (!e || !amt) return;
    setBusy(true);
    try {
      await api.manualPurchase({ memberId: e.id, merchantId: f.shop, amount: amt, note: f.note.trim(), idempotencyKey: f.key });
      toast.success(`บันทึก ${baht(amt)} ให้ ${e.name} แล้ว`);
      onDone();
      onClose();
    } catch (x) {
      toast.error(errorText(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!e} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>บันทึกรายการย้อนหลัง · {e?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            ใช้กับใบจดที่พนักงานเซ็นไว้ตอนระบบขัดข้องเท่านั้น ไม่ต้องใช้ PIN และไม่นับวงเงินต่อวัน
          </Typography>
          <TextField select label="ร้าน" value={f.shop} onChange={(ev) => setF({ ...f, shop: ev.target.value })}>
            {shops.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="จำนวนเงิน (บาท)" value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} inputProps={{ inputMode: 'decimal' }} />
          <TextField
            label="เลขที่ใบจด / วันที่"
            placeholder="เช่น ใบที่ 12 · 24/11"
            value={f.note}
            onChange={(ev) => setF({ ...f, note: ev.target.value })}
            inputProps={{ maxLength: 80 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          ยกเลิก
        </Button>
        <LoadingButton variant="contained" loading={busy} disabled={!f.shop || !amt || !f.note.trim()} onClick={submit}>
          บันทึก
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}

// ----------------------------------------------------------------------

export function HrEmployeesView() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Employee[] | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [menu, setMenu] = useState<{ el: HTMLElement; e: Employee } | null>(null);
  const [badge, setBadge] = useState<{ e: Employee; qr: string } | null>(null);
  const [pinFor, setPinFor] = useState<Employee | null>(null);
  const [pinStep, setPinStep] = useState<{ first?: string; error?: string | null; reset: number }>({ reset: 0 });
  const [topup, setTopup] = useState<{ e: Employee; amount: string; key: string } | null>(null);
  const [rotate, setRotate] = useState<Employee | null>(null);
  const [offboard, setOffboard] = useState<Employee | null>(null);
  const [manual, setManual] = useState<Employee | null>(null);

  const load = useCallback(() => {
    api.employees(q || undefined).then(setList).catch((e) => toast.error(errorText(e)));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    api.org().then(setOrg).catch(() => {});
  }, []);

  const showBadge = async (e: Employee, doRotate = false) => {
    try {
      setBadge({ e, qr: (await api.badge(e.id, doRotate)).qr });
      if (doRotate) toast.success('ออกบัตรใหม่แล้ว บัตรเดิมใช้ไม่ได้');
    } catch (x) {
      toast.error(errorText(x));
    }
  };

  const onPin = async (pin: string) => {
    if (!pinStep.first) return setPinStep((s) => ({ first: pin, error: null, reset: s.reset + 1 }));
    if (pin !== pinStep.first) return setPinStep((s) => ({ error: 'PIN ไม่ตรงกัน ให้พนักงานตั้งใหม่', reset: s.reset + 1 }));
    try {
      await api.setEmployeePin(pinFor!.id, pin);
      toast.success(`ตั้ง PIN ให้ ${pinFor!.name} แล้ว`);
      setPinFor(null);
      load();
    } catch (e) {
      setPinStep((s) => ({ error: errorText(e), reset: s.reset + 1 }));
    }
    return undefined;
  };

  const doTopup = async () => {
    const amt = toSatang(topup!.amount);
    if (!amt) return;
    try {
      await api.topupEmployee(topup!.e.id, amt, topup!.key);
      toast.success(`เติม ${baht(amt)} ให้ ${topup!.e.name} แล้ว`);
      setTopup(null);
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const toggle = async (e: Employee) => {
    try {
      await api.updateEmployee(e.id, { status: e.status === 'active' ? 'inactive' : 'active' });
      load();
    } catch (x) {
      toast.error(errorText(x));
    }
  };

  return (
    <>
      <PageHeader
        title="พนักงาน"
        sub={list ? `${list.length.toLocaleString('th-TH')} คน` : undefined}
        action={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" component={RouterLink} to="/hr/badges" startIcon={<Iconify icon="solar:printer-linear" />}>
              พิมพ์บัตร QR
            </Button>
            <Button variant="contained" onClick={() => setImportOpen(true)} startIcon={<Iconify icon="solar:import-linear" />}>
              นำเข้ารายชื่อ
            </Button>
          </Stack>
        }
      />
      <Card>
        <Stack sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="ค้นหา ชื่อ รหัส หรือเบอร์"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Iconify icon="solar:magnifer-linear" /></InputAdornment> }}
            sx={{ maxWidth: 360 }}
          />
        </Stack>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>รหัส</TableCell>
                <TableCell>ชื่อ</TableCell>
                <TableCell>แผนก</TableCell>
                <TableCell>ช่องทาง</TableCell>
                <TableCell align="right">ยอดคงเหลือ</TableCell>
                <TableCell align="right">ใช้ได้</TableCell>
                <TableCell width={48} />
              </TableRow>
            </TableHead>
            <TableBody>
              {list?.map((e) => (
                <TableRow key={e.id} hover sx={{ opacity: e.status === 'inactive' ? 0.5 : 1 }}>
                  <TableCell>{e.code}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{e.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {e.phone ?? 'ไม่มีเบอร์ (ใช้บัตร)'}
                    </Typography>
                  </TableCell>
                  <TableCell>{e.department}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      {e.offboarded ? <Label color="default">ลาออก</Label> : e.status === 'inactive' && <Label color="default">ระงับ</Label>}
                      {e.activated ? <Label color="success">เปิดใช้แล้ว</Label> : <Label color="warning">ยังไม่เปิดใช้</Label>}
                      {e.lineLinked && <Label color="info">LINE</Label>}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ color: e.balance < 0 ? 'error.main' : 'text.primary' }}>
                    {baht(e.balance)}
                  </TableCell>
                  <TableCell align="right">{baht(e.available)}</TableCell>
                  <TableCell>
                    <IconButton aria-label={`จัดการ ${e.name}`} onClick={(ev) => setMenu({ el: ev.currentTarget, e })}>
                      <Iconify icon="eva:more-vertical-fill" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {list && !list.length && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                    {q ? 'ไม่พบพนักงาน' : 'ยังไม่มีพนักงาน เริ่มจาก "นำเข้ารายชื่อ"'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { showBadge(menu!.e); setMenu(null); }}>
          <Iconify icon="solar:qr-code-linear" sx={{ mr: 1 }} /> ดูบัตร QR
        </MenuItem>
        <MenuItem onClick={() => { setRotate(menu!.e); setMenu(null); }}>
          <Iconify icon="solar:restart-linear" sx={{ mr: 1 }} /> ออกบัตรใหม่ (บัตรหาย)
        </MenuItem>
        <MenuItem onClick={() => { setPinFor(menu!.e); setPinStep({ reset: 0 }); setMenu(null); }}>
          <Iconify icon="solar:lock-password-linear" sx={{ mr: 1 }} /> ตั้ง PIN (พนักงานกดเอง)
        </MenuItem>
        {org?.moneyMode === 'prepaid' && (
          <MenuItem onClick={() => { setTopup({ e: menu!.e, amount: '', key: newKey() }); setMenu(null); }}>
            <Iconify icon="solar:wallet-linear" sx={{ mr: 1 }} /> รับเงินสด / เติมเงิน
          </MenuItem>
        )}
        {menu?.e.status === 'active' && (
          <MenuItem onClick={() => { setManual(menu!.e); setMenu(null); }}>
            <Iconify icon="solar:document-add-linear" sx={{ mr: 1 }} /> บันทึกรายการย้อนหลัง (ใบจด)
          </MenuItem>
        )}
        <MenuItem onClick={() => { toggle(menu!.e); setMenu(null); }} sx={{ color: menu?.e.status === 'active' ? 'error.main' : 'success.main' }}>
          <Iconify icon={menu?.e.status === 'active' ? 'solar:forbidden-circle-linear' : 'solar:check-circle-linear'} sx={{ mr: 1 }} />
          {menu?.e.status === 'active' ? 'ระงับชั่วคราว' : menu?.e.offboarded ? 'กลับมาทำงาน (เปิดใช้อีกครั้ง)' : 'เปิดใช้งานอีกครั้ง'}
        </MenuItem>
        {!menu?.e.offboarded && (
          <MenuItem onClick={() => { setOffboard(menu!.e); setMenu(null); }} sx={{ color: 'error.main' }}>
            <Iconify icon="solar:logout-2-linear" sx={{ mr: 1 }} /> ทำเรื่องลาออก
          </MenuItem>
        )}
      </Menu>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      <OffboardDialog e={offboard} mode={org?.moneyMode} onClose={() => setOffboard(null)} onDone={load} />
      <ManualPurchaseDialog e={manual} onClose={() => setManual(null)} onDone={load} />

      <Dialog open={!!badge} onClose={() => setBadge(null)}>
        <DialogTitle>บัตร QR · {badge?.e.name}</DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          {badge && <QRCodeSVG value={badge.qr} size={220} level="M" marginSize={2} />}
          <Typography variant="body2" sx={{ mt: 1 }}>
            {badge?.e.code} · {badge?.e.department}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => window.print()} startIcon={<Iconify icon="solar:printer-linear" />}>
            พิมพ์
          </Button>
          <Button variant="contained" onClick={() => setBadge(null)}>
            ปิด
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!rotate}
        onClose={() => setRotate(null)}
        title="ออกบัตรใหม่?"
        content={`บัตรเดิมของ ${rotate?.name ?? ''} จะใช้จ่ายไม่ได้ทันที`}
        action={
          <Button variant="contained" color="error" onClick={() => { showBadge(rotate!, true); setRotate(null); }}>
            ออกบัตรใหม่
          </Button>
        }
      />

      <Dialog open={!!pinFor} onClose={() => setPinFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>ตั้ง PIN · {pinFor?.name}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            ให้พนักงานกด PIN เอง ฝ่ายบุคคลไม่ควรรู้ PIN
          </Alert>
          <PinPad title={pinStep.first ? 'ยืนยัน PIN อีกครั้ง' : 'ตั้ง PIN 6 หลัก'} onComplete={onPin} error={pinStep.error} resetKey={pinStep.reset} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!topup} onClose={() => setTopup(null)} fullWidth maxWidth="xs">
        <DialogTitle>รับเงินสด · {topup?.e.name}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="จำนวนเงิน (บาท)"
            value={topup?.amount ?? ''}
            onChange={(e) => setTopup((t) => (t ? { ...t, amount: e.target.value } : t))}
            inputProps={{ inputMode: 'decimal' }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setTopup(null)}>
            ยกเลิก
          </Button>
          <Button variant="contained" disabled={!toSatang(topup?.amount ?? '')} onClick={doTopup}>
            เติมเงิน
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
