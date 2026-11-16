"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import { useTRPC } from "@/lib/trpc/client";

export function NotificationsButton() {
  const t = useTranslations("shell");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useQuery({ ...trpc.notifications.list.queryOptions(), refetchInterval: 60_000 });
  const markRead = useMutation(trpc.notifications.markRead.mutationOptions());
  const markAll = useMutation(trpc.notifications.markAllRead.mutationOptions());
  const unread = query.data?.unreadCount ?? 0;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.notifications.list.queryKey() });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0
              ? `${t("notifications")}, ${t("unread", { count: unread })}`
              : t("notifications")
          }
        >
          <Bell className="size-5" aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
        {query.data?.items.length ? (
          <>
            {query.data.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="h-auto flex-col items-start py-2"
                onSelect={async () => {
                  if (!item.read) {
                    await markRead.mutateAsync({ id: item.id });
                    await refresh();
                  }
                  if (item.link) router.push(item.link);
                }}
              >
                <span className={item.read ? "text-muted-foreground" : "font-semibold"}>
                  {item.title}
                </span>
                {item.body ? (
                  <span className="text-xs text-muted-foreground">{item.body}</span>
                ) : null}
              </DropdownMenuItem>
            ))}
            {unread > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await markAll.mutateAsync();
                    await refresh();
                  }}
                >
                  {t("markAllRead")}
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : (
          <p className="px-3 pb-3 text-sm text-muted-foreground">{t("noNotifications")}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ name }: { name: string }) {
  const t = useTranslations("shell");
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("userMenu")}>
          <User className="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t("signedInAs")} {name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>{t("profile")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>{t("signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
