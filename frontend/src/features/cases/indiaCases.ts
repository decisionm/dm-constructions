// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
//
// DM Constructions (release 5): the case order for an Indian workspace.
//
// With the India regional pack on (or the English (India) UI), the dashboard's
// "Popular starting points" row leads with the Indian playbooks (RA bill from
// the measurement book, IS 456 concrete, IS 1200 measurement, CPWD schedule of
// rates, GST/TDS/cess...) in the order an Indian contractor meets them, then
// the universal cases that fit that workflow. Cases written for another market
// and the clearly US/EU-only universal ones (6D carbon, US earned value, AIA
// pay applications...) are left out of the popular row; they stay in the full
// case library ("All cases"), where they are ordered after the Indian ones.

import { normalizeLanguageTag } from './homeMarket';

/** Indian playbooks, in the order the popular row shows them. */
export const INDIA_CASE_ORDER: readonly string[] = [
  'bill-a-running-account-from-the-measurement-book',
  'hold-the-concrete-to-is-456-from-pour-card-to-cube-result',
  'measure-to-is-1200-so-the-bill-can-be-checked',
  'price-a-tender-on-the-schedule-of-rates-that-governs-it',
  'keep-gst-tds-and-labour-cess-out-of-the-rate',
  'analyse-a-schedule-rate-into-labour-material-and-machinery',
  'evaluate-a-government-tender-against-the-estimated-cost',
  'hold-the-estimate-to-the-sanctioned-amount',
  'apply-the-price-variation-formula-on-a-public-contract',
  'register-the-project-under-rera-and-file-the-quarterly-report',
  // Universal cases that follow the Indian workflow (enquiry -> estimate ->
  // PO/GRN -> site -> final bill and retention).
  'track-an-opportunity-from-enquiry-to-tender',
  'estimate-from-cost-database',
  'procure-from-boq',
  'receive-and-reconcile-material-deliveries',
  'run-a-three-way-match-before-paying-a-supplier',
  'run-the-site-day',
  'run-a-concrete-pour-from-request-to-record',
  'agree-the-final-account-and-release-retention',
  'defects-liability-period-tracking',
  'manage-retention-across-the-supply-chain',
];

/** Universal cases that read as US/EU practice; never in the popular row of
 *  an Indian workspace (still in the full library). */
export const INDIA_HIDDEN_FROM_POPULAR: ReadonlySet<string> = new Set([
  'carbon-from-bim-6d',
  'earned-value-and-forecast',
  'payment-application-and-reconciliation',
  'prepare-an-interim-payment-application',
  'roll-subcontractor-pay-applications-into-your-pay-application',
  'price-the-preliminaries-and-general-conditions',
  'run-a-soft-landings-performance-handover',
  'check-a-model-against-the-eir-and-raise-issues',
  'build-a-4d-construction-sequence',
  'build-a-5d-cost-loaded-model',
]);

const RANK = new Map(INDIA_CASE_ORDER.map((id, i) => [id, i]));

/** Position in the Indian order; cases outside the list sort after it. */
export function indiaCaseRank(id: string): number {
  return RANK.get(id) ?? INDIA_CASE_ORDER.length;
}

/** True for a case the popular row of an Indian workspace may show. */
export function indiaPopularAllowed(pb: { id: string; region?: string }): boolean {
  if (pb.region && pb.region !== 'IN') return false;
  return !INDIA_HIDDEN_FROM_POPULAR.has(pb.id);
}

/** An Indian workspace: the India pack is active, or (before the pack answer
 *  arrives, or without one) the UI speaks English (India). */
export function isIndiaWorkspace(
  packCountry: string | null | undefined,
  language: string | null | undefined,
): boolean {
  if (packCountry && packCountry.toLowerCase() === 'in') return true;
  return normalizeLanguageTag(language) === 'en-IN';
}

/** Library order for an Indian workspace: Indian order first, the rest of the
 *  catalogue in its own order, US/EU-only and other markets' cases last. */
export function indiaLibraryOrder<T extends { id: string; region?: string }>(
  cases: readonly T[],
  positionOf: (item: T) => number,
): T[] {
  const tier = (pb: T) =>
    RANK.has(pb.id) ? 0 : indiaPopularAllowed(pb) ? 1 : 2;
  return [...cases].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      indiaCaseRank(a.id) - indiaCaseRank(b.id) ||
      positionOf(a) - positionOf(b),
  );
}
