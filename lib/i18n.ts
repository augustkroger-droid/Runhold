export const LANGUAGES = ["sv", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

export type TranslationKey = keyof typeof translations.sv;

export const translations = {
  sv: {
    "nav.base": "Bas",
    "nav.expedition": "Expedition",
    "nav.tech": "Tech",
    "nav.inventory": "Förråd",
    "nav.profile": "Profil",
    "common.loading": "Laddar",
    "common.ready": "Klar",
    "common.cost": "Kostnad",
    "common.status": "Status",
    "common.level": "Nivå",
    "common.hp": "HP",
    "common.language": "Språk",
    "common.swedish": "Svenska",
    "common.english": "English",
    "app.signOut": "Logga ut",
    "profile.player": "Spelare",
    "profile.training": "Träningsnivå",
    "profile.character": "Karaktär",
    "base.title": "Bas",
    "base.category.camp": "Läger",
    "base.category.defense": "Försvar",
    "base.state.active": "Aktiv",
    "base.state.not_built": "Inte byggd",
    "base.state.damaged": "Skadad",
    "base.state.destroyed": "Utslagen",
    "campfire.title": "Lägereld",
    "campfire.burning": "Brinner",
    "campfire.out": "Slocknad",
    "campfire.remaining": "Återstående tid",
    "campfire.balance": "1 trä ger {minutes} minuter brinntid. Max {hours} timmar.",
    "campfire.fuelError": "Kunde inte fylla på elden just nu.",
    "campfire.full": "Full",
    "construction.built.wall": "Mur byggd",
    "construction.active": "Pågår",
    "construction.start": "Starta byggnation",
    "repair.title": "Skick",
    "repair.repair": "Reparation",
    "repair.start": "Reparera",
    "repair.good": "I gott skick",
    "repair.practice": "Övningsattack",
    "tech.title": "Tech",
    "tech.available": "Tillgänglig",
    "tech.requires": "Kräver {items}",
    "tech.unlocked": "Upplåst",
    "tech.learn": "Lär dig",
    "tech.learning": "Lär...",
    "inventory.title": "Förråd",
    "inventory.add": "Lägg till 10 {resource}",
    "inventory.remove": "Ta bort 5 {resource}",
    "inventory.error": "Kunde inte ändra resursen just nu.",
    "expedition.title": "Expedition",
    "expedition.distance": "Distans",
    "expedition.time": "Tid",
    "expedition.findPosition": "Hämta position för att öppna kartan.",
    "expedition.locate": "Hämta position",
    "expedition.locating": "Hämtar position...",
    "expedition.positionReady": "Position hittad. Du kan scanna området eller starta expeditionen.",
    "expedition.permissionDenied": "GPS-behörighet nekades.",
    "expedition.timeout": "Det tog för lång tid att hitta positionen.",
    "expedition.positionError": "Kunde inte hitta positionen.",
    "expedition.scan": "Scanna område",
    "expedition.scanning": "Scannar...",
    "expedition.needPosition": "Hämta position först.",
    "expedition.scanActive": "Scanner aktiv: {radius} radie. {count} fynd hittade.",
    "expedition.scanError": "Kunde inte scanna området.",
    "expedition.start": "Starta expedition",
    "expedition.started": "Expeditionen är igång.",
    "expedition.stop": "Avsluta expedition",
    "expedition.done": "Expedition avslutad. +{xp} XP.",
    "expedition.saveError": "Expeditionen kunde inte sparas.",
    "expedition.pickupError": "Kunde inte hämta fyndet.",
    "expedition.new": "Ny expedition",
    "expedition.result": "Resultat",
    "resource.wood": "Trä",
    "resource.stone": "Sten",
    "resource.food": "Mat",
    "building.tent.name": "Tält",
    "building.tent.description": "Första lägret och basens enkla centrum.",
    "building.campfire.name": "Lägereld",
    "building.campfire.description": "Håller mörkret borta och behöver fyllas med trä.",
    "building.wall.name": "Mur",
    "building.wall.description": "Första försvarslinjen runt lägret.",
    "tech.basic_wall.name": "Enkel mur",
    "tech.basic_wall.description": "Lär lägret att resa en första skyddande mur.",
    "tech.improved_scanner.name": "Förbättrad scanner",
    "tech.improved_scanner.description": "Förbereder längre scanner-radie för framtida expeditioner.",
    "tech.iron_discovery.name": "Järnfynd",
    "tech.iron_discovery.description": "Gör lägret redo att upptäcka järn senare.",
  },
  en: {
    "nav.base": "Base",
    "nav.expedition": "Expedition",
    "nav.tech": "Tech",
    "nav.inventory": "Storage",
    "nav.profile": "Profile",
    "common.loading": "Loading",
    "common.ready": "Done",
    "common.cost": "Cost",
    "common.status": "Status",
    "common.level": "Level",
    "common.hp": "HP",
    "common.language": "Language",
    "common.swedish": "Svenska",
    "common.english": "English",
    "app.signOut": "Sign out",
    "profile.player": "Player",
    "profile.training": "Training",
    "profile.character": "Character",
    "base.title": "Base",
    "base.category.camp": "Camp",
    "base.category.defense": "Defense",
    "base.state.active": "Active",
    "base.state.not_built": "Not built",
    "base.state.damaged": "Damaged",
    "base.state.destroyed": "Destroyed",
    "campfire.title": "Campfire",
    "campfire.burning": "Burning",
    "campfire.out": "Out",
    "campfire.remaining": "Remaining time",
    "campfire.balance": "1 wood gives {minutes} minutes burn time. Max {hours} hours.",
    "campfire.fuelError": "Could not add wood right now.",
    "campfire.full": "Full",
    "construction.built.wall": "Wall built",
    "construction.active": "In progress",
    "construction.start": "Start construction",
    "repair.title": "Condition",
    "repair.repair": "Repair",
    "repair.start": "Repair",
    "repair.good": "In good condition",
    "repair.practice": "Practice attack",
    "tech.title": "Tech",
    "tech.available": "Available",
    "tech.requires": "Requires {items}",
    "tech.unlocked": "Unlocked",
    "tech.learn": "Learn",
    "tech.learning": "Learning...",
    "inventory.title": "Storage",
    "inventory.add": "Add 10 {resource}",
    "inventory.remove": "Remove 5 {resource}",
    "inventory.error": "Could not change the resource right now.",
    "expedition.title": "Expedition",
    "expedition.distance": "Distance",
    "expedition.time": "Time",
    "expedition.findPosition": "Get your position to open the map.",
    "expedition.locate": "Get position",
    "expedition.locating": "Getting position...",
    "expedition.positionReady": "Position found. You can scan the area or start the expedition.",
    "expedition.permissionDenied": "GPS permission denied.",
    "expedition.timeout": "Finding your position took too long.",
    "expedition.positionError": "Could not find your position.",
    "expedition.scan": "Scan area",
    "expedition.scanning": "Scanning...",
    "expedition.needPosition": "Get your position first.",
    "expedition.scanActive": "Scanner active: {radius} radius. {count} finds discovered.",
    "expedition.scanError": "Could not scan the area.",
    "expedition.start": "Start expedition",
    "expedition.started": "Expedition started.",
    "expedition.stop": "End expedition",
    "expedition.done": "Expedition complete. +{xp} XP.",
    "expedition.saveError": "The expedition could not be saved.",
    "expedition.pickupError": "Could not collect the find.",
    "expedition.new": "New expedition",
    "expedition.result": "Result",
    "resource.wood": "Wood",
    "resource.stone": "Stone",
    "resource.food": "Food",
    "building.tent.name": "Tent",
    "building.tent.description": "The first camp and simple center of the base.",
    "building.campfire.name": "Campfire",
    "building.campfire.description": "Keeps the dark away and needs wood.",
    "building.wall.name": "Wall",
    "building.wall.description": "The first defensive line around the camp.",
    "tech.basic_wall.name": "Basic wall",
    "tech.basic_wall.description": "Teaches the camp how to raise a first protective wall.",
    "tech.improved_scanner.name": "Improved scanner",
    "tech.improved_scanner.description": "Prepares a longer scanner radius for future expeditions.",
    "tech.iron_discovery.name": "Iron discovery",
    "tech.iron_discovery.description": "Prepares the camp to discover iron later.",
  },
} as const;

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGES.includes(value as Language);
}

export function getLanguageFromSettings(settings: Record<string, unknown>): Language {
  return isLanguage(settings.language) ? settings.language : "sv";
}

export function t(
  language: Language,
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  let text: string = translations[language][key] ?? translations.sv[key] ?? key;

  if (!values) return text;

  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }

  return text;
}

export function resourceName(language: Language, resourceId: string): string {
  if (resourceId === "wood") return t(language, "resource.wood");
  if (resourceId === "stone") return t(language, "resource.stone");
  if (resourceId === "food") return t(language, "resource.food");
  return resourceId;
}

export function buildingName(language: Language, buildingId: string): string {
  if (buildingId === "tent") return t(language, "building.tent.name");
  if (buildingId === "campfire") return t(language, "building.campfire.name");
  if (buildingId === "wall") return t(language, "building.wall.name");
  return buildingId;
}

export function buildingDescription(language: Language, buildingId: string): string {
  if (buildingId === "tent") return t(language, "building.tent.description");
  if (buildingId === "campfire") return t(language, "building.campfire.description");
  if (buildingId === "wall") return t(language, "building.wall.description");
  return "";
}

export function techName(language: Language, techId: string): string {
  if (techId === "basic_wall") return t(language, "tech.basic_wall.name");
  if (techId === "improved_scanner") return t(language, "tech.improved_scanner.name");
  if (techId === "iron_discovery") return t(language, "tech.iron_discovery.name");
  return techId;
}

export function techDescription(language: Language, techId: string): string {
  if (techId === "basic_wall") return t(language, "tech.basic_wall.description");
  if (techId === "improved_scanner") {
    return t(language, "tech.improved_scanner.description");
  }
  if (techId === "iron_discovery") return t(language, "tech.iron_discovery.description");
  return "";
}
