import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';
import styles from './Input.module.css';

interface FieldProps {
  label?: ReactNode;
  /** 라벨을 시각적으로 숨기고 스크린리더에만 노출 */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
}

function Field({
  id,
  label,
  hideLabel,
  hint,
  error,
  className,
  children,
}: FieldProps & { id: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx(styles.field, className)}>
      {label && (
        <label htmlFor={id} className={hideLabel ? 'visually-hidden' : styles.label}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const describedBy = (id: string, { hint, error }: FieldProps) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, FieldProps {
  icon?: IconName;
  inputSize?: 'sm' | 'md' | 'lg';
  /** 바깥 Field 래퍼 className (폭 조절용) */
  fieldClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hideLabel, hint, error, icon, inputSize = 'md', fieldClassName, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint} error={error} className={fieldClassName}>
      <div className={styles.control}>
        {icon && <Icon name={icon} size={18} className={styles.leadingIcon} />}
        <input
          ref={ref}
          id={id}
          className={cx(
            styles.input,
            inputSize !== 'md' && styles[inputSize],
            icon && styles.withIcon,
            !!error && styles.invalid,
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error })}
          {...rest}
        />
      </div>
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {
  fieldClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hideLabel, hint, error, fieldClassName, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint} error={error} className={fieldClassName}>
      <textarea
        ref={ref}
        id={id}
        className={cx(styles.input, styles.textarea, !!error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint, error })}
        {...rest}
      />
    </Field>
  );
});
