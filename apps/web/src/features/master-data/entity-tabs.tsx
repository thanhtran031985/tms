'use client';

import { LinkTabs } from '@/components/ui/link-tabs';
import { ENTITY_TABS } from './entities';

// Chuyển giữa 5 danh mục (mỗi danh mục một URL).
export function EntityTabs() {
  return (
    <LinkTabs
      label="Loại danh mục"
      items={ENTITY_TABS.map(({ slug, label }) => ({ href: `/master-data/${slug}`, label }))}
    />
  );
}
