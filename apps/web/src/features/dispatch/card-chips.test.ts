import { describe, expect, it } from 'vitest';
import { makeCard } from './board-fixtures';
import { cardChips } from './card-chips';

const TZ = 'Asia/Ho_Chi_Minh';
const NOW = Date.parse('2026-10-17T07:20:00.000Z'); // 14:20 giờ Việt Nam
const later = (ms: number) => new Date(NOW + ms).toISOString();
const H = 3_600_000;
const M = 60_000;
const labels = (card = makeCard()) => cardChips(card, NOW, TZ).map((c) => c.label);

describe('cardChips', () => {
  it('cont xuất: cut-off còn 2 giờ 15 là crit, kèm trạng thái cảng', () => {
    const chips = cardChips(makeCard({ cutOffAt: later(2 * H + 15 * M) }), NOW, TZ);

    expect(chips[0]).toMatchObject({ tone: 'crit', icon: 'clock', label: 'Cut-off còn 2 giờ 15' });
    expect(chips[1]).toMatchObject({ tone: 'ok', icon: 'check', label: 'Có lệnh cấp rỗng' });
  });

  it('mức hạn đổi màu theo giờ còn lại: 7 giờ 40 warn, 20 giờ 40 info', () => {
    expect(cardChips(makeCard({ cutOffAt: later(7 * H + 40 * M) }), NOW, TZ)[0]).toMatchObject({
      tone: 'warn',
      label: 'Cut-off còn 7 giờ 40',
    });
    expect(cardChips(makeCard({ cutOffAt: later(20 * H + 40 * M) }), NOW, TZ)[0]).toMatchObject({
      tone: 'info',
      label: 'Cut-off còn 20 giờ 40',
    });
  });

  it('cont nhập: DEM và DET riêng, HOLD hải quan là crit có icon khóa', () => {
    const chips = cardChips(
      makeCard({
        orderType: 'IMPORT',
        demFreeUntil: later(24 * H + 16 * H),
        detFreeUntil: later(30 * M),
        portReadiness: 'HOLD_CUSTOMS',
      }),
      NOW,
      TZ,
    );

    expect(chips.map((c) => c.label)).toEqual([
      'DEM còn 1 ngày 16 giờ',
      'DET còn 30 phút',
      'HOLD hải quan',
    ]);
    expect(chips[1]!.tone).toBe('crit');
    expect(chips[2]).toMatchObject({ tone: 'crit', icon: 'lock' });
  });

  it('chờ EDO (nhập) và chờ lệnh cấp rỗng (xuất) khi cảng chưa xác nhận; nội địa không có nhãn cảng', () => {
    expect(labels(makeCard({ orderType: 'IMPORT', portReadiness: 'PENDING' }))).toContain(
      'Chờ EDO',
    );
    expect(labels(makeCard({ portReadiness: 'PENDING' }))).toContain('Chờ lệnh cấp rỗng');
    expect(labels(makeCard({ orderType: 'DOMESTIC', portReadiness: 'PENDING' }))).toEqual([]);
    expect(labels(makeCard({ orderType: 'IMPORT', portReadiness: 'READY_EDO' }))).toEqual([
      'Có EDO',
    ]);
  });

  it('Rule 8: khung giờ kết thúc sau cut-off thì thêm chip đỏ', () => {
    const miss = cardChips(
      makeCard({ cutOffAt: '2026-10-17T08:00:00.000Z', windowEnd: '2026-10-17T09:20:00.000Z' }),
      NOW,
      TZ,
    );
    const ok = cardChips(
      makeCard({ cutOffAt: '2026-10-17T10:00:00.000Z', windowEnd: '2026-10-17T09:20:00.000Z' }),
      NOW,
      TZ,
    );

    expect(miss.find((c) => c.key === 'cutoff-miss')).toMatchObject({
      tone: 'crit',
      icon: 'warning',
      label: 'Dự kiến quá cut-off',
    });
    expect(ok.find((c) => c.key === 'cutoff-miss')).toBeUndefined();
  });

  it('đặc tính hàng và thông tin thiếu', () => {
    const chips = labels(
      makeCard({
        isReefer: true,
        isDangerousGoods: true,
        isStreetTurn: true,
        streetTurnApprovalRef: 'MSK-ST-1',
        missing: ['CONTAINER_NO', 'WEIGHT'],
      }),
    );

    expect(chips).toEqual(
      expect.arrayContaining([
        'Cont lạnh',
        'Hàng nguy hiểm',
        'Street Turn',
        'Thiếu số cont',
        'Thiếu khối lượng',
      ]),
    );
  });

  it('cont đang chạy hoặc chờ chứng từ không hiện mốc hạn; HOLD vẫn hiện', () => {
    const running = makeCard({ column: 'IN_TRANSIT', cutOffAt: later(1 * H) });
    expect(labels(running)).toEqual([]);
    expect(labels({ ...running, portReadiness: 'HOLD_LINE' })).toEqual(['Hãng tàu giữ']);
  });
});

describe('cardChips: ghép chuyến, Street Turn và tính lại giá (task 08)', () => {
  const trip = (mode: 'SINGLE' | 'TWIN_20' | 'COMBINED') => ({
    id: 't',
    code: 'TRIP-2610-001',
    version: 1,
    status: 'PLANNED' as const,
    mode,
  });

  it('chuyến ghép có chip TWIN_20 hoặc COMBINED, chuyến đơn thì không', () => {
    expect(labels(makeCard({ trip: trip('TWIN_20') }))).toContain('TWIN_20');
    expect(labels(makeCard({ trip: trip('COMBINED') }))).toContain('COMBINED');
    expect(labels(makeCard({ trip: trip('SINGLE') }))).not.toContain('SINGLE');
  });

  it('Street Turn chưa có số chấp thuận nhắc màu cảnh báo, có số thì chỉ là thông tin', () => {
    const waiting = cardChips(makeCard({ isStreetTurn: true }), NOW, TZ).find((c) => c.key === 'st');
    expect(waiting).toMatchObject({ tone: 'warn', label: 'Street Turn chờ chấp thuận' });
    const approved = cardChips(
      makeCard({ isStreetTurn: true, streetTurnApprovalRef: 'MSK-ST-1' }),
      NOW,
      TZ,
    ).find((c) => c.key === 'st');
    expect(approved).toMatchObject({ tone: 'info', label: 'Street Turn' });
  });

  it('cont cần tính lại giá có chip cảnh báo kèm icon', () => {
    const chip = cardChips(makeCard({ repriceRequired: true }), NOW, TZ).find((c) => c.key === 'reprice');
    expect(chip).toMatchObject({ tone: 'warn', icon: 'refresh', label: 'Cần tính lại giá' });
  });
});
