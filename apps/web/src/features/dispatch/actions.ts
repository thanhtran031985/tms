'use server';

// Server Action điều vận (task 06). Mỗi action dựng bằng defineAction: requireRole → zod → service → Result.
// Service kiểm lại quyền, khóa bi quan tài nguyên và ghi audit trong cùng transaction; sau khi service trả ok mới làm mới /dispatch.
import { rolesFor } from '@core/modules/identity/permissions';
import type { TripResult } from '@core/modules/dispatch';
import { ok } from '@shared/result';
import {
  assignResourcesSchema,
  cancelAssignmentSchema,
  createSingleTripSchema,
  dispatchTripSchema,
  getDispatchBoardSchema,
  listResourceAvailabilitySchema,
  loadBoardCardsSchema,
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
