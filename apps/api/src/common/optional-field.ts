import { ValidateIf } from 'class-validator';
/** Optional means omitted, not null. Nullable dates explicitly use IsOptional. */
export const OptionalField = () =>
  ValidateIf((_object, value: unknown) => value !== undefined);
