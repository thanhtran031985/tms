'use client';

import { Route } from 'lucide-react';
import { useState } from 'react';
import type { StopType } from '@shared/enums';
import { TextField } from '@/components/ui/field';
import {
  RouteStopTemplateEditor,
  RouteTemplatesProvider,
} from '@/features/orders/route-stop-template';
import { MainCell } from '@/components/ui/work-table';
import { createRoute, listRoutes, restoreRoute, softDeleteRoute, updateRoute } from './actions';
import { CatalogView, type CatalogAccess } from './catalog-view';
import type { RouteDto } from './entities';
import {
  FormBanner,
  numberOf,
  RestoreSuggestion,
  useFormController,
  type FormProps,
} from './form-utils';

function RouteForm(props: FormProps<RouteDto>) {
  const { formId, row, readOnly } = props;
  const { errors, banner, deletedId, submit } = useFormController(props, 'routeCode');
  const [routeCode, setRouteCode] = useState(row?.routeCode ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [originZone, setOriginZone] = useState(row?.originZone ?? '');
  const [destinationZone, setDestinationZone] = useState(row?.destinationZone ?? '');
  const [km, setKm] = useState(row ? String(row.standardDistanceKm) : '');

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-16"
      onSubmit={(event) => {
        event.preventDefault();
        const input = {
          routeCode,
          name,
          originZone,
          destinationZone,
          standardDistanceKm: numberOf(km),
        };
        void submit(
          () => (row ? updateRoute({ id: row.id, ...input }) : createRoute(input)),
          `Đã lưu tuyến ${routeCode.toUpperCase()}.`,
        );
      }}
    >
      <FormBanner message={banner} />
      <TextField
        label="Mã tuyến"
        value={routeCode}
        onChange={(e) => setRouteCode(e.target.value)}
        error={errors.routeCode}
        disabled={readOnly}
        maxLength={50}
        autoComplete="off"
        className="font-mono"
        hint="Ví dụ CL-ST cho Cát Lái – Sóng Thần."
      />
      <RestoreSuggestion deletedId={deletedId} onRestore={props.onRestore} />
      <TextField
        label="Tên tuyến"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        disabled={readOnly}
        maxLength={255}
      />
      <TextField
        label="Khu vực đi"
        value={originZone}
        onChange={(e) => setOriginZone(e.target.value)}
        error={errors.originZone}
        disabled={readOnly}
        maxLength={100}
      />
      <TextField
        label="Khu vực đến"
        value={destinationZone}
        onChange={(e) => setDestinationZone(e.target.value)}
        error={errors.destinationZone}
        disabled={readOnly}
        maxLength={100}
      />
      <TextField
        label="Km chuẩn"
        inputMode="numeric"
        value={km}
        onChange={(e) => setKm(e.target.value)}
        error={errors.standardDistanceKm}
        disabled={readOnly}
        hint="Quãng đường chuẩn dùng tính định mức dầu và phân bổ chi phí."
      />
      {row ? <RouteStopTemplateEditor routeId={row.id} readOnly={readOnly} /> : null}
    </form>
  );
}

export function RouteList({
  rows,
  access,
  templates,
}: {
  rows: RouteDto[];
  access: CatalogAccess;
  /** Chuỗi Stop nội địa đã cấu hình theo tuyến (task 04). */
  templates: Record<string, StopType[]>;
}) {
  return (
    <RouteTemplatesProvider value={templates}>
      <CatalogView<RouteDto>
        title="Tuyến"
        singular="tuyến"
        icon={Route}
        emptyReason="Tuyến là cặp khu vực đi và đến, là chiều đầu tiên của bảng giá. Thêm các tuyến công ty hay chạy."
        initialRows={rows}
        access={access}
        columns={[
          { id: 'code', header: 'Mã', cell: (r) => <MainCell mono>{r.routeCode}</MainCell> },
          { id: 'name', header: 'Tên tuyến', cell: (r) => <MainCell>{r.name}</MainCell> },
          { id: 'from', header: 'Khu vực đi', cell: (r) => r.originZone },
          { id: 'to', header: 'Khu vực đến', cell: (r) => r.destinationZone },
          {
            id: 'km',
            header: 'Km chuẩn',
            cell: (r) => <span className="font-mono">{r.standardDistanceKm}</span>,
          },
        ]}
        searchText={(r) => `${r.routeCode} ${r.name} ${r.originZone} ${r.destinationZone}`}
        rowCode={(r) => r.routeCode}
        list={() => listRoutes({})}
        softDelete={(id) => softDeleteRoute({ id })}
        restore={(id) => restoreRoute({ id })}
        Form={RouteForm}
      />
    </RouteTemplatesProvider>
  );
}
