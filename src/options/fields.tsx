import type { ComponentChildren } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import { t } from '../shared/i18n';

export function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const hint = useId();
  return (
    <div class="field">
      <label class="check">
        <input
          type="checkbox"
          checked={props.checked}
          aria-describedby={props.hint === undefined ? undefined : hint}
          onChange={(event) => {
            props.onChange(event.currentTarget.checked);
          }}
        />
        <span>{props.label}</span>
      </label>
      {props.hint !== undefined && (
        <p id={hint} class="muted hint">
          {props.hint}
        </p>
      )}
    </div>
  );
}

export function Choice<T extends string>(props: {
  legend: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string; readonly hint?: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset class="field">
      <legend>{props.legend}</legend>
      {props.options.map((option) => (
        <label key={option.value} class="check">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={props.value === option.value}
            onChange={() => {
              props.onChange(option.value);
            }}
          />
          <span>
            {option.label}
            {option.hint !== undefined && <span class="muted hint"> — {option.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Text input that saves only valid values: `parse` returns the value to store, or an
 * error message shown under the field (the stored value stays as it was).
 */
export function TextField<T>(props: {
  label: string;
  hint?: string;
  value: string;
  multiline?: boolean;
  inputMode?: 'numeric' | 'text';
  parse: (text: string) => { ok: true; value: T } | { ok: false; message: string };
  onCommit: (value: T) => void;
  children?: ComponentChildren;
}) {
  const [text, setText] = useState(props.value);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  useEffect(() => {
    setText(props.value);
    setError(null);
  }, [props.value]);

  const commit = (next: string) => {
    const parsed = props.parse(next);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    props.onCommit(parsed.value);
  };
  const describedBy =
    [props.hint === undefined ? '' : `${id}-hint`, error === null ? '' : `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  const common = {
    id,
    value: text,
    'aria-invalid': error !== null,
    'aria-describedby': describedBy,
    onInput: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      setText(event.currentTarget.value);
    },
    onChange: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      commit(event.currentTarget.value);
    },
  };

  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      {props.multiline === true ? (
        <textarea rows={4} {...common} />
      ) : (
        <input type="text" inputMode={props.inputMode} spellcheck={false} {...common} />
      )}
      {props.hint !== undefined && (
        <p id={`${id}-hint`} class="muted hint">
          {props.hint}
        </p>
      )}
      {error !== null && (
        <p id={`${id}-error`} class="status-error hint" role="alert">
          {error}
        </p>
      )}
      {props.children}
    </div>
  );
}

/** Two clicks: the first arms the button, the second acts. */
export function ConfirmButton(props: { label: string; confirm: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      class="secondary"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        props.onConfirm();
      }}
      onBlur={() => {
        setArmed(false);
      }}
    >
      {armed ? props.confirm : props.label}
    </button>
  );
}

export const invalid = (message: string) => ({ ok: false as const, message });
export const valid = <T,>(value: T) => ({ ok: true as const, value });

/** "pdf, .PPTX exe" -> ["pdf", "pptx", "exe"]. */
export function parseExtensions(text: string) {
  const list = text
    .split(/[\s,;]+/)
    .map((e) => e.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
  if (list.some((e) => !/^[a-z0-9]{1,10}$/.test(e))) return invalid(t('optErrExtensions'));
  if (list.length > 40) return invalid(t('optErrExtensions'));
  return valid([...new Set(list)]);
}

/** Empty = no value (null); otherwise a whole number of MB between 1 and 10000. */
export function parseSizeMb(text: string) {
  const trimmed = text.trim();
  if (trimmed === '') return valid(null);
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 10_000) return invalid(t('optErrSize'));
  return valid(n);
}
