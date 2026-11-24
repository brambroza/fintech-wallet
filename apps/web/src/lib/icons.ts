import type { IconifyJSON } from '@iconify/react';

import { addCollection } from '@iconify/react';

import collections from './icons.json';

// ----------------------------------------------------------------------

/**
 * Icons used by this app are bundled (no runtime fetch from api.iconify.design), so they show
 * on factory networks that block the internet. Adding an icon: list it in scripts/icons.txt
 * and run `node scripts/gen-icons.mjs`.
 */
export function registerIcons() {
  (collections as unknown as IconifyJSON[]).forEach((c) => addCollection(c));
}
