"use client";

import { createHomeworkInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { FilePicker, type PickedFile } from "@/components/file-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useTRPC } from "@/lib/trpc/client";

type FormInput = z.input<typeof createHomeworkInputSchema>;
type FormOutput = z.output<typeof createHomeworkInputSchema>;

export function HomeworkForm() {
  const t = useTranslations("homework");
  const router = useRouter();
  const trpc = useTRPC();
  const assignments = useQuery(trpc.classwork.myAssignments.queryOptions());
  const create = useMutation(trpc.classwork.homework.create.mutationOptions());
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [pair, setPair] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createHomeworkInputSchema),
    mode: "onBlur",
    defaultValues: {
      sectionId: "",
      subjectId: "",
      title: "",
      details: "",
      dueDate: "",
      isGraded: false,
      maxMarks: null,
      fileIds: [],
    },
  });
  const graded = watch("isGraded");

  async function onSubmit(values: FormOutput) {
    try {
      const { id } = await create.mutateAsync({ ...values, fileIds: files.map((f) => f.id) });
      toast.success(t("published"));
      router.push(`/homework/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("fileFailed"));
    }
  }

  if (assignments.isSuccess && assignments.data.length === 0) {
    return <p className="text-muted-foreground">{t("noAssignments")}</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-xl flex-col gap-4">
      <Link href="/homework" className="text-sm text-primary underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold text-primary">{t("new")}</h1>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hw-pair">
          {t("classSection")} · {t("subject")}
        </Label>
        <Select
          id="hw-pair"
          value={pair}
          aria-invalid={errors.sectionId || errors.subjectId ? true : undefined}
          onChange={(e) => {
            setPair(e.target.value);
            const [sectionId = "", subjectId = ""] = e.target.value.split("|");
            setValue("sectionId", sectionId, { shouldValidate: true });
            setValue("subjectId", subjectId, { shouldValidate: true });
          }}
        >
          <option value="">{t("pick")}</option>
          {assignments.data?.map((a) => (
            <option key={`${a.sectionId}|${a.subjectId}`} value={`${a.sectionId}|${a.subjectId}`}>
              {a.label} · {a.subjectName}
            </option>
          ))}
        </Select>
        {errors.sectionId ? (
          <p className="text-sm text-danger">{errors.sectionId.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hw-title">{t("homeworkTitle")}</Label>
        <Input
          id="hw-title"
          aria-invalid={errors.title ? true : undefined}
          {...register("title")}
        />
        {errors.title ? <p className="text-sm text-danger">{errors.title.message}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hw-details">{t("details")}</Label>
        <textarea
          id="hw-details"
          rows={4}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          {...register("details")}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hw-due">{t("dueDate")}</Label>
        <Input
          id="hw-due"
          type="date"
          aria-invalid={errors.dueDate ? true : undefined}
          {...register("dueDate")}
        />
        {errors.dueDate ? <p className="text-sm text-danger">{errors.dueDate.message}</p> : null}
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...register("isGraded")} />
        {t("graded")}
      </label>
      {graded ? (
        <div className="flex max-w-40 flex-col gap-1.5">
          <Label htmlFor="hw-max">{t("maxMarks")}</Label>
          <Input
            id="hw-max"
            type="number"
            min={1}
            max={1000}
            aria-invalid={errors.maxMarks ? true : undefined}
            {...register("maxMarks", {
              setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
            })}
          />
          {errors.maxMarks ? (
            <p className="text-sm text-danger">{errors.maxMarks.message}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("attachments")}</span>
        <FilePicker
          purpose="homework_attachment"
          value={files}
          onChange={setFiles}
          max={5}
          label={t("addFile")}
          busyLabel={t("uploading")}
          failedMessage={t("fileFailed")}
          removeLabel={t("removeFile")}
        />
      </div>
      <Button type="submit" className="self-start" loading={create.isPending}>
        {t("publish")}
      </Button>
    </form>
  );
}
