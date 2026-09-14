import {
  REVENUE_SPLIT_FULL_SHARE_UNITS,
  REVENUE_SPLIT_SHARE_SCALE,
} from './types';
import { sumRevenueSplitShareUnits, toRevenueSplitShareUnits } from './validation';

export function formatSharePercent(value: number): string {
  if (!Number.isFinite(value)) return '0,0000';
  const normalized = toRevenueSplitShareUnits(value) / REVENUE_SPLIT_SHARE_SCALE;
  return normalized.toFixed(4).replace('.', ',');
}

export function parseSharePercentInput(raw: string): number | null {
  const trimmed = String(raw || '').trim().replace(/\s/g, '').replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return toRevenueSplitShareUnits(value) / REVENUE_SPLIT_SHARE_SCALE;
}

export function isExactHundredPercent(percents: number[]): boolean {
  return sumRevenueSplitShareUnits(percents) === REVENUE_SPLIT_FULL_SHARE_UNITS;
}

export function estimateShareAmount(gross: number, sharePercent: number): number {
  if (!Number.isFinite(gross) || !Number.isFinite(sharePercent)) return 0;
  return Math.round(((gross * sharePercent) / 100) * 100) / 100;
}
