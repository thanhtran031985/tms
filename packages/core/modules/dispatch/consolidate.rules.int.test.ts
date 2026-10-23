// Ma trận Rule 1 đến 8 (spec 03 mục 2) cho chuyến ghép TWIN_20 và COMBINED, kèm tra giá khi ghép và ghép chéo cùng lúc
// (task 08, bước 1). Mỗi Rule có ít nhất một test bị chặn và một test được phép. Giai đoạn này đỏ vì chưa có service ghép chuyến.
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import { dispatchAssignments, orderStops, tripContainers } from '../../lib/db/schema';
import {
  A,
  CUSTOMER,
  FAR_FUTURE_DATE,
  LINE,
  at,
  createWorld,
  dispatcher,
  dispatcher2,
  dispatcherB,
  expectAppError,
  viewer,
  type StopTimes,
  type World,
} from './dispatch.test-world';

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w?.stop();
});

const WINDOW = { plannedStart: at('08:00'), plannedEnd: at('12:00') };
type Made = { container: { id: string } };
type TrailerOverrides = Parameters<World['newTrailer']>[1];
type TractorOverrides = Parameters<World['newTractor']>[1];
type DriverOverrides = Parameters<World['newDriver']>[1];

/** Bộ tài nguyên mới; mặc định rơ moóc 40FT_COMBO có chốt giữa (ghép TWIN_20 được). */
async function resources(
  options: { trailer?: TrailerOverrides; tractor?: TractorOverrides; driver?: DriverOverrides } = {},
) {
  const [driver, tractor, trailer] = await Promise.all([
    w.newDriver(A, options.driver),
    w.newTractor(A, options.tractor),
    w.newTrailer(A, { trailerType: '40FT_COMBO', canCarryTwin20: true, ...options.trailer }),
  ]);
  return { driverId: driver.id, tractorId: tractor.id, trailerId: trailer.id };
}

function ghep(
  mode: 'TWIN_20' | 'COMBINED',
  containers: readonly Made[],
  withResources?: Awaited<ReturnType<typeof resources>>,
  extra: Partial<Parameters<World['service']['createConsolidatedTrip']>[1]> = {},
  ctx = dispatcher,
) {
  return w.service.createConsolidatedTrip(ctx, {
    tripMode: mode,
    orderContainerIds: containers.map((c) => c.container.id),
    ...WINDOW,
    resources: withResources ?? null,
    ...extra,
  });
}

const linkedContainerIds = async (tripId: string) =>
  (await w.repo().tripContainers.list(eq(tripContainers.tripId, tripId)))
    .map((l) => l.orderContainerId)
    .sort();
const containerRow = async (id: string) => (await w.orders().containers.get(id))!;
const codesOf = (warnings: { code: string }[]) => warnings.map((x) => x.code);

describe('Rule 1: rơ moóc cho TWIN_20 và cont 20 feet', () => {
  it('chặn rơ moóc 20FT và không để lại chuyến hay đổi trạng thái container', async () => {
    const pair = await w.newTwinPair();
    const bad = await resources({ trailer: { trailerType: '20FT', canCarryTwin20: false } });
    await expectAppError(ghep('TWIN_20', pair, bad), 'TWIN20_TRAILER_NOT_ALLOWED');
    for (const { container } of pair) {
      expect((await containerRow(container.id)).status).toBe('PENDING');
      expect(await w.repo().tripContainers.list(eq(tripContainers.orderContainerId, container.id))).toEqual([]);
    }
  });

  it('chặn rơ moóc 40FT không có chốt khóa giữa', async () => {
    const pair = await w.newTwinPair();
    const bad = await resources({ trailer: { trailerType: '40FT', canCarryTwin20: false } });
    await expectAppError(ghep('TWIN_20', pair, bad), 'TWIN20_TRAILER_NOT_ALLOWED');
  });

  it('cho phép rơ moóc 40FT_COMBO có chốt giữa: chuyến TWIN_20 với 2 container và assignment cho mọi Stop', async () => {
    const pair = await w.newTwinPair();
    const ok = await resources();
    const result = await ghep('TWIN_20', pair, ok);
    expect(result.trip.tripMode).toBe('TWIN_20');
    expect(result.trip.primaryTrailerId).toBe(ok.trailerId);
    expect(await linkedContainerIds(result.trip.id)).toEqual(pair.map((p) => p.container.id).sort());
    // 2 container × 3 Stop, mỗi Stop một assignment cùng bộ tài nguyên (decisions task 06).
    expect(result.assignments).toHaveLength(6);
    expect(result.assignments.every((a) => a.status === 'ASSIGNED')).toBe(true);
    for (const { container } of pair) expect((await containerRow(container.id)).status).toBe('PLANNED');
  });

  it('chặn cont 40 feet trong chuyến TWIN_20 ngay cả khi chưa chọn tài nguyên', async () => {
    const small = await w.newContainer({ containerType: '20DC', status: 'PENDING' });
    const big = await w.newContainer({ containerType: '40HC', status: 'PENDING' });
    await expectAppError(ghep('TWIN_20', [small, big]), 'TWIN20_CONTAINER_NOT_20FT');
  });

  it('chặn chế độ ghép khi không đủ 2 container hoặc COMBINED cùng chiều', async () => {
    const [one] = await w.newTwinPair();
    await expectAppError(ghep('TWIN_20', [one]), 'TRIP_MODE_INVALID');
    const [a, b] = await w.newTwinPair({ kind: 'IMPORT', containerType: '40HC' });
    await expectAppError(ghep('COMBINED', [a, b]), 'TRIP_MODE_INVALID');
  });

  it('cho phép lập chuyến không gán tài nguyên, rồi gán sau bằng assignResources (Rule 1 áp lúc gán)', async () => {
    const pair = await w.newTwinPair();
    const created = await ghep('TWIN_20', pair);
    expect(created.assignments).toEqual([]);
    const bad = await resources({ trailer: { trailerType: '20FT', canCarryTwin20: false } });
    await expectAppError(w.assign(dispatcher, created.trip.id, bad), 'TWIN20_TRAILER_NOT_ALLOWED');
    const good = await w.assign(dispatcher, created.trip.id, await resources());
    expect(good.trip.primaryTrailerId).not.toBe(bad.trailerId);
  });

  it('cho phép ghép 2 cont 20 feet thuộc 2 Order khác khách', async () => {
    const otherOrder = await w.newOrder({ customerId: CUSTOMER.phucThinh });
    const a = await w.newContainer({ containerType: '20DC', status: 'PENDING' });
    const b = await w.newContainer({ containerType: '20DC', status: 'PENDING', order: otherOrder });
    const result = await ghep('TWIN_20', [a, b], await resources());
    expect(result.trip.tripMode).toBe('TWIN_20');
  });
});

describe('Rule 2: tải trọng cộng dồn các container', () => {
  it('chặn khi tổng khối lượng vượt tải trọng rơ moóc dù từng cont đều nhẹ hơn', async () => {
    // Mỗi cont 14 + 2,3 (vỏ chuẩn 20 feet) = 16,3 tấn ≤ 28; hai cont = 32,6 tấn > 28.
    const pair = await w.newTwinPair({ cargoWeightTons: '14.00' });
    const error = await expectAppError(ghep('TWIN_20', pair, await resources()), 'PAYLOAD_EXCEEDED');
    expect(error.details?.weightTons).toBe('32.6');
  });

  it('chặn khi tổng cộng tự trọng rơ moóc và đầu kéo vượt khối lượng cho phép của đầu kéo', async () => {
    // 24,6 + 4 (rơ moóc) + 9 (đầu kéo) = 37,6 > 30.
    const pair = await w.newTwinPair();
    const heavy = await resources({
      tractor: { permittedGrossWeightTons: '30.00', tareWeightTons: '9.00' },
    });
    await expectAppError(ghep('TWIN_20', pair, heavy), 'PAYLOAD_EXCEEDED');
  });

  it('cho phép trong giới hạn và không còn cảnh báo thiếu tự trọng đầu kéo khi đã khai báo', async () => {
    const pair = await w.newTwinPair();
    const ok = await resources({ tractor: { permittedGrossWeightTons: '40.00', tareWeightTons: '9.00' } });
    const result = await ghep('TWIN_20', pair, ok);
    expect(codesOf(result.warnings)).not.toContain('TRACTOR_TARE_NOT_COUNTED');
  });

  it('cho phép nhưng cảnh báo khi đầu kéo chưa khai báo tự trọng', async () => {
    const pair = await w.newTwinPair();
    const result = await ghep('TWIN_20', pair, await resources());
    expect(codesOf(result.warnings)).toContain('TRACTOR_TARE_NOT_COUNTED');
  });

  it('thiếu khối lượng một cont: chặn đến khi xác nhận, xác nhận rồi cho phép kèm cảnh báo', async () => {
    const a = await w.newContainer({ containerType: '20DC', status: 'PENDING', cargoWeightTons: null });
    const b = await w.newContainer({ containerType: '20DC', status: 'PENDING' });
    const ok = await resources();
    await expectAppError(ghep('TWIN_20', [a, b], ok), 'WEIGHT_CONFIRMATION_REQUIRED');
    const confirmed = await ghep('TWIN_20', [a, b], ok, { confirmMissingWeight: true });
    expect(codesOf(confirmed.warnings)).toContain('WEIGHT_MISSING');
  });
});

describe('Rule 3: Street Turn', () => {
  const MORNING = { PICK_FULL: { start: at('07:00') }, UNSTUFFING: { start: at('08:00'), end: at('09:00') } };
  const AFTER = { PICK_EMPTY: { start: at('09:30') }, STUFFING: { start: at('10:00'), end: at('11:00') } };

  async function streetTurnPair(
    options: {
      importLine?: string | null;
      exportLine?: string | null;
      importType?: '40HC' | '40DC';
      exportType?: '40HC' | '40DC';
      importTimes?: StopTimes;
    } = {},
  ) {
    const importOrder = await w.newOrder({ kind: 'IMPORT', shippingLineId: options.importLine ?? LINE.MSK });
    const exportOrder = await w.newOrder({ kind: 'EXPORT', shippingLineId: options.exportLine ?? LINE.MSK });
    const imported = await w.newContainer({
      order: importOrder,
      containerType: options.importType ?? '40HC',
      cargoWeightTons: '8.00',
      status: 'PENDING',
      stopTimes: options.importTimes ?? MORNING,
    });
    const exported = await w.newContainer({
      order: exportOrder,
      containerType: options.exportType ?? '40HC',
      containerNo: null,
      cargoWeightTons: '8.00',
      status: 'PENDING',
      stopTimes: AFTER,
    });
    return { imported, exported };
  }
  const link = (imported: Made, exported: Made, extra: { approvalRef?: string; feeAmount?: string } = {}) =>
    w.service.linkStreetTurn(dispatcher, {
      importContainerId: imported.container.id,
      exportContainerId: exported.container.id,
      ...extra,
    });

  it('chặn khác hãng tàu', async () => {
    const { imported, exported } = await streetTurnPair({ exportLine: LINE.CMA });
    await expectAppError(link(imported, exported), 'STREET_TURN_LINE_MISMATCH');
  });

  it('chặn khác loại container', async () => {
    const { imported, exported } = await streetTurnPair({ exportType: '40DC' });
    await expectAppError(link(imported, exported), 'STREET_TURN_TYPE_MISMATCH');
  });

  it('chặn hãng tàu không cho Street Turn', async () => {
    const { imported, exported } = await streetTurnPair({ importLine: LINE.ONE, exportLine: LINE.ONE });
    await expectAppError(link(imported, exported), 'STREET_TURN_NOT_ALLOWED');
  });

  it('chặn khi rút hàng Nhập (UNSTUFFING) kết thúc sau giờ đóng hàng Xuất (STUFFING) bắt đầu', async () => {
    const { imported, exported } = await streetTurnPair({
      importTimes: { PICK_FULL: { start: at('07:00') }, UNSTUFFING: { start: at('08:00'), end: at('10:30') } },
    });
    await expectAppError(link(imported, exported), 'INVALID_STOP_SEQUENCE');
  });

  it('đủ điều kiện: liên kết hai chiều, chép số cont, chuyển đồng hồ DET, bỏ Stop trả rỗng, ghi phí chi hộ', async () => {
    const { imported, exported } = await streetTurnPair();
    const det = new Date('2026-11-05T10:00:00.000Z');
    await w.orders().containers.update(imported.container.id, { detFreeUntil: det });

    const result = await link(imported, exported, { approvalRef: 'MSK-ST-7781', feeAmount: '1500000.00' });
    expect(result.importContainer.linkedContainerId).toBe(exported.container.id);
    expect(result.exportContainer.linkedContainerId).toBe(imported.container.id);
    expect(result.exportContainer.containerNo).toBe(imported.container.containerNo);
    expect(result.exportContainer.streetTurnApprovalRef).toBe('MSK-ST-7781');
    expect(result.importContainer.streetTurnApprovalRef).toBe('MSK-ST-7781');

    const exportAfter = await containerRow(exported.container.id);
    const importAfter = await containerRow(imported.container.id);
    expect(exportAfter.detFreeUntil).toEqual(det);
    expect(importAfter.detFreeUntil).toBeNull();

    const returnEmpty = (await w.orders().stops.list(eq(orderStops.orderContainerId, imported.container.id))).find(
      (s) => s.stopType === 'RETURN_EMPTY',
    )!;
    expect(returnEmpty.status).toBe('SKIPPED');

    expect(result.fee).toMatchObject({
      feeCode: 'STREET_TURN_FEE',
      feeCategory: 'PASS_THROUGH',
      amount: '1500000.00',
      orderContainerId: exported.container.id,
    });
  });

  it('cấu hình tenant NONE thì không ghi phí Street Turn', async () => {
    w.setSettings({ dispatch: { streetTurnFee: 'NONE' } });
    try {
      const { imported, exported } = await streetTurnPair();
      const result = await link(imported, exported, { feeAmount: '1500000.00' });
      expect(result.fee).toBeNull();
    } finally {
      w.setSettings({});
    }
  });

  it('danh sách chờ chấp thuận có cặp chưa có số, hết khi nhập số chấp thuận cho cả hai cont', async () => {
    const { imported, exported } = await streetTurnPair();
    await link(imported, exported);
    const pendingIds = async () =>
      (await w.service.listStreetTurns(dispatcher, { pendingOnly: true })).map((i) => i.exportContainerId);
    expect(await pendingIds()).toContain(exported.container.id);

    await w.service.setStreetTurnApproval(dispatcher, {
      orderContainerId: imported.container.id,
      approvalRef: 'MSK-ST-9001',
    });
    expect(await pendingIds()).not.toContain(exported.container.id);
    expect((await containerRow(exported.container.id)).streetTurnApprovalRef).toBe('MSK-ST-9001');
    expect((await containerRow(imported.container.id)).streetTurnApprovalRef).toBe('MSK-ST-9001');
  });

  it('chặn lúc DISPATCHED khi thiếu số chấp thuận, cho điều sau khi nhập số', async () => {
    const { imported, exported } = await streetTurnPair();
    await link(imported, exported);
    const trip = await ghep('COMBINED', [imported, exported], await resources());
    await expectAppError(
      w.service.dispatchTrip(dispatcher, { tripId: trip.trip.id, version: trip.trip.version }),
      'STREET_TURN_NOT_APPROVED',
    );

    await w.service.setStreetTurnApproval(dispatcher, {
      orderContainerId: exported.container.id,
      approvalRef: 'MSK-ST-9002',
    });
    const current = (await w.repo().trips.get(trip.trip.id))!;
    const dispatched = await w.service.dispatchTrip(dispatcher, { tripId: current.id, version: current.version });
    expect(dispatched.trip.status).toBe('DISPATCHED');
  });

  it('chỉ DISPATCHER trở lên được liên kết; tenant khác không thấy container', async () => {
    const { imported, exported } = await streetTurnPair();
    await expectAppError(
      w.service.linkStreetTurn(viewer, {
        importContainerId: imported.container.id,
        exportContainerId: exported.container.id,
      }),
      'FORBIDDEN',
    );
    await expectAppError(
      w.service.linkStreetTurn(dispatcherB, {
        importContainerId: imported.container.id,
        exportContainerId: exported.container.id,
      }),
      'NOT_FOUND',
    );
  });
});

describe('Rule 4: COMBINED hai vỏ khác nhau', () => {
  async function combinedPair(
    importTimes: StopTimes,
    exportTimes: StopTimes,
    type: '20DC' | '40HC' = '40HC',
  ) {
    const imported = await w.newContainer({
      kind: 'IMPORT',
      containerType: type,
      cargoWeightTons: '8.00',
      status: 'PENDING',
      stopTimes: importTimes,
    });
    const exported = await w.newContainer({
      kind: 'EXPORT',
      containerType: type,
      cargoWeightTons: '8.00',
      status: 'PENDING',
      stopTimes: exportTimes,
    });
    return [imported, exported];
  }

  it('chặn khi lúc nào đó rơ moóc chở 2 cont 40 feet (lấy rỗng Xuất trước khi trả rỗng Nhập)', async () => {
    const pair = await combinedPair(
      { PICK_FULL: { start: at('07:00') }, RETURN_EMPTY: { start: at('11:00') } },
      { PICK_EMPTY: { start: at('09:00') }, PORT_IN: { start: at('13:00') } },
    );
    await expectAppError(ghep('COMBINED', pair), 'INVALID_STOP_SEQUENCE');
  });

  it('cho phép khi trả rỗng cont Nhập xong rồi mới lấy rỗng cont Xuất', async () => {
    const pair = await combinedPair(
      { PICK_FULL: { start: at('07:00') }, RETURN_EMPTY: { start: at('09:00') } },
      { PICK_EMPTY: { start: at('10:00') }, PORT_IN: { start: at('13:00') } },
    );
    const result = await ghep('COMBINED', pair, await resources({ trailer: { trailerType: '40FT' } }));
    expect(result.trip.tripMode).toBe('COMBINED');
    expect(result.assignments).toHaveLength(6);
  });

  it('cho phép hai cont 20 feet cùng nằm trên rơ moóc', async () => {
    const pair = await combinedPair(
      { PICK_FULL: { start: at('07:00') }, RETURN_EMPTY: { start: at('11:00') } },
      { PICK_EMPTY: { start: at('09:00') }, PORT_IN: { start: at('13:00') } },
      '20DC',
    );
    const result = await ghep('COMBINED', pair);
    expect(result.trip.tripMode).toBe('COMBINED');
  });

  it('thiếu giờ Stop thì cho lập chuyến nhưng cảnh báo chưa kiểm tra được thứ tự', async () => {
    const pair = await combinedPair({}, {});
    const result = await ghep('COMBINED', pair);
    expect(codesOf(result.warnings)).toContain('SEQUENCE_NOT_VERIFIED');
  });
});

describe('Rule 5: cont lạnh cần rơ moóc có genset', () => {
  it('chặn cont 20RF trên rơ moóc 40FT_COMBO không có máy phát', async () => {
    const pair = await w.newTwinPair({ containerType: '20RF' });
    const noGenset = await resources({ trailer: { hasGensetPower: false } });
    await expectAppError(ghep('TWIN_20', pair, noGenset), 'REEFER_REQUIRES_GENSET');
  });

  it('cho phép khi rơ moóc có genset', async () => {
    const pair = await w.newTwinPair({ containerType: '20RF' });
    const withGenset = await resources({ trailer: { hasGensetPower: true } });
    const result = await ghep('TWIN_20', pair, withGenset);
    expect(result.trip.tripMode).toBe('TWIN_20');
  });
});

describe('Rule 6: hàng nguy hiểm', () => {
  it('chặn tài xế không có chứng chỉ hàng nguy hiểm', async () => {
    const pair = await w.newTwinPair({ isDangerousGoods: true });
    await expectAppError(ghep('TWIN_20', pair, await resources()), 'DG_CERTIFICATE_REQUIRED');
  });

  it('chặn ghép TWIN_20 hàng nguy hiểm với container của khách khác', async () => {
    const otherOrder = await w.newOrder({ customerId: CUSTOMER.phucThinh });
    const dangerous = await w.newContainer({ containerType: '20DC', status: 'PENDING', isDangerousGoods: true });
    const other = await w.newContainer({ containerType: '20DC', status: 'PENDING', order: otherOrder });
    await expectAppError(ghep('TWIN_20', [dangerous, other]), 'DG_TWIN20_MIXED_CUSTOMER');
  });

  it('cho phép cùng khách và tài xế có chứng chỉ còn hạn', async () => {
    const pair = await w.newTwinPair({ isDangerousGoods: true });
    const certified = await resources({
      driver: { dgCertificateNo: 'DG-08', dgCertificateExpiry: FAR_FUTURE_DATE },
    });
    const result = await ghep('TWIN_20', pair, certified);
    expect(result.trip.tripMode).toBe('TWIN_20');
  });
});

describe('Rule 7: cổng cảng khi điều', () => {
  it('cont HOLD_CUSTOMS lưu kế hoạch được nhưng bị chặn lúc DISPATCHED', async () => {
    const pair = await w.newTwinPair({ portReadinessStatus: 'HOLD_CUSTOMS' });
    const planned = await ghep('TWIN_20', pair, await resources());
    expect(planned.trip.status).toBe('PLANNED');
    await expectAppError(
      w.service.dispatchTrip(dispatcher, { tripId: planned.trip.id, version: planned.trip.version }),
      'PORT_NOT_READY',
    );
  });

  it('cont READY_EDO được điều', async () => {
    const pair = await w.newTwinPair({ portReadinessStatus: 'READY_EDO' });
    const planned = await ghep('TWIN_20', pair, await resources());
    const dispatched = await w.service.dispatchTrip(dispatcher, {
      tripId: planned.trip.id,
      version: planned.trip.version,
    });
    expect(dispatched.trip.status).toBe('DISPATCHED');
  });
});

describe('Rule 8: cut-off hàng Xuất', () => {
  async function combinedWithCutOff(cutOffAt: Date) {
    const exportOrder = await w.newOrder({ kind: 'EXPORT', cutOffAt });
    const imported = await w.newContainer({ kind: 'IMPORT', containerType: '40HC', cargoWeightTons: '8.00', status: 'PENDING' });
    const exported = await w.newContainer({
      order: exportOrder,
      containerType: '40HC',
      cargoWeightTons: '8.00',
      status: 'PENDING',
    });
    return ghep('COMBINED', [imported, exported], await resources({ trailer: { trailerType: '40FT' } }));
  }

  it('cảnh báo đỏ khi chuyến kết thúc (PORT_IN) sau cut-off', async () => {
    const result = await combinedWithCutOff(at('11:00'));
    const warning = result.warnings.find((x) => x.code === 'CUT_OFF_EXCEEDED');
    expect(warning?.severity).toBe('danger');
  });

  it('không cảnh báo khi kết thúc trước cut-off', async () => {
    const result = await combinedWithCutOff(at('13:00'));
    expect(codesOf(result.warnings)).not.toContain('CUT_OFF_EXCEEDED');
  });
});

describe('Doanh thu khi ghép: appliedTripMode và cờ tính lại giá (spec 06 mục 3)', () => {
  it('cùng khách: cả hai cont nhận tripMode của chuyến và bị đánh dấu cần tính lại giá', async () => {
    const pair = await w.newTwinPair();
    await ghep('TWIN_20', pair, await resources());
    for (const { container } of pair) {
      const row = await containerRow(container.id);
      expect(row.appliedTripMode).toBe('TWIN_20');
      expect(row.repriceRequired).toBe(true);
    }
  });

  it('khác khách: giữ giá SINGLE, không đặt cờ', async () => {
    const otherOrder = await w.newOrder({ customerId: CUSTOMER.phucThinh });
    const a = await w.newContainer({ containerType: '20DC', status: 'PENDING' });
    const b = await w.newContainer({ containerType: '20DC', status: 'PENDING', order: otherOrder });
    await ghep('TWIN_20', [a, b], await resources());
    for (const { container } of [a, b]) {
      const row = await containerRow(container.id);
      expect(row.appliedTripMode).toBe('SINGLE');
      expect(row.repriceRequired).toBe(false);
    }
  });

  it('tenant tắt shareTwinDiscountWithCustomer: cùng khách vẫn giữ SINGLE', async () => {
    w.setSettings({ pricing: { shareTwinDiscountWithCustomer: false } });
    try {
      const pair = await w.newTwinPair();
      await ghep('TWIN_20', pair, await resources());
      for (const { container } of pair) {
        const row = await containerRow(container.id);
        expect(row.appliedTripMode).toBe('SINGLE');
        expect(row.repriceRequired).toBe(false);
      }
    } finally {
      w.setSettings({});
    }
  });

  it('ghi audit CREATE cho chuyến và phát dispatch.updated kèm cả hai container', async () => {
    const pair = await w.newTwinPair();
    w.published.length = 0;
    const result = await ghep('TWIN_20', pair, await resources());
    const audits = await listAuditForEntity(w.tdb(A), 'consolidated_trips', result.trip.id);
    expect(audits.map((a) => a.action)).toContain('CREATE');
    const event = w.published.find((e) => e.tripId === result.trip.id);
    expect([...(event?.orderContainerIds ?? [])].sort()).toEqual(pair.map((p) => p.container.id).sort());
  });
});

describe('Ghép chuyến: quyền, tenant và trạng thái', () => {
  it('VIEWER bị chặn; tenant khác không thấy container (NOT_FOUND)', async () => {
    const pair = await w.newTwinPair();
    await expectAppError(ghep('TWIN_20', pair, undefined, {}, viewer), 'FORBIDDEN');
    await expectAppError(ghep('TWIN_20', pair, undefined, {}, dispatcherB), 'NOT_FOUND');
  });

  it('Order chưa xác nhận bị chặn, container đã có chuyến hoạt động bị chặn', async () => {
    const draft = await w.newOrder({ status: 'DRAFT' });
    const a = await w.newContainer({ containerType: '20DC', status: 'PENDING', order: draft });
    const b = await w.newContainer({ containerType: '20DC', status: 'PENDING' });
    await expectAppError(ghep('TWIN_20', [a, b]), 'ORDER_NOT_CONFIRMED');

    const [c, d] = await w.newTwinPair();
    await w.service.createSingleTrip(dispatcher, { orderContainerId: c.container.id, ...WINDOW });
    await expectAppError(ghep('TWIN_20', [c, d]), 'CONTAINER_ALREADY_IN_TRIP');
  });
});

describe('addContainerToTrip: ghép thêm vào chuyến đơn', () => {
  it('chuyến SINGLE thành TWIN_20; chuyến đã gán xe được gán thêm các Stop của cont mới', async () => {
    const [a, b] = await w.newTwinPair();
    const single = await w.service.createSingleTrip(dispatcher, { orderContainerId: a.container.id, ...WINDOW });
    const assigned = await w.assign(dispatcher, single.trip.id, await resources());
    expect(assigned.assignments).toHaveLength(3);

    const merged = await w.service.addContainerToTrip(dispatcher, {
      tripId: single.trip.id,
      version: assigned.trip.version,
      orderContainerId: b.container.id,
      tripMode: 'TWIN_20',
    });
    expect(merged.trip.tripMode).toBe('TWIN_20');
    expect(await linkedContainerIds(single.trip.id)).toEqual([a.container.id, b.container.id].sort());
    expect(merged.assignments).toHaveLength(6);
    expect((await containerRow(b.container.id)).status).toBe('PLANNED');
  });

  it('chặn khi chuyến đã gán rơ moóc 20FT; version cũ trả STALE_DATA', async () => {
    const [a, b] = await w.newTwinPair();
    const single = await w.service.createSingleTrip(dispatcher, { orderContainerId: a.container.id, ...WINDOW });
    const bad = await resources({ trailer: { trailerType: '20FT', canCarryTwin20: false } });
    const assigned = await w.assign(dispatcher, single.trip.id, bad);

    await expectAppError(
      w.service.addContainerToTrip(dispatcher, {
        tripId: single.trip.id,
        version: assigned.trip.version,
        orderContainerId: b.container.id,
        tripMode: 'TWIN_20',
      }),
      'TWIN20_TRAILER_NOT_ALLOWED',
    );
    await expectAppError(
      w.service.addContainerToTrip(dispatcher, {
        tripId: single.trip.id,
        version: assigned.trip.version - 1,
        orderContainerId: b.container.id,
        tripMode: 'TWIN_20',
      }),
      'STALE_DATA',
    );
  });
});

describe('Hai Điều vận ghép chéo cùng lúc', () => {
  it('cùng tài nguyên, cùng khung giờ: đúng một người thắng, người kia nhận lỗi trùng giờ, không deadlock (5 lần)', async () => {
    for (let round = 0; round < 5; round += 1) {
      const first = await w.newTwinPair();
      const second = await w.newTwinPair();
      const shared = await resources();
      const outcomes = await Promise.allSettled([
        ghep('TWIN_20', first, shared, {}, dispatcher),
        ghep('TWIN_20', second, shared, {}, dispatcher2),
      ]);
      const won = outcomes.filter((o) => o.status === 'fulfilled');
      const lost = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(['RESOURCE_TIME_CONFLICT', 'RESOURCE_BUSY_RETRY']).toContain((lost[0]!.reason as { code: string }).code);
    }
  });

  it('cùng cặp container nhưng thứ tự ngược nhau: đúng một người thắng, không deadlock (5 lần)', async () => {
    for (let round = 0; round < 5; round += 1) {
      const [a, b] = await w.newTwinPair();
      const outcomes = await Promise.allSettled([
        ghep('TWIN_20', [a, b], await resources(), {}, dispatcher),
        ghep('TWIN_20', [b, a], await resources(), {}, dispatcher2),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const lost = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected')!;
      expect(['CONTAINER_ALREADY_IN_TRIP', 'RESOURCE_BUSY_RETRY']).toContain(
        (lost.reason as { code: string }).code,
      );
      const ids = [a.container.id, b.container.id];
      const links = await w.repo().tripContainers.list(inArray(tripContainers.orderContainerId, ids));
      expect(links).toHaveLength(2);
      const live = await w.repo().assignments.list(inArray(dispatchAssignments.stopId, (
        await w.orders().stops.list(inArray(orderStops.orderContainerId, ids))
      ).map((s) => s.id)));
      expect(live.filter((x) => x.status === 'ASSIGNED')).toHaveLength(6);
    }
  });
});

