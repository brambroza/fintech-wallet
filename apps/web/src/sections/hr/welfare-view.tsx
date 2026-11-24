import { useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
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

import { PageHeader } from 'src/layouts/hr-layout';
import { api, baht, bkkDate, type Org, errorText } from 'src/lib/api';

import { toast } from 'src/components/snackbar';
import { ConfirmDialog } from 'src/components/custom-dialog';

// ----------------------------------------------------------------------

export function HrWelfareView() {
  const [org, setOrg] = useState<Org | null>(null);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof api.welfareRuns>>>([]);
  const [cycle, setCycle] = useState(bkkDate().slice(0, 7));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.org().then(setOrg).catch(() => {});
    api.welfareRuns().then(setRuns).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const done = runs.some((r) => r.cycle === cycle);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.welfareRun(cycle);
      toast.success(`เติมสวัสดิการ ${r.employees} คน รวม ${baht(r.total)}`);
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
      <PageHeader title="สวัสดิการค่าอาหาร" sub={org ? `คนละ ${baht(org.welfareAmount)} ต่อรอบ · แก้ยอดได้ที่ตั้งค่า` : undefined} />
      <Stack spacing={3}>
        <Card sx={{ p: 2.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField type="month" size="small" label="รอบ" value={cycle} onChange={(e) => setCycle(e.target.value)} InputLabelProps={{ shrink: true }} />
            <Button variant="contained" disabled={!org?.welfareAmount || done} onClick={() => setConfirm(true)}>
              {done ? 'รอบนี้เติมแล้ว' : 'เติมสวัสดิการให้พนักงานทุกคน'}
            </Button>
          </Stack>
          {!org?.welfareAmount && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
              ยังไม่ได้ตั้งยอดสวัสดิการต่อคน ไปที่หน้าตั้งค่า
            </Typography>
          )}
        </Card>
        <Card>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>รอบ</TableCell>
                <TableCell align="right">ต่อคน</TableCell>
                <TableCell align="right">จำนวนคน</TableCell>
                <TableCell align="right">รวม</TableCell>
                <TableCell>วันที่ทำ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.cycle}>
                  <TableCell>{r.cycle}</TableCell>
                  <TableCell align="right">{baht(r.amount)}</TableCell>
                  <TableCell align="right">{r.employees.toLocaleString('th-TH')}</TableCell>
                  <TableCell align="right">{baht(r.amount * r.employees)}</TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleString('th-TH')}</TableCell>
                </TableRow>
              ))}
              {!runs.length && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                    ยังไม่เคยเติมสวัสดิการ
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </Stack>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`เติมสวัสดิการรอบ ${cycle}?`}
        content={org ? `พนักงานที่ใช้งานอยู่ทุกคนจะได้ ${baht(org.welfareAmount)} ทำได้ครั้งเดียวต่อรอบ` : ''}
        action={
          <LoadingButton variant="contained" loading={busy} onClick={run}>
            เติมสวัสดิการ
          </LoadingButton>
        }
      />
    </>
  );
}
