// ============================================
// КОНФИГУРАЦИЯ GOOGLE SHEETS
// ============================================

const CONFIG = {
  // ID Google таблицы (из URL)
  SHEET_ID: '1Xfi9m0y8fL44ie60LVW-vLVusHH7wGg5xP9VsdylR7Q',
  // API Key из Google Cloud Console
  API_KEY: 'AIzaSyCuv0INXcYcMhoo6pnI1gxoyWkiWx6eTKM',
  // Client ID из Google Cloud Console (OAuth 2.0)
  CLIENT_ID: '730514114188-32es3h5vc689m3niqtk61e9irjjkl70p.apps.googleusercontent.com',

  // Названия листов
  SHEETS: {
    CARS: 'Автомобили',
    PARTS: 'Детали',
    SERVICE_TYPES: 'Виды_обслуживания',
    REGULATIONS: 'Регламенты',
    UNITS: 'Единицы_измерения',
    MANUFACTURERS: 'Производители',
    SERVICE: 'Обслуживание',
    EVENTS: 'События',
    HISTORY: 'История',
    MILEAGE: 'Пробег'
  }
};

// Загрузка сохраненного SHEET_ID из localStorage
function loadConfig() {
  try {
    const saved = localStorage.getItem('app_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.SHEET_ID) {
        CONFIG.SHEET_ID = parsed.SHEET_ID;
        console.log('✅ Конфигурация загружена из localStorage');
      }
    }
  } catch (e) {
    console.warn('Ошибка загрузки конфигурации:', e);
  }
}

// Сохранение SHEET_ID в localStorage
function saveConfig(sheetId) {
  try {
    const config = { SHEET_ID: sheetId };
    localStorage.setItem('app_config', JSON.stringify(config));
    CONFIG.SHEET_ID = sheetId;
    console.log('✅ Конфигурация сохранена в localStorage');
    return true;
  } catch (e) {
    console.warn('Ошибка сохранения конфигурации:', e);
    return false;
  }
}

// Загружаем конфигурацию при старте
loadConfig();

// Автосохранение на мобильных
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const AUTOSAVE_DELAY = IS_MOBILE ? 5000 : 3000; // На мобильных - через 5 секунд

// Структура листов:
// Автомобили: id, brand, model, year, color, plate, vin, mileage, notes, photo
// Детали: id, name, characteristics (JSON строка)
// Виды_обслуживания: id, name, description, quantity, unitId
// Регламенты: id, name
// Единицы_измерения: id, name, shortName
// Производители: id, name, partName, partCode
// Обслуживание: id, carId, serviceTypeId, regulationId, quantity, unitId,
//               selectedManufacturers, comment, status,
//               lastServiceDate, lastServiceMileage,
//               isWearBased, wearTriggered
// События: id, carId, serviceId, type, date, mileage, status,
//          partsNeeded, partsAvailable,
//          baseDate, baseMileage,
//          completedDate, completedMileage, isWearEvent, comment
// История: id, carId, serviceId, date, mileage, comment
// Пробег: id, carId, value, date, note