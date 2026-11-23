import type { DirectiveType } from '@takam/shared';

/** The Hebrew label for each Directive type, shown next to its title. */
export const TYPE_LABELS: Record<DirectiveType, string> = {
  Instruction: 'הוראה',
  'Temporary Instruction': 'הוראת שעה',
  Message: 'הודעה',
};
