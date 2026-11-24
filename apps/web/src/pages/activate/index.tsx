import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { ActivateView } from 'src/sections/auth/activate-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`เปิดใช้งานบัญชี - ${CONFIG.site.name}`}</title>
      </Helmet>
      <ActivateView />
    </>
  );
}
