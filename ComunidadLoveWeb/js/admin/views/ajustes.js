/* ==========================================================================
   VISTA: AJUSTES DEL SITIO (site_settings/general)
   ========================================================================== */

import { saveSettings } from '../../services/site.js';
import { can } from '../../lib/auth.js';
import { escapeHTML as _escapeHTML, qs, qsa, showToast, confirmDialog } from '../../lib/dom.js';
import { subscribe } from '../store.js';
import { pageHeader, card, field, checkboxField, markInvalid, clearInvalid, setLoading, readForm } from '../ui.js';
import { exportFirestoreBackup, downloadBackupJSON, restoreFirestoreBackup } from '../../services/backup.js';
import { seedInitialData } from '../../services/seed.js';

export function renderAjustes(container) {
  container.innerHTML = `
    ${pageHeader({
      title: 'Ajustes del Sitio',
      subtitle: 'Estos valores alimentan la landing page en tiempo real',
      icon: 'fa-sliders'
    })}
    <div id="clg-ajustes-body">
      <div class="clg-skeleton-line clg-skeleton-line-lg"></div>
      <div class="clg-skeleton-line"></div>
      <div class="clg-skeleton-line"></div>
    </div>
  `;

  const body = qs('#clg-ajustes-body', container);

  const unsubscribe = subscribe(['settings', 'settingsExists', 'ready', 'profile'], (state) => {
    if (!state.ready) return;
    const editable = can(state.profile?.role, 'content.write');
    const settings = state.settings || {};
    const hours = Array.isArray(settings.serviceHours) ? settings.serviceHours : [];

    if (!editable) {
      body.innerHTML = card({
        title: 'Configuración actual',
        body: '<p class="clg-cell-muted">Tu rol no permite modificar la configuración del sitio.</p>'
      });
      return;
    }

    body.innerHTML = `
      <form class="clg-form clg-ajustes-form" id="clg-ajustes-form" novalidate>
        ${card({
          title: 'Aviso institucional',
          subtitle: 'Banner naranja o informativo sobre el encabezado de la web',
          body: `
            <div class="clg-grid-2">
              ${field({ keyPrefix: 'ba', name: 'type', label: 'Tipo de aviso', type: 'select', options: [{ value: 'info', label: 'Informativo' }, { value: 'warning', label: 'Urgente' }], value: settings.bannerAlert?.type || 'info' })}
              ${checkboxField({ name: 'ba-show', label: 'Mostrar el aviso en la web', checked: Boolean(settings.bannerAlert?.show) })}
            </div>
            ${field({ keyPrefix: 'ba', name: 'message', label: 'Mensaje del aviso', value: settings.bannerAlert?.message || '', placeholder: 'Ej: Hoy el templo abre 30 minutos antes por el evento especial.' })}
          `
        })}

        ${card({
          title: 'Transmisión en vivo',
          subtitle: 'Video shown en la sección "Ver Nuestras Reuniones"',
          body: `
            ${field({ keyPrefix: 'st', name: 'streamingUrl', label: 'URL del video (YouTube embed)', value: settings.streamingUrl || '', placeholder: 'https://www.youtube.com/embed/ID_DEL_VIDEO' })}
            ${field({ keyPrefix: 'st', name: 'streamingChannelUrl', label: 'Enlace al canal de YouTube', value: settings.streamingChannelUrl || '', placeholder: 'https://youtube.com/@tu-canal' })}
          `
        })}

        ${card({
          title: 'Nuestras reuniones',
          subtitle: 'Se muestran en la sección Calendario de la web',
          body: `
            <div id="clg-hours-list" class="clg-hours-list">
              ${hours.length
                ? hours
                    .map(
                      (entry, index) => `
                    <div class="clg-hour-row" data-hour-index="${index}">
                      <div class="clg-grid-2">
                        ${field({ keyPrefix: `h${index}`, name: 'day', label: 'Día', value: entry.day || '', placeholder: 'Ej: Domingos' })}
                        ${field({ keyPrefix: `h${index}`, name: 'time', label: 'Hora', value: entry.time || '', placeholder: 'Ej: 9:00 AM' })}
                      </div>
                      ${field({ keyPrefix: `h${index}`, name: 'label', label: 'Nombre del servicio', value: entry.label || '' })}
                      ${field({ keyPrefix: `h${index}`, name: 'description', label: 'Descripción', type: 'textarea', rows: 2, value: entry.description || '' })}
                      <button type="button" class="clg-link-btn clg-link-danger" data-remove-hour="${index}">
                        <i class="fas fa-trash-can"></i> Quitar este horario
                      </button>
                    </div>`
                    )
                    .join('')
                : '<p class="clg-cell-muted">Sin horarios configurados.</p>'}
            </div>
            <button type="button" class="clg-btn clg-btn-soft" id="clg-add-hour">
              <i class="fas fa-plus"></i><span>Añadir horario</span>
            </button>
          `
        })}

        ${card({
          title: 'Contacto y redes sociales',
          body: `
            <div class="clg-grid-2">
              ${field({ keyPrefix: 'ct', name: 'contactPhone', label: 'Teléfono de contacto', value: settings.contactPhone || '' })}
              ${field({ keyPrefix: 'ct', name: 'contactEmail', label: 'Correo de contacto', type: 'email', value: settings.contactEmail || '' })}
            </div>
            ${field({ keyPrefix: 'ct', name: 'address', label: 'Dirección', value: settings.address || '' })}
            <div class="clg-grid-3">
              ${field({ keyPrefix: 'so', name: 'instagram', label: 'Instagram', value: settings.socialLinks?.instagram || '', placeholder: 'https://instagram.com/…' })}
              ${field({ keyPrefix: 'so', name: 'facebook', label: 'Facebook', value: settings.socialLinks?.facebook || '', placeholder: 'https://facebook.com/…' })}
              ${field({ keyPrefix: 'so', name: 'youtube', label: 'YouTube', value: settings.socialLinks?.youtube || '', placeholder: 'https://youtube.com/@…' })}
            </div>
          `
        })}

        ${card({
          title: 'Respaldo y Restauración de Datos (JSON / Offline-First)',
          subtitle: 'Exporta o restaura las colecciones del sistema en tu equipo local',
          body: `
            <div style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center;">
              <button type="button" class="clg-btn clg-btn-secondary" id="btn-export-backup">
                <i class="fas fa-download"></i><span>Exportar Respaldo JSON</span>
              </button>

              <label class="clg-btn clg-btn-ghost" style="cursor: pointer; margin: 0; display: inline-flex; align-items: center; gap: 8px;">
                <i class="fas fa-upload"></i><span>Restaurar Respaldo JSON</span>
                <input type="file" id="input-restore-backup" accept=".json" style="display: none;">
              </label>

              <button type="button" class="clg-btn clg-btn-ghost" id="btn-seed-data">
                <i class="fas fa-seedling"></i><span>Sembrar Datos de Fábrica</span>
              </button>
            </div>
            <p class="clg-hint" style="margin-top: 10px;">
              El respaldo exporta en un archivo estructurado: configuración del sitio, eventos, catálogo de market, pedidos, avisos, peticiones y miembros.
            </p>
          `
        })}

        <div class="clg-submit-bar clg-submit-bar-static">
          <button type="submit" class="clg-btn clg-btn-primary clg-btn-lg">
            <i class="fas fa-save"></i><span>Guardar ajustes</span>
          </button>
        </div>
      </form>
    `;

    bindHours(qs('#clg-ajustes-form', body));
    bindBackupActions(body, state.profile);
  });

  function bindHours(form) {
    const list = qs('#clg-hours-list', form);
    qs('#clg-add-hour', form)?.addEventListener('click', () => {
      const index = list.querySelectorAll('[data-hour-index]').length;
      const row = document.createElement('div');
      row.className = 'clg-hour-row';
      row.dataset.hourIndex = String(index);
      row.innerHTML = `
        <div class="clg-grid-2">
          ${field({ keyPrefix: `h${index}`, name: 'day', label: 'Día', placeholder: 'Ej: Jueves' })}
          ${field({ keyPrefix: `h${index}`, name: 'time', label: 'Hora', placeholder: 'Ej: 6:30 PM' })}
        </div>
        ${field({ keyPrefix: `h${index}`, name: 'label', label: 'Nombre del servicio' })}
        ${field({ keyPrefix: `h${index}`, name: 'description', label: 'Descripción', type: 'textarea', rows: 2 })}
        <button type="button" class="clg-link-btn clg-link-danger" data-remove-hour="${index}">
          <i class="fas fa-trash-can"></i> Quitar este horario
        </button>
      `;
      list.appendChild(row);
      row.querySelector('[name$="-day"]')?.focus();
    });

    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-hour]');
      if (button) button.closest('.clg-hour-row')?.remove();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearInvalid(form);
      setLoading(form, true, 'Guardando…');

      try {
        const data = readForm(form);
        const serviceHours = qsa('.clg-hour-row', form).map((row) => {
          const keys = row.querySelector('[name$="-day"]').name.split('-')[0];
          return {
            day: data[`${keys}-day`] || '',
            time: data[`${keys}-time`] || '',
            label: data[`${keys}-label`] || '',
            description: data[`${keys}-description`] || ''
          };
        });

        await saveSettings({
          bannerAlert: {
            show: Boolean(data['ba-show']),
            message: data['ba-message'] || '',
            type: data['ba-type'] || 'info'
          },
          streamingUrl: data['st-streamingUrl'] || '',
          streamingChannelUrl: data['st-streamingChannelUrl'] || '',
          serviceHours,
          contactPhone: data['ct-contactPhone'] || '',
          contactEmail: data['ct-contactEmail'] || '',
          address: data['ct-address'] || '',
          socialLinks: {
            instagram: data['so-instagram'] || '',
            facebook: data['so-facebook'] || '',
            youtube: data['so-youtube'] || ''
          }
        });
        showToast('Ajustes guardados. La web se actualizó.', 'success');
      } catch (error) {
        markInvalid(form, error.message);
      } finally {
        setLoading(form, false);
      }
    });
  }

  function bindBackupActions(containerEl, actor) {
    const btnExport = qs('#btn-export-backup', containerEl);
    const inputRestore = qs('#input-restore-backup', containerEl);
    const btnSeed = qs('#btn-seed-data', containerEl);

    btnExport?.addEventListener('click', async () => {
      btnExport.disabled = true;
      showToast('Generando archivo de respaldo JSON…', 'info');
      try {
        const backup = await exportFirestoreBackup();
        downloadBackupJSON(backup);
        showToast('Respaldo descargado exitosamente.', 'success');
      } catch (err) {
        showToast(err.message || 'Error al exportar respaldo.', 'danger');
      } finally {
        btnExport.disabled = false;
      }
    });

    inputRestore?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ok = await confirmDialog({
        title: 'Restaurar respaldo JSON',
        message: `¿Estás seguro de restaurar los datos desde "${file.name}"? Los documentos existentes se actualizarán con la información del archivo.`,
        confirmText: 'Restaurar',
        danger: true
      });
      if (!ok) {
        e.target.value = '';
        return;
      }

      showToast('Procesando restauración de base de datos…', 'info');
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const { totalRestored } = await restoreFirestoreBackup(json);
        showToast(`Restauración completada: ${totalRestored} documentos importados.`, 'success');
      } catch (err) {
        showToast(err.message || 'Error al restaurar los datos.', 'danger');
      } finally {
        e.target.value = '';
      }
    });

    btnSeed?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Sembrar datos iniciales',
        message: '¿Deseas verificar y crear los datos iniciales de fábrica para los módulos vacíos?',
        confirmText: 'Sembrar datos',
        danger: false
      });
      if (!ok) return;

      btnSeed.disabled = true;
      try {
        const result = await seedInitialData(actor);
        if (result.alreadySeeded) {
          showToast('Las colecciones ya contienen datos.', 'info');
        } else {
          showToast(`Datos sembrados: ${result.productsCount} productos, ${result.eventsCount} eventos.`, 'success');
        }
      } catch (err) {
        showToast(err.message || 'Error al sembrar datos.', 'danger');
      } finally {
        btnSeed.disabled = false;
      }
    });
  }

  return unsubscribe;
}
