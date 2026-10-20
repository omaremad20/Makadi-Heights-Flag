import { useId, type ReactNode } from "react";

/** Title and guidance on the left (desktop), fields on the right. A rule separates sections. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-6 border-t border-brand-primary/60 py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12"
    >
      <div>
        <h2
          id={titleId}
          className="font-brand-heading text-xl text-brand-secondary"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            {description}
          </p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
