import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { HrPayrollView } from 'src/sections/hr/payroll-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`หักเงินเดือน - ${CONFIG.site.name}`}</title>
      </Helmet>
      <HrPayrollView />
    </>
  );
}
