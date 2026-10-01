/* ==========================================================================
   VISTA: AJUSTES DEL SITIO (site_settings/general)
   ========================================================================== */

import { saveSettings } from '../../services/site.js';
import { can } from '../../lib/auth.js';
import { escapeHTML as _escapeHTML, qs, qsa, showToast } from '../../lib/dom.js';
import { subscribe } from '../store.js';
import { pageHeader, card, field, checkboxField, markInvalid, clearInvalid, setLoading, readForm } from '../ui.js';

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

        <div class="clg-submit-bar clg-submit-bar-static">
          <button type="submit" class="clg-btn clg-btn-primary clg-btn-lg">
            <i class="fas fa-save"></i><span>Guardar ajustes</span>
          </button>
        </div>
      </form>
    `;

    bindHours(qs('#clg-ajustes-form', body));
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

  return unsubscribe;
}
