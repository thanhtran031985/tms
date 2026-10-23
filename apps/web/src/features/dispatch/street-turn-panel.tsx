'use client';

import { CircleAlert, Repeat2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TextField } from '@/components/ui/field';
import { listStreetTurns, setStreetTurnApproval } from './actions';
import { safeCall } from './assign-flow';
import { describeDispatchError } from './error-messages';

type Item = {
  importContainerId: string;
  exportContainerId: string;
  importContainerNo: string | null;
  exportContainerNo: string | null;
  importOrderNo: string;
  exportOrderNo: string;
  shippingLineName: string | null;
};
type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Item[] };

// Danh sách Street Turn chờ số chấp thuận của hãng tàu (spec 03 Rule 3): nhập số (và phí hãng tàu nếu có) cho từng cặp.
// Trống thì giải thích khi nào cặp xuất hiện ở đây (EmptyState). Tải lại khi có sự kiện điều vận (reloadKey đổi).
export function StreetTurnPanel({
  canEdit,
  reloadKey,
  onChanged,
}: {
  canEdit: boolean;
  reloadKey: number;
  /** Sau khi lưu số chấp thuận: Kanban tải lại hai thẻ của cặp. */
  onChanged: (orderContainerIds: string[]) => void;
}) {
  const headingId = useId();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await safeCall(() => listStreetTurns({ pendingOnly: true }));
      if (cancelled) return;
      if (!result.ok) setLoad({ status: 'error' });
      else setLoad({ status: 'ready', items: result.data as Item[] });
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, retry]);

  const count = load.status === 'ready' ? load.items.length : 0;
  return (
    <section
      aria-labelledby={headingId}
      data-street-turn-panel
      className="flex flex-col gap-8 rounded-card border border-line bg-surface px-20 py-16"
    >
      <h2 id={headingId} className="m-0 flex items-center gap-8 text-section-title">
        <Repeat2 className="size-20 text-ink-soft" aria-hidden="true" />
        Street Turn chờ chấp thuận
        {count > 0 ? (
          <span className="rounded-pill bg-surface-2 px-8 text-caption font-bold">{count}</span>
        ) : null}
      </h2>

      {load.status === 'loading' ? (
        <p role="status" className="m-0 text-small text-ink-soft">
          Đang tải danh sách Street Turn
        </p>
      ) : null}

      {load.status === 'error' ? (
        <Alert
          tone="crit"
          icon={<CircleAlert className="size-20" />}
          action={
            <Button variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)}>
              <RefreshCw className="size-18" aria-hidden="true" />
              Thử lại
            </Button>
          }
        >
          Không tải được danh sách Street Turn.
        </Alert>
      ) : null}

      {load.status === 'ready' && load.items.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<Repeat2 className="size-24" />}
          title="Không có Street Turn nào chờ chấp thuận"
          description="Khi bạn ghép cont Nhập với cont Xuất dùng chung vỏ, chuyến cần số chấp thuận của hãng tàu sẽ hiện ở đây."
        />
      ) : null}

      {load.status === 'ready' && load.items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-12 p-0">
          {load.items.map((item) => (
            <StreetTurnRow
              key={item.exportContainerId}
              item={item}
              canEdit={canEdit}
              onSaved={() => {
                setRetry((n) => n + 1);
                onChanged([item.importContainerId, item.exportContainerId]);
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function StreetTurnRow({
  item,
  canEdit,
  onSaved,
}: {
  item: Item;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [approvalRef, setApprovalRef] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await safeCall(() =>
      setStreetTurnApproval({
        orderContainerId: item.exportContainerId,
        approvalRef: approvalRef.trim(),
        ...(fee.trim() ? { feeAmount: fee.trim() } : {}),
      }),
    );
    setBusy(false);
    if (result.ok) onSaved();
    else setError(describeDispatchError(result).text);
  }, [approvalRef, fee, item.exportContainerId, onSaved]);

  return (
    <li
      data-street-turn-item={item.exportContainerId}
      className="flex flex-wrap items-end gap-12 rounded-card-sm border border-line px-12 py-10"
    >
      <div className="min-w-[14rem] flex-1">
        <p className="m-0 text-body-sm">
          <span className="font-mono font-semibold">{item.importContainerNo ?? 'Cont Nhập'}</span>
          {' → '}
          <span className="font-mono font-semibold">
            {item.exportContainerNo ?? 'Cont Xuất'}
          </span>
        </p>
        <p className="m-0 text-small text-ink-soft">
          {item.importOrderNo} và {item.exportOrderNo}
          {item.shippingLineName ? ` · ${item.shippingLineName}` : ''}
        </p>
      </div>
      {canEdit ? (
        <>
          <div className="w-[14rem]">
            <TextField
              label="Số chấp thuận hãng tàu"
              value={approvalRef}
              maxLength={50}
              onChange={(event) => setApprovalRef(event.target.value)}
            />
          </div>
          <div className="w-[11rem]">
            <TextField
              label="Phí hãng tàu (nếu có)"
              inputMode="decimal"
              value={fee}
              placeholder="1500000"
              onChange={(event) => setFee(event.target.value)}
            />
          </div>
          <Button loading={busy} disabled={approvalRef.trim().length === 0} onClick={save}>
            Lưu số chấp thuận
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 w-full text-body-sm text-crit">
          {error}
        </p>
      ) : null}
    </li>
  );
}
