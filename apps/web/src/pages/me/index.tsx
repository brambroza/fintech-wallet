import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { EmployeeApp } from 'src/sections/liff/employee-app';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`กระเป๋าโรงอาหาร - ${CONFIG.site.name}`}</title>
      </Helmet>
      <EmployeeApp channel="app" />
    </>
  );
}
