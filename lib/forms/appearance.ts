import type { FormAppearance, FormPublicSettings } from "@/types/forms";

export interface GlobalFormDefaultsInput {
  primaryColor: string;
  backgroundColor: string;
  buttonColor: string;
  headerColor: string;
  font: NonNullable<FormAppearance["font"]>;
  title: string;
  description: string;
}

export interface FormPresentation {
  title: string;
  description: string | null;
  appearance: FormAppearance;
}

/**
 * Decides how a form looks to respondents. With "Apply global settings" on,
 * colours and font come from Settings → Global form appearance, and the
 * global title/description replace the form's own ones when they are set.
 * With it off, the form uses its own appearance, name and description.
 */
export function resolveFormPresentation(
  form: { name: string; description: string | null; settings: FormPublicSettings },
  globals: GlobalFormDefaultsInput,
): FormPresentation {
  const own = form.settings.appearance ?? {};
  if (!own.useGlobal) {
    return { title: form.name, description: form.description, appearance: own };
  }
  return {
    title: globals.title.trim() || form.name,
    description: globals.description.trim() || form.description,
    appearance: {
      useGlobal: true,
      primaryColor: globals.primaryColor,
      backgroundColor: globals.backgroundColor,
      buttonColor: globals.buttonColor,
      headerColor: globals.headerColor,
      font: globals.font,
    },
  };
}
