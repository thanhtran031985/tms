import { describe, expect, it } from 'vitest';
import { STANDARD_STOP_CHAINS, buildStopPlan, locationRoleOf } from './stops';

const zones = { originZone: 'Cát Lái', destinationZone: 'Sóng Thần' };
const place = (id: string, name: string) => ({ id, name });

describe('chuỗi Stop tiêu chuẩn', () => {
  it('IMPORT: PICK_FULL → UNSTUFFING → RETURN_EMPTY', () => {
    const plan = buildStopPlan({ orderType: 'IMPORT', zones });
    expect(plan.map((s) => s.stopType)).toEqual(['PICK_FULL', 'UNSTUFFING', 'RETURN_EMPTY']);
    expect(plan.map((s) => s.sequenceNo)).toEqual([1, 2, 3]);
  });

  it('EXPORT: PICK_EMPTY → STUFFING → PORT_IN', () => {
    const plan = buildStopPlan({ orderType: 'EXPORT', zones });
    expect(plan.map((s) => s.stopType)).toEqual(['PICK_EMPTY', 'STUFFING', 'PORT_IN']);
  });

  it('DOMESTIC: theo mẫu của tuyến, đúng thứ tự khai báo', () => {
    const plan = buildStopPlan({
      orderType: 'DOMESTIC',
      zones,
      template: ['PICK_EMPTY', 'STUFFING', 'UNSTUFFING', 'RETURN_EMPTY'],
    });
    expect(plan.map((s) => s.stopType)).toEqual([
      'PICK_EMPTY',
      'STUFFING',
      'UNSTUFFING',
      'RETURN_EMPTY',
    ]);
    expect(plan.map((s) => s.sequenceNo)).toEqual([1, 2, 3, 4]);
  });

  it('DOMESTIC không có mẫu thì không sinh Stop (service báo lỗi)', () => {
    expect(() => buildStopPlan({ orderType: 'DOMESTIC', zones })).toThrow(/mẫu/);
    expect(() => buildStopPlan({ orderType: 'DOMESTIC', zones, template: [] })).toThrow(/mẫu/);
  });

  it('bảng chuỗi chuẩn không có Stop trùng thứ tự và không đổi khi tạo bản sao', () => {
    expect(STANDARD_STOP_CHAINS.IMPORT).toEqual(['PICK_FULL', 'UNSTUFFING', 'RETURN_EMPTY']);
    const plan = buildStopPlan({ orderType: 'IMPORT', zones });
    plan.pop();
    expect(STANDARD_STOP_CHAINS.IMPORT).toHaveLength(3);
  });
});

describe('địa điểm của Stop', () => {
  it('mỗi loại Stop thuộc một vai trò địa điểm: lấy, đóng/dỡ hàng, hạ/trả', () => {
    expect(locationRoleOf('PICK_FULL')).toBe('pickup');
    expect(locationRoleOf('PICK_EMPTY')).toBe('pickup');
    expect(locationRoleOf('STUFFING')).toBe('cargo');
    expect(locationRoleOf('UNSTUFFING')).toBe('cargo');
    expect(locationRoleOf('RETURN_EMPTY')).toBe('drop');
    expect(locationRoleOf('PORT_IN')).toBe('drop');
  });

  it('có địa điểm được chọn thì dùng id và tên của địa điểm', () => {
    const plan = buildStopPlan({
      orderType: 'IMPORT',
      zones,
      places: {
        pickup: place('loc-port', 'Cảng Cát Lái'),
        cargo: place('loc-kho', 'Kho Phúc Thịnh'),
        drop: place('loc-depot', 'Depot Phước Long'),
      },
    });
    expect(plan.map((s) => [s.locationId, s.locationName])).toEqual([
      ['loc-port', 'Cảng Cát Lái'],
      ['loc-kho', 'Kho Phúc Thịnh'],
      ['loc-depot', 'Depot Phước Long'],
    ]);
  });

  it('bỏ trống thì lấy tên vùng của tuyến, không có id', () => {
    const plan = buildStopPlan({ orderType: 'IMPORT', zones });
    expect(plan.map((s) => [s.locationId, s.locationName])).toEqual([
      [null, 'Cát Lái'],
      [null, 'Sóng Thần'],
      [null, 'Cát Lái'],
    ]);
  });

  it('chỉ chọn một phần địa điểm: phần còn lại vẫn rơi về tên vùng', () => {
    const plan = buildStopPlan({
      orderType: 'EXPORT',
      zones,
      places: { cargo: place('loc-kho', 'Kho Phúc Thịnh') },
    });
    expect(plan.map((s) => s.locationName)).toEqual(['Cát Lái', 'Kho Phúc Thịnh', 'Cát Lái']);
  });
});
