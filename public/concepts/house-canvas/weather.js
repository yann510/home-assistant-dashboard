// Design fixtures only; production must use Home Assistant forecast conditions.
export function sampleWeather(scenario, now = new Date()) {
  const start = new Date(now);
  if (scenario === 'nighttime') start.setHours(21);
  start.setMinutes(0, 0, 0);
  const hours = Array.from({ length: 24 }, (_, i) => {
    const date = new Date(start.getTime() + i * 3600000);
    const night = date.getHours() < 7 || date.getHours() >= 19;
    const rain = i >= 6 && i <= 9;
    const cloudy = i >= 4 && i <= 12;
    const condition = rain ? 'Rain' : cloudy ? 'Cloudy' : i % 5 >= 2 ? 'Partly cloudy' : night ? 'Clear night' : 'Sunny';
    const symbol = rain
      ? 'rain'
      : cloudy
        ? 'cloud'
        : condition === 'Partly cloudy'
          ? night
            ? 'cloud-moon'
            : 'cloud-sun'
          : night
            ? 'moon'
            : 'sun';
    return {
      date,
      label: i === 0 ? 'Now' : new Intl.DateTimeFormat('en', { hour: 'numeric' }).format(date),
      condition,
      symbol,
      temperature: Math.round(18 + 3 * Math.sin(i / 4) - (night && i > 0 ? 3 : 0)),
      rain: rain ? 80 : cloudy ? 30 : 5,
    };
  });
  const days = ['sun', 'cloud-sun', 'rain', 'cloud', 'sun'].map((symbol, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return {
      label: i === 0 ? 'Today' : new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      symbol,
      condition: { sun: 'Sunny', 'cloud-sun': 'Partly cloudy', rain: 'Rain', cloud: 'Cloudy' }[symbol],
      high: [21, 19, 17, 20, 22][i],
      low: [14, 12, 11, 13, 15][i],
      rain: [5, 20, 80, 30, 5][i],
    };
  });
  return { hours, days };
}
