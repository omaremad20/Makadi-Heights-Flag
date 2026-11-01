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
  Minus,
  Plus,
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
import { PhotoPicker, PhotoSelectionProvider } from "@/components/applications/photo-picker";
import { PhotoUploadStatus } from "@/components/applications/photo-upload-status";
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
import { usePhotoSelection } from "@/hooks/use-photo-selection";
import { usePhotoUploads } from "@/hooks/use-photo-uploads";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { buildPhotoJobs } from "@/lib/photos/build-photo-jobs";
import { guestPhotoDeps } from "@/lib/photos/guest-photo-api";

const DEFAULT_VALUES: ApplicationFormValues = {
  membership_type: "clubhouse_only",
  period: "week",
  user_type: "",
  full_name: "",
  unit_number: "",
  mobile: "",
  email: "",
  nationality: "",
  partner_name: "",
  partner_nationality: "",
  partner_mobile: "",
  partner_email: "",
  additional_persons: [],
};

type TextFieldName = Exclude<
  keyof ApplicationFormValues,
  "additional_persons" | "period" | "user_type" | "membership_type"
>;

function TextField({
  name,
  label,
  required,
  optional,
  hint,
  className,
  ...input
}: {
  name: TextFieldName;
  label: string;
  required?: boolean;
  optional?: boolean;
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
      optional={optional}
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
    handleSubmit,
    reset,
    setValue,
    getValues,
    setError,
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

  // Headcount state (starts at 1; exclusively controls all applicant forms from 1 to 22)
  const [headcount, setHeadcount] = useState<number>(1);

  const inFlight = useRef(false); // blocks repeat submits
  // One key per submission attempt: retries after a lost response replay the
  // same application instead of creating a duplicate.
  const idempotencyKey = useRef<string | null>(null);

  // Optional photos: compressed on selection, uploaded after the application is saved.
  const photos = usePhotoSelection();
  const photoUploads = usePhotoUploads();

  // Unsaved changes warning (also while photos are still uploading)
  const { showConfirmDialog, confirmNavigation, cancelNavigation } =
    useUnsavedChanges({
      isDirty: isDirty || Object.keys(photos.slots).length > 0 || photoUploads.running,
      isSubmitted: submitted && !photoUploads.running,
    });

  // Watch form fields needed for live pricing and sync
  const watchedMembershipType = useWatch({
    control,
    name: "membership_type",
  });
  const watchedPeriod = useWatch({ control, name: "period" });

  // Master Headcount Counter handler (1 to 22)
  // The counter is the sole controller for all applicant forms:
  // - 1: Main Applicant only
  // - 2: Main Applicant + Partner
  // - 3+: Main Applicant + Partner + (count - 2) Additional Members
  const handleHeadcountChange = (targetCount: number) => {
    if (targetCount < 1 || targetCount > 22) return;
    setHeadcount(targetCount);
    photos.keepOnly((slot) => {
      if (slot === "applicant") return true;
      if (slot === "partner") return targetCount >= 2;
      const index = Number(slot.split(":")[1]);
      return Number.isInteger(index) && index < targetCount - 2;
    });

    if (targetCount === 1) {
      setValue("partner_name", "");
      setValue("partner_nationality", "");
      setValue("partner_mobile", "");
      setValue("partner_email", "");
      setValue("additional_persons", []);
      return;
    }

    if (targetCount === 2) {
      setValue("additional_persons", []);
      return;
    }

    // When targetCount >= 3:
    // 1 Primary Applicant + 1 Partner + (targetCount - 2) Additional Members
    const targetAdditional = targetCount - 2;
    const current = getValues("additional_persons") || [];

    if (current.length < targetAdditional) {
      const toAdd = targetAdditional - current.length;
      const newItems = Array.from({ length: toAdd }, () => ({
        name: "",
        relative: "",
        mobile: "",
      }));
      setValue("additional_persons", [...current, ...newItems]);
    } else if (current.length > targetAdditional) {
      setValue("additional_persons", current.slice(0, targetAdditional));
    }
  };

  // Live pricing calculator effect
  useEffect(() => {
    let active = true;

    async function fetchPricing() {
      if (!watchedMembershipType || !watchedPeriod) return;

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
    if (photos.preparing) {
      toast.error("Wait for the photos to finish preparing");
      return;
    }
    inFlight.current = true;
    setSubmitError(null);

    // Ensure submitted payload only contains active applicants strictly governed by current headcount
    const cleanedValues: ApplicationFormValues = {
      ...values,
      partner_name: headcount >= 2 ? (values.partner_name || "") : "",
      partner_nationality: headcount >= 2 ? (values.partner_nationality || "") : "",
      partner_mobile: headcount >= 2 ? (values.partner_mobile || "") : "",
      partner_email: headcount >= 2 ? (values.partner_email || "") : "",
      additional_persons:
        headcount >= 3
          ? (values.additional_persons || []).slice(0, headcount - 2)
          : [],
    };

    idempotencyKey.current ??= crypto.randomUUID();
    const submissionKey = idempotencyKey.current;

    try {
      const result = await submitApplication(cleanedValues, submissionKey);
      if (result.ok) {
        idempotencyKey.current = null;
        // Photos go up in the background; the application is already saved.
        const jobs = buildPhotoJobs(photos.slots, result.application);
        if (jobs.length > 0) void photoUploads.start(guestPhotoDeps(submissionKey), jobs);
        setSubmitted(true);
        setLastSubmittedValues(cleanedValues);
        toast.success("Application submitted successfully");

        // Automatically trigger PDF generation
        setPdfGenerating(true);
        setPdfError(null);
        try {
          const pdf = await generateApplicationPdf(cleanedValues, pricingData, {
            isExternalUserView: true,
          });
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
        if (result.rotateKey) idempotencyKey.current = null;
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(path as Parameters<typeof setError>[0], { type: "server", message });
        }
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
        { isExternalUserView: true },
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
    setHeadcount(1);
    reset(DEFAULT_VALUES);
    setSubmitError(null);
    setSubmitted(false);
    photos.clear();
    photoUploads.reset();
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
        photoStatus={
          <PhotoUploadStatus
            items={photoUploads.items}
            running={photoUploads.running}
            hasFailures={photoUploads.hasFailures}
            onRetry={() => void photoUploads.retryFailed()}
          />
        }
      />
    );
  }

  return (
    <PhotoSelectionProvider value={photos}>
    <FormProvider {...methods}>
      <form
        noValidate
        aria-busy={isSubmitting}
        // eslint-disable-next-line react-hooks/refs
        onSubmit={handleSubmit(onSubmit, () =>
          toast.error("Check the highlighted fields"),
        )}
      >
        {/* TOP PRICING & HEADCOUNT SUMMARY WITH APPLICATION DETAILS */}
        <div className="mb-8 rounded-2xl border border-brand-primary/30 bg-gradient-to-br from-white via-white to-brand-primary/5 p-6 shadow-sm space-y-6">
          {/* Header row: Title & Attendee Counter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-5 border-b border-brand-primary/20">
            <div>
              <div className="flex items-center gap-2 text-brand-secondary font-bold text-base">
                <Calculator className="size-5 text-brand-secondary" />
                <span>Pricing & Headcount Summary</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-secondary">
                  2026 Season
                </span>
              </div>
              <p className="text-xs text-neutral-600 mt-1">
                Configure your application pass details and attendee count (1 to 22) to calculate official fees.
              </p>
            </div>

            {/* Master Attendee Stepper */}
            <div className="flex items-center gap-4 bg-white px-4 py-2.5 rounded-xl border border-neutral-200/80 shadow-xs">
              <div className="text-right">
                <span className="text-xs font-semibold text-neutral-500 block uppercase tracking-wider">
                  Total Attendees
                </span>
                <span className="text-xs text-neutral-500">Max 22 people</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                  disabled={headcount <= 1}
                  onClick={() => handleHeadcountChange(headcount - 1)}
                  aria-label="Decrease headcount"
                >
                  <Minus className="size-3.5" />
                </Button>
                <div className="w-10 text-center">
                  <span className="text-xl font-bold font-brand-heading text-brand-secondary block leading-none">
                    {headcount}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                  disabled={headcount >= 22}
                  onClick={() => handleHeadcountChange(headcount + 1)}
                  aria-label="Increase headcount"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* APPLICATION DETAILS INSIDE SUMMARY */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Membership Type */}
            <Controller
              control={control}
              name="membership_type"
              render={({ field }) => (
                <FormField
                  id="membership_type"
                  label="Membership facility"
                  required
                  error={errors.membership_type?.message}
                  hint="Select facility access"
                >
                  {(a11y) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        {...a11y}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        className={SELECT_CLASS}
                      >
                        <SelectValue placeholder="Select facility" />
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

            {/* 2. Membership Period */}
            <Controller
              control={control}
              name="period"
              render={({ field }) => (
                <FormField
                  id="period"
                  label="Membership duration"
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
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {PERIODS.map((p) => {
                          const unavailable = UNAVAILABLE_PERIODS.includes(p);
                          return (
                            <SelectItem key={p} value={p} disabled={unavailable}>
                              {PERIOD_LABELS[p]}
                              {unavailable && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  (Unavailable)
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

            {/* 3. Applicant Type */}
            <Controller
              control={control}
              name="user_type"
              render={({ field }) => (
                <FormField
                  id="user_type"
                  label="Applicant residency"
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
                          <SelectValue placeholder="Select residency" />
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
                          aria-label="Clear applicant residency"
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
          </div>

          {/* Attendees Alignment Breakdown */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-primary/10 text-xs">
            <span className="text-neutral-500 font-medium">Included in pass:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-neutral-200 font-medium text-neutral-800 shadow-2xs">
              <span className="size-2 rounded-full bg-brand-primary" />
              1 Primary Applicant
            </span>
            {headcount >= 2 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 font-medium text-blue-900 shadow-2xs">
                <span className="size-2 rounded-full bg-blue-500" />
                1 Partner
              </span>
            ) : null}
            {headcount >= 3 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 font-medium text-emerald-900 shadow-2xs">
                <span className="size-2 rounded-full bg-emerald-500" />
                {headcount - 2} Additional {headcount - 2 === 1 ? "Person" : "People"}
              </span>
            ) : null}
          </div>

          {/* Pricing Calculation Display */}
          <div className="pt-2">
            {pricingLoading ? (
              <div className="flex items-center gap-2 text-xs text-neutral-600 py-2">
                <LoaderCircle className="size-4 animate-spin text-brand-secondary" />
                <span>Calculating official pricing from server…</span>
              </div>
            ) : pricingData ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/90 p-3 rounded-lg border border-neutral-200">
                  <span className="text-[11px] font-medium text-neutral-500 block">Base Membership Fee</span>
                  <span className="text-sm font-semibold text-neutral-800">
                    {pricingData.base_price.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP
                  </span>
                </div>
                <div className="bg-white/90 p-3 rounded-lg border border-neutral-200">
                  <span className="text-[11px] font-medium text-neutral-500 block">14% VAT Amount</span>
                  <span className="text-sm font-semibold text-neutral-800">
                    {pricingData.vat_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP
                  </span>
                </div>
                <div className="bg-brand-primary/10 p-3 rounded-lg border border-brand-primary/30">
                  <span className="text-[11px] font-bold text-brand-secondary block">Total Payable</span>
                  <span className="text-base font-bold text-brand-secondary font-brand-heading">
                    {pricingData.total_price.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP
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
                Select your membership duration and facility to view live pricing.
              </p>
            )}
          </div>
        </div>

        {/* SECTION 1: APPLICANT DETAILS */}
        <FormSection
          title="Applicant Details"
          description="Details of the person applying for the pass."
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

          <NationalityField name="nationality" label="Nationality" />
          <PhoneField
            id="mobile"
            name="mobile"
            label="Mobile"
            optional
            autoComplete="tel-national"
          />
          <TextField
            name="email"
            label="Email"
            optional
            type="email"
            inputMode="email"
            autoComplete="email"
            className="sm:col-span-2"
          />
          <PhotoPicker slot="applicant" personLabel="the applicant" />
        </FormSection>

        {/* SECTION 2: PARTNER DETAILS */}
        {headcount >= 2 && (
          <FormSection
            title="Partner Details"
            description="Details of the partner included in the pass."
          >
            <TextField
              name="partner_name"
              label="Partner’s full name"
              required
              autoComplete="off"
              hint="Latin letters only."
            />
            <NationalityField name="partner_nationality" label="Nationality" />
            <PhoneField
              id="partner_mobile"
              name="partner_mobile"
              label="Mobile"
              optional
            />
            <TextField
              name="partner_email"
              label="Email"
              optional
              type="email"
              inputMode="email"
              autoComplete="off"
            />
            <PhotoPicker slot="partner" personLabel="the partner" />
          </FormSection>
        )}

        {/* SECTION 3: ADDITIONAL MEMBERS */}
        {headcount >= 3 && (
          <FormSection
            title="Additional Members"
            description="Additional members included in this application pass."
          >
            <AdditionalPersons />
          </FormSection>
        )}

        {/* SUBMISSION BUTTON */}
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
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Users className="size-4 text-brand-secondary" />
              <span>
                Registering <strong>{headcount} {headcount === 1 ? "person" : "people"}</strong> under this application.
              </span>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || photos.preparing}
              className="h-11 w-full bg-brand-button px-8 text-brand-button-foreground hover:bg-brand-button/85 sm:w-auto font-medium cursor-pointer"
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
    </PhotoSelectionProvider>
  );
}
