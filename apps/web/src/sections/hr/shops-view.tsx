import { useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TableContainer from '@mui/material/TableContainer';

import { PageHeader } from 'src/layouts/hr-layout';
import { api, baht, newKey, toSatang, errorText, type Shop, isThaiMobile, normalizePhone } from 'src/lib/api';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export function HrShopsView() {
  const [list, setList] = useState<Shop[]>([]);
  const [add, setAdd] = useState<{ name: string; ownerName: string; ownerPhone: string } | null>(null);
  const [payout, setPayout] = useState<{ s: Shop; amount: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.shops().then(setList).catch((e) => toast.error(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api.createShop({ ...add!, ownerPhone: normalizePhone(add!.ownerPhone) });
      toast.success('เพิ่มร้านแล้ว ให้เจ้าของร้านเปิดใช้งานด้วยเบอร์นี้');
      setAdd(null);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    const amt = toSatang(payout!.amount);
    if (!amt) return;
    setBusy(true);
    try {
      await api.payoutShop(payout!.s.id, amt, payout!.key);
      toast.success(`บันทึกจ่าย ${payout!.s.name} ${baht(amt)} แล้ว`);
      setPayout(null);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: Shop) => {
    await api.updateShop(s.id, { status: s.status === 'active' ? 'inactive' : 'active' }).catch((e) => toast.error(errorText(e)));
    load();
  };

  return (
    <>
      <PageHeader
        title="ร้านค้า"
        sub="ยอดค้างจ่าย = ยอดขายที่บริษัทยังไม่ได้โอนให้ร้าน"
        action={
          <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setAdd({ name: '', ownerName: '', ownerPhone: '' })}>
            เพิ่มร้าน
          </Button>
        }
      />
      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>ร้าน</TableCell>
                <TableCell>เจ้าของ</TableCell>
                <TableCell>สถานะ</TableCell>
                <TableCell align="right">ค้างจ่าย</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((s) => (
                <TableRow key={s.id} sx={{ opacity: s.status === 'inactive' ? 0.5 : 1 }}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{s.ownerName}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {s.ownerPhone}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      {s.status === 'inactive' && <Label>ปิด</Label>}
                      {s.activated ? <Label color="success">เปิดใช้แล้ว</Label> : <Label color="warning">ยังไม่เปิดใช้</Label>}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{baht(s.payable)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button size="small" variant="outlined" disabled={s.payable <= 0} onClick={() => setPayout({ s, amount: (s.payable / 100).toFixed(2), key: newKey() })}>
                        บันทึกจ่ายร้าน
                      </Button>
                      <Button size="small" color="inherit" onClick={() => toggle(s)}>
                        {s.status === 'active' ? 'ปิดร้าน' : 'เปิดร้าน'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!list.length && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                    ยังไม่มีร้านค้า
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={!!add} onClose={() => setAdd(null)} fullWidth maxWidth="xs">
        <DialogTitle>เพิ่มร้านค้า</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="ชื่อร้าน" value={add?.name ?? ''} onChange={(e) => setAdd((a) => a && { ...a, name: e.target.value })} autoFocus />
            <TextField label="ชื่อเจ้าของร้าน" value={add?.ownerName ?? ''} onChange={(e) => setAdd((a) => a && { ...a, ownerName: e.target.value })} />
            <TextField
              label="เบอร์โทรเจ้าของร้าน"
              helperText="ใช้เปิดใช้งานและเข้าสู่ระบบหน้าร้าน"
              value={add?.ownerPhone ?? ''}
              onChange={(e) => setAdd((a) => a && { ...a, ownerPhone: e.target.value })}
              inputProps={{ inputMode: 'tel' }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setAdd(null)}>
            ยกเลิก
          </Button>
          <LoadingButton variant="contained" loading={busy} disabled={!add?.name || !add.ownerName || !isThaiMobile(add.ownerPhone)} onClick={create}>
            เพิ่มร้าน
          </LoadingButton>
        </DialogActions>
      </Dialog>

      <Dialog open={!!payout} onClose={() => setPayout(null)} fullWidth maxWidth="xs">
        <DialogTitle>บันทึกจ่ายเงินร้าน · {payout?.s.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            บันทึกหลังโอนเงินหรือจ่ายเงินสดให้ร้านแล้วเท่านั้น ค้างจ่าย {payout ? baht(payout.s.payable) : ''}
          </Typography>
          <TextField fullWidth label="จำนวนที่จ่าย (บาท)" value={payout?.amount ?? ''} onChange={(e) => setPayout((p) => p && { ...p, amount: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPayout(null)}>
            ยกเลิก
          </Button>
          <LoadingButton variant="contained" loading={busy} disabled={!toSatang(payout?.amount ?? '')} onClick={pay}>
            บันทึก
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}
