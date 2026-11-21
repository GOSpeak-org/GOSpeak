const DB_NAME = "gospeak-web";
const STORE_NAME = "backgrounds";
const DB_VERSION = 1;

export type BackgroundMode = "light" | "dark";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("INDEXEDDB_REQUEST_FAILED"));
	});
}

function transactionDone(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(tx.error ?? new Error("INDEXEDDB_ABORTED"));
		tx.onerror = () => reject(tx.error ?? new Error("INDEXEDDB_TX_FAILED"));
	});
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
	});
}

async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
	const db = await openDb();
	try {
		return await run(db);
	} finally {
		db.close();
	}
}

export async function getBackground(
	mode: BackgroundMode,
): Promise<Blob | null> {
	return withDb(async (db) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const result = await requestToPromise(
			tx.objectStore(STORE_NAME).get(mode) as IDBRequest<Blob | undefined>,
		);
		return result ?? null;
	});
}

export async function putBackground(
	mode: BackgroundMode,
	blob: Blob,
): Promise<void> {
	await withDb(async (db) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).put(blob, mode);
		await transactionDone(tx);
	});
}

export async function deleteBackground(mode: BackgroundMode): Promise<void> {
	await withDb(async (db) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).delete(mode);
		await transactionDone(tx);
	});
}
