import liff from '@line/liff';
import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { useAuth } from 'src/lib/auth';
import { CONFIG } from 'src/config-global';
import { api, errorText } from 'src/lib/api';

import { EmployeeApp } from './employee-app';
import { LoginView } from '../auth/login-view';

// ----------------------------------------------------------------------

/**
 * LINE LIFF entry. First visit: log in with phone + PIN once, then the LINE account is linked
 * and later visits sign in automatically. Payments always ask for the PIN.
 */
export function LiffView() {
  const { me, signIn, loading } = useAuth();
  const [state, setState] = useState<'init' | 'login' | 'ready' | 'error'>('init');
  const [error, setError] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        if (!CONFIG.liffId) {
          // No LIFF configured (local dev): behave like the browser page.
          setState(me ? 'ready' : 'login');
          return;
        }
        await liff.init({ liffId: CONFIG.liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const token = liff.getIDToken();
        setIdToken(token);
        if (me) {
          setState('ready');
          if (token && !me.lineLinked) api.lineLink(token).catch(() => {});
          return;
        }
        if (token) {
          const r = await api.lineLogin(token);
          if (r.linked) {
            await signIn(r);
            setState('ready');
            return;
          }
        }
        setState('login');
      } catch (e) {
        setError(errorText(e));
        setState('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const scan = useCallback(async () => {
    if (!CONFIG.liffId || !liff.isApiAvailable('scanCodeV2')) throw new Error('unavailable');
    const r = await liff.scanCodeV2();
    return r.value ?? null;
  }, []);

  if (state === 'init') return <LinearProgress />;
  if (state === 'error')
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error ?? 'เปิดผ่าน LINE ไม่สำเร็จ'}</Alert>
      </Box>
    );
  if (state === 'login')
    return (
      <>
        {idToken && (
          <Typography variant="body2" sx={{ textAlign: 'center', p: 1, bgcolor: 'info.lighter' }}>
            เข้าสู่ระบบครั้งแรก ครั้งต่อไปเปิดจาก LINE ได้เลย
          </Typography>
        )}
        <LoginView
          onDone={async () => {
            if (idToken) await api.lineLink(idToken).catch(() => {});
            setState('ready');
          }}
        />
      </>
    );
  return <EmployeeApp channel="liff" scan={CONFIG.liffId ? scan : undefined} />;
}
