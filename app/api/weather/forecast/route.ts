import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { assessStripingWeather } from "@/lib/schedule/weather-risk";

type OpenMeteoDaily = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  precipitation_sum: number[];
  wind_gusts_10m_max: number[];
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lat = z.coerce.number().min(-90).max(90).parse(url.searchParams.get("lat"));
    const lng = z.coerce.number().min(-180).max(180).parse(url.searchParams.get("lng"));
    const apiKey = process.env.OPEN_METEO_API_KEY?.trim();
    const endpoint = new URL(apiKey ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast");
    endpoint.searchParams.set("latitude", String(lat));
    endpoint.searchParams.set("longitude", String(lng));
    endpoint.searchParams.set("forecast_days", "16");
    endpoint.searchParams.set("timezone", "auto");
    endpoint.searchParams.set("temperature_unit", "fahrenheit");
    endpoint.searchParams.set("wind_speed_unit", "mph");
    endpoint.searchParams.set("precipitation_unit", "inch");
    endpoint.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max");
    if (apiKey) endpoint.searchParams.set("apikey", apiKey);

    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) return json({ error: "Weather forecast is temporarily unavailable." }, 502);
    const payload = await response.json() as { daily?: OpenMeteoDaily };
    if (!payload.daily) return json({ error: "Weather provider returned an incomplete forecast." }, 502);
    const daily = payload.daily;
    const days = daily.time.map((date, index) => assessStripingWeather({
      date,
      weatherCode: daily.weather_code[index] ?? 0,
      temperatureMax: daily.temperature_2m_max[index] ?? 0,
      temperatureMin: daily.temperature_2m_min[index] ?? 0,
      precipitationProbability: daily.precipitation_probability_max[index] ?? 0,
      precipitationInches: daily.precipitation_sum[index] ?? 0,
      windGustMph: daily.wind_gusts_10m_max[index] ?? 0,
    }));
    return json({ days, commercialEndpoint: Boolean(apiKey), attribution: "Weather data by Open-Meteo.com" }, 200, { "Cache-Control": "public, max-age=900" });
  } catch (error) { return apiError(error); }
}
