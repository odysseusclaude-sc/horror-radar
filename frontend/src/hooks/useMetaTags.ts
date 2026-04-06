import { useEffect } from "react";

function setMeta(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

interface MetaTagOptions {
  title?: string;
  description?: string;
  image?: string;
}

const DEFAULT_TITLE = "Horror Radar — Indie Horror Game Breakout Tracker";
const DEFAULT_DESCRIPTION =
  "Discover breakout indie horror games on Steam before they blow up. Real-time OPS scores, YouTube tracking, and review velocity signals.";
const DEFAULT_IMAGE = "https://horror-radar.com/og-image.png";

export function useMetaTags({ title, description, image }: MetaTagOptions = {}) {
  useEffect(() => {
    const resolvedTitle = title ? `${title} | Horror Radar` : DEFAULT_TITLE;
    const resolvedDesc = description ?? DEFAULT_DESCRIPTION;
    const resolvedImage = image ?? DEFAULT_IMAGE;

    document.title = resolvedTitle;

    setMeta("og:title", resolvedTitle);
    setMeta("og:description", resolvedDesc);
    setMeta("og:image", resolvedImage);
    setMeta("og:type", "website");

    setMetaName("twitter:title", resolvedTitle);
    setMetaName("twitter:description", resolvedDesc);
    setMetaName("twitter:image", resolvedImage);

    // Cleanup: restore defaults on unmount
    return () => {
      document.title = DEFAULT_TITLE;
      setMeta("og:title", DEFAULT_TITLE);
      setMeta("og:description", DEFAULT_DESCRIPTION);
      setMeta("og:image", DEFAULT_IMAGE);
      setMetaName("twitter:title", DEFAULT_TITLE);
      setMetaName("twitter:description", DEFAULT_DESCRIPTION);
      setMetaName("twitter:image", DEFAULT_IMAGE);
    };
  }, [title, description, image]);
}
