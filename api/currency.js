/* Курсы Банка России через бесплатный JSON-сервис, без ключа. */
window.CurrencyAPI = {
  async load(signal) {
    const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', {signal});
    if (!response.ok) throw new Error('Курсы временно недоступны.');
    const data = await response.json();
    if (!data.Valute || !Number.isFinite(Date.parse(data.Date))) throw new Error('Некорректные данные курсов.');
    const rates = {};
    for (const code of ['USD','EUR','CNY']) {
      const item = data.Valute[code];
      if (!item || !Number.isFinite(item.Value) || !Number.isFinite(item.Nominal) || item.Nominal <= 0) continue;
      rates[code] = {value:item.Value / item.Nominal, previous:Number.isFinite(item.Previous)?item.Previous/item.Nominal:null};
    }
    if (!Object.keys(rates).length) throw new Error('Курсы не найдены.');
    return {date:data.Date, rates};
  }
};
