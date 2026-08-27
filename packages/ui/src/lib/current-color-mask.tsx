/** Paint a mono SVG through currentColor so it follows light/dark chrome. */
export function CurrentColorMask({ src }: { src: string }) {
  return (
    <span
      className="block size-full bg-current"
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "contain",
      }}
    />
  );
}

/** Color SVG on a light plate so lime/white marks stay visible on cream chrome. */
export function ColorPlateMark({ src }: { src: string }) {
  return (
    <span className="brand-mark is-color block size-full">
      <img src={src} alt="" />
    </span>
  );
}
