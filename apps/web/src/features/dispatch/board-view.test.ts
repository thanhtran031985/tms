import { describe, expect, it } from 'vitest';
import { makeCard } from './board-fixtures';
import {
  boardSearchString,
  buildColumnItems,
  cardMatchesFilters,
  dayLabel,
  laneBlockPosition,
  laneTicks,
  localDate,
  nowLinePosition,
  parseBoardSearch,
  shiftDate,
  windowLabel,
} from './board-view';

const TZ = 'Asia/Ho_Chi_Minh';
const DAY_START = '2026-10-16T17:00:00.000Z'; // 00:00 ngày 17/10 giờ Việt Nam
const DAY_END = '2026-10-17T17:00:00.000Z';

describe('buildColumnItems: gom nhóm theo Order', () => {
  it('chỉ gom khi Order có từ 2 thẻ trong cùng cột; giữ vị trí thẻ đầu tiên', () => {
    const a1 = makeCard({ orderContainerId: 'a1', orderId: 'A', orderNo: 'A' });
    const b1 = makeCard({ orderContainerId: 'b1', orderId: 'B', orderNo: 'B' });
    const a2 = makeCard({ orderContainerId: 'a2', orderId: 'A', orderNo: 'A' });
    const c1 = makeCard({ orderContainerId: 'c1', orderId: 'C', orderNo: 'C' });
    const a3 = makeCard({ orderContainerId: 'a3', orderId: 'A', orderNo: 'A' });

    const items = buildColumnItems([a1, b1, a2, c1, a3]);

    expect(
      items.map((i) => (i.kind === 'group' ? `G:${i.group.orderId}` : i.card.orderContainerId)),
    ).toEqual(['G:A', 'b1', 'c1']);
    const group = items[0]!;
    expect(group.kind === 'group' && group.group.cards.map((c) => c.orderContainerId)).toEqual([
      'a1',
      'a2',
      'a3',
    ]);
  });

  it('cột rỗng không có mục', () => {
    expect(buildColumnItems([])).toEqual([]);
  });
});

describe('lịch xe 05:00–23:00', () => {
  it('khối chuyến theo phần trăm của trục 18 giờ', () => {
    // 06:00–10:30 giờ Việt Nam: bắt đầu sau 05:00 một giờ, dài 4,5 giờ.
    const position = laneBlockPosition(
      '2026-10-16T23:00:00.000Z',
      '2026-10-17T03:30:00.000Z',
      DAY_START,
    )!;
    expect(position.left).toBeCloseTo(5.56, 1);
    expect(position.width).toBeCloseTo(25, 1);
  });

  it('khối thò ra ngoài trục bị cắt, khối nằm hẳn ngoài thì bỏ', () => {
    const early = laneBlockPosition(
      '2026-10-16T17:00:00.000Z',
      '2026-10-16T23:00:00.000Z',
      DAY_START,
    )!;
    expect(early.left).toBe(0);
    expect(early.width).toBeCloseTo(5.56, 1);
    expect(
      laneBlockPosition('2026-10-16T17:00:00.000Z', '2026-10-16T21:00:00.000Z', DAY_START),
    ).toBeNull();
    expect(
      laneBlockPosition('2026-10-17T16:00:00.000Z', '2026-10-17T16:59:00.000Z', DAY_START),
    ).toBeNull();
  });

  it('10 nhãn giờ, mỗi 2 giờ từ 05:00 đến 23:00', () => {
    const ticks = laneTicks();
    expect(ticks.map((t) => t.label)).toEqual([
      '05:00',
      '07:00',
      '09:00',
      '11:00',
      '13:00',
      '15:00',
      '17:00',
      '19:00',
      '21:00',
      '23:00',
    ]);
    expect(ticks[0]!.left).toBe(0);
    expect(ticks[9]!.left).toBe(100);
  });

  it('vạch bây giờ: 14:20 nằm ở 51,85%; ngoài ngày hoặc ngoài trục thì null', () => {
    const at1420 = Date.parse('2026-10-17T07:20:00.000Z');
    expect(nowLinePosition(at1420, DAY_START, DAY_END)).toBeCloseTo(51.85, 1);
    expect(nowLinePosition(Date.parse('2026-10-17T18:00:00.000Z'), DAY_START, DAY_END)).toBeNull();
    expect(nowLinePosition(Date.parse('2026-10-16T20:00:00.000Z'), DAY_START, DAY_END)).toBeNull(); // 03:00
  });
});

describe('ngày giờ theo múi giờ tenant', () => {
  it('nhãn khung giờ', () => {
    expect(windowLabel(makeCard(), TZ)).toBe('Khung 14:30–16:20');
    expect(
      windowLabel(
        makeCard({
          windowStart: '2026-10-17T15:00:00.000Z',
          windowEnd: '2026-10-17T19:30:00.000Z',
        }),
        TZ,
      ),
    ).toBe('Khung 22:00–02:30 (18/10)');
    expect(windowLabel(makeCard({ windowStart: null, windowEnd: null }), TZ)).toBe(
      'Chưa có khung giờ',
    );
  });

  it('ngày dương lịch qua nửa đêm theo giờ Việt Nam', () => {
    expect(localDate(Date.parse('2026-10-16T17:00:00.000Z'), TZ)).toBe('2026-10-17');
    expect(localDate(Date.parse('2026-10-16T16:59:00.000Z'), TZ)).toBe('2026-10-16');
  });

  it('cộng ngày và nhãn thứ', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayLabel('2026-10-17')).toBe('Thứ Bảy 17/10');
    expect(dayLabel('2026-10-23')).toBe('Thứ Sáu 23/10');
  });
});

describe('bộ lọc trên URL', () => {
  const TODAY = '2026-10-23';

  it('đọc đầy đủ tham số hợp lệ', () => {
    const id = '0190a000-0000-7000-8000-000000000101';
    expect(
      parseBoardSearch(
        { date: '2026-10-26', dir: 'EXPORT', q: ' OOLU ', zone: 'Cát Lái', customer: id },
        TODAY,
      ),
    ).toEqual({
      date: '2026-10-26',
      direction: 'EXPORT',
      q: 'OOLU',
      zone: 'Cát Lái',
      customerId: id,
    });
  });

  it('giá trị sai bị bỏ: ngày sai về hôm nay, chiều sai thành không lọc', () => {
    expect(
      parseBoardSearch({ date: '26/10/2026', dir: 'DOMESTIC', customer: 'ngắn' }, TODAY),
    ).toEqual({ date: TODAY, direction: null, q: '', zone: null, customerId: null });
    expect(parseBoardSearch({ date: '2026-02-31x' }, TODAY).date).toBe(TODAY);
  });

  it('ghi query chỉ gồm tham số khác mặc định', () => {
    const none = parseBoardSearch({}, TODAY);
    expect(boardSearchString(none, TODAY)).toBe('');
    expect(
      boardSearchString({ ...none, date: '2026-10-26', direction: 'IMPORT', q: 'a b' }, TODAY),
    ).toBe('?date=2026-10-26&dir=IMPORT&q=a+b');
  });
});

describe('cardMatchesFilters', () => {
  const base = {
    date: '2026-10-17',
    direction: null,
    q: '',
    zone: null,
    customerId: null,
  } as const;

  it('không lọc thì khớp mọi thẻ', () => {
    expect(cardMatchesFilters(makeCard(), base)).toBe(true);
  });

  it('lọc theo chiều, khách, khu vực', () => {
    const card = makeCard({ zones: ['Cát Lái', 'Biên Hòa'] });
    expect(cardMatchesFilters(card, { ...base, direction: 'IMPORT' })).toBe(false);
    expect(cardMatchesFilters(card, { ...base, direction: 'EXPORT' })).toBe(true);
    expect(cardMatchesFilters(card, { ...base, customerId: 'khac' })).toBe(false);
    expect(cardMatchesFilters(card, { ...base, zone: 'Biên Hòa' })).toBe(true);
    expect(cardMatchesFilters(card, { ...base, zone: 'VSIP' })).toBe(false);
  });

  it('ô tìm không phân biệt hoa thường và dấu, tìm cả số cont, Order, tên khách', () => {
    const card = makeCard();
    expect(cardMatchesFilters(card, { ...base, q: 'oolu8842' })).toBe(true);
    expect(cardMatchesFilters(card, { ...base, q: 'exp-2610-044' })).toBe(true);
    expect(cardMatchesFilters(card, { ...base, q: 'may mac phuc thinh' })).toBe(true);
    expect(cardMatchesFilters(card, { ...base, q: 'khong co' })).toBe(false);
  });
});
