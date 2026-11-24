import { QRCodeSVG } from 'qrcode.react';
import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { useAuth } from 'src/lib/auth';
import { api, errorText } from 'src/lib/api';
import { PageHeader } from 'src/layouts/hr-layout';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

/** Printable sheet: 3 columns of card-sized badges (cut and laminate, or stick on existing ID cards). */
export function HrBadgesView() {
  const { me } = useAuth();
  const [list, setList] = useState<Awaited<ReturnType<typeof api.badges>> | null>(null);
  useEffect(() => {
    api.badges().then(setList).catch((e) => toast.error(errorText(e)));
  }, []);
  const org = me?.roles.find((r) => r.role === 'hr')?.orgName;

  return (
    <>
      <Box sx={{ '@media print': { display: 'none' } }}>
        <PageHeader
          title="พิมพ์บัตร QR"
          sub="สำหรับพนักงานที่ไม่ใช้มือถือ ร้านค้าสแกนบัตรแล้วให้พนักงานกด PIN"
          action={
            <Button variant="contained" onClick={() => window.print()} startIcon={<Iconify icon="solar:printer-linear" />} disabled={!list?.length}>
              พิมพ์ {list?.length ?? ''} ใบ
            </Button>
          }
        />
      </Box>
      {!list ? (
        <LinearProgress />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 2,
            '@media print': { gridTemplateColumns: 'repeat(3, 1fr)', gap: '6mm' },
          }}
        >
          {list.map((b) => (
            <Stack
              key={b.id}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ p: 1.5, bgcolor: 'background.paper', border: '1px dashed', borderColor: 'divider', borderRadius: 1, breakInside: 'avoid' }}
            >
              <QRCodeSVG value={b.qr} size={92} level="M" marginSize={1} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                  {org}
                </Typography>
                <Typography variant="subtitle2" noWrap>
                  {b.name}
                </Typography>
                <Typography variant="body2">{b.code}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {b.department}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Box>
      )}
    </>
  );
}
