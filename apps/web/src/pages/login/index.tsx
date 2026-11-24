import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { LoginView } from 'src/sections/auth/login-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`เข้าสู่ระบบ - ${CONFIG.site.name}`}</title>
      </Helmet>
      <LoginView />
    </>
  );
}
