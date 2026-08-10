/**
 * Shared types for the API drift monitor. This tooling lives outside `src/` — it is never
 * built, exported, or published; it only inspects the live ChargePoint API and proposes changes
 * to `src/types.ts` for a human to review.
 */

/** A structural shape of a JSON value: what kind each leaf/branch is, never what its value is. */
export type Shape =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  /** Empty array, or any value whose kind we can't classify (JSON has none, kept for safety). */
  | { kind: 'unknown' }
  | { kind: 'array'; items: Shape }
  | { kind: 'object'; fields: Record<string, Shape> };

/**
 * A baseline tree mirrors `Shape` but every object field also tracks whether that field has
 * ever been seen absent (`optional`) and how many *consecutive* runs it's been missing
 * (`missingStreak`) — the latter is what makes the monitor resistant to fields that are only
 * present transiently (e.g. `sessionId` only while charging), so a single day's absence never
 * triggers a type change on its own.
 */
export type BaselineNode =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'unknown' }
  | { kind: 'array'; items: BaselineNode }
  | { kind: 'object'; fields: Record<string, BaselineField> };

export interface BaselineField {
  node: BaselineNode;
  optional: boolean;
  missingStreak: number;
}

/**
 * Number of consecutive runs a currently-required field must be absent before it's proposed as
 * optional. Keeps a single transient absence from triggering a type change.
 */
export const DEFAULT_MISSING_THRESHOLD = 3;

export type DiffKind = 'added' | 'widenedRequired' | 'typeChanged';

export interface DiffEntry {
  /** Dot/bracket path from the endpoint root, e.g. `utility.plans[].id`. */
  path: string;
  kind: DiffKind;
  /** Human-readable detail, e.g. `string -> number` for typeChanged. */
  detail: string;
}

export type VersionLabel = 'bump:patch' | 'bump:minor' | 'bump:major';

export interface Classification {
  /** Null when the run contains any entry that needs human review — no label is auto-applied. */
  label: VersionLabel | null;
  /** True only when every entry in the diff is safe to auto-apply (added / widenedRequired). */
  autoApplyable: boolean;
  needsReview: boolean;
}

/** Raw (unredacted) JSON captured from one endpoint. Never written to disk. */
export interface EndpointCapture {
  endpoint: string;
  data: unknown;
}

export interface EndpointDiff {
  endpoint: string;
  entries: DiffEntry[];
}

/**
 * Whether any *changed* file needs committing is a git question, not something this script
 * tracks itself — the workflow decides that with `git status --porcelain api-schema/` after
 * `run.ts` writes the (possibly unchanged) baseline files. `status` only says whether there's a
 * human-relevant diff worth turning into a PR.
 */
export type RunOutcome =
  | { status: 'no-change' }
  | { status: 'changed'; diffs: EndpointDiff[]; classification: Classification }
  | { status: 'auth-error'; message: string };
