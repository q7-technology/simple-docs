/** Simple Docs' own mark, for an organisation with no logo: a page with its
 * corner folded, three lines of writing, and a sparkle for the draft
 * written for you. space-lightGray, space-gray and space-blue. Decorative
 * unless given a title. */
export function SimpleDocsMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="#ccd6f6" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19 3v7h7" stroke="#ccd6f6" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 17h7M10 21h9M10 25h12" stroke="#8892b0" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 12.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#29abe2" />
    </svg>
  );
}
