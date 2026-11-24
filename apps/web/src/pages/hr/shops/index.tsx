import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { HrShopsView } from 'src/sections/hr/shops-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`ร้านค้า - ${CONFIG.site.name}`}</title>
      </Helmet>
      <HrShopsView />
    </>
  );
}
