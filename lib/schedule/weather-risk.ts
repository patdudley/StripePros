export type ForecastDayInput = {
  date: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  precipitationProbability: number;
  precipitationInches: number;
  windGustMph: number;
};

export type WeatherRisk = ForecastDayInput & {
  level: "good" | "watch" | "high";
  reasons: string[];
};

function isThunderOrSnow(code: number) {
  return (code >= 71 && code <= 86) || code >= 95;
}

export function assessStripingWeather(day: ForecastDayInput): WeatherRisk {
  const high: string[] = [];
  const watch: string[] = [];

  if (day.precipitationProbability >= 60 || day.precipitationInches >= 0.1) high.push("Rain is likely to leave pavement unsuitable for paint");
  else if (day.precipitationProbability >= 30 || day.precipitationInches >= 0.02) watch.push("Possible rain or wet pavement");
  if (isThunderOrSnow(day.weatherCode)) high.push("Storm or frozen precipitation risk");
  if (day.temperatureMin < 40) high.push("Low temperature may prevent proper curing");
  else if (day.temperatureMin < 50) watch.push("Cool-weather material limits may apply");
  if (day.temperatureMax > 105) high.push("Extreme heat may affect crew and material performance");
  else if (day.temperatureMax > 98) watch.push("High heat may affect crew and material performance");
  if (day.windGustMph >= 40) high.push("Strong gusts can disrupt layout and spraying");
  else if (day.windGustMph >= 30) watch.push("Wind gusts may affect spraying");

  return { ...day, level: high.length ? "high" : watch.length ? "watch" : "good", reasons: high.length ? high : watch };
}
