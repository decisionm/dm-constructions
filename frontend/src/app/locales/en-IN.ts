// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
// Indian English (en-IN) for DM Constructions. Indian usage follows British
// spelling, so this reuses the en-GB overrides; every other key falls back to
// en.ts. Dates (DD/MM/YYYY) and lakh/crore grouping come from the locale tag.
import enGB from './en-GB';

// Release 5: Indian site wording where the upstream term is American.
const IN_OVERRIDES: Record<string, string> = {
  'rfi.title': 'Technical queries (RFI)',
  'nav.rfi': 'Technical query / RFI',
  'cases.answer_an_rfi.title': 'Answer a technical query (RFI)',
};

const resource = { translation: { ...enGB.translation, ...IN_OVERRIDES } } as {
  translation: Record<string, string>;
};

export default resource;
