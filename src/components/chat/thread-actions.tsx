"use client";

import {
  Ban,
  EllipsisVertical,
  EyeOff,
  Flag,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useModeration } from "@/components/chat/moderation-provider";
import { useThreadContext } from "@/components/chat/thread-moderation";
import { hideChatForUser, reportUser } from "@/lib/chat-client";
import { REPORT_REASONS, type ReportReason } from "@/lib/db/types";

/**
 * The `...` menu on a conversation: remove it, block the person, report them.
 *
 * Removal and blocking are separate on purpose. Removing is a private,
 * reversible tidy-up of this member's list; blocking is a statement about the
 * other person that also stops messages and hides them from the feed. People
 * reach for the first far more often, so conflating them would make a
 * reversible action irreversible.
 */
export function ThreadActions() {
  const t = useTranslations("chatModeration");
  const { status, block, unblock } = useModeration();
  const { chatId, peerId, peerName, ready } = useThreadContext();

  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState<"hide" | "block" | "unblock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const blocked = status === "blocked";
  const available = status !== "unavailable";
  // Actions need the chat uuid, which only exists once the thread has resolved.
  const actionable = ready && chatId !== null;

  async function run(
    kind: "hide" | "block" | "unblock",
    action: () => Promise<void>,
  ) {
    setBusy(kind);
    setError(null);

    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("menu")}
              disabled={busy !== null || !actionable}
            />
          }
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <EllipsisVertical className="size-5" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            className="gap-2"
            disabled={busy !== null}
            onClick={() => {
              if (!chatId) return;

              void run("hide", async () => {
                await hideChatForUser(chatId);
                // Leaving the thread is part of the action: the member asked
                // for it to disappear, and staying on an empty thread is not
                // the outcome they meant.
                router.replace("/chats");
              });
            }}
          >
            <EyeOff className="size-4" />
            {t("deleteForMe")}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2"
            disabled={!available || busy !== null}
            onClick={() =>
              void run(blocked ? "unblock" : "block", blocked ? unblock : block)
            }
          >
            {blocked ? (
              <>
                <ShieldAlert className="size-4" />
                {t("unblock")}
              </>
            ) : (
              <>
                <Ban className="size-4" />
                {t("block")}
              </>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2"
            disabled={blocked || busy !== null}
            onClick={() => setReportOpen(true)}
          >
            <Flag className="size-4" />
            {t("report")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        peerId={peerId}
        peerName={peerName || t("someone")}
        alreadyBlocked={blocked}
      />

      {error ? (
        <p role="alert" className="pe-2 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * Report form.
 *
 * Reports are filed under the member's own name and are not anonymous to
 * moderators, so the dialog says so rather than implying a tip line. The offer
 * to block afterwards is deliberate: most reports are filed because someone
 * wants the conversation to stop, and a report alone does not stop anything.
 */
function ReportDialog({
  open,
  onOpenChange,
  peerId,
  peerName,
  alreadyBlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerId: string | null;
  peerName: string;
  alreadyBlocked: boolean;
}) {
  const t = useTranslations("chatModeration");
  const { block } = useModeration();

  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!peerId) return;

    setStatus("sending");
    setError(null);

    try {
      await reportUser({
        reportedProfileId: peerId,
        reason,
        details: details || undefined,
      });
      setStatus("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("idle");
    }
  }

  function reset() {
    onOpenChange(false);
    setStatus("idle");
    setReason("spam");
    setDetails("");
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : reset())}
    >
      <DialogContent className="max-w-sm">
        {status === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("reportSentTitle")}</DialogTitle>
              <DialogDescription>
                {t("reportSentBody", { name: peerName })}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={reset}>
                {t("close")}
              </Button>

              {!alreadyBlocked ? (
                <Button
                  onClick={() => {
                    void block().then(reset);
                  }}
                >
                  {t("reportAndBlock")}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("reportTitle")}</DialogTitle>
              <DialogDescription>
                {t("reportBody", { name: peerName })}
              </DialogDescription>
            </DialogHeader>

            <RadioGroup
              value={reason}
              onValueChange={(value) => setReason(value as ReportReason)}
              className="gap-1"
            >
              {REPORT_REASONS.map((option) => (
                <Label
                  key={option}
                  className="flex items-center gap-2 py-1.5 text-sm"
                >
                  <RadioGroupItem value={option} />
                  {t(`reasons.${option}`)}
                </Label>
              ))}
            </RadioGroup>

            {reason === "other" ? (
              <Textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder={t("detailsPlaceholder")}
                maxLength={2000}
                rows={3}
              />
            ) : null}

            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="ghost"
                onClick={reset}
                disabled={status === "sending"}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={status === "sending" || !peerId}
              >
                {status === "sending" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {t("submit")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
