import type { MediaKind } from "@verdict/shared";
import { KIND_LABEL, hueFor } from "@/lib/format";

/** Real poster when the catalog has one; otherwise a generated cover. */
export function Poster({ slug, name, kind, url }: { slug: string; name: string; kind: MediaKind; url: string | null }) {
  const hue = hueFor(slug);
  return (
    <div className="poster" style={{ background: `linear-gradient(160deg, hsl(${hue} 55% 42%), hsl(${(hue + 50) % 360} 60% 18%))` }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${name} poster`} loading="lazy" />
      ) : (
        <div className="poster-fallback" aria-hidden>
          <span className="poster-kind">{KIND_LABEL[kind]}</span>
          <span className="poster-title">{name}</span>
        </div>
      )}
    </div>
  );
}
