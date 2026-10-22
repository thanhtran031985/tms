'use client';

import { Ship } from 'lucide-react';
import { useState } from 'react';
import { TextField, SwitchField } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { MainCell, SubText } from '@/components/ui/work-table';
import {
  createShippingLine,
  listShippingLines,
  restoreShippingLine,
  softDeleteShippingLine,
  updateShippingLine,
} from './actions';
import { CatalogView, type CatalogAccess } from './catalog-view';
import type { ShippingLineDto } from './entities';
import { FormBanner, RestoreSuggestion, useFormController, type FormProps } from './form-utils';

function ShippingLineForm(props: FormProps<ShippingLineDto>) {
  const { formId, row, readOnly } = props;
  const { errors, banner, deletedId, submit } = useFormController(props, 'code');
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [allowsStreetTurn, setAllowsStreetTurn] = useState(row?.allowsStreetTurn ?? false);

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-16"
      onSubmit={(event) => {
        event.preventDefault();
        const input = { code, name, allowsStreetTurn };
        const message = `Đã lưu hãng tàu ${code.toUpperCase()}.`;
        void submit(
          () => (row ? updateShippingLine({ id: row.id, ...input }) : createShippingLine(input)),
          message,
        );
      }}
    >
      <FormBanner message={banner} />
      <TextField
        label="Mã hãng tàu"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={errors.code}
        disabled={readOnly}
        maxLength={20}
        autoComplete="off"
        className="font-mono"
        hint="Ví dụ MSK, ONE, CMA."
      />
      <RestoreSuggestion deletedId={deletedId} onRestore={props.onRestore} />
      <TextField
        label="Tên hãng tàu"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        disabled={readOnly}
        maxLength={255}
      />
      <SwitchField
        label="Cho phép đảo vỏ"
        hint="Bật nếu hãng tàu cho dùng container rỗng của một Order để đóng hàng cho Order khác (Street Turn)."
        checked={allowsStreetTurn}
        onChange={(e) => setAllowsStreetTurn(e.target.checked)}
        disabled={readOnly}
      />
    </form>
  );
}

export function ShippingLineList({
  rows,
  access,
}: {
  rows: ShippingLineDto[];
  access: CatalogAccess;
}) {
  return (
    <CatalogView<ShippingLineDto>
      title="Hãng tàu"
      singular="hãng tàu"
      icon={Ship}
      emptyReason="Hãng tàu gắn với Order và quy định đảo vỏ. Thêm các hãng tàu công ty đang làm việc cùng."
      initialRows={rows}
      access={access}
      columns={[
        { id: 'code', header: 'Mã', cell: (r) => <MainCell mono>{r.code}</MainCell> },
        { id: 'name', header: 'Tên hãng tàu', cell: (r) => <MainCell>{r.name}</MainCell> },
        {
          id: 'st',
          header: 'Đảo vỏ',
          cell: (r) =>
            r.allowsStreetTurn ? <Pill>Cho phép</Pill> : <SubText>Không cho phép</SubText>,
        },
      ]}
      searchText={(r) => `${r.code} ${r.name}`}
      rowCode={(r) => r.code}
      list={() => listShippingLines({})}
      softDelete={(id) => softDeleteShippingLine({ id })}
      restore={(id) => restoreShippingLine({ id })}
      Form={ShippingLineForm}
    />
  );
}
