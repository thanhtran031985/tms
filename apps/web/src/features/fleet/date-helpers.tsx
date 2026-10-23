import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';

export function parseDaysLeft(
  dateStr: string | null | undefined,
): { days: number; text: string; tone: StatusTone } | null {
  if (!dateStr) return null;
  const targetUtc = Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
  );
  const now = new Date();
  const baseUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((targetUtc - baseUtc) / (86400 * 1000));

  if (days < 0) {
    return { days, text: `Quá hạn ${Math.abs(days)} ngày`, tone: 'crit' };
  }
  if (days === 0) {
    return { days, text: 'Hết hạn hôm nay', tone: 'crit' };
  }
  if (days <= 3) {
    return { days, text: `Còn ${days} ngày`, tone: 'crit' };
  }
  if (days <= 15) {
    return { days, text: `Còn ${days} ngày`, tone: 'warn' };
  }
  return { days, text: `Còn ${days} ngày`, tone: 'ok' };
}

export function ExpiryCell({ date }: { date: string | null | undefined }) {
  if (!date) return <span className="text-ink-subtle">—</span>;
  const info = parseDaysLeft(date);
  if (!info) return <span>{date}</span>;

  const icon =
    info.tone === 'crit' ? AlertCircle : info.tone === 'warn' ? AlertTriangle : CheckCircle;

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-body-sm font-semibold text-ink">{date}</span>
      <div>
        <StatusChip tone={info.tone} icon={icon} size="sm">
          {info.text}
        </StatusChip>
      </div>
    </div>
  );
}
