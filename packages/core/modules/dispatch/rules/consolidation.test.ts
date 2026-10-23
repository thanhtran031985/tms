// Test thuần cho các Rule ghép chuyến (spec 03 mục 2, task 08 bước 1): Rule 1, 2 (cộng dồn), 3, 4 và 6 (ghép khác khách).
// Không cần DB. Đỏ vì các hàm trong rules/*.ts chưa cài đặt.
import { describe, expect, it } from 'vitest';
import { checkCombinedSequence } from './combined-sequence';
import { checkDangerousGoodsMix } from './dangerous-goods';
import { checkStreetTurnPair, type StreetTurnSide } from './street-turn';
import { checkTwin20 } from './twin20';
import { checkTripWeight } from './weight';

const at = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00.000Z`);
const codes = (result: { errors: { code: string }[] }) => result.errors.map((e) => e.code);
const warningCodes = (result: { warnings: { code: string }[] }) => result.warnings.map((e) => e.code);

const container = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  lineNo: 1,
  containerNo: `CONT${id}`,
  containerType: '20DC' as const,
  vgmTons: null as string | null,
  cargoWeightTons: '10.00' as string | null,
  linkedContainerId: null as string | null,
  orderId: 'o1',
  isDangerousGoods: false,
  ...over,
});

describe('Rule 1: checkTwin20', () => {
  const pair = [container('a'), container('b')];
  const trailer = (over: Record<string, unknown>) => ({
    plateNumber: '51R-1',
    trailerType: '40FT_COMBO' as const,
    canCarryTwin20: true,
    ...over,
  });

  it('chặn rơ moóc 20FT và rơ moóc không có chốt giữa', () => {
    expect(codes(checkTwin20({ tripMode: 'TWIN_20', containers: pair, trailer: trailer({ trailerType: '20FT', canCarryTwin20: false }) }))).toEqual(['TWIN20_TRAILER_NOT_ALLOWED']);
    expect(codes(checkTwin20({ tripMode: 'TWIN_20', containers: pair, trailer: trailer({ trailerType: '40FT', canCarryTwin20: false }) }))).toEqual(['TWIN20_TRAILER_NOT_ALLOWED']);
  });

  it('cho phép rơ moóc có chốt giữa, và chưa chọn rơ moóc thì chỉ kiểm cont', () => {
    expect(codes(checkTwin20({ tripMode: 'TWIN_20', containers: pair, trailer: trailer({}) }))).toEqual([]);
    expect(codes(checkTwin20({ tripMode: 'TWIN_20', containers: pair, trailer: undefined }))).toEqual([]);
  });

  it('chặn cont 40 hoặc 45 feet trong TWIN_20', () => {
    const mixed = [container('a'), container('b', { containerType: '40HC' })];
    expect(codes(checkTwin20({ tripMode: 'TWIN_20', containers: mixed, trailer: undefined }))).toEqual(['TWIN20_CONTAINER_NOT_20FT']);
  });

  it('chế độ khác TWIN_20 không áp Rule này', () => {
    const big = [container('a', { containerType: '40HC' }), container('b', { containerType: '40HC' })];
    expect(codes(checkTwin20({ tripMode: 'COMBINED', containers: big, trailer: trailer({ canCarryTwin20: false }) }))).toEqual([]);
    expect(codes(checkTwin20({ tripMode: 'SINGLE', containers: [container('a')], trailer: trailer({ canCarryTwin20: false }) }))).toEqual([]);
  });
});

describe('Rule 2: checkTripWeight cộng dồn', () => {
  const trailer = { plateNumber: '51R-1', maxPayloadTons: '28.00', tareWeightTons: '4.00' };
  const tractor = { plateNumber: '51C-1', permittedGrossWeightTons: '40.00', tareWeightTons: '9.00' };

  it('cộng khối lượng các cont (hàng + vỏ chuẩn) rồi chặn khi vượt tải trọng rơ moóc', () => {
    const heavy = [container('a', { cargoWeightTons: '14.00' }), container('b', { cargoWeightTons: '14.00' })];
    const result = checkTripWeight({ containers: heavy, tractor, trailer, confirmMissingWeight: false });
    expect(codes(result)).toEqual(['PAYLOAD_EXCEEDED']);
    expect(result.errors[0]!.details?.weightTons).toBe('32.6');
  });

  it('VGM thay cho hàng cộng vỏ chuẩn', () => {
    const vgm = [container('a', { vgmTons: '12.00' }), container('b', { vgmTons: '12.00' })];
    expect(codes(checkTripWeight({ containers: vgm, tractor, trailer, confirmMissingWeight: false }))).toEqual([]);
  });

  it('chặn khi cộng tự trọng rơ moóc và đầu kéo vượt khối lượng cho phép của đầu kéo', () => {
    const pair = [container('a'), container('b')]; // 24,6 + 4 + 9 = 37,6
    const tight = { ...tractor, permittedGrossWeightTons: '30.00' };
    expect(codes(checkTripWeight({ containers: pair, tractor: tight, trailer, confirmMissingWeight: false }))).toEqual(['PAYLOAD_EXCEEDED']);
  });

  it('đầu kéo chưa khai báo tự trọng thì cảnh báo thay vì bỏ qua âm thầm', () => {
    const pair = [container('a'), container('b')];
    const unknown = { ...tractor, tareWeightTons: null };
    const result = checkTripWeight({ containers: pair, tractor: unknown, trailer, confirmMissingWeight: false });
    expect(codes(result)).toEqual([]);
    expect(warningCodes(result)).toContain('TRACTOR_TARE_NOT_COUNTED');
  });

  it('thiếu khối lượng: cần xác nhận, đã xác nhận thì chỉ cảnh báo', () => {
    const pair = [container('a', { cargoWeightTons: null }), container('b')];
    expect(codes(checkTripWeight({ containers: pair, tractor, trailer, confirmMissingWeight: false }))).toEqual(['WEIGHT_CONFIRMATION_REQUIRED']);
    const confirmed = checkTripWeight({ containers: pair, tractor, trailer, confirmMissingWeight: true });
    expect(codes(confirmed)).toEqual([]);
    expect(warningCodes(confirmed)).toContain('WEIGHT_MISSING');
  });
});

describe('Rule 6 (ghép): checkDangerousGoodsMix', () => {
  const orders = new Map([
    ['o1', { customerId: 'cust-1' }],
    ['o2', { customerId: 'cust-2' }],
  ]);
  const withOrder = (id: string, orderId: string, dg: boolean) =>
    container(id, { orderId, isDangerousGoods: dg });

  it('chặn TWIN_20 hàng nguy hiểm với container của khách khác', () => {
    const containers = [withOrder('a', 'o1', true), withOrder('b', 'o2', false)];
    expect(codes(checkDangerousGoodsMix({ tripMode: 'TWIN_20', containers, orders }))).toEqual(['DG_TWIN20_MIXED_CUSTOMER']);
  });

  it('cho phép cùng khách, không có hàng nguy hiểm hoặc chế độ khác TWIN_20', () => {
    expect(codes(checkDangerousGoodsMix({ tripMode: 'TWIN_20', containers: [withOrder('a', 'o1', true), withOrder('b', 'o1', false)], orders }))).toEqual([]);
    expect(codes(checkDangerousGoodsMix({ tripMode: 'TWIN_20', containers: [withOrder('a', 'o1', false), withOrder('b', 'o2', false)], orders }))).toEqual([]);
    expect(codes(checkDangerousGoodsMix({ tripMode: 'COMBINED', containers: [withOrder('a', 'o1', true), withOrder('b', 'o2', false)], orders }))).toEqual([]);
  });
});

describe('Rule 3: checkStreetTurnPair', () => {
  const side = (id: string, over: Partial<StreetTurnSide> & { stops?: StreetTurnSide['stops'] } = {}): StreetTurnSide => ({
    container: container(id, { containerType: '40HC' }),
    order: { shippingLineId: 'msk' },
    stops: [],
    ...over,
  });
  const importSide = side('imp', {
    stops: [{ stopType: 'UNSTUFFING', windowStart: at('08:00'), deadlineTime: at('09:00') }],
  });
  const exportSide = side('exp', {
    stops: [{ stopType: 'STUFFING', windowStart: at('10:00'), deadlineTime: at('11:00') }],
  });
  const allowed = { allowsStreetTurn: true };

  it('cho phép khi cùng hãng, cùng loại, hãng cho phép và thứ tự Stop hợp lệ', () => {
    expect(codes(checkStreetTurnPair({ importSide, exportSide, shippingLine: allowed }))).toEqual([]);
  });

  it('chặn khác hãng tàu', () => {
    const other = side('exp', { ...exportSide, order: { shippingLineId: 'cma' } });
    expect(codes(checkStreetTurnPair({ importSide, exportSide: other, shippingLine: allowed }))).toEqual(['STREET_TURN_LINE_MISMATCH']);
  });

  it('chặn khác loại container', () => {
    const other = side('exp', { ...exportSide, container: container('exp', { containerType: '40DC' }) });
    expect(codes(checkStreetTurnPair({ importSide, exportSide: other, shippingLine: allowed }))).toEqual(['STREET_TURN_TYPE_MISMATCH']);
  });

  it('chặn hãng tàu không cho Street Turn hoặc Order không ghi hãng tàu', () => {
    expect(codes(checkStreetTurnPair({ importSide, exportSide, shippingLine: { allowsStreetTurn: false } }))).toEqual(['STREET_TURN_NOT_ALLOWED']);
    expect(codes(checkStreetTurnPair({ importSide, exportSide, shippingLine: undefined }))).toEqual(['STREET_TURN_NOT_ALLOWED']);
  });

  it('chặn khi UNSTUFFING kết thúc sau giờ STUFFING bắt đầu; thiếu giờ thì cảnh báo chưa kiểm tra được', () => {
    const late = side('imp', {
      stops: [{ stopType: 'UNSTUFFING', windowStart: at('08:00'), deadlineTime: at('10:30') }],
    });
    expect(codes(checkStreetTurnPair({ importSide: late, exportSide, shippingLine: allowed }))).toEqual(['INVALID_STOP_SEQUENCE']);

    const noTimes = side('imp', { stops: [{ stopType: 'UNSTUFFING', windowStart: null, deadlineTime: null }] });
    const result = checkStreetTurnPair({ importSide: noTimes, exportSide, shippingLine: allowed });
    expect(codes(result)).toEqual([]);
    expect(warningCodes(result)).toContain('SEQUENCE_NOT_VERIFIED');
  });
});

describe('Rule 4: checkCombinedSequence', () => {
  const stop = (orderContainerId: string, sequenceNo: number, stopType: string, start: string | null) => ({
    orderContainerId,
    sequenceNo,
    stopType: stopType as 'PICK_FULL',
    windowStart: start ? at(start) : null,
    deadlineTime: null,
  });
  const forty = (id: string, over: Record<string, unknown> = {}) => container(id, { containerType: '40HC', ...over });

  it('chặn khi lấy rỗng cont Xuất trước khi trả rỗng cont Nhập (2 cont 40 cùng trên rơ moóc)', () => {
    const result = checkCombinedSequence({
      containers: [forty('imp'), forty('exp')],
      stops: [
        stop('imp', 1, 'PICK_FULL', '07:00'),
        stop('imp', 3, 'RETURN_EMPTY', '11:00'),
        stop('exp', 1, 'PICK_EMPTY', '09:00'),
        stop('exp', 3, 'PORT_IN', '13:00'),
      ],
    });
    expect(codes(result)).toEqual(['INVALID_STOP_SEQUENCE']);
  });

  it('cho phép trả rỗng rồi mới lấy rỗng', () => {
    const result = checkCombinedSequence({
      containers: [forty('imp'), forty('exp')],
      stops: [
        stop('imp', 1, 'PICK_FULL', '07:00'),
        stop('imp', 3, 'RETURN_EMPTY', '09:00'),
        stop('exp', 1, 'PICK_EMPTY', '10:00'),
        stop('exp', 3, 'PORT_IN', '13:00'),
      ],
    });
    expect(codes(result)).toEqual([]);
  });

  it('cho phép hai cont 20 feet chồng nhau và coi cặp Street Turn là một vỏ', () => {
    const overlapping = [
      stop('imp', 1, 'PICK_FULL', '07:00'),
      stop('imp', 3, 'RETURN_EMPTY', '11:00'),
      stop('exp', 1, 'PICK_EMPTY', '09:00'),
      stop('exp', 3, 'PORT_IN', '13:00'),
    ];
    expect(codes(checkCombinedSequence({ containers: [container('imp'), container('exp')], stops: overlapping }))).toEqual([]);
    expect(
      codes(
        checkCombinedSequence({
          containers: [forty('imp', { linkedContainerId: 'exp' }), forty('exp', { linkedContainerId: 'imp' })],
          stops: overlapping,
        }),
      ),
    ).toEqual([]);
  });

  it('thiếu giờ Stop thì cảnh báo chưa kiểm tra được thứ tự', () => {
    const result = checkCombinedSequence({
      containers: [forty('imp'), forty('exp')],
      stops: [stop('imp', 1, 'PICK_FULL', null), stop('exp', 1, 'PICK_EMPTY', null)],
    });
    expect(codes(result)).toEqual([]);
    expect(warningCodes(result)).toContain('SEQUENCE_NOT_VERIFIED');
  });
});
