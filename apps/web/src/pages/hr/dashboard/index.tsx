import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { HrDashboardView } from 'src/sections/hr/dashboard-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`ภาพรวม - ${CONFIG.site.name}`}</title>
      </Helmet>
      <HrDashboardView />
    </>
  );
}
