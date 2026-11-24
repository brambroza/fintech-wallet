import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { HrEmployeesView } from 'src/sections/hr/employees-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{`พนักงาน - ${CONFIG.site.name}`}</title>
      </Helmet>
      <HrEmployeesView />
    </>
  );
}
