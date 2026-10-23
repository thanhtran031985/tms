import { describe, expect, it } from 'vitest';
import { describeDispatchError } from './error-messages';
import { allReasonTexts, pickDefault, primaryReason, reasonText } from './resource-reasons';

const err = (code: string, details?: Record<string, string | number>, message = 'máy chủ nói') => ({
  code,
  message,
  details,
});

describe('describeDispatchError', () => {
  it('trùng giờ nêu loại tài nguyên và mã chuyến gây trùng', () => {
    const view = describeDispatchError(
      err('RESOURCE_TIME_CONFLICT', { resource: 'DRIVER', conflictTripCode: 'TRIP-2610-001' }),
    );
    expect(view.kind).toBe('message');
    expect(view.text).toContain('Tài xế đã có chuyến trùng giờ (TRIP-2610-001)');
    expect(view.text).toContain('Chọn xe hoặc tài xế khác');
  });

  it('không điều được theo lý do và gợi ý chọn cái khác', () => {
    expect(describeDispatchError(err('DRIVER_NOT_AVAILABLE', { reason: 'OFF_DUTY' })).text).toBe(
      'Tài xế đang nghỉ phép, không điều được. Chọn tài xế khác.',
    );
    expect(
      describeDispatchError(err('TRACTOR_NOT_AVAILABLE', { reason: 'MAINTENANCE' })).text,
    ).toContain('Đầu kéo đang bảo dưỡng');
    expect(
      describeDispatchError(err('TRAILER_NOT_AVAILABLE', { reason: 'BUSY' }, 'Rơ moóc bận.')).text,
    ).toBe('Rơ moóc bận. Chọn rơ moóc khác.');
  });

  it('RESOURCE_BUSY_RETRY: đang có người gán cùng lúc, thử lại', () => {
    expect(describeDispatchError(err('RESOURCE_BUSY_RETRY')).text).toMatch(
      /Đang có người gán cùng lúc.*thử lại/,
    );
  });

  it('STALE_DATA: kind stale để tải lại thẻ', () => {
    expect(describeDispatchError(err('STALE_DATA')).kind).toBe('stale');
  });

  it('thiếu khối lượng cần xác nhận; giờ lái chỉ cho Quản trị ghi đè', () => {
    expect(describeDispatchError(err('WEIGHT_CONFIRMATION_REQUIRED')).kind).toBe('confirm-weight');
    expect(
      describeDispatchError(err('DRIVING_HOURS_EXCEEDED'), { canOverrideHours: true }).kind,
    ).toBe('override-hours');
    const other = describeDispatchError(err('DRIVING_HOURS_EXCEEDED'), { canOverrideHours: false });
    expect(other.kind).toBe('message');
    expect(other.text).toContain('nhờ Quản trị ghi đè');
  });

  it('các mã Rule 5, 6, 7, tải trọng, giấy tờ có câu riêng', () => {
    expect(describeDispatchError(err('REEFER_REQUIRES_GENSET')).text).toContain('genset');
    expect(describeDispatchError(err('DG_CERTIFICATE_REQUIRED')).text).toContain('chứng chỉ');
    expect(describeDispatchError(err('PORT_NOT_READY')).text).toContain('Cảng chưa sẵn sàng');
    expect(describeDispatchError(err('PAYLOAD_EXCEEDED', undefined, 'Vượt 2 tấn.')).text).toBe(
      'Vượt 2 tấn. Chọn rơ moóc có tải trọng lớn hơn.',
    );
    expect(
      describeDispatchError(err('DOCUMENT_EXPIRED', undefined, 'Đăng kiểm hết hạn.')).text,
    ).toContain('Đăng kiểm hết hạn. Chọn xe khác');
  });

  it('lỗi mạng: thẻ đã quay về; mã lạ dùng câu của máy chủ', () => {
    expect(describeDispatchError(err('NETWORK')).text).toContain('quay về vị trí cũ');
    expect(describeDispatchError(err('MA_LA', undefined, 'Câu của máy chủ.')).text).toBe(
      'Câu của máy chủ.',
    );
  });
});

describe('lý do trên bảng gán xe', () => {
  const reason = (
    code: string,
    details?: Record<string, string | number>,
    severity: 'info' | 'warn' | 'danger' = 'danger',
  ) => ({
    code,
    severity,
    message: 'câu gốc',
    ...(details ? { details } : {}),
  });

  it('câu một dòng theo mã', () => {
    expect(reasonText(reason('AVAILABLE', undefined, 'info'))).toBe('Rảnh trong khung giờ này');
    expect(reasonText(reason('DOCUMENT_EXPIRED', { document: 'Đăng kiểm' }))).toBe(
      'Đăng kiểm hết hạn, không được điều',
    );
    expect(
      reasonText(reason('DOCUMENT_EXPIRING', { document: 'GPLX', daysRemaining: 2 }, 'warn')),
    ).toBe('Được điều · GPLX còn 2 ngày');
    expect(reasonText(reason('RESOURCE_TIME_CONFLICT'))).toBe('Trùng giờ với chuyến khác');
    expect(reasonText(reason('DRIVER_NOT_AVAILABLE', { reason: 'OFF_DUTY' }))).toBe(
      'Tài xế nghỉ phép hôm nay',
    );
    expect(reasonText(reason('MA_LA'))).toBe('câu gốc');
  });

  it('lý do nổi bật: chặn trước cảnh báo trước thông tin', () => {
    const resource = {
      id: 'x',
      label: '51C',
      available: false,
      reasons: [
        reason('TRACTOR_TARE_NOT_COUNTED', undefined, 'info'),
        reason('DOCUMENT_EXPIRING', { document: 'Bảo hiểm', daysRemaining: 3 }, 'warn'),
        reason('DOCUMENT_EXPIRED', { document: 'Đăng kiểm' }),
      ],
    };
    expect(primaryReason(resource).code).toBe('DOCUMENT_EXPIRED');
    expect(allReasonTexts(resource)).toEqual([
      'Được điều · Bảo hiểm còn 3 ngày',
      'Đăng kiểm hết hạn, không được điều',
    ]);
  });

  it('chọn sẵn phương án rảnh đầu tiên, ưu tiên cái được chỉ định nếu còn rảnh', () => {
    const list = [
      { id: 'a', label: 'a', available: false, reasons: [] },
      { id: 'b', label: 'b', available: true, reasons: [] },
      { id: 'c', label: 'c', available: true, reasons: [] },
    ];
    expect(pickDefault(list)).toBe('b');
    expect(pickDefault(list, 'c')).toBe('c');
    expect(pickDefault(list, 'a')).toBe('b');
    expect(pickDefault([], 'a')).toBe('');
  });
});
