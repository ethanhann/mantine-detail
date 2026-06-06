import type { UseFormReturnType } from "@mantine/form";
import { useCallback, useEffect, useRef } from "react";
import type { FormDetailBinding, UseDetailReturn } from "../types";

export type { FormDetailBinding };

export interface MantineFormDetailOptions<TData, TForm> {
	/** Map a loaded record to form values when `TForm` differs from `TData`. */
	toForm?: (record: TData) => TForm;
}

/**
 * Wire a `@mantine/form` instance to a detail: auto-resets the form to each
 * loaded record (and to a blank form in create), surfaces `isDirty`, and gives
 * a validating `onSave`. Strictly additive; the core never depends on
 * `@mantine/form`.
 *
 * Use a **controlled** form (`useForm({ mode: "controlled" })`) so `isDirty`
 * stays reactive. Uncontrolled forms do not re-render on field edits.
 *
 * @example
 * const form = useForm<UserForm>({ mode: "controlled", initialValues, validate });
 * const bind = useMantineFormDetail(detail, form);
 * const guard = useDirtyGuard({ when: bind.isDirty });
 * return (
 *   <Detail detail={detail} isDirty={bind.isDirty} confirmDiscard={guard.confirmDiscard}>
 *     <Detail.Body><TextInput {...form.getInputProps("name")} /></Detail.Body>
 *     <Detail.Actions onSave={bind.onSave} />
 *   </Detail>
 * );
 */
export function useMantineFormDetail<TData, TForm>(
	detail: UseDetailReturn<TData, TForm>,
	form: UseFormReturnType<TForm>,
	options?: MantineFormDetailOptions<TData, TForm>,
): FormDetailBinding {
	const formRef = useRef(form);
	formRef.current = form;
	const detailRef = useRef(detail);
	detailRef.current = detail;
	const toFormRef = useRef(options?.toForm);
	toFormRef.current = options?.toForm;

	// Capture the form's original (blank) values once, before any record loads.
	// resetDirty() below rebases the form's reset snapshot to each loaded record,
	// so reset() can no longer return to blank for create.
	const blankRef = useRef<TForm | null>(null);
	if (blankRef.current === null) {
		blankRef.current = form.getValues();
	}

	// Reset-on-load: when a new record lands (or on entering create), reset the
	// form to it and mark that the pristine baseline, so isDirty starts false.
	const { record, mode } = detail;
	useEffect(() => {
		const f = formRef.current;
		const values =
			mode === "create"
				? (blankRef.current ?? f.getValues())
				: record != null
					? (toFormRef.current?.(record) ?? (record as unknown as TForm))
					: null;
		if (values === null) return;
		f.setValues(values);
		f.resetDirty(values);
	}, [record, mode]);

	const onSave = useCallback(async () => {
		const f = formRef.current;
		if (f.validate().hasErrors) return;
		await detailRef.current.save(f.getValues());
	}, []);

	return { isDirty: form.isDirty(), onSave };
}
