'use server';

// Server Action điều vận (task 06). Mỗi action dựng bằng defineAction: requireRole → zod → service → Result.
// Service kiểm lại quyền, khóa bi quan tài nguyên và ghi audit trong cùng transaction; sau khi service trả ok mới làm mới /dispatch.
import { rolesFor } from '@core/modules/identity/permissions';
import type { RemoveContainerResult, TripResult } from '@core/modules/dispatch';
import { ok } from '@shared/result';
import {
  addContainerToTripSchema,
  assignResourcesSchema,
  cancelAssignmentSchema,
  createConsolidatedTripSchema,
  createSingleTripSchema,
  dispatchTripSchema,
  getDispatchBoardSchema,
  linkStreetTurnSchema,
  listResourceAvailabilitySchema,
  listStreetTurnsSchema,
  loadBoardCardsSchema,
  removeContainerFromTripSchema,
  setStreetTurnApprovalSchema,
  updateTripTimesSchema,
} from '@shared/schemas/dispatch';
import { revalidatePath } from 'next/cache';
import { defineAction } from '@/server';
import { getDispatchService } from '@/server/services';

const ASSIGN = rolesFor('dispatch.assign');
const VIEW = rolesFor('dispatch.view');
const svc = () => getDispatchService();

// Chỉ trả phần giao diện cần (id, trạng thái, version để gửi lại khi sửa tiếp), không trả cả dòng DB.
function summary({ trip, assignments, warnings }: TripResult) {
  return {
    trip: {
      id: trip.id,
      tripCode: trip.tripCode,
      status: trip.status,
      version: trip.version,
      plannedStart: trip.plannedStart,
      plannedEnd: trip.plannedEnd,
      primaryDriverId: trip.primaryDriverId,
      primaryTractorId: trip.primaryTractorId,
      primaryTrailerId: trip.primaryTrailerId,
      tripMode: trip.tripMode,
    },
    assignments: assignments.map((a) => ({
      id: a.id,
      stopId: a.stopId,
      status: a.status,
      driverId: a.driverId,
      tractorId: a.tractorId,
      trailerId: a.trailerId,
    })),
    warnings,
  };
}

export const createSingleTrip = defineAction(ASSIGN, createSingleTripSchema, async (ctx, input) => {
  const result = await svc().createSingleTrip(ctx, input);
  revalidatePath('/dispatch');
  return ok(summary(result));
});

export const updateTripTimes = defineAction(ASSIGN, updateTripTimesSchema, async (ctx, input) => {
  const result = await svc().updateTripTimes(ctx, input);
  revalidatePath('/dispatch');
  return ok(summary(result));
});

export const assignResources = defineAction(ASSIGN, assignResourcesSchema, async (ctx, input) => {
  const result = await svc().assignResources(ctx, input);
  revalidatePath('/dispatch');
  return ok(summary(result));
});

export const dispatchTrip = defineAction(ASSIGN, dispatchTripSchema, async (ctx, input) => {
  const result = await svc().dispatchTrip(ctx, input);
  revalidatePath('/dispatch');
  return ok(summary(result));
});

export const cancelAssignment = defineAction(ASSIGN, cancelAssignmentSchema, async (ctx, input) => {
  const result = await svc().cancelAssignment(ctx, input);
  revalidatePath('/dispatch');
  return ok(summary(result));
});

// Bảng gán xe: chỉ đọc nên không làm mới trang.
export const listResourceAvailability = defineAction(
  VIEW,
  listResourceAvailabilitySchema,
  async (ctx, input) => ok(await svc().listResourceAvailability(ctx, input)),
);

// Bảng Kanban theo ngày và làm mới vài thẻ theo sự kiện SSE: chỉ đọc nên không làm mới trang.
export const loadDispatchBoard = defineAction(VIEW, getDispatchBoardSchema, async (ctx, input) =>
  ok(await svc().getDispatchBoard(ctx, input)),
);

export const loadBoardCards = defineAction(VIEW, loadBoardCardsSchema, async (ctx, input) =>
  ok(await svc().getBoardCards(ctx, input)),
);

// ---- Ghép chuyến, tách chuyến và Street Turn (task 08).
export const createConsolidatedTrip = defineAction(
  ASSIGN,
  createConsolidatedTripSchema,
  async (ctx, input) => {
    const result = await svc().createConsolidatedTrip(ctx, input);
    revalidatePath('/dispatch');
    return ok(summary(result));
  },
);

export const addContainerToTrip = defineAction(ASSIGN, addContainerToTripSchema, async (ctx, input) => {
  const result = await svc().addContainerToTrip(ctx, input);
  revalidatePath('/dispatch');
  return ok(summary(result));
});

function removedSummary(result: RemoveContainerResult) {
  return {
    ...summary(result),
    removedContainerId: result.removedContainerId,
    repriceContainerIds: result.repriceContainerIds,
  };
}

export const removeContainerFromTrip = defineAction(
  ASSIGN,
  removeContainerFromTripSchema,
  async (ctx, input) => {
    const result = await svc().removeContainerFromTrip(ctx, input);
    revalidatePath('/dispatch');
    return ok(removedSummary(result));
  },
);

// Trả về hai container của cặp (số cont, số chấp thuận), không trả cả dòng DB.
function streetTurnSummary(result: Awaited<ReturnType<ReturnType<typeof svc>['linkStreetTurn']>>) {
  return {
    importContainerId: result.importContainer.id,
    exportContainerId: result.exportContainer.id,
    containerNo: result.exportContainer.containerNo,
    approvalRef: result.exportContainer.streetTurnApprovalRef,
    feeAmount: result.fee?.amount ?? null,
  };
}

export const linkStreetTurn = defineAction(ASSIGN, linkStreetTurnSchema, async (ctx, input) => {
  const result = await svc().linkStreetTurn(ctx, input);
  revalidatePath('/dispatch');
  return ok(streetTurnSummary(result));
});

export const setStreetTurnApproval = defineAction(
  ASSIGN,
  setStreetTurnApprovalSchema,
  async (ctx, input) => {
    const result = await svc().setStreetTurnApproval(ctx, input);
    revalidatePath('/dispatch');
    return ok(streetTurnSummary(result));
  },
);

// Danh sách Street Turn (chờ chấp thuận): chỉ đọc nên không làm mới trang.
export const listStreetTurns = defineAction(VIEW, listStreetTurnsSchema, async (ctx, input) =>
  ok(await svc().listStreetTurns(ctx, input)),
);
