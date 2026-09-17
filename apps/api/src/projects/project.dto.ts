import { OptionalField } from '../common/optional-field';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
  @OptionalField() @IsString() @MaxLength(2000) description?: string;
  @OptionalField() @IsHexColor() color?: string;
}

export class UpdateProjectDto {
  @OptionalField()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;
  @OptionalField() @IsString() @MaxLength(2000) description?: string;
  @OptionalField() @IsHexColor() color?: string;
  @OptionalField() @IsBoolean() archived?: boolean;
}
