import { OptionalField } from '../common/optional-field';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Priority } from '@prisma/client';

export class TaskFieldsDto {
  @OptionalField() @IsString() @MaxLength(10000) description?: string;
  @OptionalField() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString({ strict: true }) dueDate?: string | null;
  @OptionalField()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  assigneeIds?: string[];
}
export class CreateTaskDto extends TaskFieldsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @IsUUID() columnId!: string;
}
export class UpdateTaskDto extends TaskFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}
export class MoveTaskDto {
  @IsUUID() columnId!: string;
  // Omitted or null means append; a supplied anchor must be a valid UUID.
  @IsOptional() @IsUUID() beforeTaskId?: string | null;
}
export class CreateCommentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
