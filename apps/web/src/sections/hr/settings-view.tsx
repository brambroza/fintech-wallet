import { useState, useEffect } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Radio from '@mui/material/Radio';
import TextField from '@mui/material/TextField';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import FormControlLabel from '@mui/material/FormControlLabel';

import { PageHeader } from 'src/layouts/hr-layout';
import { api, toSatang, type Org, errorText, isThaiMobile, normalizePhone } from 'src/lib/api';

import { toast } from 'src/components/snackbar';

// ----------------------------------------------------------------------

const toBaht = (s: number) => String(s / 100);

export function HrSettingsView() {
  const [org, setOrg] = useState<Org | null>(null);
  const [f, setF] = useState({ mode: 'credit' as Org['moneyMode'], credit: '', daily: '', welfare: '' });
  const [hr, setHr] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .org()
      .then((o) => {
        setOrg(o);
        setF({ mode: o.moneyMode, credit: toBaht(o.creditLimit), daily: toBaht(o.dailyLimit), welfare: toBaht(o.welfareAmount) });
      })
      .catch((e) => toast.error(errorText(e)));
  }, []);

  const valid = toSatang(f.credit) !== null && !!toSatang(f.daily) && toSatang(f.welfare) !== null;

  const save = async () => {
    setBusy(true);
    try {
      await api.updateOrg({ moneyMode: f.mode, creditLimit: toSatang(f.credit)!, dailyLimit: toSatang(f.daily)!, welfareAmount: toSatang(f.welfare)! });
      toast.success('บันทึกแล้ว');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const addHr = async () => {
    try {
      await api.addHr(hr.name, normalizePhone(hr.phone));
      toast.success('เพิ่มผู้ดูแลแล้ว ให้เปิดใช้งานด้วยเบอร์นี้');
      setHr({ name: '', phone: '' });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <>
      <PageHeader title="ตั้งค่า" sub={org ? `${org.name} · รหัสองค์กร ${org.code}` : undefined} />
      <Stack spacing={3} sx={{ maxWidth: 640 }}>
        <Card sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <Typography variant="h6">รูปแบบการใช้เงิน</Typography>
            <RadioGroup value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as Org['moneyMode'] })}>
              <FormControlLabel
                value="credit"
                control={<Radio />}
                label={
                  <div>
                    <Typography variant="subtitle2">เครดิต + หักเงินเดือน</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      ใช้สวัสดิการก่อน ใช้เกินได้ถึงวงเงิน แล้วหักเงินเดือนสิ้นรอบ
                    </Typography>
                  </div>
                }
                sx={{ alignItems: 'flex-start', mb: 1 }}
              />
              <FormControlLabel
                value="prepaid"
                control={<Radio />}
                label={
                  <div>
                    <Typography variant="subtitle2">เติมเงินล่วงหน้า</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      ใช้ได้เท่ายอดคงเหลือ เติมเงินสดที่ฝ่ายบุคคล (ตรวจสอบเงื่อนไข ธปท. ก่อนเปิดใช้)
                    </Typography>
                  </div>
                }
                sx={{ alignItems: 'flex-start' }}
              />
            </RadioGroup>
            {f.mode === 'credit' && (
              <TextField label="วงเงินใช้เกินต่อคน (บาท)" value={f.credit} onChange={(e) => setF({ ...f, credit: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
            )}
            <TextField label="วงเงินใช้จ่ายต่อวันต่อคน (บาท)" value={f.daily} onChange={(e) => setF({ ...f, daily: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
            <TextField
              label="สวัสดิการค่าอาหารต่อคนต่อรอบ (บาท)"
              helperText="ใส่ 0 ถ้าไม่มีสวัสดิการ"
              value={f.welfare}
              onChange={(e) => setF({ ...f, welfare: e.target.value })}
              inputProps={{ inputMode: 'decimal' }}
            />
            <LoadingButton variant="contained" loading={busy} disabled={!valid} onClick={save} sx={{ alignSelf: 'flex-start' }}>
              บันทึก
            </LoadingButton>
          </Stack>
        </Card>
        <Card sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h6">เพิ่มผู้ดูแล (ฝ่ายบุคคล)</Typography>
            <TextField label="ชื่อ" value={hr.name} onChange={(e) => setHr({ ...hr, name: e.target.value })} />
            <TextField label="เบอร์โทร" value={hr.phone} onChange={(e) => setHr({ ...hr, phone: e.target.value })} inputProps={{ inputMode: 'tel' }} />
            <LoadingButton variant="outlined" disabled={!hr.name || !isThaiMobile(hr.phone)} onClick={addHr} sx={{ alignSelf: 'flex-start' }}>
              เพิ่มผู้ดูแล
            </LoadingButton>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
