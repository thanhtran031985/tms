import {
  CircleCheck,
  Clock,
  FileWarning,
  Lock,
  Merge,
  RefreshCw,
  Repeat2,
  Snowflake,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { StatusChip } from '@/components/ui/status-chip';
import type { ChipIcon, ChipSpec } from './card-chips';

const ICONS: Record<ChipIcon, LucideIcon> = {
  clock: Clock,
  check: CircleCheck,
  lock: Lock,
  snowflake: Snowflake,
  warning: TriangleAlert,
  swap: Repeat2,
  file: FileWarning,
  merge: Merge,
  refresh: RefreshCw,
};

// Chip cỡ sm trên thẻ container: luôn có icon và chữ, màu theo mức.
export function CardChipList({ chips }: { chips: ChipSpec[] }) {
  return (
    <>
      {chips.map((chip) => (
        <StatusChip key={chip.key} tone={chip.tone} icon={ICONS[chip.icon]} size="sm">
          {chip.label}
        </StatusChip>
      ))}
    </>
  );
}
