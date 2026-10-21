/**
 * Deterministic Weather & Marine Mock Fixtures for E2E Tests.
 * Intercepts Open-Meteo & Nominatim requests in CI (or upon 429/5xx)
 * providing 100% deterministic, zero-latency responses.
 */

function generateHourlyTimes(baseDate, hoursCount = 120) {
    const times = [];
    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);
    // Start 24 hours prior to cover timezone shifts and previous day lookbacks
    start.setDate(start.getDate() - 1);

    for (let i = 0; i < hoursCount; i++) {
        const d = new Date(start.getTime() + i * 3600 * 1000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        times.push(`${yyyy}-${mm}-${dd}T${hh}:00`);
    }
    return times;
}

export function createMockForecastData(lat = 38.8406, lon = 0.1057) {
    const times = generateHourlyTimes(new Date(), 120);
    const n = times.length;

    return {
        latitude: lat,
        longitude: lon,
        generationtime_ms: 0.15,
        utc_offset_seconds: 7200,
        timezone: "Europe/Madrid",
        timezone_abbreviation: "CEST",
        elevation: 12,
        hourly_units: {
            time: "iso8601",
            wind_speed_10m: "m/s",
            wind_gusts_10m: "m/s",
            wind_direction_10m: "°",
            temperature_2m: "°C",
            weather_code: "wmo code",
            precipitation: "mm",
            precipitation_probability: "%",
            cloud_cover: "%",
            relative_humidity_2m: "%",
            surface_pressure: "hPa",
            visibility: "m"
        },
        hourly: {
            time: times,
            wind_speed_10m: Array.from({ length: n }, (_, i) => 4.2 + Math.sin(i / 6) * 1.5),
            windspeed_10m: Array.from({ length: n }, (_, i) => 15.1 + Math.sin(i / 6) * 5.4),
            wind_gusts_10m: Array.from({ length: n }, (_, i) => 6.2 + Math.sin(i / 6) * 2.0),
            windgusts_10m: Array.from({ length: n }, (_, i) => 22.3 + Math.sin(i / 6) * 7.2),
            wind_direction_10m: Array.from({ length: n }, () => 115),
            winddirection_10m: Array.from({ length: n }, () => 115),
            temperature_2m: Array.from({ length: n }, (_, i) => 21.0 + Math.sin(i / 12) * 3.0),
            weather_code: Array.from({ length: n }, () => 1),
            weathercode: Array.from({ length: n }, () => 1),
            precipitation: Array.from({ length: n }, () => 0.0),
            precipitation_probability: Array.from({ length: n }, () => 5),
            cloud_cover: Array.from({ length: n }, () => 15),
            relative_humidity_2m: Array.from({ length: n }, () => 65),
            surface_pressure: Array.from({ length: n }, () => 1016),
            visibility: Array.from({ length: n }, () => 10000)
        }
    };
}

export function createMockMarineData(lat = 38.8406, lon = 0.1057) {
    const times = generateHourlyTimes(new Date(), 120);
    const n = times.length;

    return {
        latitude: lat,
        longitude: lon,
        generationtime_ms: 0.18,
        utc_offset_seconds: 7200,
        timezone: "Europe/Madrid",
        timezone_abbreviation: "CEST",
        hourly_units: {
            time: "iso8601",
            wave_height: "m",
            wave_period: "s",
            wave_direction: "°",
            swell_wave_height: "m",
            swell_wave_period: "s",
            swell_wave_direction: "°",
            sea_surface_temperature: "°C",
            ocean_current_velocity: "m/s"
        },
        hourly: {
            time: times,
            wave_height: Array.from({ length: n }, (_, i) => 0.42 + Math.sin(i / 8) * 0.08),
            wave_period: Array.from({ length: n }, () => 5.6),
            wave_direction: Array.from({ length: n }, () => 95),
            swell_wave_height: Array.from({ length: n }, () => 0.35),
            swell_wave_period: Array.from({ length: n }, () => 6.1),
            swell_wave_direction: Array.from({ length: n }, () => 90),
            sea_surface_temperature: Array.from({ length: n }, () => 22.0),
            ocean_current_velocity: Array.from({ length: n }, () => 0.12)
        }
    };
}

const SPOT_COORDINATES = {
    denia: { lat: 38.8406, lon: 0.1057, name: 'Dénia', display: 'Dénia, Alicante, España' },
    dénia: { lat: 38.8406, lon: 0.1057, name: 'Dénia', display: 'Dénia, Alicante, España' },
    javea: { lat: 38.7895, lon: 0.1664, name: 'Jávea', display: 'Jávea, Alicante, España' },
    jávea: { lat: 38.7895, lon: 0.1664, name: 'Jávea', display: 'Jávea, Alicante, España' },
    xabia: { lat: 38.7895, lon: 0.1664, name: 'Xàbia', display: 'Xàbia / Jávea, Alicante, España' },
    xàbia: { lat: 38.7895, lon: 0.1664, name: 'Xàbia', display: 'Xàbia / Jávea, Alicante, España' },
    moraira: { lat: 38.6888, lon: 0.1345, name: 'Moraira', display: 'Moraira, Teulada, Alicante, España' }
};

/**
 * Sets up Playwright route mocks for Open-Meteo and Nominatim geocoding.
 * Operates unconditionally in CI or when forceMock is enabled; otherwise
 * intercepts and acts as a safety net against 429/5xx responses.
 */
export async function setupWeatherMocks(page, options = {}) {
    const isCI = Boolean(process.env.CI);
    const forceMock = options.forceMock !== undefined ? options.forceMock : isCI;

    // 1. Open-Meteo Geocoding
    await page.route(/https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/, async route => {
        const url = new URL(route.request().url());
        const query = (url.searchParams.get('name') || '').trim().toLowerCase();

        if (query.includes('inexistente') || query.includes('fantasma')) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ results: [] })
            });
        }

        const match = Object.keys(SPOT_COORDINATES).find(k => query.includes(k));
        if (match) {
            const spot = SPOT_COORDINATES[match];
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    results: [
                        {
                            id: 1001,
                            name: spot.name,
                            latitude: spot.lat,
                            longitude: spot.lon,
                            elevation: 12,
                            country: "España",
                            admin1: "Comunidad Valenciana"
                        }
                    ]
                })
            });
        }

        if (forceMock) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    results: [
                        {
                            id: 1002,
                            name: query || "Spot Local",
                            latitude: 38.8406,
                            longitude: 0.1057,
                            elevation: 10,
                            country: "España"
                        }
                    ]
                })
            });
        }

        // Pass through or fallback
        try {
            const response = await route.fetch();
            if (response.status() === 429 || response.status() >= 500) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ results: [] })
                });
            }
            return route.fulfill({ response });
        } catch {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ results: [] })
            });
        }
    });

    // 2. OpenStreetMap Nominatim Geocoding
    await page.route(/https:\/\/nominatim\.openstreetmap\.org\/search/, async route => {
        const url = new URL(route.request().url());
        const query = (url.searchParams.get('q') || '').trim().toLowerCase();

        if (query.includes('inexistente') || query.includes('fantasma')) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        }

        const match = Object.keys(SPOT_COORDINATES).find(k => query.includes(k));
        if (match) {
            const spot = SPOT_COORDINATES[match];
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        lat: String(spot.lat),
                        lon: String(spot.lon),
                        display_name: spot.display
                    }
                ])
            });
        }

        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        });
    });

    // 3. Open-Meteo Weather Forecast
    await page.route(/https:\/\/api\.open-meteo\.com\/v1\/forecast/, async route => {
        const url = new URL(route.request().url());
        const lat = parseFloat(url.searchParams.get('latitude') || '38.8406');
        const lon = parseFloat(url.searchParams.get('longitude') || '0.1057');

        if (forceMock) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify(createMockForecastData(lat, lon))
            });
        }

        try {
            const response = await route.fetch();
            if (response.status() === 429 || response.status() >= 500) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(createMockForecastData(lat, lon))
                });
            }
            return route.fulfill({ response });
        } catch {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(createMockForecastData(lat, lon))
            });
        }
    });

    // 4. Open-Meteo Marine
    await page.route(/https:\/\/marine-api\.open-meteo\.com\/v1\/marine/, async route => {
        const url = new URL(route.request().url());
        const lat = parseFloat(url.searchParams.get('latitude') || '38.8406');
        const lon = parseFloat(url.searchParams.get('longitude') || '0.1057');

        if (forceMock) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify(createMockMarineData(lat, lon))
            });
        }

        try {
            const response = await route.fetch();
            if (response.status() === 429 || response.status() >= 500) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(createMockMarineData(lat, lon))
                });
            }
            return route.fulfill({ response });
        } catch {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(createMockMarineData(lat, lon))
            });
        }
    });

    // 5. Open-Meteo Elevation
    await page.route(/https:\/\/api\.open-meteo\.com\/v1\/elevation/, async route => {
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ elevation: [12] })
        });
    });
}
