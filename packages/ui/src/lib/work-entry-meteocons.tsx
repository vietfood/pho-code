import type { ReactNode } from "react";
import barometer from "@meteocons/svg-static/fill/barometer.svg";
import cloudDown from "@meteocons/svg-static/fill/cloud-down.svg";
import compass from "@meteocons/svg-static/fill/compass.svg";
import lightningBolt from "@meteocons/svg-static/fill/lightning-bolt.svg";
import moonFirstQuarter from "@meteocons/svg-static/fill/moon-first-quarter.svg";
import moonWaxingCrescent from "@meteocons/svg-static/fill/moon-waxing-crescent.svg";
import overcast from "@meteocons/svg-static/fill/overcast.svg";
import partlyCloudyDay from "@meteocons/svg-static/fill/partly-cloudy-day.svg";
import rain from "@meteocons/svg-static/fill/rain.svg";
import rainbow from "@meteocons/svg-static/fill/rainbow.svg";
import star from "@meteocons/svg-static/fill/star.svg";
import starryNight from "@meteocons/svg-static/fill/starry-night.svg";
import sunrise from "@meteocons/svg-static/fill/sunrise.svg";
import thunderstorms from "@meteocons/svg-static/fill/thunderstorms.svg";
import tornado from "@meteocons/svg-static/fill/tornado.svg";
import wind from "@meteocons/svg-static/fill/wind.svg";
import windmill from "@meteocons/svg-static/fill/windmill.svg";
import { cn } from "./cn";
import { githubWorkGlyph } from "./work-entry-github";
import type { WorkEntryIconName } from "../tool-presentation";

const METEOCONS: Record<Exclude<WorkEntryIconName, "github">, string> = {
  list: overcast,
  read: moonFirstQuarter,
  write: sunrise,
  edit: rainbow,
  run: lightningBolt,
  search: tornado,
  find: moonWaxingCrescent,
  "web-search": wind,
  fetch: cloudDown,
  trash: rain,
  skill: star,
  ask: partlyCloudyDay,
  todos: barometer,
  plan: compass,
  execute: thunderstorms,
  thought: starryNight,
  wrench: windmill,
};

/**
 * Fill artwork sits inset in a 128 box. Crop that padding inside the same
 * size-3.5 slot as Lucide/Pho — do not overflow the row.
 */
export const METEOCONS_OPTICAL_SCALE = 1.7;

export function meteoconsGlyph(name: WorkEntryIconName, className?: string): ReactNode {
  if (name === "github") {
    return githubWorkGlyph(className);
  }
  return (
    <span className={cn("overflow-hidden", className)} aria-hidden="true">
      <img
        src={METEOCONS[name]}
        alt=""
        className="block size-full origin-center"
        style={{
          transform: `scale(${METEOCONS_OPTICAL_SCALE})`,
          filter: "drop-shadow(0 0 0.45px rgb(0 0 0 / 45%))",
        }}
      />
    </span>
  );
}
