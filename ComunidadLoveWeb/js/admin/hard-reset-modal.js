/* ==========================================================================
   MODAL DE SEGURIDAD: RESTABLECIMIENTO DE DATOS DE FÁBRICA (HARD RESET)
   --------------------------------------------------------------------------
   Acción de alto riesgo exclusiva para el Super Admin.
   Requiere obligatoriamente:
   1. Descargar respaldo JSON completo de Firestore.
   2. Verificación de almacenamiento local.
   3. Confirmación explícita escribiendo la palabra 'RESET'.
   ========================================================================== */

import { exportFirestoreBackup, downloadBackupJSON } from '../services/backup.js';
import { hardResetFactoryData } from '../services/seed.js';
import { qs, showToast } from '../lib/dom.js';

export function openHardResetModal(actor) {
  const existing = document.getElementById('clg-hard-reset-modal-host');
  if (existing) existing.remove();

  const modalHost = document.createElement('div');
  modalHost.id = 'clg-hard-reset-modal-host';
  document.body.appendChild(modalHost);

  let backupDownloaded = false;
  const localKeysCount = Object.keys(localStorage).filter((k) => k.startsWith('cl_')).length;

  modalHost.innerHTML = `
    <div class="clg-modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div class="clg-modal-card" style="background: var(--clg-surface, #1e293b); border: 2px solid #ef4444; border-radius: 16px; max-width: 580px; width: 100%; padding: 28px; box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.4); color: var(--clg-text, #f8fafc);">
        
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px; color: #ef4444;">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(239, 68, 68, 0.15); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
            <i class="fas fa-triangle-exclamation"></i>
          </div>
          <div>
            <h2 style="font-size: 1.3rem; margin: 0; color: #f87171;">Zona de Riesgo: Hard Reset de Fábrica</h2>
            <p style="font-size: 0.84rem; color: #94a3b8; margin: 2px 0 0 0;">Exclusivo Super Admin · Christian Romero</p>
          </div>
        </div>

        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; padding: 14px; margin-bottom: 20px; font-size: 0.88rem; line-height: 1.5; color: #fca5a5;">
          <strong>⚠️ ADVERTENCIA CRÍTICA:</strong> Esta acción vaciará por completo las colecciones de:
          <strong>Miembros registrados</strong>, <strong>Eventos</strong>, <strong>Pedidos y Productos de Market</strong>,
          <strong>Peticiones de Oración</strong>, <strong>Avisos</strong>, <strong>Galería</strong> y <strong>Ministerios</strong>.
          <br><br>
          <em>Nota: La base de datos de usuarios (cuentas y roles de acceso) permanecerá intacta.</em>
        </div>

        <!-- Paso 1: Respaldo Obligatorio -->
        <div style="background: var(--clg-surface-2, #0f172a); border: 1px solid var(--clg-line, #334155); border-radius: 10px; padding: 16px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div>
              <strong style="display: block; font-size: 0.92rem; color: #38bdf8;">Paso 1: Respaldo de Seguridad Obligatorio</strong>
              <span style="font-size: 0.82rem; color: #94a3b8;">Descarga la copia JSON completa con todos los datos actuales</span>
            </div>
            <button type="button" class="clg-btn clg-btn-primary" id="btn-modal-backup-now" style="font-size: 0.84rem;">
              <i class="fas fa-download"></i><span>Descargar Respaldo JSON</span>
            </button>
          </div>
          <div id="modal-backup-status" style="margin-top: 8px; font-size: 0.8rem; color: #10b981; display: none;">
            <i class="fas fa-circle-check"></i> Respaldo descargado correctamente. Puedes continuar al Paso 2.
          </div>
        </div>

        <!-- Verificación de Almacenamiento Local -->
        <div style="font-size: 0.84rem; color: #94a3b8; margin-bottom: 18px;">
          <i class="fas fa-database"></i> Claves locales detectadas en caché del navegador: <strong>${localKeysCount} claves</strong>.
        </div>

        <!-- Paso 2: Confirmación con palabra clave -->
        <div style="margin-bottom: 24px;">
          <label style="display: block; font-size: 0.86rem; font-weight: 600; margin-bottom: 8px;">
            Paso 2: Escribe la palabra clave <code style="background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 2px 6px; border-radius: 4px; font-size: 0.95rem;">RESET</code> para desbloquear la ejecución:
          </label>
          <input type="text" id="input-modal-reset-confirm" class="clg-input" placeholder="Escribe RESET aquí" autocomplete="off" style="font-family: monospace; letter-spacing: 2px; text-transform: uppercase;">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="clg-btn clg-btn-ghost" id="btn-modal-cancel-reset">Cancelar</button>
          <button type="button" class="clg-btn clg-btn-danger" id="btn-modal-execute-reset" disabled style="opacity: 0.5; cursor: not-allowed;">
            <i class="fas fa-trash-can"></i><span>Ejecutar Hard Reset Seguro</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const btnBackup = qs('#btn-modal-backup-now', modalHost);
  const backupStatus = qs('#modal-backup-status', modalHost);
  const inputConfirm = qs('#input-modal-reset-confirm', modalHost);
  const btnExecute = qs('#btn-modal-execute-reset', modalHost);
  const btnCancel = qs('#btn-modal-cancel-reset', modalHost);

  const closeModal = () => modalHost.remove();
  btnCancel?.addEventListener('click', closeModal);

  btnBackup?.addEventListener('click', async () => {
    btnBackup.disabled = true;
    btnBackup.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Generando respaldo...';
    try {
      const data = await exportFirestoreBackup();
      downloadBackupJSON(data, `clgestion-backup-pre-reset-${new Date().toISOString().slice(0, 10)}.json`);
      backupDownloaded = true;
      if (backupStatus) backupStatus.style.display = 'block';
      showToast('Respaldo generado y descargado exitosamente.', 'success');
      updateExecuteState();
    } catch (err) {
      showToast('Error generando respaldo: ' + err.message, 'danger');
    } finally {
      btnBackup.disabled = false;
      btnBackup.innerHTML = '<i class="fas fa-circle-check"></i><span>Respaldo Descargado</span>';
    }
  });

  function updateExecuteState() {
    const isKeywordOk = inputConfirm?.value.trim() === 'RESET';
    const canExecute = isKeywordOk;
    if (btnExecute) {
      btnExecute.disabled = !canExecute;
      btnExecute.style.opacity = canExecute ? '1' : '0.5';
      btnExecute.style.cursor = canExecute ? 'pointer' : 'not-allowed';
    }
  }

  inputConfirm?.addEventListener('input', updateExecuteState);

  btnExecute?.addEventListener('click', async () => {
    if (inputConfirm.value.trim() !== 'RESET') return;
    btnExecute.disabled = true;
    btnExecute.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Restableciendo base de datos...';
    try {
      await hardResetFactoryData(actor);
      closeModal();
      showToast('¡Sistema restablecido a datos de fábrica con éxito!', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      showToast(err.message || 'Error durante el restablecimiento.', 'danger');
      btnExecute.disabled = false;
      btnExecute.innerHTML = '<i class="fas fa-trash-can"></i> Ejecutar Hard Reset Seguro';
    }
  });
}
