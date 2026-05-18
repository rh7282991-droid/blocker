/**
 * FocusOS Analytics - IndexedDB scaffold
 * Tracks block events and daily statistics for V3 dashboard.
 */

const DB_NAME = 'focusos-analytics';
const DB_VERSION = 1;

interface BlockEvent {
  id?: number;
  site: string;
  action: string;
  timestamp: number;
}

interface DailyStats {
  date: string;
  blocksCount: number;
  sites: Record<string, number>;
}

/**
 * Open or create the IndexedDB database with required object stores.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Events store - individual block events
      if (!db.objectStoreNames.contains('events')) {
        const eventsStore = db.createObjectStore('events', {
          keyPath: 'id',
          autoIncrement: true,
        });
        eventsStore.createIndex('site', 'site', { unique: false });
        eventsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Daily stats store - aggregated per day
      if (!db.objectStoreNames.contains('daily_stats')) {
        db.createObjectStore('daily_stats', { keyPath: 'date' });
      }
    };
  });
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Record a block event in the events store.
 */
export async function recordBlockEvent(site: string, action: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('events', 'readwrite');
  const store = tx.objectStore('events');

  const event: BlockEvent = {
    site,
    action,
    timestamp: Date.now(),
  };

  store.add(event);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Increment today's block count for a specific site.
 */
export async function incrementBlockCount(site: string): Promise<void> {
  const db = await openDB();
  const date = getTodayDate();
  const tx = db.transaction('daily_stats', 'readwrite');
  const store = tx.objectStore('daily_stats');

  const getRequest = store.get(date);

  getRequest.onsuccess = () => {
    const existing = getRequest.result as DailyStats | undefined;

    if (existing) {
      existing.blocksCount += 1;
      existing.sites[site] = (existing.sites[site] || 0) + 1;
      store.put(existing);
    } else {
      const newStats: DailyStats = {
        date,
        blocksCount: 1,
        sites: { [site]: 1 },
      };
      store.add(newStats);
    }
  };

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Get stats for a specific date (YYYY-MM-DD format).
 */
export async function getDailyStats(
  date: string
): Promise<DailyStats | null> {
  const db = await openDB();
  const tx = db.transaction('daily_stats', 'readonly');
  const store = tx.objectStore('daily_stats');
  const request = store.get(date);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve((request.result as DailyStats) ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Get stats for a date range (inclusive).
 */
export async function getStatsRange(
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; blocksCount: number }>> {
  const db = await openDB();
  const tx = db.transaction('daily_stats', 'readonly');
  const store = tx.objectStore('daily_stats');
  const range = IDBKeyRange.bound(startDate, endDate);
  const request = store.openCursor(range);

  const results: Array<{ date: string; blocksCount: number }> = [];

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const stats = cursor.value as DailyStats;
        results.push({ date: stats.date, blocksCount: stats.blocksCount });
        cursor.continue();
      } else {
        db.close();
        resolve(results);
      }
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
