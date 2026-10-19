import { SimpleDocsMark } from "./SimpleDocsMark";

/** The organisation's logo from Settings, or Simple Docs' mark when there is
 * none. The name beside it says whose it is, so the picture is decorative.
 * The logo's id is in the address, so a new upload is fetched afresh. */
export function OrgMark({ logoId, size = 32 }: { logoId: string | null; size?: number }) {
  if (logoId) {
    return (
      <img
        src={`/api/v1/branding/logo?v=${encodeURIComponent(logoId)}`}
        alt=""
        width={size}
        height={size}
        className="rounded-sm object-contain"
      />
    );
  }
  return <SimpleDocsMark size={size} />;
}
