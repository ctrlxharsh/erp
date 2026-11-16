"use client";

import { createClassInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";

type Values = z.input<typeof createClassInputSchema>;
type ClassItem = {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
  subjectIds: string[];
};
type Subject = { id: string; name: string };

export function ClassesPanel() {
  const t = useTranslations("setup");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setup = useQuery(trpc.setup.get.queryOptions());
  const createClass = useMutation(trpc.setup.createClass.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(createClassInputSchema), mode: "onBlur" });

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.setup.get.queryKey() });

  if (setup.isPending) return <Skeleton className="h-40 w-full" />;
  const classes = setup.data?.classes ?? [];
  const subjects = setup.data?.subjects ?? [];

  return (
    <div className="flex flex-col gap-4">
      {classes.length === 0 ? <p className="text-muted-foreground">{t("noClasses")}</p> : null}
      {classes.map((item) => (
        <ClassCard key={item.id} item={item} subjects={subjects} onChanged={refresh} />
      ))}
      <form
        onSubmit={handleSubmit(async (values) => {
          try {
            await createClass.mutateAsync(values);
            reset();
            await refresh();
            toast.success(t("added"));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("uploadFailed"));
          }
        })}
        noValidate
        className="flex max-w-md flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="class-name">{t("className")}</Label>
          <Input
            id="class-name"
            aria-invalid={errors.name ? true : undefined}
            {...register("name")}
          />
          {errors.name ? <p className="text-sm text-danger">{errors.name.message}</p> : null}
        </div>
        <Button type="submit" className="self-start" loading={createClass.isPending}>
          {t("addClass")}
        </Button>
      </form>
    </div>
  );
}

function ClassCard({
  item,
  subjects,
  onChanged,
}: {
  item: ClassItem;
  subjects: Subject[];
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations("setup");
  const trpc = useTRPC();
  const addSection = useMutation(trpc.setup.createSection.mutationOptions());
  const removeSection = useMutation(trpc.setup.deleteSection.mutationOptions());
  const removeClass = useMutation(trpc.setup.deleteClass.mutationOptions());
  const saveSubjects = useMutation(trpc.setup.setClassSubjects.mutationOptions());
  const [sectionName, setSectionName] = useState("");
  const [chosen, setChosen] = useState<string[]>(item.subjectIds);

  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("uploadFailed"));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{item.name}</CardTitle>
        <ConfirmButton
          label={t("deleteItem")}
          question={t("deleteNamed", { name: item.name })}
          detail={t("cannotUndo")}
          confirmLabel={t("confirm")}
          cancelLabel={t("cancel")}
          busy={removeClass.isPending}
          onConfirm={async () => {
            try {
              await removeClass.mutateAsync({ id: item.id });
              await onChanged();
              toast.success(t("deleted"));
            } catch (error) {
              fail(error);
            }
          }}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("sections")}</p>
          {item.sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSections")}</p>
          ) : null}
          <ul className="flex flex-wrap gap-2">
            {item.sections.map((section) => (
              <li
                key={section.id}
                className="flex items-center gap-1 rounded-md border border-border pl-3"
              >
                <span className="text-sm">{section.name}</span>
                <ConfirmButton
                  label={t("deleteItem")}
                  question={t("deleteNamed", { name: `${item.name} – ${section.name}` })}
                  confirmLabel={t("confirm")}
                  cancelLabel={t("cancel")}
                  busy={removeSection.isPending}
                  onConfirm={async () => {
                    try {
                      await removeSection.mutateAsync({ id: section.id });
                      await onChanged();
                    } catch (error) {
                      fail(error);
                    }
                  }}
                />
              </li>
            ))}
          </ul>
          <form
            className="flex items-end gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await addSection.mutateAsync({ classId: item.id, name: sectionName });
                setSectionName("");
                await onChanged();
              } catch (error) {
                fail(error);
              }
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`section-${item.id}`}>{t("sectionName")}</Label>
              <Input
                id={`section-${item.id}`}
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" loading={addSection.isPending}>
              {t("addSection")}
            </Button>
          </form>
        </div>

        {subjects.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t("subjectsOfClass")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {subjects.map((subject) => (
                <label key={subject.id} className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={chosen.includes(subject.id)}
                    onChange={(event) =>
                      setChosen((current) =>
                        event.target.checked
                          ? [...current, subject.id]
                          : current.filter((id) => id !== subject.id),
                      )
                    }
                  />
                  {subject.name}
                </label>
              ))}
            </div>
            <Button
              variant="outline"
              className="self-start"
              loading={saveSubjects.isPending}
              onClick={async () => {
                try {
                  await saveSubjects.mutateAsync({ classId: item.id, subjectIds: chosen });
                  await onChanged();
                  toast.success(t("subjectsSaved"));
                } catch (error) {
                  fail(error);
                }
              }}
            >
              {t("saveSubjects")}
            </Button>
          </fieldset>
        ) : null}
      </CardContent>
    </Card>
  );
}
