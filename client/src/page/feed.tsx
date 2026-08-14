import type { Feed } from "@rin/api";
import { Button, Waiting } from "@rin/ui";
import mermaid from "mermaid";
import { useContext, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { client } from "../app/runtime";
import { AdjacentSection } from "../components/adjacent_feed";
import { useAlert, useConfirm } from "../components/dialog";
import { HashTag } from "../components/hashtag";
import { Markdown } from "../components/markdown";
import { Tips } from "../components/tips";
import { FeedComments } from "../features/feed/feed-comments";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { ClientConfigContext } from "../state/config";
import { ProfileContext } from "../state/profile";
import { siteName } from "../utils/constants";
import { stripImageUrlMetadata } from "../utils/image-upload";
import { timeago } from "../utils/timeago";

function extractFirstMarkdownImageUrl(content: string) {
  const match = /!\[.*?\]\((\S+?)(?:\s+"[^"]*")?\)/.exec(content);
  return match ? stripImageUrlMetadata(match[1]) : undefined;
}

function runMermaidDiagrams() {
  mermaid.initialize({ startOnLoad: false, theme: "default" });
  return mermaid
    .run({ suppressErrors: true, nodes: document.querySelectorAll("pre.mermaid_default") })
    .then(() => {
      mermaid.initialize({ startOnLoad: false, theme: "dark" });
      return mermaid.run({ suppressErrors: true, nodes: document.querySelectorAll("pre.mermaid_dark") });
    });
}

export function FeedPage({ id, TOC, clean }: { id: string; TOC: () => JSX.Element; clean: (id: string) => void }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const profile = useContext(ProfileContext);
  const config = useContext(ClientConfigContext);
  const [feed, setFeed] = useState<Feed>();
  const [error, setError] = useState<string>();
  const [headImage, setHeadImage] = useState<string>();
  const [top, setTop] = useState(0);
  const loadedId = useRef("");
  const [, setLocation] = useLocation();
  const { showAlert, AlertUI } = useAlert();
  const { showConfirm, ConfirmUI } = useConfirm();
  const counterEnabled = config.getBoolean("counter.enabled");
  const hashtags = Array.isArray(feed?.hashtags) ? feed.hashtags : [];
  const hasAISummary = Boolean(feed?.ai_summary?.trim());
  const showAISummaryState = ["pending", "processing", "failed"].includes(feed?.ai_summary_status ?? "");

  useEffect(() => {
    if (loadedId.current === id) return;
    loadedId.current = id;
    setFeed(undefined);
    setError(undefined);
    setHeadImage(undefined);

    void client.feed.get(id).then(({ data, error: requestError }) => {
      if (requestError) {
        setError(String(requestError.value));
        return;
      }
      if (!data || typeof data === "string") return;
      setFeed(data);
      setTop(data.top || 0);
      setHeadImage(extractFirstMarkdownImageUrl(data.content));
      clean(id);
    });
  }, [clean, id]);

  useEffect(() => {
    if (feed) void runMermaidDiagrams();
  }, [feed]);

  function deleteFeed() {
    showConfirm(t("article.delete.title"), t("article.delete.confirm"), async () => {
      if (!feed) return;
      const { error: requestError } = await client.feed.delete(feed.id);
      if (requestError) showAlert(String(requestError.value));
      else showAlert(t("delete.success"), () => setLocation("/"));
    });
  }

  function toggleTop() {
    const nextTop = top > 0 ? 0 : 1;
    showConfirm(
      nextTop ? t("article.top.title") : t("article.untop.title"),
      nextTop ? t("article.top.confirm") : t("article.untop.confirm"),
      async () => {
        if (!feed) return;
        const { error: requestError } = await client.feed.setTop(feed.id, nextTop);
        if (requestError) showAlert(String(requestError.value));
        else {
          setTop(nextTop);
          showAlert(nextTop ? t("article.top.success") : t("article.untop.success"));
        }
      },
    );
  }

  return (
    <Waiting for={feed || error}>
      {feed ? (
        <Helmet>
          <title>{`${feed.title ?? "Unnamed"} - ${siteConfig.name}`}</title>
          <meta property="og:site_name" content={siteName} />
          <meta property="og:title" content={feed.title ?? ""} />
          <meta property="og:image" content={headImage ?? siteConfig.avatar} />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={document.URL} />
          <meta name="og:description" content={feed.content.slice(0, 200)} />
          <meta name="author" content={feed.user.username} />
          <meta name="keywords" content={hashtags.map(({ name }) => name).join(", ")} />
          <meta name="description" content={feed.content.slice(0, 200)} />
        </Helmet>
      ) : null}
      <div className="ani-show flex w-full flex-row justify-center">
        {error ? (
          <div className="m-2 flex wauto flex-col items-center justify-center space-y-2 rounded-2xl bg-w p-6">
            <h1 className="text-xl font-bold t-primary">{error}</h1>
            {error === "Not found" && id === "about" ? <Tips value={t("about.notfound")} /> : null}
            <Button title={t("index.back")} onClick={() => (window.location.href = "/")} />
          </div>
        ) : null}
        {feed && !error ? (
          <>
            <div className="xl:w-64" />
            <main className="wauto">
              <article className="m-2 rounded-2xl bg-w px-6 py-4" aria-label={feed.title ?? "Unnamed"}>
                <div className="flex justify-between">
                  <div>
                    <div className="mb-1 mt-1 flex gap-1">
                      <p className="text-[12px] text-gray-400" title={new Date(feed.createdAt).toLocaleString()}>
                        {t("feed_card.published$time", { time: timeago(feed.createdAt) })}
                      </p>
                      {feed.createdAt !== feed.updatedAt ? (
                        <p className="text-[12px] text-gray-400" title={new Date(feed.updatedAt).toLocaleString()}>
                          {t("feed_card.updated$time", { time: timeago(feed.updatedAt) })}
                        </p>
                      ) : null}
                    </div>
                    {counterEnabled ? (
                      <p className="link-line text-[12px] font-normal text-gray-400">
                        <span> {t("count.pv")} {feed.pv} | {t("count.uv")} {feed.uv}</span>
                      </p>
                    ) : null}
                    <h1 className="break-all text-2xl font-bold t-primary">{feed.title}</h1>
                  </div>
                  {profile?.permission ? (
                    <div className="flex gap-2 pt-2">
                      <button aria-label={top > 0 ? t("untop.title") : t("top.title")} onClick={toggleTop} className={`flex flex-col items-end justify-center rounded-full px-2 py transition ${top > 0 ? "bg-theme text-white hover:bg-theme-hover active:bg-theme-active" : "bg-button bg-secondary dark:text-neutral-400"}`}>
                        <i className="ri-skip-up-line" />
                      </button>
                      <Link aria-label={t("edit")} href={`/admin/writing/${feed.id}`} className="flex flex-col items-end justify-center rounded-full bg-button bg-secondary px-2 py transition">
                        <i className="ri-edit-2-line dark:text-neutral-400" />
                      </Link>
                      <button aria-label={t("delete.title")} onClick={deleteFeed} className="flex flex-col items-end justify-center rounded-full bg-button bg-secondary px-2 py transition">
                        <i className="ri-delete-bin-7-line text-red-500" />
                      </button>
                    </div>
                  ) : null}
                </div>
                {hasAISummary || showAISummaryState ? (
                  <div className="my-4 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-blue-50 p-4 dark:border-purple-800/30 dark:from-purple-900/20 dark:to-blue-900/20">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><i className="ri-sparkling-2-fill text-purple-500" /><span className="text-sm font-medium text-purple-600 dark:text-purple-400">{t("ai_summary.title")}</span></div>
                      {showAISummaryState ? <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-white/10 dark:text-purple-300">{t(`ai_summary.status.${feed.ai_summary_status}`)}</span> : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed t-secondary">{hasAISummary ? feed.ai_summary : t(`ai_summary.message.${feed.ai_summary_status}`)}</p>
                    {feed.ai_summary_status === "failed" && feed.ai_summary_error ? <p className="mt-2 whitespace-pre-wrap text-xs text-rose-600 dark:text-rose-300">{feed.ai_summary_error}</p> : null}
                  </div>
                ) : null}
                <Markdown content={feed.content} />
                <div className="mt-6 flex flex-col gap-2">
                  {hashtags.length > 0 ? <div className="flex flex-row flex-wrap gap-x-2">{hashtags.map(({ name }, index) => <HashTag key={index} name={name} />)}</div> : null}
                  <div className="flex flex-row items-center"><img src={feed.user.avatar || "/avatar.png"} alt="" className="h-8 w-8 rounded-full" /><span className="ml-2 cursor-default text-sm text-gray-400">{feed.user.username}</span></div>
                </div>
              </article>
              <AdjacentSection id={id} setError={setError} />
              <FeedComments id={String(feed.id)} />
              <div className="h-16" />
            </main>
            <div className="relative hidden w-80 lg:block"><div className="sticky start-0 end-0 top-[5.5rem]"><TOC /></div></div>
          </>
        ) : null}
      </div>
      <AlertUI />
      <ConfirmUI />
    </Waiting>
  );
}
