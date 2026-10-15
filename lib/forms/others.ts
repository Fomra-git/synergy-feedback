/** Branch dropdown value for forms filed under "Others" (not tied to a branch). */
export const OTHERS_VALUE = "others";

/** How a form's group is shown in lists: its branch, "Others · <name>", or "No branch". */
export function formGroupLabel(form: { other_name?: string | null; branch?: { name: string } | null }): string {
  if (form.other_name) return `Others · ${form.other_name}`;
  return form.branch?.name ?? "No branch";
}
