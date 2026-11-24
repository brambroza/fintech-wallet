import { useState } from 'react';
import { Outlet, useLocation, Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import AppBar from '@mui/material/AppBar';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListItemButton from '@mui/material/ListItemButton';

import { useResponsive } from 'src/hooks/use-responsive';

import { useAuth } from 'src/lib/auth';

import { Logo } from 'src/components/logo';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

const NAV = [
  { to: '/hr', label: 'ภาพรวม', icon: 'solar:chart-2-bold-duotone' },
  { to: '/hr/employees', label: 'พนักงาน', icon: 'solar:users-group-rounded-bold-duotone' },
  { to: '/hr/payroll', label: 'หักเงินเดือน', icon: 'solar:wallet-money-bold-duotone' },
  { to: '/hr/welfare', label: 'สวัสดิการ', icon: 'solar:gift-bold-duotone' },
  { to: '/hr/shops', label: 'ร้านค้า', icon: 'solar:shop-bold-duotone' },
  { to: '/hr/settings', label: 'ตั้งค่า', icon: 'solar:settings-bold-duotone' },
];
const W = 240;

export function HrLayout() {
  const { me, signOut } = useAuth();
  const { pathname } = useLocation();
  const desktop = useResponsive('up', 'lg');
  const [open, setOpen] = useState(false);
  const org = me?.roles.find((r) => r.role === 'hr')?.orgName;

  const nav = (
    <Stack sx={{ height: 1, p: 2 }} spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 1 }}>
        <Logo />
        <Box>
          <Typography variant="subtitle2">Canteen Wallet</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {org}
          </Typography>
        </Box>
      </Stack>
      <List disablePadding component="nav" aria-label="เมนูฝ่ายบุคคล">
        {NAV.map((n) => {
          const active = n.to === '/hr' ? pathname === '/hr' : pathname.startsWith(n.to);
          return (
            <ListItemButton
              key={n.to}
              component={RouterLink}
              to={n.to}
              selected={active}
              onClick={() => setOpen(false)}
              sx={{ borderRadius: 1, mb: 0.5, minHeight: 44 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: active ? 'primary.main' : 'text.secondary' }}>
                <Iconify icon={n.icon} width={22} />
              </ListItemIcon>
              <ListItemText primary={n.label} primaryTypographyProps={{ typography: 'body2', fontWeight: active ? 600 : 500 }} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ flexGrow: 1 }} />
      <Box sx={{ px: 1 }}>
        <Typography variant="body2" noWrap>
          {me?.displayName}
        </Typography>
        <Button size="small" color="inherit" onClick={signOut} startIcon={<Iconify icon="solar:logout-2-linear" />} sx={{ mt: 1, color: 'text.secondary' }}>
          ออกจากระบบ
        </Button>
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {desktop ? (
        <Drawer variant="permanent" sx={{ width: W, '& .MuiDrawer-paper': { width: W, borderRightStyle: 'dashed' } }}>
          {nav}
        </Drawer>
      ) : (
        <>
          <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar>
              <IconButton edge="start" aria-label="เปิดเมนู" onClick={() => setOpen(true)}>
                <Iconify icon="solar:hamburger-menu-linear" />
              </IconButton>
              <Typography variant="subtitle1" sx={{ ml: 1 }}>
                {NAV.find((n) => (n.to === '/hr' ? pathname === '/hr' : pathname.startsWith(n.to)))?.label}
              </Typography>
            </Toolbar>
          </AppBar>
          <Drawer open={open} onClose={() => setOpen(false)} sx={{ '& .MuiDrawer-paper': { width: W } }}>
            {nav}
          </Drawer>
        </>
      )}
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 }, pt: { xs: 10, lg: 4 }, bgcolor: 'background.neutral' }}>
        <Outlet />
      </Box>
    </Box>
  );
}

/** Page title row with optional actions. */
export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h4">{title}</Typography>
        {sub && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {sub}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
