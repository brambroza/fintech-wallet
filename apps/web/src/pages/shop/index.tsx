import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { ShopView } from 'src/sections/shop/shop-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`หน้าร้าน - ${CONFIG.site.name}`}</title>
      </Helmet>
      <ShopView />
    </>
  );
}
