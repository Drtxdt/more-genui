export const dataset = 'usgs-m45-day';
export const endpoint = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
export function parseEarthquakes(feed) {
  if (feed?.type !== 'FeatureCollection' || !Array.isArray(feed.features) ||
      feed.features.length > 256 || !Number.isSafeInteger(feed.metadata?.generated) ||
      feed.metadata.generated < 0 || feed.metadata.generated > 8640000000000000)
    throw Error('USGS 数据集结构或时间无效');
  const events = feed.features.map(({id, properties: p, geometry: g}) => {
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || typeof id !== 'string' || typeof p?.place !== 'string' ||
        p.place.length > 160 || !Number.isFinite(p.mag) || g?.type !== 'Point' ||
        !Array.isArray(g.coordinates) || g.coordinates.length !== 3 ||
        !g.coordinates.every(Number.isFinite) || Math.abs(g.coordinates[0])>180 || Math.abs(g.coordinates[1])>90)
      throw Error('USGS 事件字段无效');
    return {id, place:p.place, mag:p.mag, lon:g.coordinates[0], lat:g.coordinates[1]};
  });
  return {at:feed.metadata.generated,events};
}
