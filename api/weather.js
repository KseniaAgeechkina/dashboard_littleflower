/* MET Norway Locationforecast: прямой запрос без ключа, кэш по координатам. */
class WeatherAPIError extends Error {}
async function requestWeatherJSON(url, withMetadata = false) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw new WeatherAPIError(`Сервис ответил HTTP ${response.status}.`);
    const data = await response.json();
    if (!withMetadata) return data;
    const expires = Date.parse(response.headers.get('Expires'));
    return {data,expires:Number.isFinite(expires) && expires > Date.now() ? expires : Date.now()+30*60*1000};
  }catch(error){throw new WeatherAPIError(error instanceof WeatherAPIError ? error.message : error.name === 'AbortError' ? 'MET Norway не ответил за 20 секунд. Соединение с сервисом недоступно.' : 'Браузер не смог получить ответ погодного сервиса: сетевой сбой или CORS. Точная причина указана в консоли браузера.');}
  finally{clearTimeout(timer);}
}
function weatherNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
window.WeatherAPI = {
  async current(city) {
    const latitude = Number(city.latitude), longitude = Number(city.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new WeatherAPIError('Не выбраны координаты города.');
    const params = new URLSearchParams({lat:latitude.toFixed(4),lon:longitude.toFixed(4)});
    const key = 'quiet-garden-metno-' + params;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
    let data;
    if (saved?.expires > Date.now() && Array.isArray(saved.data?.properties?.timeseries)) {
      data = saved.data;
    } else {
      const response = await requestWeatherJSON(`https://api.met.no/weatherapi/locationforecast/2.0/compact?${params}`, true);
      data = response.data;
      if (!Array.isArray(data.properties?.timeseries) || !data.properties.timeseries.length) throw new WeatherAPIError('MET Norway не вернул прогноз.');
      try { localStorage.setItem(key, JSON.stringify({data,expires:response.expires})); } catch {}
    }
    const points = data.properties.timeseries.filter(point => Number.isFinite(Date.parse(point.time)) && Number.isFinite(point.data?.instant?.details?.air_temperature));
    points.sort((a,b) => Math.abs(Date.parse(a.time)-Date.now()) - Math.abs(Date.parse(b.time)-Date.now()));
    const point = points[0];
    if (!point || Math.abs(Date.parse(point.time)-Date.now()) > 6*3600000) throw new WeatherAPIError('Свежий прогноз MET Norway недоступен.');
    const details = point.data.instant.details;
    const symbol = point.data.next_1_hours?.summary?.symbol_code || point.data.next_6_hours?.summary?.symbol_code || point.data.next_12_hours?.summary?.symbol_code;
    if (typeof symbol !== 'string') throw new WeatherAPIError('Нет описания погоды MET Norway.');
    const kind = /snow|sleet/.test(symbol) ? 'snow' : /rain|showers|thunder/.test(symbol) ? 'rain' : /clearsky|fair/.test(symbol) ? 'sun' : 'cloud';
    return {
      temperature_2m:details.air_temperature,apparent_temperature:null,
      relative_humidity_2m:weatherNumber(details.relative_humidity),wind_speed_10m:Number.isFinite(details.wind_speed) ? Math.round(details.wind_speed*3.6) : null,
      weather_code:{sun:0,cloud:3,rain:61,snow:71}[kind],is_day:symbol.endsWith('_night') ? 0 : symbol.endsWith('_day') ? 1 : null,
      description:'Прогноз: '+{sun:'ясно',cloud:'облачно',rain:'дождь',snow:'снег'}[kind],
      forecastTime:Date.parse(point.time),source:'MET Norway',sourceURL:'https://www.met.no/en'
    };
  },
  async search(name) {
    const query = name.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
    const local = russianCities.filter(city => city.name.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(query) || city.alias?.includes(query));
    if (local.length) return local.slice(0,8);
    const data = await requestWeatherJSON(`https://photon.komoot.io/api/?${new URLSearchParams({q:name,limit:8})}`);
    if (!Array.isArray(data.features)) throw new WeatherAPIError('Поиск городов временно недоступен.');
    return data.features.filter(f => ['city','town','village','municipality'].includes(f.properties?.osm_value) && f.geometry?.coordinates?.length === 2 && f.geometry.coordinates.every(Number.isFinite)).map(f => ({name:f.properties.name,admin1:f.properties.state,country:f.properties.country,latitude:f.geometry.coordinates[1],longitude:f.geometry.coordinates[0]}));
  }
};
/* Частые города находятся без сетевого запроса к геокодеру. */
const russianCities = [
  ['Москва',55.7558,37.6173],['Санкт-Петербург',59.9343,30.3351,'питер спб санкт петербург'],
  ['Ивантеевка',55.9711,37.9208],['Фрязино',55.9606,38.0456],['Щёлково',55.9217,37.9917],['Пушкино',56.0104,37.8472],
  ['Новосибирск',55.0084,82.9357],['Екатеринбург',56.8389,60.6057],['Казань',55.7961,49.1064],
  ['Нижний Новгород',56.3269,44.0059],['Красноярск',56.0153,92.8932],['Челябинск',55.1644,61.4368],
  ['Самара',53.1959,50.1002],['Уфа',54.7388,55.9721],['Ростов-на-Дону',47.2357,39.7015],
  ['Омск',54.9885,73.3242],['Краснодар',45.0355,38.9753],['Воронеж',51.6608,39.2003],
  ['Пермь',58.0105,56.2502],['Волгоград',48.708,44.5133],['Саратов',51.5336,46.0343],
  ['Тюмень',57.1522,65.5272],['Тольятти',53.5078,49.4204],['Ижевск',56.8527,53.2115],
  ['Барнаул',53.3474,83.7784],['Иркутск',52.2871,104.281],['Хабаровск',48.4802,135.0719],
  ['Владивосток',43.1155,131.8855],['Ярославль',57.6261,39.8845],['Махачкала',42.9849,47.5047],
  ['Томск',56.4846,84.9482],['Оренбург',51.7682,55.0969],['Кемерово',55.3552,86.0878],
  ['Рязань',54.6292,39.7369],['Тула',54.1931,37.6173],['Калининград',54.7104,20.4522],
  ['Черняховск',54.6334,21.8156],['Сочи',43.5855,39.7231],['Мурманск',68.9707,33.0749],
  ['Архангельск',64.5393,40.5187],['Петрозаводск',61.7891,34.3596],['Великий Новгород',58.5215,31.2755]
].map(([name,latitude,longitude,alias]) => ({name,latitude,longitude,alias,country:'Россия'}));
