'use client';

import { CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { CONTAINER_TYPES, type OrderType } from '@shared/enums';
import { parseContainerList } from '@shared/container-list';
import { validateContainerNo } from '@shared/iso6346';
import { Button, IconButton } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { vnLocalToIso } from '@/lib/format';
import { cn } from '@/lib/utils';

// Nhập danh sách container (tạo Order, thêm container): ô dán tách số cont từ Excel/email, bảng dòng cont với check digit ISO 6346
// báo ngay dưới ô khi gõ, báo trùng số. Mọi ô là input native nên dùng được bằng bàn phím.
export type RowState = {
  key: string;
  containerNo: string;
  containerType: string;
  sealNo: string;
  cargoWeightTons: string;
  vgmTons: string;
  demFreeUntil: string;
  detFreeUntil: string;
  reeferSetpointC: string;
  isDangerousGoods: boolean;
  dgClass: string;
  routeId: string;
  manualPrice: string;
  manualReason: string;
};

let rowSeq = 0;
export function emptyRow(containerType = '20DC', containerNo = ''): RowState {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    containerNo,
    containerType,
    sealNo: '',
    cargoWeightTons: '',
    vgmTons: '',
    demFreeUntil: '',
    detFreeUntil: '',
    reeferSetpointC: '',
    isDangerousGoods: false,
    dgClass: '',
    routeId: '',
    manualPrice: '',
    manualReason: '',
  };
}

// "3.100.000" hoặc "3 100 000" → "3100000"; chuỗi khác giữ nguyên để zod báo lỗi đúng chỗ.
function moneyInput(value: string): string {
  const text = value.trim();
  return /^\d{1,3}([. ]\d{3})+$/.test(text) ? text.replace(/[. ]/g, '') : text;
}

/** Dòng trong bảng → dữ liệu gửi Server Action (zod chuẩn hóa tiếp ở server). */
export function rowsToPayload(rows: RowState[], options: { manualPrice?: boolean } = {}) {
  return rows.map((r) => ({
    containerNo: r.containerNo.trim() || null,
    containerType: r.containerType,
    routeId: r.routeId || null,
    sealNo: r.sealNo,
    cargoWeightTons: r.cargoWeightTons,
    vgmTons: r.vgmTons,
    isDangerousGoods: r.isDangerousGoods,
    dgClass: r.dgClass,
    reeferSetpointC: r.reeferSetpointC,
    demFreeUntil: vnLocalToIso(r.demFreeUntil),
    detFreeUntil: vnLocalToIso(r.detFreeUntil),
    ...(options.manualPrice
      ? {
          manualPrice: r.manualPrice.trim()
            ? { price: moneyInput(r.manualPrice), reason: r.manualReason }
            : null,
        }
      : {}),
  }));
}

/** Lỗi theo dòng tính ở client (khi gõ): check digit, trùng số, hàng Nhập thiếu số. */
export function rowIssues(
  rows: RowState[],
  orderType: OrderType,
  existingNumbers: readonly string[] = [],
): Record<string, string> {
  const issues: Record<string, string> = {};
  const firstAt = new Map<string, number>();
  const existing = new Set(existingNumbers);
  rows.forEach((row, index) => {
    const text = row.containerNo.trim();
    if (!text) {
      if (orderType === 'IMPORT') issues[row.key] = 'Hàng Nhập phải có số container.';
      return;
    }
    const check = validateContainerNo(text);
    if (!check.ok) {
      issues[row.key] = check.error;
      return;
    }
    const first = firstAt.get(check.containerNo);
    if (first !== undefined) issues[row.key] = `Trùng với dòng ${first + 1} trong danh sách.`;
    else if (existing.has(check.containerNo))
      issues[row.key] = 'Số container này đã có trong Order.';
    else firstAt.set(check.containerNo, index);
  });
  return issues;
}

const inputClass =
  'h-ctl w-full min-w-0 rounded-control border border-line-strong bg-surface px-8 text-body-sm text-ink placeholder:text-ink-soft hover:border-ink-soft aria-invalid:border-2 aria-invalid:border-crit disabled:bg-surface-2 disabled:text-ink-soft';

type Props = {
  orderType: OrderType;
  rows: RowState[];
  onChange: (rows: RowState[]) => void;
  routes: { id: string; name: string }[];
  /** Lỗi từ server theo khóa "containers.N.field" (N tính theo thứ tự dòng đã gửi). */
  serverErrors?: Record<string, string[]>;
  onEdited?: (index: number) => void;
  existingNumbers?: readonly string[];
  /** Hiện cột giá tay (thêm cont vào Order đã xác nhận). */
  allowManualPrice?: boolean;
};

export function ContainerEntry({
  orderType,
  rows,
  onChange,
  routes,
  serverErrors = {},
  onEdited,
  existingNumbers = [],
  allowManualPrice = false,
}: Props) {
  const pasteId = useId();
  const errorBase = useId();
  const [pasted, setPasted] = useState('');
  const [defaultType, setDefaultType] = useState('20DC');
  const parsed = useMemo(() => parseContainerList(pasted), [pasted]);
  const issues = useMemo(
    () => rowIssues(rows, orderType, existingNumbers),
    [rows, orderType, existingNumbers],
  );
  const invalidCount = parsed.filter((p) => !p.valid).length;

  function update(index: number, patch: Partial<RowState>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    onEdited?.(index);
  }

  function addPasted() {
    const added = parsed.map((item) => emptyRow(defaultType, item.containerNo));
    // Bỏ dòng trống đầu tiên nếu người dùng chưa nhập gì.
    const base = rows.filter((r) => r.containerNo.trim() !== '' || rows.length > 1);
    onChange([...base, ...added]);
    setPasted('');
  }

  const th =
    'whitespace-nowrap border-b border-line bg-surface-2 px-8 py-8 text-left text-caption text-ink-soft';
  const td = 'border-b border-line px-6 py-8 align-top';

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-col gap-12 rounded-card border border-line bg-surface-2 p-16">
        <div className="flex flex-col gap-6">
          <label htmlFor={pasteId} className="text-label text-ink">
            Dán danh sách số container
          </label>
          <textarea
            id={pasteId}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            placeholder={'MSKU1234565\nCSQU3054383\nONEU5001120'}
            aria-describedby={`${pasteId}-hint`}
            className="w-full rounded-control border border-line-strong bg-surface p-12 font-mono text-code text-ink placeholder:text-ink-soft hover:border-ink-soft"
          />
          <p id={`${pasteId}-hint`} className="text-small text-ink-soft">
            Dán từ Excel hoặc email: mỗi số một dòng, hoặc cách nhau bằng dấu phẩy, tab, khoảng
            trắng. Hệ thống tách số và kiểm tra số cuối (check digit) ngay.
          </p>
        </div>
        {parsed.length > 0 ? (
          <div aria-live="polite" className="flex flex-col gap-8">
            <p
              className={cn(
                'flex items-center gap-6 text-body-sm font-semibold',
                invalidCount > 0 ? 'text-crit' : 'text-ok',
              )}
            >
              {invalidCount > 0 ? (
                <CircleAlert className="size-18 flex-none" aria-hidden="true" />
              ) : (
                <CircleCheck className="size-18 flex-none" aria-hidden="true" />
              )}
              Tìm thấy {parsed.length} số container
              {invalidCount > 0 ? `, ${invalidCount} số cần sửa` : ', tất cả hợp lệ'}
            </p>
            {invalidCount > 0 ? (
              <ul className="list-disc pl-20 text-body-sm text-crit">
                {parsed
                  .filter((p) => !p.valid)
                  .map((p) => (
                    <li key={p.line}>
                      Mục {p.line} <span className="font-mono">{p.containerNo || p.raw}</span>:{' '}
                      {p.error}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-12">
          <div className="w-full max-w-form sm:w-auto sm:min-w-cell">
            <SelectField
              label="Loại cont cho các số vừa dán"
              value={defaultType}
              onChange={(e) => setDefaultType(e.target.value)}
              options={CONTAINER_TYPES.map((v) => ({ value: v, label: v }))}
            />
          </div>
          <Button onClick={addPasted} disabled={parsed.length === 0}>
            <Plus className="size-20" aria-hidden="true" />
            Thêm {parsed.length > 0 ? `${parsed.length} ` : ''}số vào bảng
          </Button>
        </div>
      </div>

      <div className="relative overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-table border-collapse">
          <caption className="sr-only">Danh sách container của Order</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                Dòng
              </th>
              <th scope="col" className={th}>
                Số container
              </th>
              <th scope="col" className={th}>
                Loại
              </th>
              <th scope="col" className={th}>
                Seal
              </th>
              <th scope="col" className={th}>
                VGM (tấn)
              </th>
              <th scope="col" className={th}>
                Hạn DEM
              </th>
              <th scope="col" className={th}>
                Hạn DET
              </th>
              <th scope="col" className={th}>
                Lạnh (°C)
              </th>
              <th scope="col" className={th}>
                Hàng nguy hiểm
              </th>
              {routes.length > 0 ? (
                <th scope="col" className={th}>
                  Tuyến riêng
                </th>
              ) : null}
              {allowManualPrice ? (
                <th scope="col" className={th}>
                  Giá tay (₫) · lý do
                </th>
              ) : null}
              <th scope="col" className={th}>
                <span className="sr-only">Xóa dòng</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const n = index + 1;
              const server = (field: string) => serverErrors[`containers.${index}.${field}`]?.[0];
              const noError = issues[row.key] ?? server('containerNo');
              const isRefrigerated = row.containerType.endsWith('RF');
              return (
                <tr key={row.key}>
                  <td className={cn(td, 'text-ink-soft')}>{n}</td>
                  <td className={cn(td, 'min-w-cell')}>
                    <input
                      aria-label={`Số container dòng ${n}`}
                      value={row.containerNo}
                      onChange={(e) => update(index, { containerNo: e.target.value.toUpperCase() })}
                      placeholder={orderType === 'IMPORT' ? 'Bắt buộc' : 'Có thể để trống'}
                      aria-invalid={noError ? true : undefined}
                      aria-describedby={noError ? `${errorBase}-no-error-${index}` : undefined}
                      autoComplete="off"
                      className={cn(inputClass, 'font-mono')}
                    />
                    {noError ? (
                      <p
                        id={`${errorBase}-no-error-${index}`}
                        role="alert"
                        className="mt-4 flex items-start gap-4 text-small text-crit"
                      >
                        <CircleAlert className="mt-2 size-14 flex-none" aria-hidden="true" />
                        <span>{noError}</span>
                      </p>
                    ) : null}
                  </td>
                  <td className={cn(td, 'min-w-cell-sm')}>
                    <select
                      aria-label={`Loại container dòng ${n}`}
                      value={row.containerType}
                      onChange={(e) => update(index, { containerType: e.target.value })}
                      className={inputClass}
                    >
                      {CONTAINER_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cn(td, 'min-w-cell-sm')}>
                    <input
                      aria-label={`Số seal dòng ${n}`}
                      value={row.sealNo}
                      onChange={(e) => update(index, { sealNo: e.target.value })}
                      aria-invalid={server('sealNo') ? true : undefined}
                      className={cn(inputClass, 'font-mono')}
                    />
                  </td>
                  <td className={cn(td, 'min-w-cell-sm')}>
                    <input
                      aria-label={`VGM dòng ${n}`}
                      inputMode="decimal"
                      value={row.vgmTons}
                      onChange={(e) => update(index, { vgmTons: e.target.value })}
                      aria-invalid={server('vgmTons') ? true : undefined}
                      className={inputClass}
                    />
                    {server('vgmTons') ? (
                      <p role="alert" className="mt-4 text-small text-crit">
                        {server('vgmTons')}
                      </p>
                    ) : null}
                  </td>
                  <td className={cn(td, 'min-w-cell')}>
                    <input
                      type="datetime-local"
                      aria-label={`Hạn DEM dòng ${n}`}
                      value={row.demFreeUntil}
                      onChange={(e) => update(index, { demFreeUntil: e.target.value })}
                      className={inputClass}
                    />
                  </td>
                  <td className={cn(td, 'min-w-cell')}>
                    <input
                      type="datetime-local"
                      aria-label={`Hạn DET dòng ${n}`}
                      value={row.detFreeUntil}
                      onChange={(e) => update(index, { detFreeUntil: e.target.value })}
                      className={inputClass}
                    />
                  </td>
                  <td className={cn(td, 'min-w-cell-sm')}>
                    <input
                      aria-label={`Nhiệt độ lạnh dòng ${n}`}
                      inputMode="decimal"
                      value={row.reeferSetpointC}
                      onChange={(e) => update(index, { reeferSetpointC: e.target.value })}
                      disabled={!isRefrigerated}
                      placeholder={isRefrigerated ? '-18' : '—'}
                      aria-invalid={server('reeferSetpointC') ? true : undefined}
                      className={inputClass}
                    />
                  </td>
                  <td className={cn(td, 'min-w-cell')}>
                    <div className="flex items-center gap-6">
                      <input
                        type="checkbox"
                        aria-label={`Hàng nguy hiểm dòng ${n}`}
                        checked={row.isDangerousGoods}
                        onChange={(e) => update(index, { isDangerousGoods: e.target.checked })}
                        className="size-20 flex-none cursor-pointer accent-primary"
                      />
                      <input
                        aria-label={`Loại hàng nguy hiểm dòng ${n}`}
                        value={row.dgClass}
                        onChange={(e) => update(index, { dgClass: e.target.value })}
                        disabled={!row.isDangerousGoods}
                        placeholder="IMDG"
                        aria-invalid={server('dgClass') ? true : undefined}
                        className={cn(inputClass, 'min-w-0')}
                      />
                    </div>
                    {server('dgClass') ? (
                      <p role="alert" className="mt-4 text-small text-crit">
                        {server('dgClass')}
                      </p>
                    ) : null}
                  </td>
                  {routes.length > 0 ? (
                    <td className={cn(td, 'min-w-cell')}>
                      <select
                        aria-label={`Tuyến riêng dòng ${n}`}
                        value={row.routeId}
                        onChange={(e) => update(index, { routeId: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Theo tuyến của Order</option>
                        {routes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  ) : null}
                  {allowManualPrice ? (
                    <td className={cn(td, 'min-w-cell-lg')}>
                      <input
                        aria-label={`Giá tay dòng ${n}`}
                        inputMode="numeric"
                        value={row.manualPrice}
                        onChange={(e) => update(index, { manualPrice: e.target.value })}
                        placeholder="Chỉ khi chưa có bảng giá"
                        aria-invalid={server('manualPrice.price') ? true : undefined}
                        className={inputClass}
                      />
                      <input
                        aria-label={`Lý do giá tay dòng ${n}`}
                        value={row.manualReason}
                        onChange={(e) => update(index, { manualReason: e.target.value })}
                        placeholder="Lý do (bắt buộc)"
                        disabled={!row.manualPrice.trim()}
                        aria-invalid={server('manualPrice.reason') ? true : undefined}
                        className={cn(inputClass, 'mt-4')}
                      />
                      {server('manualPrice.price') || server('manualPrice.reason') ? (
                        <p role="alert" className="mt-4 text-small text-crit">
                          {server('manualPrice.price') ?? server('manualPrice.reason')}
                        </p>
                      ) : null}
                    </td>
                  ) : null}
                  <td className={td}>
                    <IconButton
                      aria-label={`Xóa dòng ${n}`}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      disabled={rows.length === 1}
                    >
                      <Trash2 className="size-20" aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-12">
        <Button
          variant="secondary"
          onClick={() => onChange([...rows, emptyRow(rows.at(-1)?.containerType)])}
        >
          <Plus className="size-20" aria-hidden="true" />
          Thêm dòng trống
        </Button>
        <p className="text-small text-ink-soft">{rows.length} container trong danh sách</p>
      </div>
    </div>
  );
}
