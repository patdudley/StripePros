import { describe, expect, it } from "vitest";
import { assessStripingWeather } from "../lib/schedule/weather-risk";

const base = { date: "2026-08-10", weatherCode: 1, temperatureMax: 78, temperatureMin: 58, precipitationProbability: 5, precipitationInches: 0, windGustMph: 12 };

describe("striping weather risk", () => {
  it("keeps dry, mild days clear", () => {
    expect(assessStripingWeather(base)).toMatchObject({ level: "good", reasons: [] });
  });

  it("flags likely rain as high risk", () => {
    expect(assessStripingWeather({ ...base, precipitationProbability: 70 })).toMatchObject({ level: "high" });
  });

  it("warns on cool temperatures and gusty wind", () => {
    const result = assessStripingWeather({ ...base, temperatureMin: 45, windGustMph: 34 });
    expect(result.level).toBe("watch");
    expect(result.reasons).toHaveLength(2);
  });
});
