"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Calculator,
  LoaderCircle,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AdditionalPersons } from "@/components/applications/additional-persons";
import {
  CONTROL_CLASS,
  FormField,
  SELECT_CLASS,
} from "@/components/applications/form-field";
import { FormSection } from "@/components/applications/form-section";
import { NationalityField } from "@/components/applications/nationality-field";
import { PhoneField } from "@/components/applications/phone-field";
import { SuccessPanel } from "@/components/applications/success-panel";
import { UnsavedChangesDialog } from "@/components/applications/unsaved-changes-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applicationFormSchema,
  MEMBERSHIP_TYPE_LABELS,
  PERIOD_LABELS,
  UNAVAILABLE_PERIODS,
  USER_TYPE_LABELS,
  type ApplicationFormValues,
} from "@/lib/applications/form-schema";
import {
  calculateApplicationPricing,
  type PricingData,
} from "@/lib/applications/pricing";
import {
  generateApplicationPdf,
  type GeneratedPdfResult,
} from "@/lib/applications/pdf";
import { submitApplication } from "@/lib/applications/submit";
import {
  MEMBERSHIP_TYPES,
  PERIODS,
  USER_TYPES,
} from "@/lib/applications/vaildation";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

const DEFAULT_VALUES: ApplicationFormValues = {
  membership_type: "clubhouse_only",
  period: "week",
  user_type: "",
  full_name: "",
  unit_number: "",
  date_of_birth: "",
  mobile: "",
  email: "",
  nationality: "",
  partner_name: "",
  partner_nationality: "",
  partner_mobile: "",
  partner_email: "",
  additional_persons: [],
};

// Same cutoff validateApplication() uses (UTC calendar date), so the picker never
// allows a date the validator would reject.
const todayUtc = () => new Date().toISOString().slice(0, 10);

type TextFieldName = Exclude<
  keyof ApplicationFormValues,
  "additional_persons" | "period" | "user_type" | "membership_type"
>;

function TextField({
  name,
  label,
  required,
  hint,
  className,
  ...input
}: {
  name: TextFieldName;
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
} & Omit<ComponentProps<"input">, "name">) {
  const {
    register,
    formState: { errors },
  } = useFormContext<ApplicationFormValues>();
  return (
    <FormField
      id={name}
      label={label}
      required={required}
      hint={hint}
      error={errors[name]?.message}
      className={className}
    >
      {(a11y) => (
        <Input
          {...a11y}
          {...input}
          {...register(name)}
          className={CONTROL_CLASS}
        />
      )}
    </FormField>
  );
}

export function ApplicationForm() {
  const methods = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    mode: "onTouched",
    defaultValues: DEFAULT_VALUES,
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = methods;

  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSubmittedValues, setLastSubmittedValues] =
    useState<ApplicationFormValues | null>(null);

  // PDF Generation State
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfResult, setPdfResult] = useState<GeneratedPdfResult | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Live Pricing State
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);

  const inFlight = useRef(false); // blocks repeat submits (e.g. Enter key) while a request is running

  // Unsaved changes warning
  const { showConfirmDialog, confirmNavigation, cancelNavigation } =
    useUnsavedChanges({
      isDirty,
      isSubmitted: submitted,
    });

  // Watch form fields needed for live pricing
  const watchedMembershipType = useWatch({
    control,
    name: "membership_type",
  });
  const watchedPeriod = useWatch({ control, name: "period" });
  const watchedPartnerName = useWatch({ control, name: "partner_name" });
  const watchedAdditionalPersons = useWatch({
    control,
    name: "additional_persons",
  });

  const partnerCount = watchedPartnerName && watchedPartnerName.trim() ? 1 : 0;
  const additionalCount = watchedAdditionalPersons?.length || 0;
  const headcount = 1 + partnerCount + additionalCount;

  // Live pricing calculator effect
  useEffect(() => {
    let active = true;

    async function fetchPricing() {
      if (!watchedMembershipType || !watchedPeriod) return;

      if (watchedMembershipType === "beach_only" && headcount < 2) {
        setPricingData(null);
        setPricingMessage(
          "Beach-only membership requires at least two people (applicant + partner or guest).",
        );
        return;
      }

      if (headcount > 22) {
        setPricingData(null);
        setPricingMessage("Maximum allowed headcount is 22 people.");
        return;
      }

      setPricingLoading(true);
      setPricingMessage(null);

      const res = await calculateApplicationPricing({
        membershipType: watchedMembershipType,
        period: watchedPeriod,
        people: headcount,
      });

      if (!active) return;
      setPricingLoading(false);

      if (res.ok) {
        setPricingData(res.data);
        setPricingMessage(null);
      } else {
        setPricingData(null);
        setPricingMessage(res.message);
      }
    }

    const timer = setTimeout(fetchPricing, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [watchedMembershipType, watchedPeriod, headcount]);

  async function onSubmit(values: ApplicationFormValues) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitError(null);

    try {
      const result = await submitApplication(values);
      if (result.ok) {
        setSubmitted(true);
        setLastSubmittedValues(values);
        toast.success("Application submitted successfully");

        // Automatically trigger PDF generation
        setPdfGenerating(true);
        setPdfError(null);
        try {
          const pdf = await generateApplicationPdf(values, pricingData);
          setPdfResult(pdf);
          toast.success("Completed application PDF is ready");
        } catch (pdfErr) {
          console.error("PDF generation error:", pdfErr);
          const msg =
            pdfErr instanceof Error ? pdfErr.message : "Failed to generate PDF";
          setPdfError(msg);
          toast.error("Application saved, but PDF generation failed");
        } finally {
          setPdfGenerating(false);
        }
      } else {
        setSubmitError(result.message); // values stay in the form
        toast.error(result.message || "Application not submitted");
      }
    } finally {
      inFlight.current = false;
    }
  }

  // Safe retry for PDF generation without duplicate application submission
  async function handleRetryPdf() {
    if (!lastSubmittedValues || pdfGenerating) return;
    setPdfGenerating(true);
    setPdfError(null);
    try {
      const pdf = await generateApplicationPdf(
        lastSubmittedValues,
        pricingData,
      );
      setPdfResult(pdf);
      toast.success("PDF generated successfully");
    } catch (pdfErr) {
      console.error("PDF retry error:", pdfErr);
      const msg =
        pdfErr instanceof Error ? pdfErr.message : "Failed to generate PDF";
      setPdfError(msg);
      toast.error("PDF generation failed: " + msg);
    } finally {
      setPdfGenerating(false);
    }
  }

  function startNew() {
    if (pdfResult?.url) {
      URL.revokeObjectURL(pdfResult.url);
    }
    setPdfResult(null);
    setPdfGenerating(false);
    setPdfError(null);
    setLastSubmittedValues(null);
    reset(DEFAULT_VALUES);
    setSubmitError(null);
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <SuccessPanel
        onReset={startNew}
        pdfResult={pdfResult}
        pdfGenerating={pdfGenerating}
        pdfError={pdfError}
        onRetryPdf={handleRetryPdf}
        applicantName={lastSubmittedValues?.full_name}
        membershipLabel={
          lastSubmittedValues
            ? MEMBERSHIP_TYPE_LABELS[lastSubmittedValues.membership_type]
            : undefined
        }
        periodLabel={
          lastSubmittedValues
            ? PERIOD_LABELS[lastSubmittedValues.period]
            : undefined
        }
      />
    );
  }

  const dob = register("date_of_birth");

  return (
    <FormProvider {...methods}>
      <form
        noValidate
        aria-busy={isSubmitting}
        // eslint-disable-next-line react-hooks/refs
        onSubmit={handleSubmit(onSubmit, () =>
          toast.error("Check the highlighted fields"),
        )}
      >
        <FormSection
          title="Applicant"
          description="Details of the person applying."
        >
          <TextField
            name="full_name"
            label="Full name"
            required
            autoComplete="name"
            hint="Latin letters only. Hyphens and apostrophes are allowed."
            className="sm:col-span-2"
          />
          <TextField
            name="unit_number"
            label="Unit number"
            required
            autoComplete="off"
          />

          <FormField
            id="date_of_birth"
            label="Date of birth"
            required
            error={errors.date_of_birth?.message}
          >
            {(a11y) => (
              <Input
                {...a11y}
                {...dob}
                type="date"
                autoComplete="bday"
                min="1900-01-01"
                ref={(el) => {
                  dob.ref(el);
                  if (el) el.max = todayUtc(); // set after hydration: avoids a server/client date mismatch
                }}
                className={CONTROL_CLASS}
              />
            )}
          </FormField>

          <NationalityField name="nationality" label="Nationality" required />
          <PhoneField
            id="mobile"
            name="mobile"
            label="Mobile"
            required
            autoComplete="tel-national"
          />
          <TextField
            name="email"
            label="Email"
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            className="sm:col-span-2"
          />
        </FormSection>

        <FormSection
          title="Membership details"
          description="Choose your membership facility, duration, and residency status."
        >
          {/* Membership Type Input (Required) */}
          <Controller
            control={control}
            name="membership_type"
            render={({ field }) => (
              <FormField
                id="membership_type"
                label="Membership type"
                required
                error={errors.membership_type?.message}
                hint="Select the facilities included in your pass."
                className="sm:col-span-2"
              >
                {(a11y) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      {...a11y}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      className={SELECT_CLASS}
                    >
                      <SelectValue placeholder="Select membership type" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMBERSHIP_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          <span className="font-medium">
                            {MEMBERSHIP_TYPE_LABELS[type]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}
          />

          <Controller
            control={control}
            name="user_type"
            render={({ field }) => (
              <FormField
                id="user_type"
                label="Applicant type"
                optional
                error={errors.user_type?.message}
              >
                {(a11y) => (
                  <div className="flex items-center gap-2">
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        {...a11y}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        className={SELECT_CLASS}
                      >
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {USER_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.value !== "" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Clear applicant type"
                        onClick={() => field.onChange("")}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                )}
              </FormField>
            )}
          />

          <Controller
            control={control}
            name="period"
            render={({ field }) => (
              <FormField
                id="period"
                label="Membership period"
                required
                error={errors.period?.message}
              >
                {(a11y) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      {...a11y}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      className={SELECT_CLASS}
                    >
                      <SelectValue placeholder="Select a period" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => {
                        const unavailable = UNAVAILABLE_PERIODS.includes(p);
                        return (
                          <SelectItem key={p} value={p} disabled={unavailable}>
                            {PERIOD_LABELS[p]}
                            {unavailable && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Unavailable
                              </span>
                            )}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}
          />

          {/* Live Pricing Summary Box */}
          <div className="sm:col-span-2 mt-2 rounded-xl border border-brand-primary/40 bg-brand-primary/5 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-brand-primary/20">
              <div className="flex items-center gap-2 text-brand-secondary font-semibold text-sm">
                <Calculator className="size-4" />
                <span>Pricing Summary (2026 Season)</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 bg-white/80 px-2.5 py-1 rounded-full border border-neutral-200">
                <Users className="size-3.5" />
                <span>
                  {headcount} {headcount === 1 ? "Person" : "People"}
                </span>
              </div>
            </div>

            <div className="mt-3">
              {pricingLoading ? (
                <div className="flex items-center gap-2 text-xs text-neutral-600 py-2">
                  <LoaderCircle className="size-4 animate-spin text-brand-secondary" />
                  <span>Calculating official pricing from server…</span>
                </div>
              ) : pricingData ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-neutral-600 text-xs">
                    <span>Base Membership Fee</span>
                    <span>
                      {pricingData.base_price.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      EGP
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-600 text-xs">
                    <span>14% VAT</span>
                    <span>
                      {pricingData.vat_amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      EGP
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-brand-primary/20 font-brand-heading text-base font-bold text-brand-secondary">
                    <span>Total Payable</span>
                    <span>
                      {pricingData.total_price.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      EGP
                    </span>
                  </div>
                </div>
              ) : pricingMessage ? (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                  <p>{pricingMessage}</p>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">
                  Fill in your membership period and attendees to view pricing.
                </p>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Partner"
          description="Optional. Leave this section empty if it doesn’t apply. Anything you enter is checked."
        >
          <TextField
            name="partner_name"
            label="Partner’s name"
            autoComplete="off"
            hint="Latin letters only."
          />
          <NationalityField name="partner_nationality" label="Nationality" />
          <PhoneField
            id="partner_mobile"
            name="partner_mobile"
            label="Mobile"
          />
          <TextField
            name="partner_email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="off"
          />
        </FormSection>

        <FormSection
          title="Additional children and adults"
          description="Add anyone else to include. Leave this empty if there is no one to add."
        >
          <AdditionalPersons />
        </FormSection>

        <div className="grid gap-4 border-t border-brand-primary/60 pt-8">
          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <p>{submitError}</p>
            </div>
          )}
          <div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 w-full bg-brand-button px-8 text-brand-button-foreground hover:bg-brand-button/85 sm:w-auto font-medium"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit application"
              )}
            </Button>
            <span role="status" className="sr-only">
              {isSubmitting ? "Submitting application" : ""}
            </span>
          </div>
        </div>
      </form>

      {/* Unsaved Changes Confirmation Dialog */}
      <UnsavedChangesDialog
        open={showConfirmDialog}
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />
    </FormProvider>
  );
}
