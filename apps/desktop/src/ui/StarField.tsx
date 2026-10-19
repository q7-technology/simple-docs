export interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
}

/** Points from a seeded sequence (Park–Miller), so the field is the same on
 * every load and in every test. x and y are percent of the window. */
export function makeStars(count: number, seed: number): Star[] {
  let s = seed;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  return Array.from({ length: count }, () => ({
    x: round(next() * 100),
    y: round(next() * 100),
    r: round(next() * 0.9 + 0.3),
    o: round(next() * 0.55 + 0.25),
  }));
}

const STARS = makeStars(140, 7);

/** The star field behind every screen (the design system's ground). Fixed,
 * decoration only, and still: nothing on it moves. */
export function StarField() {
  return (
    <svg
      data-testid="star-field"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      {STARS.map((s, i) => (
        <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#ffffff" opacity={s.o} />
      ))}
    </svg>
  );
}
