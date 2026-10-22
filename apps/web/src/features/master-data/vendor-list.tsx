'use client';

import { Truck } from 'lucide-react';
import { useState } from 'react';
import { VENDOR_TYPES } from '@shared/enums';
import { VENDOR_TYPE_LABELS } from '@shared/labels';
import { SelectField, TextField } from '@/components/ui/field';
import { MainCell, SubText } from '@/components/ui/work-table';
import {
  createVendor,
  listVendors,
  restoreVendor,
  softDeleteVendor,
  updateVendor,
} from './actions';
import { CatalogView, type CatalogAccess } from './catalog-view';
import type { VendorDto } from './entities';
import {
  FormBanner,
  numberOf,
  RestoreSuggestion,
  textOrNull,
  useFormController,
  type FormProps,
} from './form-utils';

const TYPE_OPTIONS = VENDOR_TYPES.map((value) => ({ value, label: VENDOR_TYPE_LABELS[value] }));

function VendorForm(props: FormProps<VendorDto>) {
  const { formId, row, readOnly } = props;
  const { errors, banner, deletedId, submit } = useFormController(props, 'code');
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [type, setType] = useState<string>(row?.type ?? '');
  const [taxCode, setTaxCode] = useState(row?.taxCode ?? '');
  const [paymentTermDays, setPaymentTermDays] = useState(String(row?.paymentTermDays ?? 30));

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-16"
      onSubmit={(event) => {
        event.preventDefault();
        const input = {
          code,
          name,
          type,
          taxCode: textOrNull(taxCode),
          paymentTermDays: numberOf(paymentTermDays),
        };
        void submit(
          () => (row ? updateVendor({ id: row.id, ...input }) : createVendor(input)),
          `Đã lưu nhà cung cấp ${code.toUpperCase()}.`,
        );
      }}
    >
      <FormBanner message={banner} />
      <TextField
        label="Mã nhà cung cấp"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={errors.code}
        disabled={readOnly}
        maxLength={50}
        autoComplete="off"
        className="font-mono"
      />
      <RestoreSuggestion deletedId={deletedId} onRestore={props.onRestore} />
      <TextField
        label="Tên nhà cung cấp"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        disabled={readOnly}
        maxLength={255}
      />
      <SelectField
        label="Loại"
        value={type}
        onChange={(e) => setType(e.target.value)}
        error={errors.type}
        disabled={readOnly}
        options={TYPE_OPTIONS}
        placeholder="Chọn loại nhà cung cấp"
      />
      <TextField
        label="Mã số thuế"
        value={taxCode}
        onChange={(e) => setTaxCode(e.target.value)}
        error={errors.taxCode}
        disabled={readOnly}
        maxLength={20}
        className="font-mono"
      />
      <TextField
        label="Hạn thanh toán (ngày)"
        inputMode="numeric"
        value={paymentTermDays}
        onChange={(e) => setPaymentTermDays(e.target.value)}
        error={errors.paymentTermDays}
        disabled={readOnly}
      />
    </form>
  );
}

export function VendorList({ rows, access }: { rows: VendorDto[]; access: CatalogAccess }) {
  return (
    <CatalogView<VendorDto>
      title="Nhà cung cấp"
      singular="nhà cung cấp"
      icon={Truck}
      emptyReason="Nhà cung cấp gồm cây xăng, nhà xe ngoài, garage, cảng, depot và lốp; dùng cho phiếu dầu, chi phí và đối soát."
      initialRows={rows}
      access={access}
      columns={[
        { id: 'code', header: 'Mã', cell: (r) => <MainCell mono>{r.code}</MainCell> },
        { id: 'name', header: 'Tên nhà cung cấp', cell: (r) => <MainCell>{r.name}</MainCell> },
        { id: 'type', header: 'Loại', cell: (r) => VENDOR_TYPE_LABELS[r.type] },
        {
          id: 'tax',
          header: 'Mã số thuế',
          cell: (r) =>
            r.taxCode ? <span className="font-mono">{r.taxCode}</span> : <SubText>Chưa có</SubText>,
        },
        {
          id: 'term',
          header: 'Hạn thanh toán',
          cell: (r) =>
            r.paymentTermDays === null ? <SubText>Chưa đặt</SubText> : `${r.paymentTermDays} ngày`,
        },
      ]}
      filter={{
        label: 'Lọc nhà cung cấp theo loại',
        tabs: TYPE_OPTIONS.map((o) => ({ id: o.value, label: o.label })),
        pick: (r) => r.type,
      }}
      searchText={(r) => `${r.code} ${r.name} ${r.taxCode ?? ''}`}
      rowCode={(r) => r.code}
      list={() => listVendors({})}
      softDelete={(id) => softDeleteVendor({ id })}
      restore={(id) => restoreVendor({ id })}
      Form={VendorForm}
    />
  );
}
