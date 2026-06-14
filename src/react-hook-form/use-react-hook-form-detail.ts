import { useCallback, useEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import type { FormDetailBinding, UseDetailReturn } from "../types";

export type { FormDetailBinding };

export interface ReactHookFormDetailOptions<TData, TForm extends FieldValues> {
	/** Map a loaded record to form values when `TForm` differs from `TData`. */
	toForm?: (record: TData) => TForm;
}

/**
 * Wire a React Hook Form instance to a detail: auto-resets the form to each
 * loaded record (and to default values in create), surfaces `formState.isDirty`,
 * and gives a validating `onSave`. Strictly additive; the core never depends on
 * `react-hook-form`.
 *
 * @example
 * const form = useForm<UserForm>({ defaultValues });
 * const bind = useReactHookFormDetail(detail, form);
 * const guard = useDirtyGuard({ when: bind.isDirty });
 * return (
 *   <Detail detail={detail} isDirty={bind.isDirty} confirmDiscard={guard.confirmDiscard}>
 *     <Detail.Body><input {...form.register("name")} /></Detail.Body>
 *     <Detail.Actions onSave={bind.onSave} />
 *   </Detail>
 * );
 */
export function useReactHookFormDetail<TData, TForm extends FieldValues>(
	detail: UseDetailReturn<TData, TForm>,
	form: UseFormReturn<TForm>,
	options?: ReactHookFormDetailOptions<TData, TForm>,
): FormDetailBinding {
	const formRef = useRef(form);
	formRef.current = form;
	const detailRef = useRef(detail);
	detailRef.current = detail;
	const toFormRef = useRef(options?.toForm);
	toFormRef.current = options?.toForm;

	// Capture the form's original (blank) defaults once. RHF's reset(values)
	// rebases defaultValues to each loaded record, so reset() alone can no
	// longer return to blank for create.
	const blankRef = useRef<TForm | null>(null);
	if (blankRef.current === null) {
		blankRef.current = form.getValues();
	}

	// Reset-on-load: RHF's reset(values) also rebases the dirty comparison, so
	// isDirty starts false against each freshly loaded record.
	const { record, mode } = detail;
	// The record we last synced, to tell a real change from a re-render.
	const prevRecordRef = useRef(record);
	useEffect(() => {
		const f = formRef.current;
		const recordChanged = prevRecordRef.current !== record;
		prevRecordRef.current = record;

		if (mode === "create") {
			f.reset(blankRef.current ?? f.getValues());
			return;
		}
		if (record == null) return;
		// Don't clobber unsaved edits when the record changes underneath an
		// active edit (e.g. a controlled-core background revalidation). A mode
		// change (cancel/save back to view) still resets; only a same-mode
		// record swap while dirty-editing is skipped. The narrow exception is
		// opening a *different* record straight into edit while already dirty.
		if (recordChanged && mode === "edit" && f.formState.isDirty) return;
		f.reset(toFormRef.current?.(record) ?? (record as unknown as TForm));
	}, [record, mode]);

	const onSave = useCallback(async () => {
		// handleSubmit runs validation; the inner handler only fires when valid.
		await formRef.current.handleSubmit(async (values) => {
			await detailRef.current.save(values);
		})();
	}, []);

	return { isDirty: form.formState.isDirty, onSave };
}
