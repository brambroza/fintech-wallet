import { useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import TableContainer from '@mui/material/TableContainer';

import { csvBaht, downloadCsv } from 'src/lib/csv';
import { PageHeader } from 'src/layouts/hr-layout';
import { api, baht, bkkDate, errorText, type PayrollItem } from 'src/lib/api';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ConfirmDialog } from 'src/components/custom-dialog';

// ----------------------------------------------------------------------

/**
 * 1) Export the snapshot → give to payroll. 2) After salaries are paid, "settle" the SAME snapshot.
 * Spending after the export stays negative and rolls into the next cycle.
 */
export function HrPayrollView() {
  const [cycle, setCycle] = useState(bkkDate().slice(0, 7));
  const [snap, setSnap] = useState<{ asOf: string; items: PayrollItem[]; total: number } | null>(null);
  const [exported, setExported] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setExported(false);
    api.payroll().then(setSnap).catch((e) => toast.error(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const exportCsv = () => {
    if (!snap) return;
    downloadCsv(
      `payroll-deduction-${cycle}.csv`,
      ['รหัสพนักงาน', 'ชื่อ', 'แผนก', 'ยอดหัก (บาท)'],
      snap.items.map((i) => [i.code, i.name, i.department, csvBaht(i.deduct)])
    );
    setExported(true);
  };

  const settle = async () => {
    setBusy(true);
    try {
      const r = await api.settlePayroll(cycle, snap!.items.map((i) => ({ memberId: i.memberId, amount: i.deduct })));
      toast.success(`บันทึกหักเงินเดือนแล้ว ${baht(r.settled)}`);
      setConfirm(false);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="หักเงินเดือน"
        sub="พนักงานที่ใช้เกินสวัสดิการ (ยอดติดลบ)"
        action={<TextField type="month" size="small" label="รอบเงินเดือน" value={cycle} onChange={(e) => setCycle(e.target.value)} InputLabelProps={{ shrink: true }} />}
      />
      <Stack spacing={2}>
        <Alert severity="info">
          ขั้นที่ 1 ดาวน์โหลดไฟล์ส่งฝ่ายเงินเดือน → ขั้นที่ 2 หลังจ่ายเงินเดือนแล้ว กด &quot;บันทึกว่าหักแล้ว&quot; ระบบจะล้างยอดตามไฟล์ที่ดาวน์โหลด
          ยอดที่ใช้หลังจากดาวน์โหลดจะยกไปรอบหน้า
        </Alert>
        <Card>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ p: 2.5 }}>
            <div>
              <Typography variant="h5">{snap ? baht(snap.total) : '—'}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {snap ? `${snap.items.length.toLocaleString('th-TH')} คน · ข้อมูล ณ ${new Date(snap.asOf).toLocaleString('th-TH')}` : ''}
              </Typography>
            </div>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={load} startIcon={<Iconify icon="solar:refresh-linear" />}>
                ดึงยอดล่าสุด
              </Button>
              <Button variant="contained" onClick={exportCsv} disabled={!snap?.items.length} startIcon={<Iconify icon="solar:download-linear" />}>
                1. ดาวน์โหลด CSV
              </Button>
              <Button variant="contained" color="success" onClick={() => setConfirm(true)} disabled={!exported}>
                2. บันทึกว่าหักแล้ว
              </Button>
            </Stack>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>รหัส</TableCell>
                  <TableCell>ชื่อ</TableCell>
                  <TableCell>แผนก</TableCell>
                  <TableCell align="right">ยอดหัก</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {snap?.items.map((i) => (
                  <TableRow key={i.memberId}>
                    <TableCell>{i.code}</TableCell>
                    <TableCell>{i.name}</TableCell>
                    <TableCell>{i.department}</TableCell>
                    <TableCell align="right">{baht(i.deduct)}</TableCell>
                  </TableRow>
                ))}
                {snap && !snap.items.length && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                      ไม่มียอดต้องหักรอบนี้
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Stack>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`บันทึกหักเงินเดือนรอบ ${cycle}?`}
        content={snap ? `${snap.items.length} คน รวม ${baht(snap.total)} ตามไฟล์ที่ดาวน์โหลด ทำซ้ำรอบเดิมจะไม่หักซ้ำ` : ''}
        action={
          <LoadingButton variant="contained" color="success" loading={busy} onClick={settle}>
            บันทึก
          </LoadingButton>
        }
      />
    </>
  );
}
