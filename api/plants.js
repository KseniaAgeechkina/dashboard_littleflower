/* Общедоступные сведения о растениях iNaturalist. */
window.PlantsAPI = {
  async search(name, signal) {
    const params = new URLSearchParams({q:name,iconic_taxa:'Plantae',rank:'species',per_page:10,locale:'ru'});
    const response = await fetch(`https://api.inaturalist.org/v1/taxa?${params}`, {signal});
    if (!response.ok) throw new Error('Сведения о растении временно недоступны.');
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error('Некорректный ответ растений.');
    const taxon = data.results.find(t => t.name?.toLowerCase() === name.toLowerCase()) || data.results.find(t => t.default_photo?.url);
    if (!taxon) return null;
    return {id:taxon.id,name:taxon.preferred_common_name || taxon.name,scientificName:taxon.name,photo:taxon.default_photo?.medium_url || taxon.default_photo?.url,credit:taxon.default_photo?.attribution,license:taxon.default_photo?.license_code};
  }
};
