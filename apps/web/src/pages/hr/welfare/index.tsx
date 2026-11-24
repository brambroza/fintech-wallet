import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { HrWelfareView } from 'src/sections/hr/welfare-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`สวัสดิการ - ${CONFIG.site.name}`}</title>
      </Helmet>
      <HrWelfareView />
    </>
  );
}
