import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { HrBadgesView } from 'src/sections/hr/badges-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`พิมพ์บัตร QR - ${CONFIG.site.name}`}</title>
      </Helmet>
      <HrBadgesView />
    </>
  );
}
