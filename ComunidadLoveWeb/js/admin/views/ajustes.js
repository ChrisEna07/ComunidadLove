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
import { openHardResetModal } from '../hard-reset-modal.js';

export { openHardResetModal };

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
          title: 'Horarios de Servicios Semanales ("Nuestras Reuniones")',
          subtitle: 'Configura o elimina los servicios recurrentes (Domingos, Miércoles, etc.) que aparecen en el lateral del calendario público.',
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
                <h3 style="margin:0; font-size:1.15rem; color:var(--clg-secondary);">${escapeHTML(min.name || min.title || '')}</h3>
                <small class="clg-hint">${escapeHTML(min.badge || 'Ministerio oficial')}</small>
              </div>
              <span class="clg-tag clg-tag-primary">${escapeHTML(min.id)}</span>
            </div>
            <div class="clg-card-body">
              <form class="clg-form clg-ministry-form" data-ministry-id="${min.id}">
                <div class="clg-grid-2">
                  ${field({ keyPrefix: min.id, name: 'name', label: 'Nombre del Ministerio (Título)', value: min.name || min.title || '', required: true })}
                  ${field({ keyPrefix: min.id, name: 'badge', label: 'Insignia / Etiqueta', value: min.badge || '' })}
                </div>
                ${field({ keyPrefix: min.id, name: 'description', label: 'Descripción Principal', type: 'textarea', rows: 3, value: min.description || '', required: true })}
                
                ${min.id === 'woman' || min.id === 'comunidad'
                  ? field({ keyPrefix: min.id, name: 'quote', label: 'Cita / Versículo destacado', value: min.quote || '' })
                  : ''}
                
                ${min.id === 'adora' || min.id === 'love-adora'
                  ? field({ keyPrefix: min.id, name: 'videoUrl', label: 'Enlace del Video (YouTube Embed)', value: min.videoUrl || '', placeholder: 'https://www.youtube.com/embed/...' })
                  : ''}

                ${min.id === 'buenas-nuevas' || min.id === 'love-buenas-nuevas'
                  ? `
                  <div class="clg-grid-3">
                    ${field({ keyPrefix: min.id, name: 'stat_homes', label: 'Hogares Visitados', value: min.stats?.homes || '500+' })}
                    ${field({ keyPrefix: min.id, name: 'stat_zones', label: 'Zonas e Impacto', value: min.stats?.zones || '15+' })}
                    ${field({ keyPrefix: min.id, name: 'stat_volunteers', label: 'Voluntarios', value: min.stats?.volunteers || '80+' })}
                  </div>

                  <div class="clg-card" style="background: var(--clg-surface-2, #0f172a); border: 1px solid var(--clg-line, #334155); border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                      <div>
                        <h4 style="margin: 0; font-size: 0.95rem; color: var(--clg-primary, #38bdf8);"><i class="fas fa-images"></i> Fotografías de Buenas Nuevas (2 Fotos)</h4>
                        <small class="clg-hint">Cuadrícula visual de 2 fotos en la sección de Buenas Nuevas en la web pública.</small>
                      </div>
                      <span class="clg-tag clg-tag-info" style="font-size: 0.72rem;">2 Fotos</span>
                    </div>
                    <div class="clg-grid-2">
                      ${[0, 1].map((idx) => imageInput({
                        keyPrefix: `${min.id}-gal`,
                        name: `photo_${idx}`,
                        label: `Foto ${idx + 1} de Buenas Nuevas`,
                        value: (Array.isArray(min.gallery) && min.gallery[idx]) || (idx === 0 ? min.imageUrl : '') || (idx === 0 ? './Assets/somos comunidad love/love comunidad (6).jpeg' : './Assets/somos comunidad love/love comunidad (7).jpeg'),
                        hint: `Posición ${idx + 1} en el collage de Buenas Nuevas.`
                      })).join('')}
                    </div>
                  </div>
                  `
                  : ''}

                ${min.id === 'adora' || min.id === 'love-adora'
                  ? `
                  <div class="clg-card" style="background: var(--clg-surface-2, #0f172a); border: 1px solid var(--clg-line, #334155); border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                      <div>
                        <h4 style="margin: 0; font-size: 0.95rem; color: var(--clg-primary, #38bdf8);"><i class="fas fa-images"></i> Collage de 4 Fotografías (Love Adora)</h4>
                        <small class="clg-hint">Cuadrícula visual de 4 fotos en la página principal.</small>
                      </div>
                      <span class="clg-tag clg-tag-info" style="font-size: 0.72rem;">Cuadrícula 4 Fotos</span>
                    </div>
                    <div class="clg-grid-2">
                      ${[0, 1, 2, 3].map((idx) => imageInput({
                        keyPrefix: `${min.id}-gal`,
                        name: `photo_${idx}`,
                        label: `Foto ${idx + 1} del Collage`,
                        value: (Array.isArray(min.gallery) && min.gallery[idx]) || (idx === 0 ? min.imageUrl : '') || `./Assets/Love adora/love adora (${idx + 1}).jpg`,
                        hint: `Posición ${idx + 1} en el collage de la web.`
                      })).join('')}
                    </div>
                  </div>
                  `
                  : (min.id !== 'buenas-nuevas' && min.id !== 'love-buenas-nuevas'
                    ? imageInput({
                        keyPrefix: min.id,
                        name: 'imageUrl',
                        label: 'Imagen Principal',
                        value: min.imageUrl || '',
                        hint: 'Pega una dirección web o sube una imagen (se comprimirá a < 200 KB).'
                      })
                    : '')
                }

                <div style="margin-top: 12px; text-align: right;">
                  <button type="submit" class="clg-btn clg-btn-primary">
                    <i class="fas fa-floppy-disk"></i><span>Guardar ${escapeHTML(min.name || min.title || '')}</span>
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
        const existingMin = ministriesCache.find((m) => m.id === id);

        const patch = {
          name: data[`${prefix}name`],
          title: data[`${prefix}name`],
          badge: data[`${prefix}badge`],
          description: data[`${prefix}description`],
          quote: data[`${prefix}quote`] || '',
          videoUrl: data[`${prefix}videoUrl`] || '',
          imageUrl: data[`${prefix}imageUrl`] || ''
        };

        if (id === 'buenas-nuevas' || id === 'love-buenas-nuevas') {
          patch.stats = {
            homes: data[`${prefix}stat_homes`] || '500+',
            zones: data[`${prefix}stat_zones`] || '15+',
            volunteers: data[`${prefix}stat_volunteers`] || '80+'
          };
          try {
            const raw0 = (data[`${id}-gal-photo_0`] || '').trim();
            const raw1 = (data[`${id}-gal-photo_1`] || '').trim();
            const curGal = Array.isArray(existingMin?.gallery) ? existingMin.gallery : [];

            const g0 = raw0 ? prepareImageValue(raw0) : (curGal[0] || existingMin?.imageUrl || './Assets/somos comunidad love/love comunidad (6).jpeg');
            const g1 = raw1 ? prepareImageValue(raw1) : (curGal[1] || './Assets/somos comunidad love/love comunidad (7).jpeg');

            patch.gallery = [g0, g1];
            patch.imageUrl = g0;
          } catch (err) {
            showToast(err.message, 'danger');
            return;
          }
        } else if (id === 'adora' || id === 'love-adora') {
          try {
            const curGal = Array.isArray(existingMin?.gallery) ? existingMin.gallery : [];
            const r0 = (data[`${id}-gal-photo_0`] || '').trim();
            const r1 = (data[`${id}-gal-photo_1`] || '').trim();
            const r2 = (data[`${id}-gal-photo_2`] || '').trim();
            const r3 = (data[`${id}-gal-photo_3`] || '').trim();

            const g0 = r0 ? prepareImageValue(r0) : (curGal[0] || existingMin?.imageUrl || './Assets/Love adora/love adora (1).jpg');
            const g1 = r1 ? prepareImageValue(r1) : (curGal[1] || './Assets/Love adora/love adora (2).jpg');
            const g2 = r2 ? prepareImageValue(r2) : (curGal[2] || './Assets/Love adora/love adora (3).jpg');
            const g3 = r3 ? prepareImageValue(r3) : (curGal[3] || './Assets/Love adora/love adora (4).jpg');

            patch.gallery = [g0, g1, g2, g3];
            patch.imageUrl = g0;
          } catch (err) {
            showToast(err.message, 'danger');
            return;
          }
        } else {
          try {
            const rawImg = (patch.imageUrl || '').trim();
            patch.imageUrl = rawImg ? prepareImageValue(rawImg) : (existingMin?.imageUrl || '');
          } catch (err) {
            showToast(err.message, 'danger');
            return;
          }
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

    list?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-remove-hour]');
      if (!button) return;
      button.closest('.clg-hour-row')?.remove();

      try {
        const data = readForm(form);
        const updatedServicesList = qsa('.clg-hour-row', form).map((row) => {
          const keys = row.querySelector('[name$="-day"]')?.name.split('-')[0] || '';
          return {
            day: data[`${keys}-day`] || '',
            time: data[`${keys}-time`] || '',
            label: data[`${keys}-label`] || '',
            description: data[`${keys}-description`] || ''
          };
        });

        await saveSettings({
          serviceHours: updatedServicesList,
          services: updatedServicesList
        });
        showToast('Horario eliminado y actualizado en Firestore.', 'info');
      } catch (err) {
        console.error('[CL] Error al eliminar horario:', err);
        showToast('Error al persistir la eliminación del horario.', 'danger');
      }
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

  return () => {
    unsubMinistries();
    unsubGallery();
    unsubscribeStore();
  };
}
