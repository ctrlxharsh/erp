"use client";

import { createStudentInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useTRPC } from "@/lib/trpc/client";

type FormInput = z.input<typeof createStudentInputSchema>;
type Output = z.output<typeof createStudentInputSchema>;

export function StudentForm() {
  const t = useTranslations("people");
  const router = useRouter();
  const trpc = useTRPC();
  const setup = useQuery(trpc.setup.get.queryOptions());
  const create = useMutation(trpc.people.students.create.mutationOptions());
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, Output>({
    resolver: zodResolver(createStudentInputSchema),
    mode: "onBlur",
    defaultValues: {
      admissionNo: "",
      fullName: "",
      dateOfBirth: "",
      gender: null,
      admissionDate: "",
      sectionId: "",
      guardians: [],
    },
  });
  const guardians = useFieldArray({ control, name: "guardians" });

  const noSession = setup.isSuccess && setup.data.sessions.length === 0;

  async function onSubmit(values: Output) {
    try {
      const { id } = await create.mutateAsync(values);
      toast.success(t("created"));
      router.push(`/people/students/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("importFailed"));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-xl flex-col gap-4">
      <Link href="/people/students" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold text-primary">{t("addStudent")}</h1>
      {noSession ? (
        <p role="alert" className="rounded-md bg-warning p-3 text-sm text-warning-foreground">
          {t("needSession")}
        </p>
      ) : null}

      <Field id="fullName" label={t("fullName")} error={errors.fullName?.message}>
        <Input
          id="fullName"
          aria-invalid={errors.fullName ? true : undefined}
          {...register("fullName")}
        />
      </Field>
      <Field id="admissionNo" label={t("admissionNo")} error={errors.admissionNo?.message}>
        <Input
          id="admissionNo"
          aria-invalid={errors.admissionNo ? true : undefined}
          {...register("admissionNo")}
        />
      </Field>
      <Field id="sectionId" label={t("classSection")} error={errors.sectionId?.message}>
        <Select
          id="sectionId"
          aria-invalid={errors.sectionId ? true : undefined}
          {...register("sectionId")}
        >
          <option value="">{t("chooseSection")}</option>
          {setup.data?.classes.flatMap((c) =>
            c.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {c.name} {s.name}
              </option>
            )),
          )}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="dob" label={t("dob")} error={errors.dateOfBirth?.message}>
          <Input id="dob" type="date" {...register("dateOfBirth")} />
        </Field>
        <Field id="gender" label={t("gender")}>
          <Select id="gender" {...register("gender", { setValueAs: (v) => v || null })}>
            <option value="">{t("notSaid")}</option>
            <option value="female">{t("female")}</option>
            <option value="male">{t("male")}</option>
            <option value="other">{t("other")}</option>
          </Select>
        </Field>
      </div>
      <Field id="admissionDate" label={t("admissionDate")} error={errors.admissionDate?.message}>
        <Input id="admissionDate" type="date" {...register("admissionDate")} />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium text-primary">{t("guardians")}</legend>
        {guardians.fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <Field
              id={`g-name-${index}`}
              label={t("guardianName")}
              error={errors.guardians?.[index]?.fullName?.message}
            >
              <Input id={`g-name-${index}`} {...register(`guardians.${index}.fullName`)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                id={`g-email-${index}`}
                label={t("guardianEmail")}
                error={errors.guardians?.[index]?.email?.message}
              >
                <Input
                  id={`g-email-${index}`}
                  type="email"
                  {...register(`guardians.${index}.email`)}
                />
              </Field>
              <Field id={`g-phone-${index}`} label={t("guardianPhone")}>
                <Input
                  id={`g-phone-${index}`}
                  type="tel"
                  {...register(`guardians.${index}.phone`)}
                />
              </Field>
            </div>
            <Field id={`g-rel-${index}`} label={t("relation")}>
              <Input id={`g-rel-${index}`} {...register(`guardians.${index}.relation`)} />
            </Field>
            <Button variant="ghost" className="self-start" onClick={() => guardians.remove(index)}>
              {t("removeGuardian")}
            </Button>
          </div>
        ))}
        {guardians.fields.length < 4 ? (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => guardians.append({ fullName: "", email: "", phone: "", relation: "" })}
          >
            {t("addGuardian")}
          </Button>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label className="flex min-h-10 items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4" {...register("consentConfirmed")} />
          {t("consent")}
        </label>
        {errors.consentConfirmed ? (
          <p className="text-sm text-danger">{t("consentRequired")}</p>
        ) : null}
      </div>
      <Button type="submit" className="self-start" loading={create.isPending} disabled={noSession}>
        {t("saveStudent")}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
