import { useState } from "react";
import { SimpleDocsMark } from "./SimpleDocsMark";

/** The organisation's logo from Settings, or Simple Docs' mark when there is
 * none or it won't load. The name beside it says whose it is, so the picture
 * is decorative. The logo's id is in the address, so a new upload is fetched
 * afresh, and a new id gets a fresh try after one that failed. */
export function OrgMark({ logoId, size = 32 }: { logoId: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (logoId && failed !== logoId) {
    return (
      <img
        src={`/api/v1/branding/logo?v=${encodeURIComponent(logoId)}`}
        alt=""
        width={size}
        height={size}
        className="rounded-sm object-contain"
        onError={() => setFailed(logoId)}
      />
    );
  }
  return <SimpleDocsMark size={size} />;
}
