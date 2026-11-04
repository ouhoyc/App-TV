import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Plus,
  Share2,
  Download,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { CloudWorkspace } from "./App";
import { request } from "./cloudStore";
import { decryptCloud, type CloudPayload } from "./cloudCrypto";
import type { Vault } from "./model";
import { imageAsset, thumbnailAsset, type MediaAsset } from "./mediaImage";
import { cachedMedia, cacheMedia, removeCachedMedia } from "./mediaCache";
type Category = "ads" | "tutorials";
interface MediaRow {
  id: string;
  owner_id: string;
  created_at: string;
  category?: Category;
  thumbnail?: CloudPayload | null;
}
const labels: Record<Category, string> = {
  ads: "Publicités",
  tutorials: "Tutos",
};
// Metadata contains encrypted thumbnails only. Fresh server metadata rechecks
// access on each visit; full photos are fetched only for the viewer or legacy
// thumbnail migration. No plaintext is written to persistent storage.
const indexes = new WeakMap<CryptoKey, Map<string, MediaRow[]>>();
function indexFor(cloud: CloudWorkspace) {
  let value = indexes.get(cloud.privateKey);
  if (!value) {
    value = new Map();
    indexes.set(cloud.privateKey, value);
  }
  return value;
}
function Thumb({
  row,
  asset,
  error,
  onVisible,
  onOpen,
}: {
  row: MediaRow;
  asset?: MediaAsset;
  error?: string;
  onVisible: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          onVisible();
        }
      },
      { rootMargin: "100px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [row.id, row.thumbnail]);
  return (
    <button
      type="button"
      className="photo-thumb"
      ref={ref}
      onClick={onOpen}
      aria-label={asset ? `Ouvrir ${asset.name}` : "Ouvrir la photo"}
    >
      {asset ? (
        <img
          src={asset.data}
          alt={asset.name}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={error ? "photo-thumb-error" : "photo-thumb-loading"}>
          {error ? "Réessayer" : ""}
        </span>
      )}
    </button>
  );
}
function Viewer({
  rows,
  index,
  assets,
  thumbs,
  onIndex,
  onClose,
  onDelete,
  onMove,
}: {
  rows: MediaRow[];
  index: number;
  assets: Map<string, MediaAsset>;
  thumbs: Map<string, MediaAsset>;
  onIndex: (index: number) => void;
  onClose: () => void;
  onDelete: () => void;
  onMove: (category: Category) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    strip = useRef<HTMLDivElement>(null),
    position = useRef(index),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [moving, setMoving] = useState(false);
  position.current = index;
  const row = rows[index],
    asset = row ? assets.get(row.id) : undefined;
  useLayoutEffect(() => {
    dialog.current!.showModal();
    const resize = () => {
      if (strip.current)
        strip.current.scrollLeft = position.current * strip.current.clientWidth;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (strip.current) observer.observe(strip.current);
    return () => {
      observer.disconnect();
      dialog.current?.close();
    };
  }, []);
  const go = (next: number) =>
    strip.current?.scrollTo({
      left:
        Math.max(0, Math.min(rows.length - 1, next)) *
        strip.current.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  function download() {
    if (!asset) return;
    const a = document.createElement("a");
    a.href = asset.data;
    a.download = asset.name;
    a.click();
  }
  async function share() {
    if (!asset) return;
    setError("");
    setNotice("");
    try {
      const bytes = atob(asset.data.split(",")[1]),
        file = new File(
          [Uint8Array.from(bytes, (c) => c.charCodeAt(0))],
          asset.name,
          { type: asset.type },
        );
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file] });
      else {
        download();
        setNotice("Photo téléchargée. Vous pouvez l’ajouter à votre story.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError("Partage indisponible. Utilisez Télécharger.");
    }
  }
  return (
    <dialog
      className="photo-viewer"
      ref={dialog}
      aria-label="Visionneuse de photos"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(index + 1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(index - 1);
        }
      }}
    >
      <header className="photo-viewer-header">
        <span>
          {index + 1} / {rows.length}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Fermer la photo"
          onClick={onClose}
        >
          <X size={24} />
        </button>
      </header>
      <div
        className="photo-viewer-strip"
        ref={strip}
        onScroll={() => {
          const el = strip.current;
          if (el && el.clientWidth) {
            const current = Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round(el.scrollLeft / el.clientWidth),
              ),
            );
            if (current !== position.current) onIndex(current);
          }
        }}
      >
        {rows.map((r, i) => {
          const image = assets.get(r.id) || thumbs.get(r.id);
          return (
            <div key={r.id} className="photo-slide" aria-hidden={i !== index}>
              {image ? (
                <img
                  src={image.data}
                  alt={image.name}
                  draggable={false}
                  decoding="async"
                />
              ) : (
                <span className="photo-opening">Chargement…</span>
              )}
              {Math.abs(i - index) < 2 && !assets.has(r.id) && (
                <span
                  className="photo-loading-mark"
                  aria-label="Chargement de la photo"
                />
              )}
            </div>
          );
        })}
      </div>
      <footer className="photo-viewer-footer">
        <div className="photo-viewer-navigation">
          <button
            className="icon-button"
            aria-label="Photo précédente"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            <ChevronLeft />
          </button>
          <label className="photo-category-label">
            <span className="sr-only">Catégorie de la photo</span>
            <select
              aria-label="Catégorie de la photo"
              value={row?.category || "ads"}
              disabled={moving}
              onChange={(e) => {
                setMoving(true);
                void onMove(e.target.value as Category)
                  .catch((e) => setError(e.message))
                  .finally(() => setMoving(false));
              }}
            >
              <option value="ads">Publicités</option>
              <option value="tutorials">Tutos</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Photo suivante"
            disabled={index === rows.length - 1}
            onClick={() => go(index + 1)}
          >
            <ChevronRight />
          </button>
        </div>
        <div className="photo-viewer-actions">
          <button
            className="primary"
            disabled={!asset}
            onClick={() => void share()}
          >
            <Share2 size={18} />
            Partager
          </button>
          <button
            className="secondary"
            aria-label="Télécharger l’image"
            disabled={!asset}
            onClick={download}
          >
            <Download size={19} />
          </button>
          <button
            className="icon-button danger-text"
            aria-label="Supprimer l’image"
            onClick={() => {
              if (confirm("Supprimer cette photo ?")) onDelete();
            }}
          >
            <Trash2 size={19} />
          </button>
        </div>
        {(notice || error) && (
          <p role={error ? "alert" : "status"}>{error || notice}</p>
        )}
      </footer>
    </dialog>
  );
}
export default function MediaLibrary({ cloud }: { cloud: CloudWorkspace }) {
  const [category, setCategory] = useState<Category>("ads"),
    owners = cloud.viewOwners.join(","),
    key = owners + ":" + category;
  const [rows, setRows] = useState<MediaRow[]>(
      () => indexFor(cloud).get(owners + ":ads") || [],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [progress, setProgress] = useState(""),
    [viewer, setViewer] = useState<string | null>(null),
    [thumbs, setThumbs] = useState(new Map<string, MediaAsset>()),
    [assets, setAssets] = useState(new Map<string, MediaAsset>());
  const input = useRef<HTMLInputElement>(null),
    fullCache = useRef(new Map<string, MediaAsset>()),
    thumbCache = useRef(new Map<string, MediaAsset>()),
    pending = useRef(new Map<string, Promise<MediaAsset>>()),
    pendingThumbs = useRef(new Set<string>()),
    thumbQueue = useRef<(() => Promise<void>)[]>([]),
    running = useRef(0),
    generation = useRef(0);
  const cacheKey = (row: MediaRow) =>
    cloud.profile.id + ":" + row.owner_id + ":" + row.id;
  async function decode(payload: CloudPayload, row: MediaRow) {
    const value = (await decryptCloud(
      payload,
      row.owner_id,
      1,
      cloud.profile.id,
      cloud.privateKey,
    )) as Vault & { mediaAsset?: MediaAsset };
    if (
      !value.mediaAsset ||
      !/^data:image\/(webp|png|jpeg);base64,/.test(value.mediaAsset.data)
    )
      throw new Error("Image non reconnue.");
    return value.mediaAsset;
  }
  function ensureFull(row: MediaRow): Promise<MediaAsset> {
    const existing = fullCache.current.get(row.id);
    if (existing) return Promise.resolve(existing);
    const inflight = pending.current.get(row.id);
    if (inflight) return inflight;
    const promise = (async () => {
      let asset: MediaAsset | undefined;
      const cached = await cachedMedia(cacheKey(row));
      if (cached) {
        try {
          asset = await decode(cached, row);
        } catch {
          void removeCachedMedia(cacheKey(row));
        }
      }
      if (!asset) {
        const result = await request<MediaRow & { payload: CloudPayload }>(
          "media?id=" + encodeURIComponent(row.id),
        );
        asset = await decode(result.payload, row);
        void cacheMedia(cacheKey(row), result.payload);
      }
      fullCache.current.set(row.id, asset);
      while (fullCache.current.size > 6)
        fullCache.current.delete(fullCache.current.keys().next().value!);
      setAssets(new Map(fullCache.current));
      return asset;
    })().finally(() => pending.current.delete(row.id));
    pending.current.set(row.id, promise);
    return promise;
  }
  function pump() {
    while (running.current < 3 && thumbQueue.current.length) {
      running.current++;
      const fn = thumbQueue.current.shift()!;
      void fn().finally(() => {
        running.current--;
        pump();
      });
    }
  }
  function ensureThumb(row: MediaRow) {
    if (thumbCache.current.has(row.id) || pendingThumbs.current.has(row.id))
      return;
    pendingThumbs.current.add(row.id);
    thumbQueue.current.push(async () => {
      try {
        const asset = row.thumbnail
          ? await decode(row.thumbnail, row)
          : await thumbnailAsset(await ensureFull(row));
        thumbCache.current.set(row.id, asset);
        setThumbs(new Map(thumbCache.current));
        if (!row.thumbnail) {
          const thumbnail = await cloud.sealMedia(asset);
          const updated = await request<MediaRow>("media", {
            action: "thumbnail",
            id: row.id,
            thumbnail,
          });
          updateRows((old) =>
            old.some((r) => r.id === row.id)
              ? old.map((r) => (r.id === row.id ? updated : r))
              : old,
          );
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        pendingThumbs.current.delete(row.id);
      }
    });
    pump();
  }
  function updateRows(fn: (old: MediaRow[]) => MediaRow[]) {
    setRows((old) => {
      const next = fn(old);
      if (next !== old) indexFor(cloud).set(key, next);
      return next;
    });
  }
  async function fetchRows(before = "") {
    return request<{ images: MediaRow[] }>(
      "media?owners=" +
        encodeURIComponent(owners) +
        "&category=" +
        category +
        (before ? "&before=" + encodeURIComponent(before) : ""),
    );
  }
  useEffect(() => {
    const token = ++generation.current;
    setViewer(null);
    setRows(indexFor(cloud).get(key) || []);
    setLoading(true);
    setError("");
    void fetchRows()
      .then((result) => {
        if (generation.current !== token) return;
        setRows(result.images);
        setMore(result.images.length === 24);
        indexFor(cloud).set(key, result.images);
      })
      .catch((e) => {
        if (generation.current === token) setError(e.message);
      })
      .finally(() => {
        if (generation.current === token) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [key]);
  const index = viewer === null ? -1 : rows.findIndex((r) => r.id === viewer);
  const loadingMore = useRef(false);
  useEffect(() => {
    if (index < 0 || index < rows.length - 3 || !more || loadingMore.current)
      return;
    loadingMore.current = true;
    const token = generation.current;
    void fetchRows(rows.at(-1)?.created_at)
      .then((result) => {
        if (generation.current !== token) return;
        updateRows((old) => [...old, ...result.images]);
        setMore(result.images.length === 24);
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        loadingMore.current = false;
      });
  }, [index, rows.length, more]);
  useEffect(() => {
    if (index < 0) return;
    for (const row of rows.slice(Math.max(0, index - 1), index + 2))
      void ensureFull(row).catch((e) => setError(e.message));
  }, [viewer, rows]);
  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    const failures: string[] = [],
      target = category;
    try {
      for (const [i, file] of files.entries()) {
        setProgress(`${i + 1}/${files.length}`);
        try {
          const asset = await imageAsset(file),
            thumb = await thumbnailAsset(asset);
          const [payload, thumbnail] = await Promise.all([
            cloud.sealMedia(asset),
            cloud.sealMedia(thumb),
          ]);
          const row = await request<MediaRow>("media", {
            action: "upload",
            ownerId: cloud.ownerFor(""),
            category: target,
            payload,
            thumbnail,
          });
          thumbCache.current.set(row.id, thumb);
          setThumbs(new Map(thumbCache.current));
          fullCache.current.set(row.id, asset);
          while (fullCache.current.size > 6)
            fullCache.current.delete(fullCache.current.keys().next().value!);
          setAssets(new Map(fullCache.current));
          void cacheMedia(cacheKey(row), payload);
          updateRows((old) => [row, ...old]);
        } catch (e) {
          failures.push((e as Error).message);
        }
      }
      if (failures.length)
        setError(
          failures.length === 1
            ? failures[0]
            : `${failures.length} photos non ajoutées. ${failures[0]}`,
        );
    } finally {
      setBusy(false);
      setProgress("");
      if (input.current) input.current.value = "";
    }
  }
  function removeRow(id: string, purge = true) {
    const position = rows.findIndex((r) => r.id === id),
      remaining = rows.filter((r) => r.id !== id);
    setRows(remaining);
    indexFor(cloud).set(key, remaining);
    setViewer(remaining[Math.min(position, remaining.length - 1)]?.id || null);
    if (purge) {
      fullCache.current.delete(id);
      thumbCache.current.delete(id);
      void removeCachedMedia(cacheKey(rows[position]));
    }
  }
  return (
    <div className="media-library">
      <div className="media-gallery-toolbar">
        <div
          className="media-segments"
          role="group"
          aria-label="Catégories de photos"
        >
          {(["ads", "tutorials"] as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              aria-pressed={category === c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              {labels[c]}
            </button>
          ))}
        </div>
        <button
          className="photo-add"
          aria-label="Ajouter des photos"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Plus size={21} />
          <span>{busy ? progress : "Ajouter"}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          aria-label="Ajouter une publicité"
          hidden
          onChange={(e) => void upload(Array.from(e.target.files || []))}
        />
      </div>
      <div className="photo-grid" aria-label={labels[category]}>
        {rows.map((row) => (
          <Thumb
            key={row.id}
            row={row}
            asset={thumbs.get(row.id)}
            onVisible={() => ensureThumb(row)}
            onOpen={() => setViewer(row.id)}
          />
        ))}
      </div>
      {!rows.length && !busy && (
        <p className="gallery-empty">
          {loading
            ? "Chargement…"
            : category === "ads"
              ? "Aucune publicité."
              : "Aucun tuto."}
        </p>
      )}
      {more && (
        <button
          className="secondary full"
          onClick={() =>
            void fetchRows(rows.at(-1)?.created_at)
              .then((result) => {
                updateRows((old) => [...old, ...result.images]);
                setMore(result.images.length === 24);
              })
              .catch((e) => setError(e.message))
          }
        >
          Afficher la suite
        </button>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {index >= 0 && (
        <Viewer
          key={category}
          rows={rows}
          index={index}
          assets={assets}
          thumbs={thumbs}
          onIndex={(i) => setViewer(rows[i].id)}
          onClose={() => setViewer(null)}
          onDelete={() => {
            const row = rows[index];
            void request("media", { action: "delete", id: row.id })
              .then(() => removeRow(row.id))
              .catch((e) => setError(e.message));
          }}
          onMove={async (target) => {
            const row = rows[index];
            await request("media", {
              action: "category",
              id: row.id,
              category: target,
            });
            indexFor(cloud).delete(owners + ":" + target);
            removeRow(row.id, false);
          }}
        />
      )}
    </div>
  );
}
