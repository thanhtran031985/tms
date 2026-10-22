'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import { CALC_BASES, CONTAINER_TYPES, FEE_TARIFF_CATEGORIES, TRIP_MODES } from '@shared/enums';
import { CALC_BASIS_LABELS, FEE_CATEGORY_LABELS, TRIP_MODE_LABELS } from '@shared/labels';
import type { Failure, Result } from '@shared/result';
import { Alert } from '@/components/ui/alert';
import { SelectField, SwitchField, TextField } from '@/components/ui/field';
import { FormBanner } from '@/features/master-data/form-utils';
import {
  createFeeTariff,
  createFreightTariff,
  reviseFeeTariff,
  reviseFreightTariff,
  updateFeeTariff,
  updateFreightTariff,
} from './tariff-actions';
import type { FeeDto, FreightDto, RefOption, TariffDto } from './tariff-types';

// Form giá cước / bảng phí trong ngăn kéo. Chế độ:
//   create  tạo giá mới · edit  sửa giá CHƯA hiệu lực · revise  điều chỉnh giá ĐANG hiệu lực (đóng bản cũ, tạo bản mới)
//   view    chỉ xem (hết hạn, đã ngừng, hoặc vai trò không đủ quyền)
export type FormMode = 'create' | 'edit' | 'revise' | 'view';

export type TariffFormProps = {
  kind: 'freight' | 'fee';
  formId: string;
  mode: FormMode;
  row: TariffDto | null;
  routes: RefOption[];
  customers: RefOption[];
  today: string;
  onSaving: (saving: boolean) => void;
  onSaved: (message: string) => void;
};

const CONTAINER_OPTIONS = CONTAINER_TYPES.map((value) => ({ value, label: value }));
const TRIP_OPTIONS = TRIP_MODES.map((value) => ({ value, label: TRIP_MODE_LABELS[value] }));
const CATEGORY_OPTIONS = FEE_TARIFF_CATEGORIES.map((value) => ({
  value,
  label: FEE_CATEGORY_LABELS[value],
}));
const BASIS_OPTIONS = CALC_BASES.map((value) => ({ value, label: CALC_BASIS_LABELS[value] }));
const toOptions = (list: RefOption[]) => list.map((o) => ({ value: o.id, label: o.name }));

const moneyText = (value: string | null | undefined) => (value ? String(Number(value)) : '');

export function TariffForm(props: TariffFormProps) {
  const { kind, formId, mode, row, routes, customers, today, onSaving, onSaved } = props;
  const freight = kind === 'freight' ? (row as FreightDto | null) : null;
  const fee = kind === 'fee' ? (row as FeeDto | null) : null;
  const locked = mode === 'view';
  // Điều chỉnh giá giữ nguyên khóa 4D: chỉ giá, VAT và ngày đổi được.
  const keyLocked = locked || mode === 'revise';

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const [routeId, setRouteId] = useState(row?.routeId ?? '');
  const [containerType, setContainerType] = useState<string>(row?.containerType ?? '');
  const [tripMode, setTripMode] = useState<string>(row?.tripMode ?? 'SINGLE');
  const [customerId, setCustomerId] = useState(row?.customerId ?? '');
  const [basePrice, setBasePrice] = useState(moneyText(freight?.basePrice));
  const [vat, setVat] = useState(row?.vatRatePercent ? String(Number(row.vatRatePercent)) : '');
  const [validFrom, setValidFrom] = useState(mode === 'revise' ? today : (row?.validFrom ?? today));
  const [validTo, setValidTo] = useState(mode === 'revise' ? '' : (row?.validTo ?? ''));
  const [feeCategory, setFeeCategory] = useState<string>(fee?.feeCategory ?? '');
  const [feeCode, setFeeCode] = useState(fee?.feeCode ?? '');
  const [feeName, setFeeName] = useState(fee?.feeName ?? '');
  const [calcBasis, setCalcBasis] = useState<string>(fee?.calcBasis ?? 'PER_TRIP');
  const [amount, setAmount] = useState(moneyText(fee?.amount));
  const [isExcluded, setIsExcluded] = useState(fee?.isExcluded ?? false);

  function showFailure(failure: Failure) {
    if (failure.code === 'TARIFF_OVERLAP') {
      setErrors({ validFrom: failure.message });
      setBanner(null);
      return;
    }
    const fields: Record<string, string> = {};
    for (const [key, messages] of Object.entries(failure.fieldErrors ?? {})) {
      if (messages[0]) fields[key] = messages[0];
    }
    setErrors(fields);
    setBanner(Object.keys(fields).length > 0 ? null : failure.message);
  }

  async function run(action: () => Promise<Result<unknown>>, message: string) {
    onSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const result = await action();
      if (result.ok) onSaved(message);
      else showFailure(result);
    } catch {
      setBanner('Không gửi được dữ liệu. Kiểm tra kết nối mạng rồi bấm Lưu lại.');
    } finally {
      onSaving(false);
    }
  }

  function submit() {
    const dates = { validFrom, validTo: validTo || null };
    if (kind === 'freight') {
      const price = { basePrice, vatRatePercent: vat };
      if (mode === 'revise' && row) {
        return run(
          () => reviseFreightTariff({ id: row.id, ...price, ...dates }),
          'Đã điều chỉnh giá cước: giá cũ được đóng, giá mới có hiệu lực từ ngày đã chọn.',
        );
      }
      const input = {
        routeId,
        containerType,
        tripMode,
        customerId: customerId || null,
        ...price,
        ...dates,
      };
      return run(
        () => (row ? updateFreightTariff({ id: row.id, ...input }) : createFreightTariff(input)),
        'Đã lưu giá cước.',
      );
    }
    const money = {
      amount: isExcluded && amount.trim() === '' ? '0' : amount,
      vatRatePercent: vat || null,
      isExcluded,
    };
    if (mode === 'revise' && row) {
      return run(
        () => reviseFeeTariff({ id: row.id, feeName, calcBasis, ...money, ...dates }),
        'Đã điều chỉnh phí: phí cũ được đóng, phí mới có hiệu lực từ ngày đã chọn.',
      );
    }
    const input = {
      routeId: routeId || null,
      containerType,
      tripMode,
      customerId: customerId || null,
      feeCategory,
      feeCode,
      feeName,
      calcBasis,
      ...money,
      ...dates,
    };
    return run(
      () => (row ? updateFeeTariff({ id: row.id, ...input }) : createFeeTariff(input)),
      'Đã lưu phí.',
    );
  }

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-16"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {mode === 'revise' ? (
        <Alert tone="info" icon={<Info className="size-20" />}>
          Sửa giá đang hiệu lực sẽ đóng giá cũ vào ngày hôm trước ngày hiệu lực mới và tạo giá mới
          từ ngày đó. Giá cũ giữ nguyên để các đơn đã tính vẫn truy vết được.
        </Alert>
      ) : null}
      <FormBanner message={banner} />

      <SelectField
        label={kind === 'fee' ? 'Tuyến' : 'Tuyến'}
        value={routeId}
        onChange={(e) => setRouteId(e.target.value)}
        error={errors.routeId}
        disabled={keyLocked}
        options={toOptions(routes)}
        placeholder={kind === 'fee' ? 'Mọi tuyến (phí theo cảng, đảo vỏ…)' : 'Chọn tuyến'}
      />
      <div className="grid grid-cols-2 gap-12">
        <SelectField
          label="Loại cont"
          value={containerType}
          onChange={(e) => setContainerType(e.target.value)}
          error={errors.containerType}
          disabled={keyLocked}
          options={CONTAINER_OPTIONS}
          placeholder="Chọn loại cont"
        />
        <SelectField
          label="Chế độ chạy"
          value={tripMode}
          onChange={(e) => setTripMode(e.target.value)}
          error={errors.tripMode}
          disabled={keyLocked}
          options={TRIP_OPTIONS}
        />
      </div>
      <SelectField
        label="Khách hàng"
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        error={errors.customerId}
        disabled={keyLocked}
        options={toOptions(customers)}
        placeholder={kind === 'fee' ? 'Phí chung (mọi khách)' : 'Giá chung (mọi khách)'}
        hint="Giá riêng của khách được ưu tiên hơn giá chung khi tra giá."
      />

      {kind === 'fee' ? (
        <>
          <div className="grid grid-cols-2 gap-12">
            <SelectField
              label="Nhóm phí"
              value={feeCategory}
              onChange={(e) => setFeeCategory(e.target.value)}
              error={errors.feeCategory}
              disabled={keyLocked}
              options={CATEGORY_OPTIONS}
              placeholder="Chọn nhóm phí"
            />
            <TextField
              label="Mã phí"
              value={feeCode}
              onChange={(e) => setFeeCode(e.target.value)}
              error={errors.feeCode}
              disabled={keyLocked}
              maxLength={50}
              autoComplete="off"
              className="font-mono"
              hint="Ví dụ LIFT_FEE."
            />
          </div>
          <TextField
            label="Tên phí"
            value={feeName}
            onChange={(e) => setFeeName(e.target.value)}
            error={errors.feeName}
            disabled={locked}
            maxLength={255}
          />
          <SelectField
            label="Cách tính"
            value={calcBasis}
            onChange={(e) => setCalcBasis(e.target.value)}
            error={errors.calcBasis}
            disabled={locked}
            options={BASIS_OPTIONS}
          />
          <SwitchField
            label="Miễn phí này"
            hint="Bật để khách riêng được miễn mã phí này; không lấy phí chung thay thế."
            checked={isExcluded}
            onChange={(e) => setIsExcluded(e.target.checked)}
            disabled={locked}
          />
          <TextField
            label="Số tiền (VND)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.amount}
            disabled={locked}
          />
        </>
      ) : (
        <TextField
          label="Giá cước (VND)"
          inputMode="decimal"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          error={errors.basePrice}
          disabled={locked}
        />
      )}
      <TextField
        label="Thuế VAT (%)"
        inputMode="decimal"
        value={vat}
        onChange={(e) => setVat(e.target.value)}
        error={errors.vatRatePercent}
        disabled={locked}
        hint={kind === 'fee' ? 'Bỏ trống nếu phí không chịu VAT.' : 'Ví dụ 8.'}
      />
      <div className="grid grid-cols-2 gap-12">
        <TextField
          label={mode === 'revise' ? 'Hiệu lực mới từ' : 'Hiệu lực từ'}
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
          error={errors.validFrom}
          disabled={locked}
          min={mode === 'revise' ? today : undefined}
        />
        <TextField
          label="Hiệu lực đến"
          type="date"
          value={validTo}
          onChange={(e) => setValidTo(e.target.value)}
          error={errors.validTo}
          disabled={locked}
          hint="Để trống nếu vô thời hạn."
        />
      </div>
    </form>
  );
}
