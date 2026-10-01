/* ==========================================================================
   SERVICIO: RESPALDO Y RESTAURACIÓN JSON (CLGESTIÓN)
   --------------------------------------------------------------------------
   Permite exportar e importar las colecciones esenciales del sistema a archivos
   JSON locales para respaldos periódicos, recuperación ante desastres y
   arquitectura offline-first.
   ========================================================================== */

import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, requireService } from '../firebase.js';

const BACKUP_COLLECTIONS = [
  'site_settings',
  'events',
  'market_products',
  'market_orders',
  'announcements',
  'prayers',
  'members',
  'ministries',
  'gallery_items'
];

export async function exportFirestoreBackup() {
  requireService(db, 'Firestore');
  const backup = {
    version: '1.0',
    app: 'CLGestión Comunidad Love',
    exportedAt: new Date().toISOString(),
    collections: {}
  };

  for (const colName of BACKUP_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      backup.collections[colName] = snap.docs.map((d) => ({
        id: d.id,
        data: d.data()
      }));
    } catch (err) {
      console.warn(`[CL] Error respaldando colección ${colName}:`, err);
      backup.collections[colName] = [];
    }
  }

  return backup;
}

export function downloadBackupJSON(backupData, filename = null) {
  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = filename || `clgestion-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function restoreFirestoreBackup(backupData) {
  requireService(db, 'Firestore');
  if (!backupData || !backupData.collections || typeof backupData.collections !== 'object') {
    throw new Error('El archivo no tiene el formato válido de respaldo de CLGestión.');
  }

  let totalRestored = 0;
  for (const [colName, docs] of Object.entries(backupData.collections)) {
    if (!Array.isArray(docs)) continue;
    for (const item of docs) {
      if (!item.id || !item.data) continue;
      await setDoc(doc(db, colName, item.id), item.data, { merge: true });
      totalRestored++;
    }
  }

  return { totalRestored };
}
