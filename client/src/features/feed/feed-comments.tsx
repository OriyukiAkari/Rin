import type { Comment } from "@rin/api";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Popup from "reactjs-popup";
import { useLocation } from "wouter";
import { client } from "../../app/runtime";
import { useAlert, useConfirm } from "../../components/dialog";
import { ClientConfigContext } from "../../state/config";
import { ProfileContext } from "../../state/profile";
import { timeago } from "../../utils/timeago";

function CommentComposer({ feedId, onRefresh }: { feedId: number; onRefresh: () => void }) {
  const { t } = useTranslation();
  const profile = useContext(ProfileContext);
  const config = useContext(ClientConfigContext);
  const [, setLocation] = useLocation();
  const { showAlert, AlertUI } = useAlert();
  const [content, setContent] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestWebsite, setGuestWebsite] = useState("");
  const [error, setError] = useState("");
  const rawGuestSetting = config.get("comment.guest.enabled");
  const guestEnabled = rawGuestSetting !== false && rawGuestSetting !== "false";

  function humanizeError(message: string) {
    if (message === "Unauthorized") return t("login.required");
    if (message === "Content is required") return t("comment.empty");
    if (message === "Guest name is required") return t("comment.guest_name_required");
    return message;
  }

  async function submit() {
    if (!profile && !guestEnabled) {
      setLocation("/login");
      return;
    }
    if (!profile && !guestName.trim()) {
      setError(t("comment.guest_name_required"));
      return;
    }

    const result = await client.comment.create(feedId, {
      content,
      ...(!profile
        ? {
            guestName: guestName.trim(),
            guestEmail: guestEmail.trim() || undefined,
            guestWebsite: guestWebsite.trim() || undefined,
          }
        : {}),
    });
    if (result.error) {
      setError(humanizeError(String(result.error.value)));
      return;
    }

    setContent("");
    setGuestName("");
    setGuestEmail("");
    setGuestWebsite("");
    setError("");
    showAlert(t("comment.success"), onRefresh);
  }

  return (
    <div className="flex w-full flex-col items-end rounded-2xl bg-w p-6 t-primary">
      <div className="mb-4 flex w-full flex-col items-start">
        <label htmlFor="comment">{t("comment.title")}</label>
      </div>
      {!profile && guestEnabled ? (
        <>
          <input
            type="text"
            placeholder={t("comment.guest_name_placeholder")}
            className="mb-2 w-full rounded-lg border border-gray-200 bg-w px-3 py-2 dark:border-gray-700"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
          />
          <input
            type="email"
            placeholder={t("comment.guest_email_placeholder")}
            className="mb-2 w-full rounded-lg border border-gray-200 bg-w px-3 py-2 dark:border-gray-700"
            value={guestEmail}
            onChange={(event) => setGuestEmail(event.target.value)}
          />
          <input
            type="url"
            placeholder={t("comment.guest_website_placeholder")}
            className="mb-2 w-full rounded-lg border border-gray-200 bg-w px-3 py-2 dark:border-gray-700"
            value={guestWebsite}
            onChange={(event) => setGuestWebsite(event.target.value)}
          />
        </>
      ) : null}
      {profile || guestEnabled ? (
        <>
          <textarea
            id="comment"
            placeholder={t("comment.placeholder.title")}
            className="h-24 w-full rounded-lg bg-w"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <button className="mt-4 rounded-full bg-theme px-4 py-2 text-white" onClick={submit}>
            {t("comment.submit")}
          </button>
        </>
      ) : (
        <div className="flex w-full items-center justify-center py-12">
          <button className="mt-2 rounded-full bg-theme px-4 py-2 text-white" onClick={() => setLocation("/login")}>
            {t("login.required")}
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      <AlertUI />
    </div>
  );
}

function CommentItem({ comment, onRefresh }: { comment: Comment; onRefresh: () => void }) {
  const { t } = useTranslation();
  const profile = useContext(ProfileContext);
  const { showConfirm, ConfirmUI } = useConfirm();
  const { showAlert, AlertUI } = useAlert();
  const commenterName = comment.user?.username || comment.guestName || t("anonymous");
  const commenterAvatar = comment.user?.avatar || "/avatar.png";

  function deleteComment() {
    showConfirm(t("delete.comment.title"), t("delete.comment.confirm"), async () => {
      const { error } = await client.comment.delete(comment.id);
      if (error) showAlert(String(error.value));
      else showAlert(t("delete.success"), onRefresh);
    });
  }

  async function approveComment() {
    const { error } = await client.comment.approve(comment.id);
    if (error) showAlert(String(error.value));
    else showAlert(t("comment.success"), onRefresh);
  }

  return (
    <div className="mt-2 flex flex-row items-start rounded-xl">
      <img src={commenterAvatar} alt="" className="mt-4 h-8 w-8 rounded-full" />
      <div className="ml-2 flex w-0 flex-1 flex-col rounded-xl bg-w p-4">
        <div className="flex flex-row">
          <span className="text-base font-bold t-primary">{commenterName}</span>
          {comment.guestWebsite ? (
            <a href={comment.guestWebsite} target="_blank" rel="noopener noreferrer" className="ml-2 text-gray-400 transition-colors hover:text-theme">
              <i className="ri-external-link-line" />
            </a>
          ) : null}
          <div className="w-0 flex-1" />
          <span title={new Date(comment.createdAt).toLocaleString()} className="text-sm text-gray-400">
            {timeago(comment.createdAt)}
          </span>
        </div>
        <p className="break-words t-primary">{comment.content}</p>
        {profile?.permission && !comment.approved ? (
          <button type="button" className="mt-2 self-start rounded-full bg-theme px-3 py-1 text-sm text-white" onClick={approveComment}>
            {t("approve", { defaultValue: "Approve" })}
          </button>
        ) : null}
        <div className="flex flex-row justify-end">
          {profile?.permission || (comment.user && profile?.id === comment.user.id) ? (
            <Popup
              arrow={false}
              trigger={<button className="rounded-full bg-secondary px-2 py"><i className="ri-more-fill t-secondary" /></button>}
              position="left center"
            >
              <div className="mr-2 flex flex-row self-end">
                <button onClick={deleteComment} aria-label={t("delete.comment.title")} className="rounded-full bg-secondary px-2 py">
                  <i className="ri-delete-bin-2-line t-secondary" />
                </button>
              </div>
            </Popup>
          ) : null}
        </div>
      </div>
      <ConfirmUI />
      <AlertUI />
    </div>
  );
}

export function FeedComments({ id }: { id: string }) {
  const { t } = useTranslation();
  const config = useContext(ClientConfigContext);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string>();
  const feedId = Number.parseInt(id, 10);

  const loadComments = useCallback(async () => {
    const result = await client.comment.list(feedId);
    if (result.error) setError(String(result.error.value));
    else {
      setComments(result.data ?? []);
      setError(undefined);
    }
  }, [feedId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  if (!config.getBoolean("comment.enabled")) return null;

  return (
    <div className="m-2 flex flex-col items-center justify-center">
      <CommentComposer feedId={feedId} onRefresh={loadComments} />
      {error ? (
        <div className="m-2 flex wauto flex-col items-center justify-center rounded-2xl bg-w p-6 t-primary">
          <h1 className="text-xl font-bold t-primary">{error}</h1>
          <button className="mt-2 rounded-full bg-theme px-4 py-2 text-white" onClick={loadComments}>{t("reload")}</button>
        </div>
      ) : null}
      {comments.length > 0 ? (
        <div className="w-full">
          {comments.map((comment) => <CommentItem key={comment.id} comment={comment} onRefresh={loadComments} />)}
        </div>
      ) : null}
    </div>
  );
}
