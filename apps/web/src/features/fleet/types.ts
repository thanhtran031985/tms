import type { DriverRow, TractorRow, TrailerRow } from '@core/modules/fleet/repo';
import type { ExpiringDocumentItem } from '@core/modules/fleet/documents.service';

export type TractorDto = TractorRow;
export type TrailerDto = TrailerRow;
export type DriverDto = DriverRow;
export type ExpiringDocDto = ExpiringDocumentItem;

export type FleetAccess = 'write' | 'read';
