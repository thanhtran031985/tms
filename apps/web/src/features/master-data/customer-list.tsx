'use client';

import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { TextField } from '@/components/ui/field';
import { MainCell, SubText } from '@/components/ui/work-table';
import { CatalogView, type CatalogAccess } from './catalog-view';
import type { CustomerDto } from './entities';
import {
  FormBanner,
  numberOf,
  RestoreSuggestion,
  textOrNull,
  useFormController,
  type FormProps,
} from './form-utils';
import {
  createCustomer,
  listCustomers,
  restoreCustomer,
  softDeleteCustomer,
  updateCustomer,
  updateCustomerBilling,
} from './actions';

function CustomerForm(props: FormProps<CustomerDto>) {
  const { formId, row, readOnly, billingOnly } = props;
  const { errors, banner, deletedId, submit } = useFormController(props, 'code');
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [taxCode, setTaxCode] = useState(row?.taxCode ?? '');
  const [billingAddress, setBillingAddress] = useState(row?.billingAddress ?? '');
  const [paymentTermDays, setPaymentTermDays] = useState(String(row?.paymentTermDays ?? 30));
  const [creditLimit, setCreditLimit] = useState(
    row?.creditLimit ? String(Number(row.creditLimit)) : '',
  );

  const lockIdentity = readOnly || billingOnly;
  const billing = {
    taxCode: textOrNull(taxCode),
    billingAddress: textOrNull(billingAddress),
    paymentTermDays: numberOf(paymentTermDays),
    creditLimit: creditLimit.trim() === '' ? null : creditLimit.trim(),
  };

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-16"
      onSubmit={(event) => {
        event.preventDefault();
        if (!row) {
          void submit(
            () => createCustomer({ code, name, ...billing }),
            `Đã lưu khách hàng ${code.toUpperCase()}.`,
          );
        } else if (billingOnly) {
          void submit(
            () => updateCustomerBilling({ id: row.id, ...billing }),
            `Đã lưu thanh toán của ${row.name}.`,
          );
        } else {
          void submit(
            () => updateCustomer({ id: row.id, code, name, ...billing }),
            `Đã lưu khách hàng ${code.toUpperCase()}.`,
          );
        }
      }}
    >
      <FormBanner message={banner} />
      <TextField
        label="Mã khách hàng"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={errors.code}
        disabled={lockIdentity}
        maxLength={50}
        autoComplete="off"
        className="font-mono"
        hint="Chữ không dấu, số, gạch ngang. Mỗi công ty dùng một mã một lần."
      />
      <RestoreSuggestion deletedId={deletedId} onRestore={props.onRestore} />
      <TextField
        label="Tên khách hàng"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        disabled={lockIdentity}
        maxLength={255}
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
        label="Địa chỉ hóa đơn"
        value={billingAddress}
        onChange={(e) => setBillingAddress(e.target.value)}
        error={errors.billingAddress}
        disabled={readOnly}
        maxLength={500}
      />
      <TextField
        label="Hạn thanh toán (ngày)"
        inputMode="numeric"
        value={paymentTermDays}
        onChange={(e) => setPaymentTermDays(e.target.value)}
        error={errors.paymentTermDays}
        disabled={readOnly}
      />
      <TextField
        label="Hạn mức công nợ (VND)"
        inputMode="decimal"
        value={creditLimit}
        onChange={(e) => setCreditLimit(e.target.value)}
        error={errors.creditLimit}
        disabled={readOnly}
        hint="Chỉ lưu giá trị. Chưa chặn tạo Order khi vượt hạn mức."
      />
    </form>
  );
}

export function CustomerList({ rows, access }: { rows: CustomerDto[]; access: CatalogAccess }) {
  return (
    <CatalogView<CustomerDto>
      title="Khách hàng"
      singular="khách hàng"
      icon={Building2}
      emptyReason="Khách hàng là bên thuê vận chuyển, cần có trước khi tạo bảng giá và Order. Thêm khách đầu tiên để bắt đầu."
      initialRows={rows}
      access={access}
      columns={[
        { id: 'code', header: 'Mã', cell: (r) => <MainCell mono>{r.code}</MainCell> },
        { id: 'name', header: 'Tên khách hàng', cell: (r) => <MainCell>{r.name}</MainCell> },
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
      searchText={(r) => `${r.code} ${r.name} ${r.taxCode ?? ''}`}
      rowCode={(r) => r.code}
      list={() => listCustomers({})}
      softDelete={(id) => softDeleteCustomer({ id })}
      restore={(id) => restoreCustomer({ id })}
      Form={CustomerForm}
    />
  );
}
