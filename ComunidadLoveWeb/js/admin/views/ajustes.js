/* ==========================================================================
   VISTA: AJUSTES DEL SITIO Y CMS GENERAL (CLGESTIÓN)
   --------------------------------------------------------------------------
   - Ajustes generales (horarios, avisos, streaming, contacto, redes).
   - CMS de Ministerios (Kids, Woman, Buenas Nuevas, Adora, Nuestra Comunidad).
   - CMS de Galería dinámica (fotos categorizadas).
   - Respaldo y restauración offline-first (JSON).
   - Zona de peligro (Super Admin): Restablecer datos de fábrica (Hard Reset).
   ========================================================================== */

import { saveSettings } from '../../services/site.js';
import { can } from '../../lib/auth.js';
import { escapeHTML, qs, qsa, showToast, confirmDialog } from '../../lib/dom.js';
import { subscribe, getState } from '../store.js';
import { pageHeader, card, field, checkboxField, markInvalid, clearInvalid, setLoading, readForm } from '../ui.js';
import { exportFirestoreBackup, downloadBackupJSON, restoreFirestoreBackup } from '../../services/backup.js';
import { seedInitialData, hardResetFactoryData } from '../../services/seed.js';
import { watchMinistries, updateMinistry, DEFAULT_MINISTRIES } from '../../services/ministries.js';
import { watchGallery, addGalleryItem, deleteGalleryItem, GALLERY_CATEGORIES, DEFAULT_GALLERY_ITEMS } from '../../services/gallery.js';
import { bindImageInputs, imageInput, prepareImageValue } from '../image-input.js';
import { resolveAssetUrl } from '../../lib/image.js';
import { bindLiveFormValidation } from '../../lib/validation.js';

let ministriesCache = DEFAULT_MINISTRIES;
let galleryCache = DEFAULT_GALLERY_ITEMS;
let activeTab = 'general';

export function renderAjustes(container) {
  container.innerHTML = `
    ${pageHeader({
      title: 'Ajustes del Sitio & CMS',
      subtitle: 'Administra en tiempo real los contenidos, ministerios y galería de la web pública',
      icon: 'fa-sliders'
    })}
    <div class="clg-tabs" id="clg-ajustes-tabs" style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid var(--clg-line); padding-bottom:12px; flex-wrap:wrap;">
      <button type="button" class="clg-btn ${activeTab === 'general' ? 'clg-btn-primary' : 'clg-btn-ghost'}" data-tab="general">
        <i class="fas fa-sliders"></i><span>Configuración General</span>
      </button>
      <button type="button" class="clg-btn ${activeTab === 'ministries' ? 'clg-btn-primary' : 'clg-btn-ghost'}" data-tab="ministries">
        <i class="fas fa-church"></i><span>CMS Ministerios</span>
      </button>
      <button type="button" class="clg-btn ${activeTab === 'gallery' ? 'clg-btn-primary' : 'clg-btn-ghost'}" data-tab="gallery">
        <i class="fas fa-images"></i><span>CMS Galería</span>
      </button>
    </div>
    <div id="clg-ajustes-body">
      <div class="clg-skeleton-line clg-skeleton-line-lg"></div>
      <div class="clg-skeleton-line"></div>
      <div class="clg-skeleton-line"></div>
    </div>
  `;

  const body = qs('#clg-ajustes-body', container);

  qs('#clg-ajustes-tabs', container)?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    qsa('#clg-ajustes-tabs button', container).forEach((b) => {
      const isActive = b.dataset.tab === activeTab;
      b.className = `clg-btn ${isActive ? 'clg-btn-primary' : 'clg-btn-ghost'}`;
    });
    renderCurrentTab();
  });

  // Suscripción en tiempo real a ministerios y galería
  const unsubMinistries = watchMinistries((list) => {
    ministriesCache = list;
    if (activeTab === 'ministries') renderCurrentTab();
  });

  const unsubGallery = watchGallery((items) => {
    galleryCache = items;
    if (activeTab === 'gallery') renderCurrentTab();
  });

  const unsubscribeStore = subscribe(['settings', 'settingsExists', 'ready', 'profile'], (state) => {
    if (!state.ready) return;
    renderCurrentTab();
  });

  function renderCurrentTab() {
    const state = getState();
    const editable = can(state.profile?.role, 'content.write');
    const isSuperAdmin = state.profile?.role === 'superadmin';

    if (!editable) {
      body.innerHTML = card({
        title: 'Configuración del sitio',
        body: '<p class="clg-cell-muted">Tu rol no permite modificar la configuración del sitio.</p>'
      });
      return;
    }

    if (activeTab === 'general') {
      renderGeneralSettingsTab(state, isSuperAdmin);
    } else if (activeTab === 'ministries') {
      renderMinistriesTab();
    } else if (activeTab === 'gallery') {
      renderGalleryTab();
    }
  }

  function renderGeneralSettingsTab(state, isSuperAdmin) {
    const settings = state.settings || {};
    const hours = Array.isArray(settings.serviceHours) ? settings.serviceHours : [];

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
          subtitle: 'Video mostrado en la sección "Ver Nuestras Reuniones"',
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

        ${
          isSuperAdmin
            ? `
            <div class="clg-card" style="border: 2px solid #ef4444; background: #fff5f5; border-radius: var(--clg-radius); padding: 20px; margin-top: 24px;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <i class="fas fa-triangle-exclamation" style="font-size: 1.4rem; color: #dc2626;"></i>
                <h3 style="color: #991b1b; font-size: 1.15rem; margin: 0;">Zona de Mantenimiento Técnico (Solo Super Admin)</h3>
              </div>
              <p style="font-size: 0.88rem; color: #7f1d1d; line-height: 1.5; margin-bottom: 16px;">
                <strong>Restablecer Datos de Fábrica:</strong> Elimina todas las colecciones con datos de prueba (eventos, pedidos, productos de market, peticiones, avisos, ministerios y galería) y siembra los contenidos oficiales limpios. <em>La base de datos de usuarios y autenticación permanecerá intacta.</em>
              </p>
              <button type="button" class="clg-btn clg-btn-danger" id="btn-hard-reset">
                <i class="fas fa-rotate-left"></i><span>Restablecer Datos de Fábrica</span>
              </button>
            </div>
            `
            : ''
        }
      </form>
    `;

    bindHours(qs('#clg-ajustes-form', body));
    bindBackupActions(body, state.profile);
    bindLiveFormValidation(body);
  }

  function renderMinistriesTab() {
    body.innerHTML = `
      <div class="clg-ministries-cms">
        ${ministriesCache
          .map(
            (min) => `
          <div class="clg-card" style="margin-bottom: 24px;">
            <div class="clg-card-header" style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h3 style="margin:0; font-size:1.15rem; color:var(--clg-secondary);">${escapeHTML(min.name)}</h3>
                <small class="clg-hint">${escapeHTML(min.badge || 'Ministerio oficial')}</small>
              </div>
              <span class="clg-tag clg-tag-primary">${escapeHTML(min.id)}</span>
            </div>
            <div class="clg-card-body">
              <form class="clg-form clg-ministry-form" data-ministry-id="${min.id}">
                <div class="clg-grid-2">
                  ${field({ keyPrefix: min.id, name: 'name', label: 'Nombre del Ministerio', value: min.name || '', required: true })}
                  ${field({ keyPrefix: min.id, name: 'badge', label: 'Insignia / Etiqueta', value: min.badge || '' })}
                </div>
                ${field({ keyPrefix: min.id, name: 'description', label: 'Descripción Principal', type: 'textarea', rows: 3, value: min.description || '', required: true })}
                
                ${min.id === 'woman' || min.id === 'comunidad'
                  ? field({ keyPrefix: min.id, name: 'quote', label: 'Cita / Versículo destacado', value: min.quote || '' })
                  : ''}
                
                ${min.id === 'adora'
                  ? field({ keyPrefix: min.id, name: 'videoUrl', label: 'Enlace del Video (YouTube Embed)', value: min.videoUrl || '', placeholder: 'https://www.youtube.com/embed/...' })
                  : ''}

                ${min.id === 'buenas-nuevas'
                  ? `
                  <div class="clg-grid-3">
                    ${field({ keyPrefix: min.id, name: 'stat_homes', label: 'Hogares Visitados', value: min.stats?.homes || '500+' })}
                    ${field({ keyPrefix: min.id, name: 'stat_zones', label: 'Zonas e Impacto', value: min.stats?.zones || '15+' })}
                    ${field({ keyPrefix: min.id, name: 'stat_volunteers', label: 'Voluntarios', value: min.stats?.volunteers || '80+' })}
                  </div>
                  `
                  : ''}

                ${imageInput({
                  keyPrefix: min.id,
                  name: 'imageUrl',
                  label: 'Imagen Principal',
                  value: min.imageUrl || '',
                  hint: 'Pega una dirección web o sube una imagen (se comprimirá a < 200 KB).'
                })}

                <div style="margin-top: 12px; text-align: right;">
                  <button type="submit" class="clg-btn clg-btn-primary">
                    <i class="fas fa-floppy-disk"></i><span>Guardar ${escapeHTML(min.name)}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    bindImageInputs(body);
    bindLiveFormValidation(body);

    body.querySelectorAll('.clg-ministry-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = form.dataset.ministryId;
        const data = readForm(form);
        const prefix = `${id}-`;

        const patch = {
          name: data[`${prefix}name`],
          badge: data[`${prefix}badge`],
          description: data[`${prefix}description`],
          quote: data[`${prefix}quote`] || '',
          videoUrl: data[`${prefix}videoUrl`] || '',
          imageUrl: data[`${prefix}imageUrl`] || ''
        };

        if (id === 'buenas-nuevas') {
          patch.stats = {
            homes: data[`${prefix}stat_homes`] || '500+',
            zones: data[`${prefix}stat_zones`] || '15+',
            volunteers: data[`${prefix}stat_volunteers`] || '80+'
          };
        }

        try {
          patch.imageUrl = prepareImageValue(patch.imageUrl);
        } catch (err) {
          showToast(err.message, 'danger');
          return;
        }

        setLoading(form, true, 'Guardando…');
        try {
          await updateMinistry(id, patch);
          showToast(`Ministerio "${patch.name}" actualizado en Firestore y en la web.`, 'success');
        } catch (err) {
          showToast(err.message || 'Error al actualizar ministerio.', 'danger');
        } finally {
          setLoading(form, false);
        }
      });
    });
  }

  function renderGalleryTab() {
    body.innerHTML = `
      <div class="clg-gallery-cms">
        ${card({
          title: 'Añadir Nueva Foto a la Galería',
          subtitle: 'Las fotos se publicarán de inmediato en la sección "Galería Eventos Love"',
          body: `
            <form class="clg-form" id="clg-gallery-add-form">
              <div class="clg-grid-2">
                ${field({ name: 'gal-title', label: 'Título de la foto o momento', placeholder: 'Ej. Celebración Dominical', required: true })}
                ${field({
                  name: 'gal-category',
                  label: 'Categoría',
                  type: 'select',
                  options: GALLERY_CATEGORIES,
                  value: 'comunidad'
                })}
              </div>
              ${imageInput({
                name: 'gal-imageUrl',
                label: 'Archivo de imagen o URL',
                hint: 'Sube la foto desde tu equipo (se optimizará a < 200 KB) o pega una URL.'
              })}
              <div style="margin-top: 10px;">
                <button type="submit" class="clg-btn clg-btn-primary">
                  <i class="fas fa-plus"></i><span>Publicar en la Galería</span>
                </button>
              </div>
            </form>
          `
        })}

        ${card({
          title: `Fotos Publicadas (${galleryCache.length})`,
          subtitle: 'Gestiona las imágenes visibles para los visitantes',
          body: `
            <div class="clg-gallery-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;">
              ${galleryCache
                .map(
                  (item) => `
                <div class="clg-gallery-card" style="border: 1px solid var(--clg-line); border-radius: var(--clg-radius-sm); overflow: hidden; background: #fff; display: flex; flex-direction: column;">
                  <div style="height: 140px; background: #f1f5f9; overflow: hidden; position: relative;">
                    <img src="${escapeHTML(resolveAssetUrl(item.imageUrl))}" alt="${escapeHTML(item.title)}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                    <span style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.65); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 999px;">
                      ${escapeHTML(GALLERY_CATEGORIES.find((c) => c.value === item.category)?.label || item.category)}
                    </span>
                  </div>
                  <div style="padding: 10px 12px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <strong style="font-size: 0.85rem; color: var(--clg-secondary); line-height: 1.3; margin-bottom: 8px;">${escapeHTML(item.title)}</strong>
                    <button type="button" class="clg-btn clg-btn-danger-soft clg-btn-sm" data-delete-gallery="${item.id}" style="align-self: flex-start;">
                      <i class="fas fa-trash-can"></i><span>Eliminar</span>
                    </button>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `
        })}
      </div>
    `;

    bindImageInputs(body);
    bindLiveFormValidation(body);

    // Formulario de agregar a galería
    const addForm = qs('#clg-gallery-add-form', body);
    addForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearInvalid(addForm);
      const data = readForm(addForm);
      const title = data['gal-title'];
      const category = data['gal-category'];
      let imageUrl = data['gal-imageUrl'];

      if (!title) {
        markInvalid(addForm, 'Ingresa un título para la foto.');
        return;
      }
      if (!imageUrl) {
        markInvalid(addForm, 'Sube una imagen o pega una URL.');
        return;
      }

      try {
        imageUrl = prepareImageValue(imageUrl);
      } catch (err) {
        markInvalid(addForm, err.message);
        return;
      }

      setLoading(addForm, true, 'Subiendo…');
      try {
        await addGalleryItem({ title, category, imageUrl });
        showToast('Foto agregada a la galería con éxito.', 'success');
        addForm.reset();
      } catch (err) {
        markInvalid(addForm, err.message || 'Error al guardar la foto.');
      } finally {
        setLoading(addForm, false);
      }
    });

    // Eliminar de galería
    body.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-gallery]');
      if (!btn) return;
      const id = btn.dataset.deleteGallery;
      const ok = await confirmDialog({
        title: 'Eliminar foto',
        message: '¿Estás seguro de retirar esta foto de la galería web?',
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;

      btn.disabled = true;
      try {
        await deleteGalleryItem(id);
        showToast('Foto eliminada de la galería.', 'success');
      } catch (err) {
        showToast(err.message || 'Error al eliminar foto.', 'danger');
        btn.disabled = false;
      }
    });
  }

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

    list?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-hour]');
      if (button) button.closest('.clg-hour-row')?.remove();
    });

    form?.addEventListener('submit', async (event) => {
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
    const btnHardReset = qs('#btn-hard-reset', containerEl);

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

    // Hard Reset a estado de fábrica (Exclusivo Super Admin con respaldo previo)
    btnHardReset?.addEventListener('click', () => {
      openHardResetModal(actor);
    });
  }

  function openHardResetModal(actor) {
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
                <strong style="display: block; font-size: 0.92rem; color: #38bdf8;">Paso 1: Respaldo de Seguridad</strong>
                <span style="font-size: 0.82rem; color: #94a3b8;">Genera una copia JSON completa (incluye miembros y pedidos)</span>
              </div>
              <button type="button" class="clg-btn clg-btn-primary" id="btn-modal-backup-now" style="font-size: 0.84rem;">
                <i class="fas fa-download"></i><span>Descargar Respaldo JSON Completo Ahora</span>
              </button>
            </div>
            <div id="modal-backup-status" style="margin-top: 8px; font-size: 0.8rem; color: #10b981; display: none;">
              <i class="fas fa-circle-check"></i> Respaldo descargado correctamente.
            </div>
          </div>

          <!-- Paso 2: Verificación de Registros Locales -->
          <div style="font-size: 0.84rem; color: #94a3b8; margin-bottom: 18px;">
            <i class="fas fa-database"></i> Registros y claves locales en IndexedDB / LocalStorage detectadas: <strong>${localKeysCount} claves</strong>.
          </div>

          <!-- Paso 3: Confirmación con palabra clave -->
          <div style="margin-bottom: 24px;">
            <label style="display: block; font-size: 0.86rem; font-weight: 600; margin-bottom: 8px;">
              Paso 2: Escribe la palabra clave <code style="background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 2px 6px; border-radius: 4px; font-size: 0.95rem;">RESET</code> para confirmar:
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
        backupStatus.style.display = 'block';
        showToast('Respaldo generado y descargado exitosamente.', 'success');
      } catch (err) {
        showToast('Error generando respaldo: ' + err.message, 'danger');
      } finally {
        btnBackup.disabled = false;
        btnBackup.innerHTML = '<i class="fas fa-circle-check"></i><span>Respaldo Descargado</span>';
      }
    });

    inputConfirm?.addEventListener('input', () => {
      const match = inputConfirm.value.trim() === 'RESET';
      btnExecute.disabled = !match;
      btnExecute.style.opacity = match ? '1' : '0.5';
      btnExecute.style.cursor = match ? 'pointer' : 'not-allowed';
    });

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

  return () => {
    unsubMinistries();
    unsubGallery();
    unsubscribeStore();
  };
}
