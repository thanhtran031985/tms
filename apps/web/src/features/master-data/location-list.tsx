'use client';

import { MapPin } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { LOCATION_TYPES } from '@shared/enums';
import { LOCATION_TYPE_LABELS } from '@shared/labels';
import { SelectField, TextField } from '@/components/ui/field';
import { MainCell, SubText } from '@/components/ui/work-table';
import {
  createLocation,
  listLocations,
  restoreLocation,
  softDeleteLocation,
  updateLocation,
} from './actions';
import { CatalogView, type CatalogAccess } from './catalog-view';
import type { LocationDto, RefOption } from './entities';
import {
  FormBanner,
  numberOf,
  RestoreSuggestion,
  textOrNull,
  useFormController,
  type FormProps,
} from './form-utils';

const TYPE_OPTIONS = LOCATION_TYPES.map((value) => ({ value, label: LOCATION_TYPE_LABELS[value] }));
const toOptions = (list: RefOption[]) => list.map((o) => ({ value: o.id, label: o.name }));

// Khách và nhà cung cấp để chọn chủ sở hữu; truyền qua context vì form do CatalogView dựng trong ngăn kéo.
const RefsContext = createContext<{ customers: RefOption[]; vendors: RefOption[] }>({
  customers: [],
  vendors: [],
});

function LocationForm(props: FormProps<LocationDto>) {
  const { customers, vendors } = useContext(RefsContext);
  const { formId, row, readOnly } = props;
  const { errors, banner, deletedId, submit } = useFormController(props, 'code');
  const [code, setCode] = useState(row?.code ?? '');
  const [type, setType] = useState<string>(row?.type ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [address, setAddress] = useState(row?.address ?? '');
  const [lat, setLat] = useState(row?.lat ?? '');
  const [lng, setLng] = useState(row?.lng ?? '');
  const [radius, setRadius] = useState(String(row?.geofenceRadiusM ?? 300));
  const [zone, setZone] = useState(row?.zone ?? '');
  const [customerId, setCustomerId] = useState(row?.customerId ?? '');
  const [vendorId, setVendorId] = useState(row?.vendorId ?? '');

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-16"
      onSubmit={(event) => {
        event.preventDefault();
        const input = {
          code,
          type,
          name,
          address: textOrNull(address),
          customerId: customerId || null,
          vendorId: vendorId || null,
          lat,
          lng,
          geofenceRadiusM: numberOf(radius),
          zone: textOrNull(zone),
        };
        void submit(
          () => (row ? updateLocation({ id: row.id, ...input }) : createLocation(input)),
          `Đã lưu địa điểm ${code.toUpperCase()}.`,
        );
      }}
    >
      <FormBanner message={banner} />
      <TextField
        label="Mã địa điểm"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={errors.code}
        disabled={readOnly}
        maxLength={50}
        autoComplete="off"
        className="font-mono"
        hint="Ví dụ CATLAI, DEPOT-PL."
      />
      <RestoreSuggestion deletedId={deletedId} onRestore={props.onRestore} />
      <SelectField
        label="Loại địa điểm"
        value={type}
        onChange={(e) => setType(e.target.value)}
        error={errors.type}
        disabled={readOnly}
        options={TYPE_OPTIONS}
        placeholder="Chọn loại địa điểm"
      />
      <TextField
        label="Tên địa điểm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        disabled={readOnly}
        maxLength={255}
      />
      <TextField
        label="Địa chỉ"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        error={errors.address}
        disabled={readOnly}
        maxLength={500}
      />
      <div className="grid grid-cols-2 gap-12">
        <TextField
          label="Vĩ độ"
          inputMode="decimal"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          error={errors.lat}
          disabled={readOnly}
          className="font-mono"
          hint="Từ -90 đến 90."
        />
        <TextField
          label="Kinh độ"
          inputMode="decimal"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          error={errors.lng}
          disabled={readOnly}
          className="font-mono"
          hint="Từ -180 đến 180."
        />
      </div>
      <TextField
        label="Bán kính geofence (mét)"
        inputMode="numeric"
        value={radius}
        onChange={(e) => setRadius(e.target.value)}
        error={errors.geofenceRadiusM}
        disabled={readOnly}
        hint="Mặc định 300 mét. Xe vào vùng này thì tính là đã tới địa điểm."
      />
      <TextField
        label="Khu vực"
        value={zone}
        onChange={(e) => setZone(e.target.value)}
        error={errors.zone}
        disabled={readOnly}
        maxLength={100}
        hint="Dùng để suy ra tuyến, ví dụ Cát Lái, Sóng Thần."
      />
      <SelectField
        label="Khách hàng sở hữu"
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        error={errors.customerId}
        disabled={readOnly}
        options={toOptions(customers)}
        placeholder="Không gắn khách hàng"
      />
      <SelectField
        label="Nhà cung cấp sở hữu"
        value={vendorId}
        onChange={(e) => setVendorId(e.target.value)}
        error={errors.vendorId}
        disabled={readOnly}
        options={toOptions(vendors)}
        placeholder="Không gắn nhà cung cấp"
      />
    </form>
  );
}

export function LocationList({
  rows,
  access,
  customers,
  vendors,
}: {
  rows: LocationDto[];
  access: CatalogAccess;
  customers: RefOption[];
  vendors: RefOption[];
}) {
  const ownerName = (r: LocationDto) =>
    customers.find((c) => c.id === r.customerId)?.name ??
    vendors.find((v) => v.id === r.vendorId)?.name ??
    null;

  return (
    <RefsContext.Provider value={{ customers, vendors }}>
      <CatalogView<LocationDto>
        title="Địa điểm"
        singular="địa điểm"
        icon={MapPin}
        emptyReason="Địa điểm là cảng, depot, kho khách, cây xăng, garage, bãi đỗ có tọa độ để dùng cho Order, chuyến xe và geofence."
        initialRows={rows}
        access={access}
        columns={[
          { id: 'code', header: 'Mã', cell: (r) => <MainCell mono>{r.code}</MainCell> },
          {
            id: 'name',
            header: 'Tên địa điểm',
            cell: (r) => (
              <>
                <MainCell>{r.name}</MainCell>
                {r.address ? <SubText>{r.address}</SubText> : null}
              </>
            ),
          },
          { id: 'type', header: 'Loại', cell: (r) => LOCATION_TYPE_LABELS[r.type] },
          { id: 'zone', header: 'Khu vực', cell: (r) => r.zone ?? <SubText>Chưa đặt</SubText> },
          {
            id: 'radius',
            header: 'Geofence',
            cell: (r) => <span className="font-mono">{r.geofenceRadiusM} m</span>,
          },
          {
            id: 'owner',
            header: 'Chủ sở hữu',
            cell: (r) => ownerName(r) ?? <SubText>Không có</SubText>,
          },
        ]}
        filter={{
          label: 'Lọc địa điểm theo loại',
          tabs: TYPE_OPTIONS.map((o) => ({ id: o.value, label: o.label })),
          pick: (r) => r.type,
        }}
        searchText={(r) => `${r.code} ${r.name} ${r.address ?? ''} ${r.zone ?? ''}`}
        rowCode={(r) => r.code}
        list={() => listLocations({})}
        softDelete={(id) => softDeleteLocation({ id })}
        restore={(id) => restoreLocation({ id })}
        Form={LocationForm}
      />
    </RefsContext.Provider>
  );
}
