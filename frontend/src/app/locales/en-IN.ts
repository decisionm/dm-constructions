// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
// Indian English (en-IN) for DM Constructions. Indian usage follows British
// spelling, so this reuses the en-GB overrides; every other key falls back to
// en.ts. Dates (DD/MM/YYYY) and lakh/crore grouping come from the locale tag.
import enGB from './en-GB';

const resource = { translation: { ...enGB.translation } } as {
  translation: Record<string, string>;
};

export default resource;
