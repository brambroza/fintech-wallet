import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { PageHeader } from 'src/layouts/hr-layout';
import { api, baht, bkkDate, type Summary } from 'src/lib/api';

// ----------------------------------------------------------------------

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card sx={{ p: 2.5, flex: 1, minWidth: 180 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {sub}
        </Typography>
      )}
    </Card>
  );
}

export function HrDashboardView() {
  const monthStart = `${bkkDate().slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(bkkDate());
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    setS(null);
    api.summary(from, to).then(setS).catch(() => {});
  }, [from, to]);

  const max = Math.max(1, ...(s?.byDay.map((d) => d.total) ?? [1]));

  return (
    <>
      <PageHeader
        title="ภาพรวม"
        sub="ยอดใช้จ่ายในโรงอาหารตามช่วงวันที่"
        action={
          <Stack direction="row" spacing={1}>
            <TextField type="date" size="small" label="ตั้งแต่" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField type="date" size="small" label="ถึง" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Stack>
        }
      />
      {!s ? (
        <LinearProgress />
      ) : (
        <Stack spacing={3}>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <Stat label="ยอดขายรวม" value={baht(s.total)} sub={`${s.count.toLocaleString('th-TH')} รายการ · ${s.buyers.toLocaleString('th-TH')} คน`} />
            <Stat label="รอหักเงินเดือน" value={baht(s.toDeduct)} sub="ยอดติดลบของพนักงาน ณ ตอนนี้" />
            <Stat label="ค้างจ่ายร้านค้า" value={baht(s.shopsPayable)} sub="ยอดที่บริษัทต้องจ่ายร้าน" />
          </Stack>

          <Card>
            <Typography variant="h6" sx={{ p: 2.5, pb: 1 }}>
              ยอดตามร้าน
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ร้าน</TableCell>
                  <TableCell align="right">รายการ</TableCell>
                  <TableCell align="right">ยอด (บาท)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {s.byShop.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell align="right">{r.count.toLocaleString('th-TH')}</TableCell>
                    <TableCell align="right">{baht(r.total)}</TableCell>
                  </TableRow>
                ))}
                {!s.byShop.length && (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ color: 'text.secondary' }}>
                      ยังไม่มีร้านค้า
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              ยอดรายวัน
            </Typography>
            {s.byDay.length ? (
              <Stack spacing={1}>
                {s.byDay.map((d) => (
                  <Stack key={d.day} direction="row" spacing={2} alignItems="center">
                    <Typography variant="body2" sx={{ width: 96, flexShrink: 0 }}>
                      {d.day}
                    </Typography>
                    <Box sx={{ flexGrow: 1, bgcolor: 'background.neutral', borderRadius: 1, height: 20 }}>
                      <Box sx={{ width: `${(d.total / max) * 100}%`, height: 1, bgcolor: 'primary.main', borderRadius: 1 }} />
                    </Box>
                    <Typography variant="body2" sx={{ width: 120, textAlign: 'right', flexShrink: 0 }}>
                      {baht(d.total)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                ยังไม่มีรายการในช่วงนี้
              </Typography>
            )}
          </Card>
        </Stack>
      )}
    </>
  );
}
