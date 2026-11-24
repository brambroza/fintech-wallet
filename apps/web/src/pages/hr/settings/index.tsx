import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { HrSettingsView } from 'src/sections/hr/settings-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`ตั้งค่า - ${CONFIG.site.name}`}</title>
      </Helmet>
      <HrSettingsView />
    </>
  );
}
