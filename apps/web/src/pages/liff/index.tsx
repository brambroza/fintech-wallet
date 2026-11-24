import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { LiffView } from 'src/sections/liff/liff-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`โรงอาหาร - ${CONFIG.site.name}`}</title>
      </Helmet>
      <LiffView />
    </>
  );
}
