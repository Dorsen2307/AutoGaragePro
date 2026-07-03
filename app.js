// ============================================
// ГЛОБАЛЬНЫЕ ДАННЫЕ
// ============================================
let appData = {
  cars: [],
  parts: [],
  serviceTypes: [],
  regulations: [],
  units: [],
  manufacturers: [],
  services: [],
  events: [],
  history: [],
  mileage: []
};

let unsavedChanges = 0;
let isSaving = false;
let sortDirection = 'asc';

// ============================================
// OAuth АВТОРИЗАЦИЯ - ПРАВИЛЬНАЯ ИНИЦИАЛИЗАЦИЯ
// ============================================

let tokenClient;
let gapiInited = false;
let gisInited = false;
let isAuthorized = false;

// Эта функция вызывается автоматически после загрузки api.js
function gapiLoaded() {
  console.log('🔐 GAPI загружен');
  gapi.load('client', initializeGapiClient);
}

// Инициализация GAPI клиента
async function initializeGapiClient() {
  try {
    await gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
    });
    gapiInited = true;
    console.log('✅ GAPI клиент инициализирован');
    maybeEnableButtons();
  } catch (error) {
    console.error('❌ Ошибка инициализации GAPI:', error);
    showToast('Ошибка инициализации Google API', 'error');
  }
}

// Эта функция вызывается автоматически после загрузки gsi/client
function gisLoaded() {
  console.log('🔐 GIS загружен');
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      callback: '', // будет определено позже
    });
    gisInited = true;
    console.log('✅ GIS клиент инициализирован');
    maybeEnableButtons();
  } catch (error) {
    console.error('❌ Ошибка инициализации GIS:', error);
    showToast('Ошибка инициализации авторизации', 'error');
  }
}

// Проверяем, инициализированы ли оба клиента
function maybeEnableButtons() {
  console.log('🔄 Проверка инициализации:', { gapiInited, gisInited });

  if (gapiInited && gisInited) {
    const authBtn = document.getElementById('auth-btn');

    // Пытаемся восстановить токен
    const tokenRestored = restoreToken();

    if (tokenRestored) {
      isAuthorized = true;
      if (authBtn) authBtn.style.display = 'none';
      document.getElementById('signout-btn').style.display = 'block';
      const statusEl = document.getElementById('auth-status');
      if (statusEl) {
        statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: #4caf50;"></i> Авторизован';
        statusEl.style.color = '#4caf50';
      }
      // Загружаем данные
      GoogleSheetsAPI.loadAllData().then(() => {
        if (app) app.loadPage(app.currentPage);
      });
      return;
    }

    if (authBtn) {
      authBtn.style.display = 'block';
      authBtn.disabled = false;
      authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';  // <-- ИСПРАВЛЕНО
      console.log('🔑 Кнопка авторизации активирована');
    } else {
      console.warn('⚠️ Кнопка авторизации не найдена в DOM');
    }

    // Проверяем, есть ли уже токен
    const token = gapi.client.getToken();
    if (token) {
      isAuthorized = true;
      authBtn.style.display = 'none';
      document.getElementById('signout-btn').style.display = 'block';
      const statusEl = document.getElementById('auth-status');
      if (statusEl) {
        statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: #4caf50;"></i> Авторизован';
        statusEl.style.color = '#4caf50';
      }
      // Загружаем данные
      GoogleSheetsAPI.loadAllData().then(() => {
        if (app) app.loadPage(app.currentPage);
      });
    }
  } else {
    console.log('⏳ Ожидание инициализации...');
    // Показываем сообщение о загрузке ТОЛЬКО если кнопка еще не инициализирована
    const authBtn = document.getElementById('auth-btn');
    if (authBtn && authBtn.style.display !== 'block') {
      authBtn.textContent = '⏳ Загрузка...';
      authBtn.disabled = true;
    }
  }
}

// Функция авторизации
function authenticate() {
  console.log('🔑 Запрос авторизации...');

  if (!tokenClient) {
    console.error('❌ TokenClient не инициализирован');
    showToast('Ошибка инициализации авторизации', 'error');
    return;
  }

  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      console.error('❌ Ошибка авторизации:', resp.error);
      showToast('Ошибка авторизации: ' + resp.error, 'error');
      return;
    }

    console.log('✅ Авторизация успешна!');
    isAuthorized = true;

    // Сохраняем токен в localStorage
    const token = gapi.client.getToken();
    if (token) {
      try {
        localStorage.setItem('oauth_token', JSON.stringify({
          access_token: token.access_token,
          expires_at: Date.now() + (token.expires_in || 3600) * 1000
        }));
        console.log('💾 Токен сохранен в localStorage');
      } catch (e) {
        console.warn('Не удалось сохранить токен:', e);
      }
    }

    const statusEl = document.getElementById('auth-status');
    if (statusEl) {
      statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: #4caf50;"></i> Авторизован';
      statusEl.style.color = '#4caf50';
    }

    const authBtn = document.getElementById('auth-btn');
    if (authBtn) authBtn.style.display = 'none';

    const signoutBtn = document.getElementById('signout-btn');
    if (signoutBtn) signoutBtn.style.display = 'block';

    showToast('✅ Авторизация успешна! Загружаем данные...', 'success');

    // Загружаем данные из Google Sheets
    await GoogleSheetsAPI.loadAllData();
    if (app) {
      app.loadPage(app.currentPage);
    }
  };

  const token = gapi.client.getToken();
  if (token === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

// Восстановление токена из localStorage
function restoreToken() {
  try {
    const saved = localStorage.getItem('oauth_token');
    if (!saved) return false;

    const tokenData = JSON.parse(saved);
    if (!tokenData.access_token) return false;

    // Проверяем, не истек ли токен
    if (tokenData.expires_at && Date.now() > tokenData.expires_at) {
      console.log('⏰ Токен истек, требуется повторная авторизация');
      localStorage.removeItem('oauth_token');
      return false;
    }

    // Восстанавливаем токен в gapi.client
    gapi.client.setToken({
      access_token: tokenData.access_token
    });

    console.log('✅ Токен восстановлен из localStorage');
    return true;
  } catch (e) {
    console.warn('Ошибка восстановления токена:', e);
    return false;
  }
}

// Функция выхода
function signOut() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken(null);
    isAuthorized = false;

    // Удаляем сохраненный токен
    localStorage.removeItem('oauth_token');
    console.log('🗑️ Токен удален из localStorage');

    const statusEl = document.getElementById('auth-status');
    if (statusEl) {
      statusEl.innerHTML = '<i class="fas fa-circle" style="color: #ff9800;"></i> Не авторизован';
      statusEl.style.color = '#ff9800';
    }

    const authBtn = document.getElementById('auth-btn');
    if (authBtn) authBtn.style.display = 'block';

    const signoutBtn = document.getElementById('signout-btn');
    if (signoutBtn) signoutBtn.style.display = 'none';

    showToast('Вы вышли из системы', 'info');

    // Очищаем данные
    appData = {
      cars: [], parts: [], serviceTypes: [], regulations: [],
      units: [], manufacturers: [], services: [], events: [],
      history: [], mileage: []
    };
    if (app) {
      app.loadPage(app.currentPage);
    }
  }
}

// ============================================
// КЛАСС ДЛЯ РАБОТЫ С GOOGLE SHEETS
// ============================================
class GoogleSheetsAPI {
  // Кеш для отслеживания изменений
  static dataCache = {};

  static async saveSheetIfChanged(sheetName, data) {
    const key = `sheet_${sheetName}`;
    const currentHash = JSON.stringify(data);

    // Проверяем, изменились ли данные
    if (this.dataCache[key] === currentHash) {
      console.log(`⏭️ ${sheetName} не изменился, пропускаем`);
      return true;
    }

    // Сохраняем и обновляем кеш
    const result = await this.writeSheet(sheetName, data);
    if (result) {
      this.dataCache[key] = currentHash;
    }
    return result;
  }

  static getHeaders(sheetName) {
    const headersMap = {
      'Автомобили': ['id', 'brand', 'model', 'year', 'color', 'plate', 'vin', 'mileage', 'notes', 'photo'],
      'Детали': ['id', 'name', 'characteristics'],
      'Виды_обслуживания': ['id', 'name', 'description', 'quantity', 'unitId'],
      'Регламенты': ['id', 'name'],
      'Единицы_измерения': ['id', 'name', 'shortName'],
      'Производители': ['id', 'name', 'partName', 'partCode'],
      'Обслуживание': ['id', 'carId', 'serviceTypeId', 'regulationId', 'quantity', 'unitId',
        'selectedManufacturers', 'comment', 'status',
        'lastServiceDate', 'lastServiceMileage',
        'isWearBased', 'wearTriggered'],
      'События': ['id', 'carId', 'serviceId', 'type', 'date', 'mileage', 'status',
        'partsNeeded', 'partsAvailable', 'baseDate', 'baseMileage',
        'completedDate', 'completedMileage', 'isWearEvent', 'comment'],
      'История': ['id', 'carId', 'serviceId', 'date', 'mileage', 'comment'],
      'Пробег': ['id', 'carId', 'value', 'date', 'note']
    };
    return headersMap[sheetName] || [];
  }

  static parseData(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        let value = row[i] || '';
        if (header === 'characteristics' && value) {
          try {
            obj[header] = JSON.parse(value);
          } catch {
            obj[header] = [];
          }
        } else if (header === 'selectedManufacturers' && value) {
          try {
            obj[header] = JSON.parse(value);
          } catch {
            obj[header] = value ? [value] : [];
          }
        } else if (header === 'quantity' && value) {
          obj[header] = parseFloat(value) || 0;
        } else if (header === 'isWearEvent') {
          obj[header] = value === 'true' || value === 'TRUE' || value === true || value === '1' || value === 1;
        } else {
          obj[header] = value;
        }
      });
      return obj;
    });
  }

  static async readSheet(sheetName) {
    try {
      showLoading(true);

      if (!isAuthorized) {
        console.warn('⚠️ Пользователь не авторизован');
        showToast('Требуется авторизация', 'warning');
        return [];
      }

      console.log(`📖 Чтение листа: ${sheetName}`);

      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: sheetName,
      });

      if (response.status === 200) {
        const data = this.parseData(response.result.values);
        console.log(`✅ Лист ${sheetName} прочитан: ${data.length} записей`);
        return data;
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка чтения листа ${sheetName}:`, error);
      if (error.status === 403) {
        showToast('Нет доступа к таблице. Проверьте права доступа.', 'error');
      } else if (error.status === 401) {
        showToast('Требуется повторная авторизация', 'warning');
        signOut();
      }
      return [];
    } finally {
      showLoading(false);
    }
  }

  static async writeSheet(sheetName, data) {
    try {
      if (!isAuthorized) {
        console.warn('⚠️ Пользователь не авторизован');
        showToast('Требуется авторизация для сохранения', 'warning');
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
          authBtn.style.display = 'block';
          authBtn.disabled = false;
          authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
        }
        return false;
      }

      console.log(`💾 Запись в лист: ${sheetName}, ${data.length} записей`);

      const headers = this.getHeaders(sheetName);
      const rows = [headers];

      data.forEach(item => {
        const row = headers.map(header => {
          let value = item[header] || '';
          if (header === 'characteristics' && typeof value === 'object') {
            value = JSON.stringify(value);
          } else if (header === 'selectedManufacturers' && Array.isArray(value)) {
            value = JSON.stringify(value);
          } else if (header === 'quantity' && value) {
            value = parseFloat(value).toString();
          } else if (header === 'isWearEvent') {
            value = value ? 'true' : 'false';
          }
          return value;
        });
        rows.push(row);
      });

      // Сначала очищаем лист
      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: CONFIG.SHEET_ID,
        range: sheetName,
      });

      // Записываем новые данные
      const response = await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: rows }
      });

      if (response.status === 200) {
        console.log(`✅ Лист ${sheetName} успешно записан`);
        return true;
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка записи в лист ${sheetName}:`, error);
      if (error.status === 401) {
        showToast('Сессия истекла. Авторизуйтесь заново.', 'error');
        localStorage.removeItem('oauth_token');
        signOut();
      } else if (error.status === 403) {
        showToast('Нет прав на запись. Проверьте доступ к таблице.', 'error');
      }
      return false;
    }
  }

  static async loadAllData() {
    try {
      if (!isAuthorized) {
        console.warn('⚠️ Пользователь не авторизован');
        showToast('Авторизуйтесь для загрузки данных', 'warning');
        return false;
      }

      showLoading(true);
      console.log('📥 Загрузка всех данных из Google Sheets...');

      const sheets = {
        cars: CONFIG.SHEETS.CARS,
        parts: CONFIG.SHEETS.PARTS,
        serviceTypes: CONFIG.SHEETS.SERVICE_TYPES,
        regulations: CONFIG.SHEETS.REGULATIONS,
        units: CONFIG.SHEETS.UNITS,
        manufacturers: CONFIG.SHEETS.MANUFACTURERS,
        services: CONFIG.SHEETS.SERVICE,
        events: CONFIG.SHEETS.EVENTS,
        history: CONFIG.SHEETS.HISTORY,
        mileage: CONFIG.SHEETS.MILEAGE
      };

      const results = await Promise.all(
        Object.values(sheets).map(name => this.readSheet(name))
      );

      const keys = Object.keys(sheets);
      keys.forEach((key, index) => {
        appData[key] = results[index] || [];
      });

      console.log('✅ Все данные загружены');
      showToast('Данные загружены из Google Sheets ✅', 'success');
      return true;
    } catch (error) {
      console.error('❌ Ошибка загрузки всех данных:', error);
      showToast('Ошибка загрузки данных', 'error');
      return false;
    } finally {
      showLoading(false);
    }
  }

  static async saveAllData() {
    try {
      if (!isAuthorized) {
        console.warn('⚠️ Пользователь не авторизован');
        showToast('Авторизуйтесь для сохранения данных', 'warning');
        return false;
      }

      console.log('💾 Сохранение измененных данных...');

      const sheets = {
        cars: CONFIG.SHEETS.CARS,
        parts: CONFIG.SHEETS.PARTS,
        serviceTypes: CONFIG.SHEETS.SERVICE_TYPES,
        regulations: CONFIG.SHEETS.REGULATIONS,
        units: CONFIG.SHEETS.UNITS,
        manufacturers: CONFIG.SHEETS.MANUFACTURERS,
        services: CONFIG.SHEETS.SERVICE,
        events: CONFIG.SHEETS.EVENTS,
        history: CONFIG.SHEETS.HISTORY,
        mileage: CONFIG.SHEETS.MILEAGE
      };

      let allSuccess = true;
      let index = 0;
      const entries = Object.entries(sheets);

      for (const [key, sheetName] of entries) {
        if (appData[key] !== undefined) {
          console.log(`💾 Проверка ${sheetName} (${index + 1}/${entries.length})...`);
          const success = await this.saveSheetIfChanged(sheetName, appData[key]);
          if (!success) allSuccess = false;

          if (index < entries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          index++;
        }
      }

      if (allSuccess) {
        console.log('✅ Все изменения сохранены');
        showToast('Данные сохранены ✅', 'success');
      } else {
        showToast('Часть данных не сохранена.', 'warning');
      }

      return allSuccess;
    } catch (error) {
      console.error('❌ Ошибка сохранения:', error);
      showToast('Ошибка сохранения данных', 'error');
      return false;
    } finally {
      showLoading(false);
    }
  }

  static async loadDemoData() {
    console.log('📦 Загрузка демо-данных...');

    // Автомобили
    appData.cars = [
      {
        id: '1',
        brand: 'Toyota',
        model: 'Camry',
        year: '2020',
        color: 'Серебристый',
        plate: 'A123BC',
        vin: 'JTDBE30K0000001',
        mileage: '45000',
        notes: 'Отличное состояние, полный привод',
        photo: ''
      },
      {
        id: '2',
        brand: 'BMW',
        model: 'X5',
        year: '2019',
        color: 'Черный',
        plate: 'B456CD',
        vin: 'WBAKR0100000002',
        mileage: '32000',
        notes: 'Полный привод, кожаный салон',
        photo: ''
      }
    ];

    // Виды обслуживания
    appData.serviceTypes = [
      {
        id: 'st1',
        name: 'Замена масла',
        description: 'Замена моторного масла и масляного фильтра',
        quantity: '10',
        unitId: 'u2'
      },
      {
        id: 'st2',
        name: 'Замена фильтров',
        description: 'Замена воздушного, салонного и топливного фильтров',
        quantity: '8',
        unitId: 'u1'
      },
      {
        id: 'st3',
        name: 'ТО',
        description: 'Комплексное техническое обслуживание',
        quantity: '5',
        unitId: 'u1'
      },
      {
        id: 'st4',
        name: 'Замена тормозных колодок',
        description: 'Замена передних и задних тормозных колодок',
        quantity: '4',
        unitId: 'u1'
      },
      {
        id: 'st5',
        name: 'Замена ремня ГРМ',
        description: 'Замена ремня газораспределительного механизма',
        quantity: '3',
        unitId: 'u1'
      }
    ];

    // Единицы измерения
    appData.units = [
      { id: 'u1', name: 'Штуки', shortName: 'шт' },
      { id: 'u2', name: 'Литр', shortName: 'л' },
      { id: 'u3', name: 'Килограмм', shortName: 'кг' },
      { id: 'u4', name: 'Метр', shortName: 'м' },
      { id: 'u5', name: 'Комплект', shortName: 'компл' }
    ];

    // Регламенты с примерами и обязательным "По износу"
    appData.regulations = [
      { id: 'r1', name: '10000 км' },
      { id: 'r2', name: '6 месяцев' },
      { id: 'r3', name: '1 год' },
      { id: 'r4', name: '30 дней' },
      { id: 'r5', name: 'По износу' } // <-- Обязательный системный регламент
    ];

    // Производители
    appData.manufacturers = [
      { id: 'm1', name: 'Castrol', partName: 'Масло моторное', partCode: 'CAST-5W30' },
      { id: 'm2', name: 'Mann-Filter', partName: 'Фильтр масляный', partCode: 'MANN-123' },
      { id: 'm3', name: 'Bosch', partName: 'Тормозные колодки', partCode: 'BOSCH-456' },
      { id: 'm4', name: 'Gates', partName: 'Ремень ГРМ', partCode: 'GATES-789' },
      { id: 'm5', name: 'NGK', partName: 'Свечи зажигания', partCode: 'NGK-789' }
    ];

    // Обслуживание
    appData.services = [
      {
        id: 's1',
        carId: '1',
        serviceTypeId: 'st1',
        regulationId: 'r1',
        quantity: '5',
        unitId: 'u2',
        selectedManufacturers: ['m1'],
        comment: 'Замена масла Castrol 5W-30, фильтр Mann',
        status: 'planned',
        lastServiceDate: '2024-01-15',
        lastServiceMileage: '40000',
        isWearBased: '',
        wearTriggered: ''
      },
      {
        id: 's2',
        carId: '2',
        serviceTypeId: 'st3',
        regulationId: 'r3',
        quantity: '1',
        unitId: 'u1',
        selectedManufacturers: [],
        comment: 'Комплексное ТО',
        status: 'planned',
        lastServiceDate: '2024-02-01',
        lastServiceMileage: '30000',
        isWearBased: '',
        wearTriggered: ''
      },
      {
        id: 's3',
        carId: '1',
        serviceTypeId: 'st2',
        regulationId: 'r5', // <-- Привязываем к "По износу"
        quantity: '1',
        unitId: 'u1',
        selectedManufacturers: ['m2'],
        comment: 'Пример: фильтр салонный - замена по износу',
        status: 'planned',
        lastServiceDate: '',
        lastServiceMileage: '',
        isWearBased: '',
        wearTriggered: ''
      }
    ];

    await this.saveAllData();

    // Показываем уведомления с задержкой
    setTimeout(() => {
      showToast('✅ Демо-данные загружены в таблицу!', 'success');
    }, 500);

    setTimeout(() => {
      showToast('ℹ️ В справочнике "Регламенты" есть обязательный пункт "По износу" 🔒', 'info');
    }, 1500);

    setTimeout(() => {
      showToast('💡 Для генерации событий нажмите "Сгенерировать" в разделе "События"', 'info');
    }, 2500);

    console.log('✅ Демо-данные успешно загружены');
  }
}

// ============================================
// ГЛАВНЫЙ КЛАСС ПРИЛОЖЕНИЯ
// ============================================
class AutoGarageApp {
  constructor() {
    this.currentPage = 'garage';
    this.editingId = null;
    this.selectedManufacturers = [];
    this.saveTimeout = null;

    // Проверяем наличие кнопок
    console.log('🔍 Проверка DOM элементов:');
    console.log('auth-btn:', document.getElementById('auth-btn'));
    console.log('signout-btn:', document.getElementById('signout-btn'));
    console.log('auth-status:', document.getElementById('auth-status'));

    this.init();
  }

  async init() {
    console.log('🚀 Инициализация приложения...');

    // Настройка предупреждения при закрытии
    this.setupBeforeUnload();

    // Проверяем авторизацию
    if (isAuthorized) {
      await GoogleSheetsAPI.loadAllData();
      this.resetUnsaved();

      // Проверяем, есть ли данные. Если нет - загружаем демо-данные
      const hasData = this.checkHasData();
      if (!hasData) {
        console.log('📦 Данные не найдены, загружаем демо-данные...');
        await GoogleSheetsAPI.loadDemoData();
        // Перезагружаем данные после загрузки демо
        await GoogleSheetsAPI.loadAllData();
      }

      // Обновляем статусы событий после загрузки
      this.updateEventsStatus();

      // Проверяем наличие обязательного регламента "По износу"
      this.ensureSystemRegulation();
    } else {
      console.log('⚠️ Ожидание авторизации...');
      document.getElementById('cars-grid').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-lock" style="font-size: 3rem; color: var(--primary);"></i>
                <h3>Требуется авторизация</h3>
                <p>Нажмите кнопку "Войти" в правом верхнем углу для доступа к данным</p>
            </div>
        `;
    }

    this.setupNavigation();
    this.setupTabs();
    this.setupModals();
    this.setupMobileMenu();
    this.setupMobileMenuClose();
    this.loadPage('garage');
  }

  // Проверка наличия данных
  checkHasData() {
    // Проверяем, есть ли данные в ключевых разделах
    const hasCars = appData.cars && appData.cars.length > 0;
    const hasServiceTypes = appData.serviceTypes && appData.serviceTypes.length > 0;
    const hasRegulations = appData.regulations && appData.regulations.length > 0;

    // Если есть хотя бы автомобили и виды обслуживания - считаем, что данные есть
    return hasCars && hasServiceTypes && hasRegulations;
  }

  // Проверка наличия системного регламента
  ensureSystemRegulation() {
    const hasWearRegulation = appData.regulations.some(r => r.name === 'По износу');
    if (!hasWearRegulation) {
      // Добавляем системный регламент, если его нет
      appData.regulations.push({
        id: 'system_wear_' + Date.now(),
        name: 'По износу'
      });
      console.log('✅ Добавлен системный регламент "По износу"');
      this.scheduleSave();
      // Обновляем отображение, если мы на странице регламентов
      if (this.currentPage === 'directories') {
        this.loadRegulations();
      }
    }
  }

  // Обновление статусов всех событий
  // Обновление статусов всех событий (упрощенная версия)
  updateEventsStatus() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let updatedCount = 0;

    for (const event of appData.events) {
      if (event.status === 'done') continue;

      const car = appData.cars.find(c => c.id === event.carId);
      let newStatus = event.status;

      if (event.type === 'date' && event.date) {
        const eventDate = parseDateAny(event.date);

        if (eventDate && !isNaN(eventDate.getTime())) {
          const diffTime = eventDate.getTime() - today.getTime();
          const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (daysUntil < 0) {
            newStatus = 'overdue';
          } else if (daysUntil <= 7) {
            newStatus = 'urgent';
          } else if (daysUntil <= 30) {
            newStatus = 'soon';
          } else {
            newStatus = 'scheduled';
          }
        }
      } else if (event.type === 'mileage' && event.mileage && car) {
        const currentMileage = parseFloat(car.mileage) || 0;
        const targetMileage = parseFloat(event.mileage) || 0;
        const kmLeft = targetMileage - currentMileage;

        if (kmLeft < 0) {
          newStatus = 'overdue';
        } else if (kmLeft <= 100) {
          newStatus = 'urgent';
        } else if (kmLeft <= 1000) {
          newStatus = 'soon';
        } else {
          newStatus = 'scheduled';
        }
      }

      if (newStatus !== event.status) {
        event.status = newStatus;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`✅ Обновлено статусов: ${updatedCount}`);
      this.scheduleSave();
    }
    return updatedCount;
  }

// ============================================
// МЕТОДЫ ДЛЯ РАБОТЫ С РЕГЛАМЕНТОМ "ПО ИЗНОСУ"
// ============================================

// Открыть модалку планирования замены по износу
  openWearEventModal(serviceId) {
    // Проверяем авторизацию
    if (!isAuthorized) {
      showToast('⚠️ Требуется авторизация', 'warning');
      return;
    }

    const service = appData.services.find(s => s.id === serviceId);
    if (!service) {
      showToast('Обслуживание не найдено', 'error');
      return;
    }

    const serviceType = appData.serviceTypes.find(st => st.id === service.serviceTypeId);
    const car = appData.cars.find(c => c.id === service.carId);
    const regulation = appData.regulations.find(r => r.id === service.regulationId);

    // Заполняем информацию
    const infoEl = document.getElementById('wearEventInfo');
    infoEl.innerHTML = `
        <div><strong>Автомобиль:</strong> ${car ? `${car.brand} ${car.model}` : 'Не найден'}</div>
        <div><strong>Вид обслуживания:</strong> ${serviceType ? serviceType.name : 'Не указан'}</div>
        <div><strong>Регламент:</strong> ${regulation ? regulation.name : 'По износу'}</div>
        ${service.quantity ? `<div><strong>Необходимо:</strong> ${service.quantity} ${this.getUnitName(service.unitId)}</div>` : ''}
        <div style="margin-top: 0.5rem; color: #ff9800; font-size: 0.85rem;">
            <i class="fas fa-exclamation-triangle"></i> Вы планируете замену по износу. Укажите дату или пробег, когда планируете выполнить замену.
        </div>
    `;

    // Сбрасываем форму
    document.getElementById('wearEventForm').reset();
    setDateFields('wearEventDate', 'wearEventDateText', '');
    document.getElementById('wearEventMileage').value = '';
    document.getElementById('wearEventComment').value = '';
    document.querySelector('input[name="wearType"][value="date"]').checked = true;
    document.getElementById('wearDateGroup').style.display = 'block';
    document.getElementById('wearMileageGroup').style.display = 'none';

    // Сохраняем ID обслуживания в data-атрибуте
    document.getElementById('wearEventModal').dataset.serviceId = serviceId;

    // Настраиваем синхронизацию даты
    setupDateSync('wearEventDate', 'wearEventDateText');

    // Переключение между типами
    document.querySelectorAll('input[name="wearType"]').forEach(radio => {
      radio.addEventListener('change', function() {
        if (this.value === 'date') {
          document.getElementById('wearDateGroup').style.display = 'block';
          document.getElementById('wearMileageGroup').style.display = 'none';
        } else {
          document.getElementById('wearDateGroup').style.display = 'none';
          document.getElementById('wearMileageGroup').style.display = 'block';
        }
      });
    });

    // Показываем модалку
    document.getElementById('wearEventModal').style.display = 'block';
    document.getElementById('wearEventDateText').focus();
  }

  // Обновление данных в существующих событиях
  async refreshEventsData() {
    if (!isAuthorized) {
      showToast('Требуется авторизация', 'warning');
      return;
    }

    if (appData.events.length === 0) {
      showToast('Нет событий для обновления', 'info');
      return;
    }

    let updatedCount = 0;

    // Обновляем данные о запчастях
    for (const event of appData.events) {
      // Находим обслуживание для этого события
      const service = appData.services.find(s => s.id === event.serviceId);
      if (!service) continue;

      // Находим вид обслуживания
      const serviceType = appData.serviceTypes.find(st => st.id === service.serviceTypeId);
      if (!serviceType) continue;

      // Получаем актуальные данные
      const partsNeeded = parseFloat(service.quantity) || 0;
      const partsAvailable = parseFloat(serviceType.quantity) || 0;

      // Обновляем только если данные изменились
      if (event.partsNeeded != partsNeeded || event.partsAvailable != partsAvailable) {
        event.partsNeeded = partsNeeded;
        event.partsAvailable = partsAvailable;
        updatedCount++;
      }
    }

    // Обновляем статусы
    const statusUpdated = this.updateEventsStatus();

    if (updatedCount > 0 || statusUpdated > 0) {
      await this.scheduleSave();
      this.loadEvents();
      showToast(`✅ Обновлено: запчастей - ${updatedCount}, статусов - ${statusUpdated}`, 'success');
    } else {
      showToast('Все события уже актуальны', 'info');
    }
  }

  // Фильтрация обслуживания по автомобилю
  filterServices() {
    this.loadServices();
  }

// Получить отфильтрованные записи обслуживания
  getFilteredServices() {
    const filter = document.getElementById('service-car-filter');
    const carId = filter ? filter.value : 'all';

    if (carId === 'all') {
      return appData.services;
    }

    return appData.services.filter(s => s.carId === carId);
  }

  // Поиск производителей
  filterManufacturers(searchText) {
    const container = document.getElementById('manufacturer-bubbles');
    if (!container) return;

    const bubbles = container.querySelectorAll('.bubble');
    const search = searchText.toLowerCase().trim();

    bubbles.forEach(bubble => {
      const text = bubble.textContent.toLowerCase();
      if (!search || text.includes(search)) {
        bubble.style.display = '';
      } else {
        bubble.style.display = 'none';
      }
    });
  }

  // Выбрать всех производителей
  selectAllManufacturers() {
    this.selectedManufacturers = appData.manufacturers.map(m => m.id);
    this.renderManufacturerBubbles();
    this.updateSelectedCount();
    showToast(`Выбрано ${this.selectedManufacturers.length} производителей`, 'info');
  }

  // Сбросить выбор
  clearAllManufacturers() {
    this.selectedManufacturers = [];
    this.renderManufacturerBubbles();
    this.updateSelectedCount();
    showToast('Выбор очищен', 'info');
  }

  // Обновить счетчик выбранных
  updateSelectedCount() {
    const countEl = document.getElementById('selected-count');
    if (countEl) {
      countEl.textContent = this.selectedManufacturers.length;
    }
  }

  // Переключение производителя (обновлено)
  toggleManufacturer(id) {
    const index = this.selectedManufacturers.indexOf(id);
    if (index === -1) {
      this.selectedManufacturers.push(id);
    } else {
      this.selectedManufacturers.splice(index, 1);
    }

    // Обновляем визуал
    const bubbles = document.querySelectorAll('.bubble');
    bubbles.forEach(el => {
      const isSelected = this.selectedManufacturers.includes(el.dataset.id);
      el.classList.toggle('selected', isSelected);
      // Обновляем иконку внутри
      const icon = el.querySelector('.fa-check-circle');
      if (isSelected && !icon) {
        const nameSpan = el.querySelector('.bubble-name');
        if (nameSpan) {
          const check = document.createElement('i');
          check.className = 'fas fa-check-circle';
          check.style.cssText = 'color: var(--success); margin-left: 4px;';
          nameSpan.after(check);
        }
      } else if (!isSelected && icon) {
        icon.remove();
      }
    });

    this.updateSelectedCount();
  }

  // Установка фокуса на первое поле в модальном окне
  focusFirstInput(modalId) {
    // Небольшая задержка для корректного отображения
    setTimeout(() => {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      // Ищем первое поле ввода (input, select, textarea)
      const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
      if (firstInput) {
        firstInput.focus();
        // Если это input или textarea - выделяем текст
        if (firstInput.tagName === 'INPUT' || firstInput.tagName === 'TEXTAREA') {
          firstInput.select();
        }
      }
    }, 150);
  }

  // Обновление выпадающего списка регламентов в форме обслуживания
  updateRegulationSelect() {
    const select = document.getElementById('serviceRegulation');
    if (!select) return;

    select.innerHTML = `<option value="">Без регламента</option>`;
    // Сортировка по алфавиту
    const sorted = [...appData.regulations].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(r => {
      select.innerHTML += `<option value="${r.id}">${r.name}</option>`;
    });
  }

  // Принудительная установка значений в форме обслуживания
  setServiceFormValues(service) {
    // Устанавливаем значения с задержкой для гарантии
    setTimeout(() => {
      if (service.carId) {
        document.getElementById('serviceCar').value = service.carId;
      }
      if (service.serviceTypeId) {
        document.getElementById('serviceType').value = service.serviceTypeId;
      }
      if (service.regulationId) {
        document.getElementById('serviceRegulation').value = service.regulationId;
      }
      document.getElementById('serviceQuantity').value = service.quantity || 0;
      if (service.unitId) {
        document.getElementById('serviceUnit').value = service.unitId;
      }
      document.getElementById('serviceComment').value = service.comment || '';
    }, 100);
  }

  // отложенное сохранение
  scheduleSave() {
    // Отменяем предыдущий таймаут
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Увеличиваем счетчик несохраненных
    this.incrementUnsaved();

    // Сохраняем через 3 секунды после последнего изменения
    this.saveTimeout = setTimeout(async () => {
      if (isSaving) return;

      try {
        isSaving = true;
        console.log('💾 Автосохранение...');

        // Проверяем авторизацию перед сохранением
        if (!isAuthorized) {
          console.warn('⚠️ Нет авторизации, пропускаем сохранение');
          this.decrementUnsaved();
          showToast('⚠️ Требуется повторная авторизация', 'warning');
          return;
        }

        const success = await GoogleSheetsAPI.saveAllData();

        if (success) {
          this.resetUnsaved();
        } else {
          // Если сохранение не удалось, уменьшаем счетчик, но оставляем данные
          this.decrementUnsaved();
          showToast('⚠️ Не удалось сохранить данные. Попробуйте позже.', 'warning');
        }
      } catch (error) {
        console.error('❌ Ошибка при сохранении:', error);
        this.decrementUnsaved();
        // Проверяем, не сброшена ли авторизация
        if (!isAuthorized) {
          showToast('⚠️ Сессия истекла. Авторизуйтесь заново.', 'warning');
          // Восстанавливаем кнопку входа
          const authBtn = document.getElementById('auth-btn');
          if (authBtn) {
            authBtn.style.display = 'block';
            authBtn.disabled = false;
            authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
          }
        }
      } finally {
        isSaving = false;
        this.saveTimeout = null;
      }
    }, AUTOSAVE_DELAY);
  }

  // Принудительное сохранение (можно вызвать вручную)
  async forceSave() {
    if (isSaving) {
      showToast('⏳ Сохранение уже выполняется...', 'info');
      return;
    }

    if (unsavedChanges === 0) {
      showToast('✅ Нет несохраненных изменений', 'success');
      return;
    }

    if (!isAuthorized) {
      showToast('⚠️ Требуется авторизация для сохранения', 'warning');
      // Восстанавливаем кнопку входа
      const authBtn = document.getElementById('auth-btn');
      if (authBtn) {
        authBtn.style.display = 'block';
        authBtn.disabled = false;
        authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
      }
      return;
    }

    isSaving = true;
    showToast('💾 Сохранение...', 'info');

    try {
      const success = await GoogleSheetsAPI.saveAllData();

      if (success) {
        this.resetUnsaved();
        showToast('✅ Все данные сохранены', 'success');
      } else {
        showToast('❌ Ошибка сохранения', 'error');
      }
    } catch (error) {
      console.error('❌ Ошибка при сохранении:', error);
      showToast('❌ Ошибка сохранения. Попробуйте еще раз.', 'error');
    } finally {
      isSaving = false;
    }
  }

  setupMobileMenuClose() {
    const navBottom = document.getElementById('nav-bottom');
    const menuBtn = document.querySelector('.mobile-menu-btn');

    // Закрытие при клике вне меню (только для мобильных)
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        const navbar = document.querySelector('.navbar');
        if (navBottom && navBottom.classList.contains('active')) {
          if (menuBtn && menuBtn.contains(e.target)) return;
          if (navBottom.contains(e.target) && e.target.tagName === 'A') {
            navBottom.classList.remove('active');
            navBottom.style.display = 'none';
            const icon = menuBtn?.querySelector('i');
            if (icon) {
              icon.classList.remove('fa-times');
              icon.classList.add('fa-bars');
            }
            return;
          }
          if (!navbar.contains(e.target)) {
            navBottom.classList.remove('active');
            navBottom.style.display = 'none';
            const icon = menuBtn?.querySelector('i');
            if (icon) {
              icon.classList.remove('fa-times');
              icon.classList.add('fa-bars');
            }
          }
        }
      }
    });

    // Закрытие при ресайзе окна
    window.addEventListener('resize', () => {
      const navBottom = document.getElementById('nav-bottom');
      const menuBtn = document.querySelector('.mobile-menu-btn');

      if (window.innerWidth > 768) {
        // На десктопе - показываем меню и убираем класс active
        if (navBottom) {
          navBottom.classList.remove('active');
          navBottom.style.display = 'flex'; // <-- ВОССТАНАВЛИВАЕМ ДЕСКТОПНЫЙ DISPLAY
          navBottom.style.height = '40px';
          navBottom.style.maxHeight = 'none';
          navBottom.style.overflowY = 'visible';
        }
        const icon = menuBtn?.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-times');
          icon.classList.add('fa-bars');
        }
      } else {
        // На мобильных - если меню не активно, скрываем
        if (navBottom && !navBottom.classList.contains('active')) {
          navBottom.style.display = 'none';
        }
      }
    });
  }

  setupNavigation() {
    document.querySelectorAll('.nav-menu a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        this.loadPage(page);

        // Закрываем мобильное меню
        if (window.innerWidth <= 768) {
          const navBottom = document.getElementById('nav-bottom');
          const menuBtn = document.querySelector('.mobile-menu-btn');
          if (navBottom && navBottom.classList.contains('active')) {
            navBottom.classList.remove('active');
            navBottom.style.display = 'none';
            const icon = menuBtn?.querySelector('i');
            if (icon) {
              icon.classList.remove('fa-times');
              icon.classList.add('fa-bars');
            }
          }
        }
      });
    });
  }

  setupMobileMenu() {
    // Этот метод больше не нужен, так как toggleMobileMenu обрабатывает всё
    console.log('✅ setupMobileMenu - обработка перенесена в toggleMobileMenu');
  }

  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        this.loadDirectoryData(tab);
      });
    });
  }

  loadPage(page) {
    this.currentPage = page;

    document.querySelectorAll('.nav-menu a').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    if (!isAuthorized) {
      this.showAuthRequired();
      return;
    }

    switch(page) {
      case 'garage': this.loadGarage(); break;
      case 'parts': this.loadParts(); break;
      case 'directories': this.loadDirectories(); break;
      case 'service': this.loadServices(); break;
      case 'events': this.loadEvents(); break;
      case 'history': this.loadHistory(); break;
      case 'mileage': this.loadMileage(); break;
      case 'settings': break;
    }
  }

  showAuthRequired() {
    const grid = document.getElementById('cars-grid');
    if (grid) {
      grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-lock" style="font-size: 3rem; color: var(--primary);"></i>
                    <h3>Требуется авторизация</h3>
                    <p>Нажмите кнопку "Войти" в правом верхнем углу</p>
                </div>
            `;
    }
  }

// ============================================
// УНИВЕРСАЛЬНАЯ СОРТИРОВКА
// ============================================

  // Переключение направления сортировки
  toggleSortDirection() {
    // Переключаем направление
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    console.log('🔄 Сортировка изменена на:', sortDirection);

    // Обновляем текст
    const label = document.getElementById('sort-label');
    if (label) {
      label.textContent = sortDirection === 'asc' ? 'По возрастанию' : 'По убыванию';
    }

    // Обновляем иконку
    const btn = document.getElementById('sort-btn');
    if (btn) {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
      }
    }

    console.log('🔍 toggleSortDirection вызван');
    console.log('Текущая страница:', this.currentPage);
    console.log('sortDirection до:', sortDirection);

    // Обновляем все списки
    this.loadPage(this.currentPage);

    showToast(`Сортировка: ${sortDirection === 'asc' ? 'по возрастанию' : 'по убыванию'}`, 'info');
  }

  // Универсальная функция сортировки массива
  sortData(data, field, type = 'string') {
    const direction = sortDirection === 'asc' ? 1 : -1;
    console.log(`📊 Сортировка ${field} (${type}) направление: ${direction}`);

    return [...data].sort((a, b) => {
      let valA = a[field] || '';
      let valB = b[field] || '';

      if (type === 'number') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
        return (valA - valB) * direction;
      } else if (type === 'date') {
        return (valA.localeCompare(valB)) * direction;
      } else {
        return (String(valA).localeCompare(String(valB))) * direction;
      }
    });
  }

  // Получить направление сортировки для отображения
  getSortIcon() {
    return sortDirection === 'asc' ? '↑' : '↓';
  }

// ============================================
// СЧЕТЧИК НЕСОХРАНЕННЫХ ИЗМЕНЕНИЙ
// ============================================

// Увеличить счетчик несохраненных изменений
  incrementUnsaved() {
    unsavedChanges++;
    this.updateUnsavedCounter();
  }

// Уменьшить счетчик несохраненных изменений
  decrementUnsaved() {
    unsavedChanges = Math.max(0, unsavedChanges - 1);
    this.updateUnsavedCounter();
  }

// Сбросить счетчик
  resetUnsaved() {
    unsavedChanges = 0;
    this.updateUnsavedCounter();
  }

// Обновить отображение счетчика
  updateUnsavedCounter() {
    const counter = document.getElementById('unsaved-counter');
    const countEl = document.getElementById('unsaved-count');

    if (!counter || !countEl) return;

    if (unsavedChanges > 0) {
      counter.style.display = 'inline-flex';
      countEl.textContent = unsavedChanges;

      // Меняем цвет в зависимости от количества
      if (unsavedChanges > 5) {
        counter.style.background = 'rgba(239,83,80,0.2)';
        counter.style.color = '#ef5350';
      } else if (unsavedChanges > 2) {
        counter.style.background = 'rgba(255,152,0,0.2)';
        counter.style.color = '#ff9800';
      } else {
        counter.style.background = 'rgba(79,195,247,0.15)';
        counter.style.color = '#4fc3f7';
      }
    } else {
      counter.style.display = 'none';
    }
  }

// Предупреждение при закрытии страницы
  setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      if (unsavedChanges > 0) {
        e.preventDefault();
        e.returnValue = `У вас есть ${unsavedChanges} несохраненных изменений. Вы уверены, что хотите покинуть страницу?`;
        return e.returnValue;
      }
    });
  }

  // ============================================
  // ГАРАЖ
  // ============================================
  loadGarage() {
    const grid = document.getElementById('cars-grid');
    if (!grid) return;

    if (!isAuthorized) {
      this.showAuthRequired();
      return;
    }

    if (appData.cars.length === 0) {
      grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-car" style="font-size: 3rem; color: var(--primary);"></i>
                <h3>Добро пожаловать в AutoGarage Pro!</h3>
                <p>Начните с добавления первого автомобиля или загрузите демо-данные.</p>
                <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1rem; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="showAddCarModal()">
                        <i class="fas fa-plus"></i> Добавить авто
                    </button>
                    <button class="btn btn-secondary" onclick="app.loadDemoData()">
                        <i class="fas fa-download"></i> Загрузить демо-данные
                    </button>
                </div>
            </div>
        `;
      return;
    }

    // Сортировка по марке и модели
    const sorted = this.sortData(appData.cars, 'brand');

    grid.innerHTML = sorted.map(car => `
            <div class="car-card">
                ${car.photo ? `<img src="${car.photo}" alt="${car.brand} ${car.model}" onerror="this.style.display='none'">` :
      `<div class="car-placeholder"><i class="fas fa-car"></i></div>`}
                <h3>${car.brand} ${car.model}</h3>
                <div class="car-info">
                    ${car.year ? `<div><i class="fas fa-calendar"></i> ${car.year}</div>` : ''}
                    ${car.color ? `<div><i class="fas fa-palette"></i> ${car.color}</div>` : ''}
                    ${car.plate ? `<div><i class="fas fa-id-card"></i> ${car.plate}</div>` : ''}
                    ${car.vin ? `<div><i class="fas fa-barcode"></i> ${car.vin}</div>` : ''}
                    <div><i class="fas fa-tachometer-alt"></i> ${this.formatMileage(car.mileage)} км</div>
                    ${car.notes ? `<div><i class="fas fa-sticky-note"></i> ${car.notes}</div>` : ''}
                </div>
                <div class="car-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.editCar('${car.id}')">
                        <i class="fas fa-edit"></i> Изменить
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteCar('${car.id}')">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        `).join('');
  }

  // метод для ручной загрузки демо-данных
  async loadDemoData() {
    if (!isAuthorized) {
      showToast('⚠️ Требуется авторизация', 'warning');
      return;
    }

    if (appData.cars.length > 0) {
      if (!confirm('У вас уже есть данные. Загрузить демо-данные заново? Это добавит примеры к вашим данным.')) {
        return;
      }
    }

    await GoogleSheetsAPI.loadDemoData();
    await GoogleSheetsAPI.loadAllData();
    this.loadPage(this.currentPage);
    showToast('✅ Демо-данные загружены!', 'success');
  }

  formatMileage(value) {
    if (!value) return '0';
    return parseInt(value).toLocaleString('ru-RU');
  }

  showAddCarModal() {
    this.editingId = null;
    document.getElementById('carModalTitle').textContent = 'Добавить автомобиль';
    document.getElementById('carForm').reset();
    document.getElementById('carId').value = '';
    document.getElementById('carModal').style.display = 'block';
    this.focusFirstInput('carModal');
  }

  editCar(id) {
    const car = appData.cars.find(c => c.id === id);
    if (!car) return;

    this.editingId = id;
    document.getElementById('carModalTitle').textContent = 'Редактировать автомобиль';
    document.getElementById('carId').value = car.id;
    document.getElementById('carBrand').value = car.brand || '';
    document.getElementById('carModel').value = car.model || '';
    document.getElementById('carYear').value = car.year || '';
    document.getElementById('carColor').value = car.color || '';
    document.getElementById('carPlate').value = car.plate || '';
    document.getElementById('carVin').value = car.vin || '';
    document.getElementById('carMileage').value = car.mileage || '';
    document.getElementById('carNotes').value = car.notes || '';
    document.getElementById('carPhoto').value = car.photo || '';
    document.getElementById('carModal').style.display = 'block';
    this.focusFirstInput('carModal');
  }

  async deleteCar(id) {
    if (!confirm('Удалить автомобиль?')) return;

    appData.cars = appData.cars.filter(c => c.id !== id);
    await this.scheduleSave();
    this.loadGarage();
    showToast('Автомобиль удален', 'success');
  }

  // ============================================
  // ДЕТАЛИ
  // ============================================
  loadParts() {
    const list = document.getElementById('parts-list');
    if (!list) return;

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    if (appData.parts.length === 0) {
      list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cogs"></i>
                    <p>Нет деталей. Добавьте первую!</p>
                </div>
            `;
      return;
    }

    // Сортировка по названию
    const sorted = this.sortData(appData.parts, 'name');

    list.innerHTML = sorted.map(part => `
            <div class="part-item">
                <div>
                    <div class="part-name">${part.name}</div>
                    ${part.characteristics && part.characteristics.length > 0 ? `
                        <div class="part-chars">
                            ${part.characteristics.map(c =>
      `<span class="char-tag">${c.name}: ${c.value}</span>`
    ).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="part-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.editPart('${part.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deletePart('${part.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
  }

  showAddPartModal() {
    this.editingId = null;
    document.getElementById('partModalTitle').textContent = 'Добавить деталь';
    document.getElementById('partForm').reset();
    document.getElementById('partId').value = '';
    document.getElementById('characteristics-container').innerHTML = `
            <div class="char-row">
                <input type="text" placeholder="Название характеристики" class="char-name">
                <input type="text" placeholder="Значение" class="char-value">
                <button type="button" onclick="app.removeCharacteristic(this)">✕</button>
            </div>
        `;
    document.getElementById('partModal').style.display = 'block';
    this.focusFirstInput('partModal');
  }

  editPart(id) {
    const part = appData.parts.find(p => p.id === id);
    if (!part) return;

    this.editingId = id;
    document.getElementById('partModalTitle').textContent = 'Редактировать деталь';
    document.getElementById('partId').value = part.id;
    document.getElementById('partName').value = part.name || '';

    const container = document.getElementById('characteristics-container');
    container.innerHTML = '';

    if (part.characteristics && part.characteristics.length > 0) {
      part.characteristics.forEach(c => {
        const row = document.createElement('div');
        row.className = 'char-row';
        row.innerHTML = `
                    <input type="text" placeholder="Название характеристики" class="char-name" value="${c.name}">
                    <input type="text" placeholder="Значение" class="char-value" value="${c.value}">
                    <button type="button" onclick="app.removeCharacteristic(this)">✕</button>
                `;
        container.appendChild(row);
      });
    } else {
      container.innerHTML = `
                <div class="char-row">
                    <input type="text" placeholder="Название характеристики" class="char-name">
                    <input type="text" placeholder="Значение" class="char-value">
                    <button type="button" onclick="app.removeCharacteristic(this)">✕</button>
                </div>
            `;
    }

    document.getElementById('partModal').style.display = 'block';
    this.focusFirstInput('partModal');
  }

  async deletePart(id) {
    if (!confirm('Удалить деталь?')) return;

    appData.parts = appData.parts.filter(p => p.id !== id);
    await this.scheduleSave();
    this.loadParts();
    showToast('Деталь удалена', 'success');
  }

  addCharacteristic() {
    const container = document.getElementById('characteristics-container');
    const row = document.createElement('div');
    row.className = 'char-row';
    row.innerHTML = `
            <input type="text" placeholder="Название характеристики" class="char-name">
            <input type="text" placeholder="Значение" class="char-value">
            <button type="button" onclick="app.removeCharacteristic(this)">✕</button>
        `;
    container.appendChild(row);
  }

  removeCharacteristic(btn) {
    const container = document.getElementById('characteristics-container');
    if (container.children.length > 1) {
      btn.parentElement.remove();
    }
  }

  // ============================================
  // СПРАВОЧНИКИ
  // ============================================
  loadDirectories() {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
      this.loadDirectoryData(activeTab.dataset.tab);
    }
  }

  loadDirectoryData(tab) {
    switch(tab) {
      case 'service-types': this.loadServiceTypes(); break;
      case 'regulations': this.loadRegulations(); break;
      case 'units': this.loadUnits(); break;
      case 'manufacturers': this.loadManufacturers(); break;
    }
  }

  loadServiceTypes() {
    const list = document.getElementById('service-types-list');
    if (!list) return;

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    if (appData.serviceTypes.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-wrench"></i><p>Нет видов обслуживания</p></div>`;
      return;
    }

    const unitMap = {};
    appData.units.forEach(u => unitMap[u.id] = u.shortName || u.name);

    // Сортировка по названию
    const sorted = this.sortData(appData.serviceTypes, 'name');

    list.innerHTML = sorted.map(item => `
        <div class="directory-item">
            <div class="info">
                <strong>${item.name}</strong>
                ${item.description ? `<span class="label">${item.description}</span>` : ''}
                <span class="label" style="color: var(--primary); font-weight: 600;">
                    В наличии: ${item.quantity || 0} ${unitMap[item.unitId] || ''}
                </span>
            </div>
            <div class="actions">
                <button class="btn btn-secondary btn-sm" onclick="app.editServiceType('${item.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="app.deleteServiceType('${item.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
  }

  showAddServiceTypeModal() {
    this.editingId = null;
    document.getElementById('serviceTypeModalTitle').textContent = 'Добавить вид обслуживания';
    document.getElementById('serviceTypeForm').reset();
    document.getElementById('serviceTypeId').value = '';
    document.getElementById('serviceTypeQuantity').value = '0';

    // Заполняем список единиц измерения
    const unitSelect = document.getElementById('serviceTypeUnit');
    unitSelect.innerHTML = `<option value="">Не указано</option>`;
    appData.units.forEach(u => {
      unitSelect.innerHTML += `<option value="${u.id}">${u.name} (${u.shortName || ''})</option>`;
    });

    document.getElementById('serviceTypeModal').style.display = 'block';
  }

  editServiceType(id) {
    const item = appData.serviceTypes.find(s => s.id === id);
    if (!item) return;

    this.editingId = id;
    document.getElementById('serviceTypeModalTitle').textContent = 'Редактировать вид обслуживания';
    document.getElementById('serviceTypeId').value = item.id;
    document.getElementById('serviceTypeName').value = item.name || '';
    document.getElementById('serviceTypeQuantity').value = item.quantity || 0;
    document.getElementById('serviceTypeDescription').value = item.description || '';

    // Заполняем список единиц измерения
    const unitSelect = document.getElementById('serviceTypeUnit');
    unitSelect.innerHTML = `<option value="">Не указано</option>`;
    appData.units.forEach(u => {
      const selected = u.id === item.unitId ? 'selected' : '';
      unitSelect.innerHTML += `<option value="${u.id}" ${selected}>${u.name} (${u.shortName || ''})</option>`;
    });

    document.getElementById('serviceTypeModal').style.display = 'block';
    this.focusFirstInput('serviceTypeModal');
  }

  async deleteServiceType(id) {
    if (!confirm('Удалить вид обслуживания?')) return;
    appData.serviceTypes = appData.serviceTypes.filter(s => s.id !== id);
    await this.scheduleSave();
    this.loadServiceTypes();
    showToast('Вид обслуживания удален', 'success');
  }

  loadRegulations() {
    const list = document.getElementById('regulations-list');
    if (!list) return;

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    if (appData.regulations.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-clock"></i><p>Нет регламентов</p></div>`;
      return;
    }

    // Сортировка по названию
    const sorted = this.sortData(appData.regulations, 'name');

    list.innerHTML = sorted.map(item => {
      const isSystem = item.name === 'По износу';
      return `
            <div class="directory-item ${isSystem ? 'system-item' : ''}">
                <div class="info">
                    <strong>${item.name}</strong>
                    ${isSystem ? `<span class="system-badge">🔒 Системный</span>` : ''}
                    ${isSystem ? `<span class="system-hint" style="font-size: 0.75rem; color: var(--gray);">Обязателен для работы функции "По износу"</span>` : ''}
                </div>
                <div class="actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.editRegulation('${item.id}')" ${isSystem ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteRegulation('${item.id}')" ${isSystem ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
  }

  showAddRegulationModal() {
    this.editingId = null;
    document.getElementById('regulationModalTitle').textContent = 'Добавить регламент';
    document.getElementById('regulationForm').reset();
    document.getElementById('regulationId').value = '';
    document.getElementById('regulationName').value = '';

    // Добавляем подсказку о формате
    const hint = document.querySelector('#regulationModal .form-group small');
    if (hint) {
      hint.innerHTML = '📌 Формат: <strong>число + пробел + единица</strong> (например: 10000 км, 6 месяцев, 1 год).';
    }

    document.getElementById('regulationModal').style.display = 'block';
    this.focusFirstInput('regulationModal');

    document.getElementById('regulationModal').style.display = 'block';
    this.focusFirstInput('regulationModal');
  }

  editRegulation(id) {
    const item = appData.regulations.find(r => r.id === id);
    if (!item) return;

    // Запрещаем редактирование обязательного регламента
    if (item.name === 'По износу') {
      showToast('⚠️ Регламент "По износу" является системным и не может быть изменен', 'warning');
      return;
    }

    this.editingId = id;
    document.getElementById('regulationModalTitle').textContent = 'Редактировать регламент';
    document.getElementById('regulationId').value = item.id;
    document.getElementById('regulationName').value = item.name || '';
    document.getElementById('regulationModal').style.display = 'block';
    this.focusFirstInput('regulationModal');
  }

  async deleteRegulation(id) {
    const item = appData.regulations.find(r => r.id === id);
    if (!item) return;

    // Запрещаем удаление обязательного регламента
    if (item.name === 'По износу') {
      showToast('⚠️ Регламент "По износу" является системным и не может быть удален', 'warning');
      return;
    }

    if (!confirm('Удалить регламент?')) return;
    appData.regulations = appData.regulations.filter(r => r.id !== id);
    await this.scheduleSave();
    this.loadRegulations();
    showToast('Регламент удален', 'success');
  }

  loadUnits() {
    const list = document.getElementById('units-list');
    if (!list) return;

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    if (appData.units.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-ruler"></i><p>Нет единиц измерения</p></div>`;
      return;
    }

    // Сортировка по названию
    const sorted = this.sortData(appData.units, 'name');

    list.innerHTML = sorted.map(item => `
      <div class="directory-item">
        <div class="info">
          <strong>${item.name}</strong>
          ${item.shortName ? `<span class="label">(${item.shortName})</span>` : ''}
        </div>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" onclick="app.editUnit('${item.id}')">
              <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-danger btn-sm" onclick="app.deleteUnit('${item.id}')">
              <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
  `).join('');
  }

  showAddUnitModal() {
    this.editingId = null;
    document.getElementById('unitModalTitle').textContent = 'Добавить единицу измерения';
    document.getElementById('unitForm').reset();
    document.getElementById('unitId').value = '';
    document.getElementById('unitModal').style.display = 'block';
    this.focusFirstInput('unitModal');
  }

  editUnit(id) {
    const item = appData.units.find(u => u.id === id);
    if (!item) return;

    this.editingId = id;
    document.getElementById('unitModalTitle').textContent = 'Редактировать единицу измерения';
    document.getElementById('unitId').value = item.id;
    document.getElementById('unitName').value = item.name || '';
    document.getElementById('unitShortName').value = item.shortName || '';
    document.getElementById('unitModal').style.display = 'block';
    this.focusFirstInput('unitModal');
  }

  async deleteUnit(id) {
    if (!confirm('Удалить единицу измерения?')) return;
    appData.units = appData.units.filter(u => u.id !== id);
    await this.scheduleSave();
    this.loadUnits();
    showToast('Единица измерения удалена', 'success');
  }

  loadManufacturers() {
    const list = document.getElementById('manufacturers-list');
    if (!list) return;

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    if (appData.manufacturers.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-industry"></i><p>Нет производителей</p></div>`;
      return;
    }

    // Сортировка по имени
    const sorted = this.sortData(appData.manufacturers, 'name');

    list.innerHTML = sorted.map(item => `
        <div class="manufacturer-card">
            <div class="manufacturer-info">
                <div class="manufacturer-name">
                    <strong>${item.name}</strong>
                    ${item.partCode ? `<span class="manufacturer-code">${item.partCode}</span>` : ''}
                </div>
                <div class="manufacturer-details">
                    ${item.partName ? `<span class="manufacturer-part">🔧 ${item.partName}</span>` : ''}
                    ${item.partCode ? `<span class="manufacturer-code-label">📋 Код: ${item.partCode}</span>` : ''}
                </div>
            </div>
            <div class="manufacturer-actions">
                <button class="btn btn-secondary btn-sm" onclick="app.editManufacturer('${item.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="app.deleteManufacturer('${item.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
  }

  showAddManufacturerModal() {
    this.editingId = null;
    document.getElementById('manufacturerModalTitle').textContent = 'Добавить производителя';
    document.getElementById('manufacturerForm').reset();
    document.getElementById('manufacturerId').value = '';
    document.getElementById('manufacturerModal').style.display = 'block';
    this.focusFirstInput('manufacturerModal');
  }

  editManufacturer(id) {
    const item = appData.manufacturers.find(m => m.id === id);
    if (!item) return;

    this.editingId = id;
    document.getElementById('manufacturerModalTitle').textContent = 'Редактировать производителя';
    document.getElementById('manufacturerId').value = item.id;
    document.getElementById('manufacturerName').value = item.name || '';
    document.getElementById('manufacturerPartName').value = item.partName || '';
    document.getElementById('manufacturerPartCode').value = item.partCode || '';
    document.getElementById('manufacturerModal').style.display = 'block';
    this.focusFirstInput('manufacturerModal');
  }

  async deleteManufacturer(id) {
    if (!confirm('Удалить производителя?')) return;
    appData.manufacturers = appData.manufacturers.filter(m => m.id !== id);
    await this.scheduleSave();
    this.loadManufacturers();
    this.renderManufacturerBubbles();
    showToast('Производитель удален', 'success');
  }

  // ============================================
  // ОБСЛУЖИВАНИЕ
  // ============================================
  loadServices() {
    const list = document.getElementById('service-list');
    if (!list) return;

    // Обновляем фильтр
    this.updateServiceFilter();

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    // Получаем отфильтрованные записи
    const filteredServices = this.getFilteredServices();

    if (filteredServices.length === 0) {
      const filter = document.getElementById('service-car-filter');
      const carId = filter ? filter.value : 'all';
      const carName = carId !== 'all' ? this.getCarName(carId) : '';
      list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tools"></i>
                <p>${carName ? `Нет записей обслуживания для автомобиля "${carName}"` : 'Нет записей обслуживания'}</p>
            </div>
        `;
      return;
    }

    const carMap = {};
    appData.cars.forEach(c => carMap[c.id] = `${c.brand} ${c.model}`);

    const serviceTypeMap = {};
    appData.serviceTypes.forEach(st => serviceTypeMap[st.id] = st.name);

    // Сортировка по виду обслуживания
    const sorted = this.sortData(filteredServices, 'serviceTypeId');

    list.innerHTML = sorted.map(service => {
      // Получаем информацию о производителях
      let manufacturerIds = [];
      try {
        if (typeof service.selectedManufacturers === 'string') {
          manufacturerIds = JSON.parse(service.selectedManufacturers);
        } else if (Array.isArray(service.selectedManufacturers)) {
          manufacturerIds = service.selectedManufacturers;
        }
      } catch (e) {
        manufacturerIds = [];
      }

      const manufacturers = manufacturerIds
        .map(id => appData.manufacturers.find(m => m.id === id))
        .filter(m => m !== undefined);

      // Создаем пузырьки производителей
      let manufacturersHtml = '';
      if (manufacturers.length > 0) {
        manufacturersHtml = `
                <div class="service-manufacturers">
                    ${manufacturers.map(m => `
                        <span class="service-manufacturer-bubble">
                            ${m.name}
                            ${m.partCode ? `<span class="bubble-code">${m.partCode}</span>` : ''}
                            ${m.partName ? `<span class="bubble-part">(${m.partName})</span>` : ''}
                        </span>
                    `).join('')}
                </div>
            `;
      }

      // Получаем название единицы измерения
      const unitName = service.unitId ? this.getUnitName(service.unitId) : '';
      // Получаем название и описание вида обслуживания
      const serviceType = appData.serviceTypes.find(st => st.id === service.serviceTypeId);
      const serviceTypeName = serviceType ? serviceType.name : 'Тип не указан';
      const serviceTypeDescription = serviceType ? serviceType.description : '';

      const lastService = service.lastServiceDate || service.lastServiceMileage;
      let lastServiceHtml = '';
      if (lastService) {
        let info = [];
        if (service.lastServiceDate) info.push(`📅 ${service.lastServiceDate}`);
        if (service.lastServiceMileage) info.push(`🛣️ ${this.formatMileage(service.lastServiceMileage)} км`);
        lastServiceHtml = `<div class="meta" style="font-size: 0.8rem; color: var(--success);">✅ Последнее: ${info.join(' | ')}</div>`;
      }

      const regulation = appData.regulations.find(r => r.id === service.regulationId);
      const isWearBased = regulation && regulation.name &&
        (regulation.name.toLowerCase().includes('износ') ||
          regulation.name.toLowerCase().includes('по износу'));

      // Проверяем наличие активных событий для этого обслуживания
      const hasActiveEvent = appData.events.some(e =>
        e.serviceId === service.id &&
        e.status !== 'done' &&
        (e.isWearEvent === true || e.isWearEvent === 'true' || e.isWearEvent === 'TRUE')
      );

      // Проверяем наличие активного события по износу
      const hasActiveWearEvent = appData.events.some(e =>
        e.serviceId === service.id && e.status !== 'done' && e.isWearEvent === true
      );

      // Индикатор события в карточке
      let eventIndicator = '';
      if (hasActiveEvent) {
        const isWear = hasActiveWearEvent;
        const icon = isWear ? '⚠️' : '📌';
        const label = isWear ? 'Замена по износу запланирована' : 'Есть запланированное событие';
        eventIndicator = `
                <div class="meta" style="font-size: 0.8rem; color: var(--warning);">
                    ${icon} ${label}
                </div>
            `;
      }

      // Кнопка для регламента "По износу"
      let wearButton = '';
      if (isWearBased) {
        // Проверяем, есть ли уже активное событие по износу для этого обслуживания
        const hasActiveWearEvent = appData.events.some(e =>
          e.serviceId === service.id && e.status !== 'done' && e.isWearEvent
        );

        if (!hasActiveWearEvent) {
          wearButton = `
            <button class="btn btn-warning btn-sm" onclick="app.openWearEventModal('${service.id}')" title="Запланировать замену по износу">
                <i class="fas fa-exclamation-triangle"></i> Планировать замену
            </button>
        `;
        } else {
          wearButton = `
            <span style="font-size: 0.8rem; color: var(--warning);">
                <i class="fas fa-clock"></i> Замена запланирована
            </span>
        `;
        }
      }

      return `
            <div class="service-item">
                <div class="info">
                    <div class="title">${serviceTypeName}</div>
                    ${serviceTypeDescription ? `<div class="meta" style="font-size: 0.8rem; color: var(--gray); font-style: italic;">${serviceTypeDescription}</div>` : ''}
                    <div class="meta" style="font-size: 0.85rem; color: var(--gray);">
                        <i class="fas fa-car" style="width: 16px;"></i> ${carMap[service.carId] || 'Авто удалено'}
                        ${service.quantity && service.quantity > 0 ? ` • <i class="fas fa-cube"></i> ${service.quantity} ${unitName}` : ''}
                        ${service.regulationId ? ` • <i class="fas fa-clock"></i> ${this.getRegulationName(service.regulationId)}` : ''}
                        
                    </div>
                    ${service.comment ? `<div class="meta" style="font-size: 0.85rem; color: var(--gray);">${service.comment}</div>` : ''}
                    ${lastServiceHtml}
                    ${manufacturersHtml}
                </div>
                <div class="actions" style="display: flex; gap: 0.3rem; flex-shrink: 0; align-items: center; flex-wrap: wrap;">
                    ${wearButton}
                    <button class="btn btn-secondary btn-sm" onclick="app.editService('${service.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteService('${service.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
  }

// Обновление фильтра автомобилей
  updateServiceFilter() {
    const filter = document.getElementById('service-car-filter');
    if (!filter) return;

    const currentValue = filter.value;
    filter.innerHTML = '<option value="all">Все автомобили</option>';
    appData.cars.forEach(c => {
      filter.innerHTML += `<option value="${c.id}">${c.brand} ${c.model}</option>`;
    });
    filter.value = currentValue;
  }

// Получить название автомобиля по ID
  getCarName(carId) {
    const car = appData.cars.find(c => c.id === carId);
    return car ? `${car.brand} ${car.model}` : '';
  }

  // Вспомогательные методы для отображения
  getUnitName(unitId) {
    if (!unitId) return '';
    const unit = appData.units.find(u => u.id === unitId);
    return unit ? unit.shortName || unit.name : '';
  }

  getRegulationName(regulationId) {
    if (!regulationId) return '';
    const reg = appData.regulations.find(r => r.id === regulationId);
    return reg ? reg.name : '';
  }

  // Редактирование обслуживания
  editService(id) {
    const service = appData.services.find(s => s.id === id);
    if (!service) {
      showToast('Запись не найдена', 'error');
      return;
    }

    console.log('Редактирование записи:', service);

    // Заполняем скрытое поле ID
    document.getElementById('serviceEditId').value = service.id;
    document.getElementById('serviceModalTitle').textContent = 'Редактировать обслуживание';

    // Заполняем select'ы перед установкой значений
    this.fillServiceFormSelects();

    // Устанавливаем значения
    this.setServiceFormValues(service);

    // Восстанавливаем выбранных производителей
    let manufacturerIds = [];
    try {
      if (typeof service.selectedManufacturers === 'string') {
        manufacturerIds = JSON.parse(service.selectedManufacturers);
      } else if (Array.isArray(service.selectedManufacturers)) {
        manufacturerIds = service.selectedManufacturers;
      }
    } catch (e) {
      manufacturerIds = [];
    }

    this.selectedManufacturers = manufacturerIds;
    this.renderManufacturerBubbles();
    this.updateSelectedCount();

    // Очищаем поиск
    document.getElementById('manufacturerSearch').value = '';

    // Открываем модальное окно
    document.getElementById('serviceModal').style.display = 'block';
    this.focusFirstInput('serviceModal');
  }

  // Заполнение select'ов в форме обслуживания
  fillServiceFormSelects() {
    // Автомобили
    const carSelect = document.getElementById('serviceCar');
    carSelect.innerHTML = '<option value="">Выберите автомобиль</option>';
    appData.cars.forEach(c => {
      carSelect.innerHTML += `<option value="${c.id}">${c.brand} ${c.model}</option>`;
    });

    // Виды обслуживания
    const typeSelect = document.getElementById('serviceType');
    typeSelect.innerHTML = '<option value="">Выберите вид обслуживания</option>';
    appData.serviceTypes.forEach(st => {
      typeSelect.innerHTML += `<option value="${st.id}">${st.name}</option>`;
    });

    // Регламенты
    this.updateRegulationSelect();

    // Единицы измерения
    const unitSelect = document.getElementById('serviceUnit');
    unitSelect.innerHTML = `<option value="">Не указано</option>`;
    appData.units.forEach(u => {
      unitSelect.innerHTML += `<option value="${u.id}">${u.name} (${u.shortName || ''})</option>`;
    });
  }

  showAddServiceModal() {
    this.openAddServiceModal();
  }

// Открыть форму обслуживания для добавления
  openAddServiceModal() {
    document.getElementById('serviceEditId').value = '';
    document.getElementById('serviceModalTitle').textContent = 'Добавить обслуживание';
    document.getElementById('serviceForm').reset();
    document.getElementById('serviceQuantity').value = '0';
    this.selectedManufacturers = [];
    this.renderManufacturerBubbles();
    this.updateSelectedCount();
    document.getElementById('manufacturerSearch').value = '';

    // Заполняем списки
    this.fillServiceFormSelects();

    document.getElementById('serviceModal').style.display = 'block';
    this.focusFirstInput('serviceModal');
  }

  // Быстрое добавление производителя из формы обслуживания
  openAddManufacturerFromService() {
    console.log('🔧 Открытие быстрого добавления производителя');

    // Сохраняем текущее состояние формы
    const currentState = {
      serviceId: document.getElementById('serviceEditId').value,
      car: document.getElementById('serviceCar').value,
      type: document.getElementById('serviceType').value,
      regulation: document.getElementById('serviceRegulation').value,
      quantity: document.getElementById('serviceQuantity').value,
      unit: document.getElementById('serviceUnit').value,
      comment: document.getElementById('serviceComment').value,
      selectedManufacturers: [...this.selectedManufacturers]
    };

    // Сохраняем состояние в data-атрибуте модалки
    const modal = document.getElementById('manufacturerModal');
    modal.dataset.fromService = 'true';
    modal.dataset.serviceState = JSON.stringify(currentState);

    // Настраиваем заголовок
    document.getElementById('manufacturerModalTitle').textContent = '➕ Быстрое добавление производителя';

    // Очищаем форму
    document.getElementById('manufacturerForm').reset();
    document.getElementById('manufacturerId').value = '';

    // СНАЧАЛА ПОКАЗЫВАЕМ МОДАЛКУ ПРОИЗВОДИТЕЛЯ
    modal.style.display = 'block';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.zIndex = '10001'; // <-- ПРИНУДИТЕЛЬНО УСТАНАВЛИВАЕМ Z-INDEX

    // Убеждаемся, что модалка обслуживания не перекрывает
    const serviceModal = document.getElementById('serviceModal');
    if (serviceModal) {
      serviceModal.style.zIndex = '9998'; // <-- УМЕНЬШАЕМ Z-INDEX У СЕРВИСНОЙ МОДАЛКИ
    }

    // Устанавливаем фокус
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type="hidden"])');
      if (firstInput) {
        firstInput.focus();
      }
    }, 200);

    console.log('✅ Модальное окно производителя открыто');
  }

  renderManufacturerBubbles() {
    const container = document.getElementById('manufacturer-bubbles');
    if (!container) return;

    // Очищаем контейнер
    container.innerHTML = '';

    if (appData.manufacturers.length === 0) {
      container.innerHTML = '<span style="color: #999; font-size: 0.9rem;">Нет производителей</span>';
      return;
    }

    // Сортируем по имени
    const sorted = [...appData.manufacturers].sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach(m => {
      const isSelected = this.selectedManufacturers.includes(m.id);
      const bubble = document.createElement('span');
      bubble.className = `bubble ${isSelected ? 'selected' : ''}`;
      bubble.dataset.id = m.id;
      bubble.innerHTML = `
            <span class="bubble-name">${m.name}</span>
            ${m.partCode ? `<span class="bubble-code" style="font-size: 0.7rem; color: #999; margin-left: 4px;">${m.partCode}</span>` : ''}
            ${m.partName ? `<span class="bubble-part" style="font-size: 0.7rem; color: #666; margin-left: 4px;">(${m.partName})</span>` : ''}
            ${isSelected ? `<i class="fas fa-check-circle" style="color: var(--success); margin-left: 4px;"></i>` : ''}
        `;
      bubble.onclick = () => app.toggleManufacturer(m.id);
      container.appendChild(bubble);
    });

    this.updateSelectedCount();
  }

  async deleteService(id) {
    if (!confirm('Удалить запись обслуживания?')) return;
    appData.services = appData.services.filter(s => s.id !== id);
    await this.scheduleSave();
    this.loadServices();
    showToast('Запись удалена', 'success');
  }

  // ============================================
  // СОБЫТИЯ - ОБНОВЛЕННЫЕ МЕТОДЫ
  // ============================================

  // Фильтрация событий
  filterEvents() {
    this.loadEvents();
  }

  // Получить отфильтрованные события
  getFilteredEvents() {
    const carFilter = document.getElementById('event-car-filter');
    const statusFilter = document.getElementById('event-status-filter');

    const carId = carFilter ? carFilter.value : 'all';
    const status = statusFilter ? statusFilter.value : 'all';

    let events = appData.events;

    // Фильтр по автомобилю
    if (carId !== 'all') {
      events = events.filter(e => e.carId === carId);
    }

    // Фильтр по статусу
    if (status !== 'all' && status !== 'active') {
      // Для конкретных статусов - фильтруем
      events = events.filter(e => e.status === status);
    } else if (status === 'active') {
      // Активные = все кроме выполненных
      events = events.filter(e => e.status !== 'done');
    }
    // status === 'all' - показываем все

    return events;
  }

  // Обновление фильтра автомобилей для событий
  updateEventFilter() {
    const filter = document.getElementById('event-car-filter');
    if (!filter) return;

    const currentValue = filter.value;
    filter.innerHTML = '<option value="all">Все автомобили</option>';
    appData.cars.forEach(c => {
      filter.innerHTML += `<option value="${c.id}">${c.brand} ${c.model}</option>`;
    });
    filter.value = currentValue;
  }

  // Обновление loadEvents()
  loadEvents() {
    const list = document.getElementById('events-list');
    if (!list) return;

    // Обновляем статусы событий перед отображением
    this.updateEventsStatus();

    // Обновляем фильтры
    this.updateEventFilter();

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    // Получаем отфильтрованные события
    const filteredEvents = this.getFilteredEvents();

    if (filteredEvents.length === 0) {
      const carFilter = document.getElementById('event-car-filter');
      const statusFilter = document.getElementById('event-status-filter');
      const carId = carFilter ? carFilter.value : 'all';
      const status = statusFilter ? statusFilter.value : 'all'; // <-- ИСПРАВЛЕНО: было 'active'

      let message = 'Нет событий';
      if (carId !== 'all') {
        const carName = this.getCarName(carId);
        message += ` для автомобиля "${carName}"`;
      }
      if (status !== 'all' && status !== 'active') {
        const statusNames = {
          'urgent': 'со статусом "Срочные"',
          'overdue': 'со статусом "Просроченные"',
          'done': 'со статусом "Выполненные"',
          'soon': 'со статусом "Скоро"',
          'scheduled': 'со статусом "Запланированные"'
        };
        message += ` ${statusNames[status] || ''}`;
      } else if (status === 'active') {
        message += ' со статусом "Активные"';
      }

      list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-alt"></i>
                <p>${message}.</p>
            </div>
        `;
      return;
    }

    const carMap = {};
    appData.cars.forEach(c => carMap[c.id] = `${c.brand} ${c.model}`);

    // Сортировка: сначала по статусу (по приоритету), затем по дате/пробегу
    const priority = { 'overdue': 0, 'urgent': 1, 'soon': 2, 'scheduled': 3, 'done': 4 };

    // Используем кастомную сортировку с учетом направления
    const direction = sortDirection === 'asc' ? 1 : -1;

    const sorted = [...filteredEvents].sort((a, b) => {
      // Сначала сортируем по статусу
      const priorityA = priority[a.status] || 5;
      const priorityB = priority[b.status] || 5;
      if (priorityA !== priorityB) {
        return (priorityA - priorityB) * direction;
      }

      // Затем по дате или пробегу
      let valA = a.date || a.mileage || '';
      let valB = b.date || b.mileage || '';
      return valA.localeCompare(valB) * direction;
    });

    list.innerHTML = sorted.map(event => {
      const statusText = this.getEventStatusText(event.status);
      const statusClass = `status-${event.status}`;

      // Получаем данные о запчастях
      const partsNeeded = parseFloat(event.partsNeeded) || 0;
      const partsAvailable = parseFloat(event.partsAvailable) || 0;
      const progress = partsNeeded > 0 ? Math.min((partsAvailable / partsNeeded) * 100, 100) : 0;

      // Определяем статус прогресса
      let progressStatus = '';
      if (progress < 30) progressStatus = 'danger';
      else if (progress < 70) progressStatus = 'warning';
      else progressStatus = 'success';

      // Получаем единицу измерения
      const service = appData.services.find(s => s.id === event.serviceId);
      const unitName = service ? this.getUnitName(service.unitId) : '';

      // Получаем название вида обслуживания
      const serviceType = service ? appData.serviceTypes.find(st => st.id === service.serviceTypeId) : null;
      const serviceTypeName = serviceType ? serviceType.name : 'Обслуживание';

      // Формируем информацию о базе расчета
      let baseInfo = '';
      if (event.baseDate) {
        baseInfo = `📅 База: ${event.baseDate}`;
      } else if (event.baseMileage) {
        baseInfo = `🛣️ База: ${this.formatMileage(event.baseMileage)} км`;
      }

      // Показываем раздел запчастей только если partsNeeded > 0
      let partsHtml = '';
      if (partsNeeded > 0) {
        partsHtml = `
                <div class="progress-container">
                    <span style="font-size: 0.85rem;">
                        <i class="fas fa-cube"></i> Необходимо: ${partsNeeded} ${unitName} | 
                        <i class="fas fa-check-circle"></i> В наличии: ${partsAvailable} ${unitName}
                    </span>
                    <div class="progress-bar">
                        <div class="progress-fill ${progressStatus}" 
                             style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
      }

      const isWear = event.isWearEvent === true || event.isWearEvent === 'true' || event.isWearEvent === 'TRUE';

      let wearBadge = '';
      if (isWear) {
        wearBadge = `<span style="font-size: 0.7rem; background: var(--warning); color: white; padding: 0.1rem 0.5rem; border-radius: 10px; margin-left: 0.5rem;">⚠️ По износу</span>`;
      }

      let commentHtml = '';
      if (event.comment) {
        commentHtml = `<div class="details" style="font-size: 0.8rem; color: var(--gray); font-style: italic;">${event.comment}</div>`;
      }

      return `
          <div class="event-card ${statusClass}">
              <div class="event-info">
                  <div class="title">${serviceTypeName} ${wearBadge}</div>
                  ${commentHtml}
                  <div class="details">
                      <i class="fas fa-car"></i> ${carMap[event.carId] || 'Авто удалено'}
                      ${event.type === 'date' ? ` • 📅 ${event.date}` : ` • 🛣️ ${this.formatMileage(event.mileage)} км`}
                  </div>
                  ${baseInfo ? `<div class="details" style="font-size: 0.8rem; color: var(--gray);">${baseInfo}</div>` : ''}
                  ${partsHtml}
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  <span class="event-status">${statusText}</span>
                  ${event.status !== 'done' ? `
                      <button class="btn btn-success btn-sm" onclick="app.completeEvent('${event.id}')">
                          <i class="fas fa-check"></i> Выполнено
                      </button>
                  ` : ''}
                  ${isWear ? `
                      <button class="btn btn-danger btn-sm" onclick="app.deleteEvent('${event.id}')" title="Удалить запланированную замену по износу">
                          <i class="fas fa-trash"></i>
                      </button>
                  ` : ''}
              </div>
          </div>
      `;
    }).join('');
  }

  getEventStatusText(status) {
    const map = {
      'overdue': '🔴 Просрочено',
      'urgent': '🟠 Срочно!',
      'soon': '🟡 Скоро',
      'scheduled': '🔵 Запланировано',
      'done': '🟢 Выполнено'
    };
    return map[status] || status;
  }

  async generateEvents() {
    if (!isAuthorized) {
      showToast('Требуется авторизация', 'warning');
      return;
    }

    if (appData.cars.length === 0) {
      showToast('Нет автомобилей для генерации событий', 'warning');
      return;
    }

    const now = new Date();
    const events = [];
    const periodRegex = /(\d+)\s*(км|km|мес|месяц|месяцев|месяца|год|лет|года|день|дней|дня)/i;

    for (const car of appData.cars) {
      const carServices = appData.services.filter(s => s.carId === car.id);

      for (const service of carServices) {
        if (!service.regulationId) continue;

        const regulation = appData.regulations.find(r => r.id === service.regulationId);
        if (!regulation || !regulation.name) continue;

        // ПРОВЕРКА: если регламент "По износу" - пропускаем автоматическую генерацию
        if (regulation.name.toLowerCase().includes('износ') ||
          regulation.name.toLowerCase().includes('по износу')) {
          console.log(`⏭️ Регламент "По износу" для ${service.id} - пропускаем автоматическую генерацию`);
          continue;
        }

        const periodMatch = regulation.name.match(periodRegex);
        if (!periodMatch) {
          console.log(`⚠️ Не удалось распарсить период из: ${regulation.name}`);
          continue;
        }

        const value = parseInt(periodMatch[1]);
        const unit = periodMatch[2].toLowerCase();

        // Проверяем, есть ли уже активное событие для этого обслуживания
        const existingEvent = appData.events.find(e =>
          e.serviceId === service.id && e.status !== 'done'
        );

        if (existingEvent) {
          console.log(`⏭️ Уже есть активное событие для ${service.id}`);
          continue;
        }

        // Определяем базовые данные
        let baseDate = service.lastServiceDate || null;
        let baseMileage = service.lastServiceMileage || null;

        // Если нет базы - запрашиваем у пользователя
        if (!baseDate && !baseMileage) {
          const userInput = await this.askForServiceBase(service, car);
          if (!userInput) {
            console.log(`⏭️ Пользователь отменил ввод для ${service.id}`);
            continue;
          }

          if (userInput.type === 'previous') {
            // Пользователь ввел данные о предыдущем обслуживании
            baseDate = userInput.date || null;
            baseMileage = userInput.mileage || null;

            // Сохраняем в запись обслуживания
            service.lastServiceDate = baseDate;
            service.lastServiceMileage = baseMileage;
            await this.scheduleSave();
          } else if (userInput.type === 'next') {
            // Пользователь ввел данные о предстоящем событии
            // Создаем событие с указанными данными
            const event = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
              carId: car.id,
              serviceId: service.id,
              type: userInput.mileage ? 'mileage' : 'date',
              date: userInput.date || '',
              mileage: userInput.mileage || '',
              status: 'scheduled',
              partsNeeded: parseFloat(service.quantity) || 0,
              partsAvailable: parseFloat(appData.serviceTypes.find(st => st.id === service.serviceTypeId)?.quantity) || 0,
              baseDate: userInput.date || '',
              baseMileage: userInput.mileage || '',
              completedDate: '',
              completedMileage: ''
            };
            events.push(event);
            continue;
          }
        }

        // Если все еще нет базы - пропускаем
        if (!baseDate && !baseMileage) {
          console.log(`⚠️ Нет базы для расчета события для ${car.brand} ${car.model}: ${service.id}`);
          continue;
        }

        // Рассчитываем следующее событие
        let nextDate = null;
        let nextMileage = null;

        if (unit.includes('км') || unit === 'km') {
          if (baseMileage) {
            nextMileage = parseFloat(baseMileage) + value;
          } else if (baseDate) {
            const d = new Date(baseDate);
            if (unit === 'days') d.setDate(d.getDate() + value);
            else if (unit === 'months') d.setMonth(d.getMonth() + value);
            else if (unit === 'years') d.setFullYear(d.getFullYear() + value);
            nextDate = d.toISOString().split('T')[0];
          }
        } else {
          const d = new Date(baseDate || now);
          if (unit.includes('мес') || unit === 'months') {
            d.setMonth(d.getMonth() + value);
          } else if (unit.includes('год') || unit === 'years') {
            d.setFullYear(d.getFullYear() + value);
          } else if (unit.includes('день') || unit === 'days') {
            d.setDate(d.getDate() + value);
          }
          nextDate = d.toISOString().split('T')[0];
        }

        // Проверяем дубликаты
        const exists = appData.events.some(e =>
          e.serviceId === service.id &&
          e.status !== 'done' &&
          ((e.type === 'mileage' && parseFloat(e.mileage) === nextMileage) ||
            (e.type === 'date' && e.date === nextDate))
        );

        if (exists) continue;

        // Определяем статус
        let status = 'scheduled';
        if (nextDate) {
          const daysUntil = Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24));
          if (daysUntil < 0) status = 'overdue';
          else if (daysUntil <= 7) status = 'urgent';
          else if (daysUntil <= 30) status = 'soon';
        } else if (nextMileage) {
          const kmLeft = nextMileage - (parseFloat(car.mileage) || 0);
          if (kmLeft < 0) status = 'overdue';
          else if (kmLeft <= 100) status = 'urgent';
          else if (kmLeft <= 1000) status = 'soon';
        }

        const serviceType = appData.serviceTypes.find(st => st.id === service.serviceTypeId);
        const eventDate = new Date(nextDate);
        const formattedDate = `${String(eventDate.getDate()).padStart(2, '0')}.${String(eventDate.getMonth() + 1).padStart(2, '0')}.${eventDate.getFullYear()}`;

        const event = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
          carId: car.id,
          serviceId: service.id,
          type: nextMileage ? 'mileage' : 'date',
          date: nextMileage ? '' : formattedDate,
          mileage: nextMileage ? nextMileage.toString() : '',
          status: status,
          partsNeeded: parseFloat(service.quantity) || 0,
          partsAvailable: parseFloat(serviceType?.quantity) || 0,
          baseDate: baseDate || '',
          baseMileage: baseMileage || '',
          completedDate: '',
          completedMileage: ''
        };
        events.push(event);
      }
    }

    // Добавляем новые события
    appData.events = [...appData.events, ...events];

    // Обновляем статусы всех событий
    this.updateEventsStatus();

    await this.scheduleSave();
    this.loadEvents();
    this.loadServices();
    showToast(`Сгенерировано ${events.length} новых событий`, 'success');
  }

  // Диалог запроса данных у пользователя
  askForServiceBase(service, car) {
    return new Promise((resolve) => {
      const serviceType = appData.serviceTypes.find(st => st.id === service.serviceTypeId);
      const serviceTypeName = serviceType ? serviceType.name : 'Обслуживание';
      const regulation = appData.regulations.find(r => r.id === service.regulationId);

      // Заполняем информацию в модалке
      const infoEl = document.getElementById('eventBaseModalInfo');
      infoEl.innerHTML = `
            <div><strong>Автомобиль:</strong> ${car.brand} ${car.model}</div>
            <div><strong>Вид обслуживания:</strong> ${serviceTypeName}</div>
            ${regulation ? `<div><strong>Регламент:</strong> ${regulation.name}</div>` : ''}
            ${service.quantity ? `<div><strong>Необходимо:</strong> ${service.quantity} ${this.getUnitName(service.unitId)}</div>` : ''}
            <div style="margin-top: 0.5rem; color: #999; font-size: 0.85rem;">
                <i class="fas fa-info-circle"></i> Нет данных о предыдущем обслуживании. Выберите тип ввода и заполните поля.
            </div>
        `;

      // Устанавливаем значения по умолчанию
      setDateFields('eventBaseDate', 'eventBaseDateText', '');
      document.getElementById('eventBaseMileage').value = '';
      document.querySelector('input[name="baseType"][value="previous"]').checked = true;

      // Настраиваем синхронизацию даты
      setupDateSync('eventBaseDate', 'eventBaseDateText');

      // Показываем модалку
      document.getElementById('eventBaseModal').style.display = 'block';
      document.getElementById('eventBaseDateText').focus();

      // Обработчик формы
      const form = document.getElementById('eventBaseForm');
      const submitHandler = async (e) => {
        e.preventDefault();

        const type = document.querySelector('input[name="baseType"]:checked').value;
        let date = getDateValue('eventBaseDate', 'eventBaseDateText');
        let mileage = document.getElementById('eventBaseMileage').value.trim();

        // Валидация
        if (date && !validateDate(date)) {
          showToast('❌ Неверный формат даты. Используйте ГГГГ-ММ-ДД', 'error');
          return;
        }

        if (date && new Date(date) > new Date()) {
          if (type === 'previous') {
            showToast('❌ Дата предыдущего обслуживания не может быть в будущем', 'error');
            return;
          }
        }

        if (mileage && isNaN(parseFloat(mileage))) {
          showToast('❌ Введите корректное значение пробега', 'error');
          return;
        }

        if (type === 'previous' && !date && !mileage) {
          showToast('❌ Введите хотя бы дату или пробег для предыдущего обслуживания', 'error');
          return;
        }

        if (type === 'next' && !date && !mileage) {
          showToast('❌ Введите дату или пробег для предстоящего события', 'error');
          return;
        }

        closeModal('eventBaseModal');
        form.removeEventListener('submit', submitHandler);
        resolve({ type: type, date: date, mileage: mileage });
      };

      form.addEventListener('submit', submitHandler);

      // Обработчик закрытия модалки
      const closeHandler = () => {
        form.removeEventListener('submit', submitHandler);
        document.getElementById('eventBaseModal').removeEventListener('close', closeHandler);
        resolve(null);
      };
      document.getElementById('eventBaseModal').addEventListener('close', closeHandler);
    });
  }

  async completeEvent(id) {
    const event = appData.events.find(e => e.id === id);
    if (!event) {
      showToast('Событие не найдено', 'error');
      return;
    }

    const service = appData.services.find(s => s.id === event.serviceId);
    const serviceType = service ? appData.serviceTypes.find(st => st.id === service.serviceTypeId) : null;
    const serviceTypeName = serviceType ? serviceType.name : 'Обслуживание';
    const car = appData.cars.find(c => c.id === event.carId);

    // Заполняем информацию в модалке
    const infoEl = document.getElementById('eventCompleteInfo');
    infoEl.innerHTML = `
        <div><strong>Автомобиль:</strong> ${car ? `${car.brand} ${car.model}` : 'Не найден'}</div>
        <div><strong>Вид обслуживания:</strong> ${serviceTypeName}</div>
        <div><strong>Тип события:</strong> ${event.type === 'date' ? '📅 По дате' : '🛣️ По пробегу'}</div>
        <div><strong>Планируемая дата/пробег:</strong> ${event.date || event.mileage}</div>
        ${event.partsNeeded ? `<div><strong>Необходимо:</strong> ${event.partsNeeded} ${this.getUnitName(service?.unitId)}</div>` : ''}
    `;

    // Устанавливаем значения по умолчанию
    setDateFields('eventCompleteDate', 'eventCompleteDateText', getTodayDate());
    document.getElementById('eventCompleteMileage').value = event.mileage || '';

    // Настраиваем синхронизацию даты
    setupDateSync('eventCompleteDate', 'eventCompleteDateText');

    // Показываем модалку
    document.getElementById('eventCompleteModal').style.display = 'block';
    document.getElementById('eventCompleteDateText').focus();

    // Обработчик формы
    const form = document.getElementById('eventCompleteForm');
    const submitHandler = async (e) => {
      e.preventDefault();

      let date = getDateValue('eventCompleteDate', 'eventCompleteDateText');
      let mileage = document.getElementById('eventCompleteMileage').value.trim();

      // Валидация даты
      if (date && !validateDate(date)) {
        showToast('❌ Неверный формат даты. Используйте ГГГГ-ММ-ДД', 'error');
        return;
      }

      if (date && new Date(date) > new Date()) {
        showToast('❌ Дата выполнения не может быть в будущем', 'error');
        return;
      }

      if (mileage && isNaN(parseFloat(mileage))) {
        showToast('❌ Введите корректное значение пробега', 'error');
        return;
      }

      if (!date && !mileage) {
        showToast('❌ Введите дату или пробег выполнения', 'error');
        return;
      }

      closeModal('eventCompleteModal');
      form.removeEventListener('submit', submitHandler);

      // Выполняем событие
      await this._completeEventAction(event, date, mileage);
    };

    form.addEventListener('submit', submitHandler);

    // Обработчик закрытия модалки
    const closeHandler = () => {
      form.removeEventListener('submit', submitHandler);
      document.getElementById('eventCompleteModal').removeEventListener('close', closeHandler);
    };
    document.getElementById('eventCompleteModal').addEventListener('close', closeHandler);
  }

  // ============================================
  // УДАЛЕНИЕ СОБЫТИЯ
  // ============================================

  // Удаление события
  async deleteEvent(id) {
    const event = appData.events.find(e => e.id === id);
    if (!event) {
      showToast('Событие не найдено', 'error');
      return;
    }

    // Проверяем, является ли событие запланированным по износу
    const isWearEvent = event.isWearEvent === true;
    const confirmMessage = isWearEvent
      ? 'Вы действительно хотите удалить запланированную замену по износу?'
      : 'Вы действительно хотите удалить это событие?';

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Удаляем событие
      appData.events = appData.events.filter(e => e.id !== id);

      // Если это событие по износу, сбрасываем флаг wearTriggered в обслуживании
      if (isWearEvent) {
        const service = appData.services.find(s => s.id === event.serviceId);
        if (service) {
          service.wearTriggered = false;
          console.log(`🔄 Сброшен флаг wearTriggered для обслуживания ${service.id}`);
        }
      }

      await this.scheduleSave();
      this.loadEvents();
      this.loadServices();
      showToast('✅ Событие удалено', 'success');
    } catch (error) {
      console.error('❌ Ошибка при удалении события:', error);
      showToast('❌ Ошибка при удалении события', 'error');
    }
  }

  // Основная логика выполнения события (вызывается после подтверждения в модалке)
  async _completeEventAction(event, date, mileage) {
    // Обновляем данные в записи обслуживания
    const service = appData.services.find(s => s.id === event.serviceId);
    if (service) {
      service.lastServiceDate = date || '';
      service.lastServiceMileage = mileage || '';
    }

    // Добавляем в историю
    const serviceType = service ? appData.serviceTypes.find(st => st.id === service.serviceTypeId) : null;
    appData.history.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
      carId: event.carId,
      serviceId: event.serviceId,
      date: date || new Date().toISOString().split('T')[0],
      mileage: mileage || '',
      comment: `✅ Выполнено: ${serviceType ? serviceType.name : 'Обслуживание'}`
    });

    // Обновляем пробег автомобиля
    if (mileage) {
      const car = appData.cars.find(c => c.id === event.carId);
      if (car && parseFloat(mileage) > parseFloat(car.mileage || 0)) {
        car.mileage = mileage;
      }
    }

    // УДАЛЯЕМ выполненное событие из списка
    appData.events = appData.events.filter(e => e.id !== event.id);

    // Сохраняем изменения
    await this.scheduleSave();

    // Генерируем новое событие на основе обновленных данных
    await this.generateEvents();

    // Обновляем статусы
    this.updateEventsStatus();

    this.loadEvents();
    this.loadServices();
    showToast('✅ Событие выполнено!', 'success');
  }

  // ============================================
  // ИСТОРИЯ
  // ============================================
  loadHistory() {
    const list = document.getElementById('history-list');
    const filter = document.getElementById('history-filter');
    if (!list) return;

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    if (filter && filter.options.length <= 1) {
      appData.cars.forEach(c => {
        filter.innerHTML += `<option value="${c.id}">${c.brand} ${c.model}</option>`;
      });
    }

    const carId = filter ? filter.value : 'all';
    let history = appData.history;
    if (carId !== 'all') {
      history = history.filter(h => h.carId === carId);
    }

    if (history.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><p>Нет записей истории</p></div>`;
      return;
    }

    const carMap = {};
    appData.cars.forEach(c => carMap[c.id] = `${c.brand} ${c.model}`);

    // Сортировка по дате
    const sorted = this.sortData(history, 'date');

    list.innerHTML = sorted.map(item => `
            <div class="history-item">
                <div class="details">
                    <div class="title">${carMap[item.carId] || 'Авто удалено'}</div>
                    <div class="meta">${item.comment || 'Обслуживание'}</div>
                </div>
                <div>
                    <span class="date">${item.date || 'Дата не указана'}</span>
                    ${item.mileage ? `<span class="date"> | ${this.formatMileage(item.mileage)} км</span>` : ''}
                </div>
            </div>
        `).join('');
  }

  // ============================================
  // ПРОБЕГ
  // ============================================
  loadMileage() {
    const list = document.getElementById('mileage-list');
    if (!list) return;

    if (!isAuthorized) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><p>Требуется авторизация</p></div>`;
      return;
    }

    if (appData.mileage.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-tachometer-alt"></i><p>Нет записей пробега</p></div>`;
      return;
    }

    const carMap = {};
    appData.cars.forEach(c => carMap[c.id] = `${c.brand} ${c.model}`);

    // Сортировка по дате
    const sorted = this.sortData(appData.mileage, 'date');

    list.innerHTML = sorted.map(item => `
            <div class="history-item">
                <div class="details">
                    <div class="title">${carMap[item.carId] || 'Авто удалено'}</div>
                    <div class="meta" style="font-weight: 600; color: var(--primary);">
                        ${this.formatMileage(item.value)} км
                    </div>
                    ${item.note ? `<div class="meta">${item.note}</div>` : ''}
                </div>
                <div>
                    <span class="date">${item.date || 'Дата не указана'}</span>
                </div>
            </div>
        `).join('');
  }

  showAddMileageModal() {
    const select = document.getElementById('mileageCar');
    select.innerHTML = appData.cars.map(c =>
      `<option value="${c.id}">${c.brand} ${c.model} (${this.formatMileage(c.mileage)} км)</option>`
    ).join('');

    document.getElementById('mileageDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('mileageForm').reset();
    document.getElementById('mileageModal').style.display = 'block';
    this.focusFirstInput('mileageModal')
  }

  // ============================================
  // НАСТРОЙКА МОДАЛЬНЫХ ОКОН
  // ============================================
  setupModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Закрытие по клавише Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
          if (modal.style.display === 'block') {
            modal.style.display = 'none';
          }
        });
      }
    });

    // Обработчик для модалки ввода базы события
    document.getElementById('eventBaseModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('eventBaseModal')) {
        closeModal('eventBaseModal');
        // Генерируем событие close
        document.getElementById('eventBaseModal').dispatchEvent(new Event('close'));
      }
    });

    // Обработчик для модалки выполнения события
    document.getElementById('eventCompleteModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('eventCompleteModal')) {
        closeModal('eventCompleteModal');
        document.getElementById('eventCompleteModal').dispatchEvent(new Event('close'));
      }
    });

    // Обработчик для модалки первой записи
    document.getElementById('serviceFirstEntryModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('serviceFirstEntryModal')) {
        closeModal('serviceFirstEntryModal');
        document.getElementById('serviceFirstEntryModal').dispatchEvent(new Event('close'));
      }
    });

    // Форма автомобиля
    document.getElementById('carForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('carId').value;
      const car = {
        id: id || Date.now().toString() + Math.random().toString(36).substr(2, 6),
        brand: document.getElementById('carBrand').value.trim(),
        model: document.getElementById('carModel').value.trim(),
        year: document.getElementById('carYear').value || '',
        color: document.getElementById('carColor').value.trim(),
        plate: document.getElementById('carPlate').value.trim(),
        vin: document.getElementById('carVin').value.trim(),
        mileage: document.getElementById('carMileage').value || '0',
        notes: document.getElementById('carNotes').value.trim(),
        photo: document.getElementById('carPhoto').value.trim()
      };

      if (id) {
        const index = appData.cars.findIndex(c => c.id === id);
        if (index !== -1) appData.cars[index] = car;
      } else {
        appData.cars.push(car);
      }

      await this.scheduleSave();
      closeModal('carModal');
      this.loadGarage();
      showToast(id ? 'Автомобиль обновлен' : 'Автомобиль добавлен', 'success');
    });

    // Форма детали
    document.getElementById('partForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('partId').value;
      const name = document.getElementById('partName').value.trim();
      const charRows = document.querySelectorAll('#characteristics-container .char-row');
      const characteristics = [];
      charRows.forEach(row => {
        const nameInput = row.querySelector('.char-name');
        const valueInput = row.querySelector('.char-value');
        if (nameInput.value.trim() && valueInput.value.trim()) {
          characteristics.push({
            name: nameInput.value.trim(),
            value: valueInput.value.trim()
          });
        }
      });

      const part = {
        id: id || Date.now().toString() + Math.random().toString(36).substr(2, 6),
        name: name,
        characteristics: characteristics
      };

      if (id) {
        const index = appData.parts.findIndex(p => p.id === id);
        if (index !== -1) appData.parts[index] = part;
      } else {
        appData.parts.push(part);
      }

      await this.scheduleSave();
      closeModal('partModal');
      this.loadParts();
      showToast(id ? 'Деталь обновлена' : 'Деталь добавлена', 'success');
    });

    // Форма вида обслуживания
    document.getElementById('serviceTypeForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('serviceTypeId').value;
      const item = {
        id: id || Date.now().toString() + Math.random().toString(36).substr(2, 6),
        name: document.getElementById('serviceTypeName').value.trim(),
        quantity: document.getElementById('serviceTypeQuantity').value || '0',
        unitId: document.getElementById('serviceTypeUnit').value || '',
        description: document.getElementById('serviceTypeDescription').value.trim()
      };

      if (id) {
        const index = appData.serviceTypes.findIndex(s => s.id === id);
        if (index !== -1) appData.serviceTypes[index] = item;
      } else {
        appData.serviceTypes.push(item);
      }

      await this.scheduleSave();
      closeModal('serviceTypeModal');
      this.loadServiceTypes();
      showToast(id ? 'Вид обслуживания обновлен' : 'Вид обслуживания добавлен', 'success');
    });

    // Форма регламента
    document.getElementById('regulationForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('regulationId').value;
      const name = document.getElementById('regulationName').value.trim();

      if (!name) {
        showToast('Введите название регламента', 'warning');
        return;
      }

      const item = {
        id: id || Date.now().toString() + Math.random().toString(36).substr(2, 6),
        name: name
      };

      if (id) {
        const index = appData.regulations.findIndex(r => r.id === id);
        if (index !== -1) appData.regulations[index] = item;
      } else {
        appData.regulations.push(item);
      }

      await this.scheduleSave();
      closeModal('regulationModal');
      this.loadRegulations();
      // Обновляем список регламентов в форме обслуживания
      this.updateRegulationSelect();
      showToast(id ? 'Регламент обновлен' : 'Регламент добавлен', 'success');
    });

    // Форма единицы измерения
    document.getElementById('unitForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('unitId').value;
      const item = {
        id: id || Date.now().toString() + Math.random().toString(36).substr(2, 6),
        name: document.getElementById('unitName').value.trim(),
        shortName: document.getElementById('unitShortName').value.trim()
      };

      if (id) {
        const index = appData.units.findIndex(u => u.id === id);
        if (index !== -1) appData.units[index] = item;
      } else {
        appData.units.push(item);
      }

      await this.scheduleSave();
      closeModal('unitModal');
      this.loadUnits();
      showToast(id ? 'Единица измерения обновлена' : 'Единица измерения добавлена', 'success');
    });

    // Форма производителя
    document.getElementById('manufacturerForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('manufacturerId').value;
      const name = document.getElementById('manufacturerName').value.trim();

      if (!name) {
        showToast('Введите название производителя', 'warning');
        return;
      }

      const item = {
        id: id || Date.now().toString() + Math.random().toString(36).substr(2, 6),
        name: name,
        partName: document.getElementById('manufacturerPartName').value.trim(),
        partCode: document.getElementById('manufacturerPartCode').value.trim()
      };

      if (id) {
        const index = appData.manufacturers.findIndex(m => m.id === id);
        if (index !== -1) appData.manufacturers[index] = item;
      } else {
        appData.manufacturers.push(item);
      }

      await this.scheduleSave();

      // Закрываем модалку
      closeModal('manufacturerModal');
      this.loadManufacturers();

      // Проверяем, открыта ли форма из обслуживания
      const modal = document.getElementById('manufacturerModal');
      const fromService = modal.dataset.fromService === 'true';

      if (fromService) {
        // Восстанавливаем состояние формы
        try {
          const state = JSON.parse(modal.dataset.serviceState || '{}');
          document.getElementById('serviceEditId').value = state.serviceId || '';
          document.getElementById('serviceCar').value = state.car || '';
          document.getElementById('serviceType').value = state.type || '';
          document.getElementById('serviceRegulation').value = state.regulation || '';
          document.getElementById('serviceQuantity').value = state.quantity || 0;
          document.getElementById('serviceUnit').value = state.unit || '';
          document.getElementById('serviceComment').value = state.comment || '';

          // Восстанавливаем выбранных производителей
          this.selectedManufacturers = state.selectedManufacturers || [];
          // Добавляем нового производителя
          this.selectedManufacturers.push(item.id);

          // Обновляем пузырьки
          this.renderManufacturerBubbles();
          this.updateSelectedCount();
          showToast(`✅ Производитель "${item.name}" добавлен и выбран`, 'success');
        } catch (error) {
          console.error('Ошибка восстановления состояния:', error);
          this.selectedManufacturers = [item.id];
          this.renderManufacturerBubbles();
          this.updateSelectedCount();
          showToast(`✅ Производитель "${item.name}" добавлен`, 'success');
        }

        // Сбрасываем флаг
        modal.dataset.fromService = 'false';
        modal.dataset.serviceState = '';
      } else {
        showToast(id ? 'Производитель обновлен' : 'Производитель добавлен', 'success');
      }
    });

    // Форма обслуживания
    document.getElementById('serviceForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const editId = document.getElementById('serviceEditId').value;
      const serviceTypeId = document.getElementById('serviceType').value;

      if (!serviceTypeId) {
        showToast('Выберите вид обслуживания', 'warning');
        return;
      }

      const serviceData = {
        carId: document.getElementById('serviceCar').value,
        serviceTypeId: serviceTypeId,
        regulationId: document.getElementById('serviceRegulation').value || '',
        quantity: parseFloat(document.getElementById('serviceQuantity').value) || 0,
        unitId: document.getElementById('serviceUnit').value || '',
        comment: document.getElementById('serviceComment').value.trim(),
        selectedManufacturers: [...this.selectedManufacturers],
        status: 'planned'
      };

      if (editId) {
        // Редактирование существующей записи
        const index = appData.services.findIndex(s => s.id === editId);
        if (index !== -1) {
          // Сохраняем старые данные для восстановления количества
          const oldService = appData.services[index];

          // Обновляем запись
          appData.services[index] = {
            ...appData.services[index],
            ...serviceData
          };

          // Если изменился вид обслуживания - обновляем количество
          if (oldService.serviceTypeId !== serviceTypeId) {
            // Возвращаем количество старому виду
            const oldType = appData.serviceTypes.find(st => st.id === oldService.serviceTypeId);
            if (oldType) {
              oldType.quantity = (parseFloat(oldType.quantity) || 0) + (parseFloat(oldService.quantity) || 0);
            }
            // Уменьшаем количество у нового вида
            const newType = appData.serviceTypes.find(st => st.id === serviceTypeId);
            if (newType) {
              newType.quantity = Math.max(0, (parseFloat(newType.quantity) || 0) - (parseFloat(serviceData.quantity) || 0));
            }
          }

          showToast('Запись обслуживания обновлена', 'success');
        }
      } else {
        // Новая запись
        const service = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
          ...serviceData
        };

        appData.services.push(service);

        // Добавляем в историю
        const serviceType = appData.serviceTypes.find(st => st.id === service.serviceTypeId);
        appData.history.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
          carId: service.carId,
          serviceId: service.id,
          date: new Date().toISOString().split('T')[0],
          mileage: '',
          comment: service.comment || (serviceType ? serviceType.name : 'Обслуживание')
        });

        // Обновляем количество у вида обслуживания
        const serviceTypeItem = appData.serviceTypes.find(st => st.id === service.serviceTypeId);
        if (serviceTypeItem) {
          const currentQuantity = parseFloat(serviceTypeItem.quantity) || 0;
          const usedQuantity = parseFloat(service.quantity) || 0;
          serviceTypeItem.quantity = Math.max(0, currentQuantity - usedQuantity);
        }

        showToast('Запись обслуживания добавлена', 'success');
      }

      await this.scheduleSave();
      closeModal('serviceModal');
      this.loadServices();
      this.loadHistory();
    });

    // Форма пробега
    document.getElementById('mileageForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const carId = document.getElementById('mileageCar').value;
      const value = document.getElementById('mileageValue').value;
      const date = document.getElementById('mileageDate').value || new Date().toISOString().split('T')[0];
      const note = document.getElementById('mileageNote').value.trim();

      appData.mileage.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
        carId: carId,
        value: value,
        date: date,
        note: note
      });

      const car = appData.cars.find(c => c.id === carId);
      if (car) {
        car.mileage = value;
      }

      await this.scheduleSave();
      closeModal('mileageModal');
      this.loadMileage();
      this.loadGarage();
      showToast('Запись пробега добавлена', 'success');
    });

    // Форма планирования замены по износу
    const wearForm = document.getElementById('wearEventForm');
    if (wearForm) {
      wearForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Блокируем кнопку
        const submitBtn = document.querySelector('#wearEventForm button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
        }

        try {
          const serviceId = document.getElementById('wearEventModal').dataset.serviceId;
          const service = appData.services.find(s => s.id === serviceId);

          if (!service) {
            showToast('Ошибка: обслуживание не найдено', 'error');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = 'Создать событие';
            }
            return;
          }

          const type = document.querySelector('input[name="wearType"]:checked').value;
          let date = '';
          let mileage = '';
          let comment = document.getElementById('wearEventComment').value.trim();

          if (type === 'date') {
            date = getDateValue('wearEventDate', 'wearEventDateText');
            if (!date) {
              showToast('❌ Введите дату планируемой замены', 'error');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Создать событие';
              }
              return;
            }
            if (!validateDate(date)) {
              showToast('❌ Неверный формат даты. Используйте ГГГГ-ММ-ДД', 'error');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Создать событие';
              }
              return;
            }
          } else {
            mileage = document.getElementById('wearEventMileage').value.trim();
            if (!mileage || isNaN(parseFloat(mileage))) {
              showToast('❌ Введите корректный пробег', 'error');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Создать событие';
              }
              return;
            }
          }

          // Создаем событие
          const car = appData.cars.find(c => c.id === service.carId);
          const serviceType = appData.serviceTypes.find(st => st.id === service.serviceTypeId);

          const event = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
            carId: service.carId,
            serviceId: service.id,
            type: type === 'date' ? 'date' : 'mileage',
            date: date || '',
            mileage: mileage || '',
            status: 'scheduled',
            partsNeeded: parseFloat(service.quantity) || 0,
            partsAvailable: parseFloat(serviceType?.quantity) || 0,
            baseDate: '',
            baseMileage: '',
            completedDate: '',
            completedMileage: '',
            isWearEvent: true,
            comment: comment || 'Замена по износу'
          };

          appData.events.push(event);
          await this.scheduleSave();

          closeModal('wearEventModal');
          this.loadEvents();
          this.loadServices();
          showToast('✅ Событие по износу создано!', 'success');

        } catch (error) {
          console.error('Ошибка при создании события по износу:', error);
          showToast('❌ Ошибка при создании события. Попробуйте еще раз.', 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Создать событие';
          }
        }
      });
    }

    // Поиск производителей
    const searchInput = document.getElementById('manufacturerSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterManufacturers(e.target.value);
      });
    }
  }
}

// Восстановление авторизации при ошибке
function restoreAuth() {
  if (!isAuthorized) {
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) {
      authBtn.style.display = 'block';
      authBtn.disabled = false;
      authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
    }
    const statusEl = document.getElementById('auth-status');
    if (statusEl) {
      statusEl.innerHTML = '<i class="fas fa-circle" style="color: #ff9800;"></i> Не авторизован';
      statusEl.style.color = '#ff9800';
    }
    showToast('⚠️ Сессия истекла. Авторизуйтесь заново.', 'warning');
  }
}

// Вызывать restoreAuth() в catch блоках при ошибках авторизации

// ============================================
// СИНХРОНИЗАЦИЯ ДАТЫ МЕЖДУ КАЛЕНДАРЕМ И ТЕКСТОВЫМ ПОЛЕМ
// ============================================

function setupDateSync(dateInputId, textInputId) {
  const dateInput = document.getElementById(dateInputId);
  const textInput = document.getElementById(textInputId);

  if (!dateInput || !textInput) return;

  // При изменении календаря - обновляем текстовое поле
  dateInput.addEventListener('change', function() {
    if (this.value) {
      textInput.value = this.value;
      textInput.dataset.source = 'date';
    } else {
      textInput.value = '';
    }
    // Убираем класс ошибки
    textInput.classList.remove('error');
  });

  // При вводе в текстовое поле - обновляем календарь
  textInput.addEventListener('input', function() {
    const value = this.value.trim();
    // Пробуем нормализовать дату
    if (value) {
      const normalized = normalizeDate(value);
      if (normalized && validateDate(normalized)) {
        dateInput.value = normalized;
        this.classList.remove('error');
        this.dataset.source = 'text';
      } else {
        // Показываем предупреждение, но не сбрасываем
        if (value.length > 4) {
          this.classList.add('error');
        }
      }
    } else {
      dateInput.value = '';
      this.classList.remove('error');
    }
  });

  // При потере фокуса - пробуем нормализовать
  textInput.addEventListener('blur', function() {
    const value = this.value.trim();
    if (value) {
      const normalized = normalizeDate(value);
      if (normalized && validateDate(normalized)) {
        this.value = normalized;
        dateInput.value = normalized;
        this.classList.remove('error');
      } else if (value.length > 0) {
        this.classList.add('error');
        showToast('❌ Неверный формат даты. Используйте ГГГГ-ММ-ДД', 'error');
      }
    }
  });

  // Обработка Enter в текстовом поле
  textInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      this.blur();
    }
  });
}

// Установка даты в поля
function setDateFields(dateInputId, textInputId, dateValue) {
  const dateInput = document.getElementById(dateInputId);
  const textInput = document.getElementById(textInputId);

  if (!dateInput || !textInput) return;

  if (dateValue) {
    const normalized = normalizeDate(dateValue);
    if (normalized && validateDate(normalized)) {
      dateInput.value = normalized;
      textInput.value = normalized;
    } else {
      textInput.value = dateValue;
    }
  } else {
    dateInput.value = '';
    textInput.value = '';
  }
}

// Получить значение даты из полей (с приоритетом у текстового поля)
function getDateValue(dateInputId, textInputId) {
  const dateInput = document.getElementById(dateInputId);
  const textInput = document.getElementById(textInputId);

  if (!dateInput || !textInput) return '';

  // Сначала проверяем текстовое поле
  let value = textInput.value.trim();
  if (value) {
    const normalized = normalizeDate(value);
    if (normalized && validateDate(normalized)) {
      return normalized;
    }
    // Если текстовое поле содержит некорректную дату, пробуем взять из календаря
  }

  // Если текстовое поле пустое или некорректное - берем из календаря
  if (dateInput.value) {
    return dateInput.value;
  }

  return '';
}

// ============================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ============================================
// Нормализация даты к формату DD.MM.YYYY
function normalizeDateToDisplay(dateString) {
  if (!dateString) return '';

  // Если уже в формате DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
    return dateString;
  }

  // Если в формате YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const parts = dateString.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  // Если в формате DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
    const parts = dateString.split('-');
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  return dateString;
}

// Парсинг даты из любого формата
function parseDateAny(dateString) {
  if (!dateString) return null;

  let day, month, year;

  // DD.MM.YYYY
  if (dateString.includes('.')) {
    const parts = dateString.split('.');
    if (parts.length === 3) {
      day = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
      year = parseInt(parts[2]);
    }
  }
  // YYYY-MM-DD
  else if (dateString.includes('-')) {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
      } else {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        year = parseInt(parts[2]);
      }
    }
  }

  if (day && month !== undefined && year) {
    return new Date(year, month, day);
  }

  return null;
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || (() => {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'toast-container';
    document.body.appendChild(div);
    return div;
  })();

  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
        <i class="${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function toggleMobileMenu() {
  const navBottom = document.getElementById('nav-bottom');
  const menuBtn = document.querySelector('.mobile-menu-btn');

  if (!navBottom) {
    console.warn('⚠️ nav-bottom не найден');
    return;
  }

  // Переключаем класс
  navBottom.classList.toggle('active');

  // if (navBottom.classList.contains('active')) {
  //   navBottom.style.display = 'block';
  //   navBottom.style.height = 'calc(100vh - 50px)';
  //   navBottom.style.maxHeight = 'calc(100vh - 50px)';
  //   navBottom.style.overflowY = 'auto';
  // } else {
  //   navBottom.style.display = 'none';
  //   navBottom.style.height = '';
  //   navBottom.style.maxHeight = '';
  //   navBottom.style.overflowY = '';
  // }

  const icon = menuBtn?.querySelector('i');
  if (icon) {
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  }
}

// ============================================
// ВАЛИДАЦИЯ ДАТЫ
// ============================================

// Проверка формата даты ГГГГ-ММ-ДД
function validateDate(dateString) {
  if (!dateString) return true; // Пустое поле допустимо

  // Проверяем формат
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  // Проверяем, что это реальная дата
  const parts = dateString.split('-');
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Проверка дней в месяце
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return false;

  return true;
}

// Форматирование даты для отображения
function formatDateDisplay(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Нормализация даты (приведение к формату ГГГГ-ММ-ДД)
function normalizeDate(dateString) {
  if (!dateString) return '';

  // Если уже в правильном формате
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  // Попытка распарсить различные форматы
  let parts = [];

  // Формат ДД.ММ.ГГГГ или ДД/ММ/ГГГГ
  if (dateString.includes('.') || dateString.includes('/')) {
    const sep = dateString.includes('.') ? '.' : '/';
    parts = dateString.split(sep);
    if (parts.length === 3) {
      // ДД.ММ.ГГГГ -> ГГГГ-ММ-ДД
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      // ММ/ДД/ГГГГ -> ГГГГ-ММ-ДД
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
  }

  // Формат ДД-ММ-ГГГГ
  if (dateString.includes('-') && !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    parts = dateString.split('-');
    if (parts.length === 3) {
      // ДД-ММ-ГГГГ -> ГГГГ-ММ-ДД
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }

  // Если не удалось распарсить, возвращаем как есть (пользователь получит ошибку)
  return dateString;
}

// Получить текущую дату в формате ГГГГ-ММ-ДД
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
let app;

// Экспортируем функции в глобальный объект
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;
window.authenticate = authenticate;
window.signOut = signOut;
window.closeModal = closeModal;
window.toggleMobileMenu = toggleMobileMenu;
window.initializeGapiClient = initializeGapiClient;
window.maybeEnableButtons = maybeEnableButtons;

document.addEventListener('DOMContentLoaded', () => {
  app = new AutoGarageApp();
});

window.app = app;
window.showAddCarModal = () => app.showAddCarModal();
window.showAddPartModal = () => app.showAddPartModal();
window.showAddServiceTypeModal = () => app.showAddServiceTypeModal();
window.showAddRegulationModal = () => app.showAddRegulationModal();
window.showAddUnitModal = () => app.showAddUnitModal();
window.showAddManufacturerModal = () => app.showAddManufacturerModal();
window.showAddServiceModal = () => app.showAddServiceModal();
window.showAddMileageModal = () => app.showAddMileageModal();
window.addCharacteristic = () => app.addCharacteristic();
window.removeCharacteristic = (btn) => app.removeCharacteristic(btn);
window.generateEvents = () => app.generateEvents();
window.loadHistory = () => app.loadHistory();
window.showAddServiceModal = () => app.showAddServiceModal();
window.editService = (id) => app.editService(id);
window.openAddManufacturerFromService = () => app.openAddManufacturerFromService();
window.selectAllManufacturers = () => app.selectAllManufacturers();
window.clearAllManufacturers = () => app.clearAllManufacturers();
window.forceSave = () => app.forceSave();
window.toggleSortDirection = () => app.toggleSortDirection();
window.restoreAuth = restoreAuth;
window.deleteEvent = (id) => app.deleteEvent(id);
window.loadDemoData = () => app.loadDemoData();