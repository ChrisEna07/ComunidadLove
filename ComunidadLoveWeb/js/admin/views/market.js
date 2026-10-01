/* ==========================================================================
   VISTA: LOVE MARKET (productos)
   --------------------------------------------------------------------------
   CRUD de `market_products`. Un producto creado aquí aparece en la web
   pública; si la colección está vacía, el sitio muestra los productos de
   ejemplo que ya vienen en el HTML (ver `js/public-init.js`).

   El precio se guarda como NÚMERO en pesos: "85000" en Firestore y
   "$85.000" sólo al mostrarlo. Así se puede filtrar y ordenar sin parsear.
   ========================================================================== */

import {
  MARKET_CATEGORIES,
  MARKET_BADGES,
  CATEGORY_LABELS,
  formatPrice,
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct
} from '../../services/market.js';
import { logAudit } from '../../services/audit.js';
import { escapeHTML, qs, showToast, confirmDialog } from '../../lib/dom.js';
import { subscribe, getState } from '../store.js';
import {
  pageHeader,
  emptyState,
  statCard,
  tag,
  field,
  drawer,
  checkboxField,
  markInvalid,
  clearInvalid,
  setLoading,
  readForm
} from '../ui.js';
import { imageInput, bindImageInputs, prepareImageValue } from '../image-input.js';

export function renderMarket(container) {
  const me = getState().profile || {};

  container.innerHTML = `
    ${pageHeader({
      title: 'Love Market',
      subtitle: 'Administra los productos que se muestran en la web pública',
      icon: 'fa-store',
      actions: `<button class="clg-btn clg-btn-primary" type="button" data-action="new">
                  <i class="fas fa-plus"></i><span>Nuevo producto</span>
                </button>`
    })}
    <div class="clg-stats-grid" id="clg-market-stats"></div>
    <div id="clg-market-body">
      <div class="clg-table-skeleton">
        ${Array.from({ length: 3 }, () => '<div class="clg-skeleton-row"></div>').join('')}
      </div>
    </div>
    <div id="clg-market-drawer"></div>
  `;

  const statsHost = qs('#clg-market-stats', container);
  const body = qs('#clg-market-body', container);
  const drawerHost = qs('#clg-market-drawer', container);

  const off = subscribe(['products', 'ready'], (state) => {
    const products = state.products || [];
    const active = products.filter((p) => p.isActive);

    statsHost.innerHTML = `
      ${statCard({ label: 'Productos', value: String(products.length), icon: 'fa-box', tone: 'primary' })}
      ${statCard({ label: 'Publicados', value: String(active.length), icon: 'fa-eye', tone: 'success' })}
      ${statCard({
        label: 'Pausados',
        value: String(products.length - active.length),
        icon: 'fa-eye-slash',
        tone: 'neutral'
      })}
      ${statCard({
        label: 'Valor publicado',
        value: formatPrice(active.reduce((sum, p) => sum + p.price, 0)),
        icon: 'fa-sack-dollar',
        tone: 'news'
      })}
    `;

    if (!products.length && state.ready) {
      body.innerHTML = emptyState({
        icon: 'fa-store',
        title: 'No hay productos todavía',
        message:
          'Crea el primero para que aparezca en la web. Mientras no haya productos, el sitio muestra los ejemplos de fábrica.',
        action: ''
      });
      return;
    }

    body.innerHTML = products.length ? renderGrid(products) : body.innerHTML;
  });

  container.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;

    if (action === 'new') {
      openDrawer({ product: null, me });
    }

    if (action === 'edit') {
      const product = (getState().products || []).find((p) => p.id === id);
      if (product) openDrawer({ product, me });
    }

    if (action === 'toggle') {
      const product = (getState().products || []).find((p) => p.id === id);
      if (!product) return;
      const next = !product.isActive;
      try {
        await setProductActive(product.id, next);
        await logAudit({
          actor: me,
          action: 'market.toggle',
          module: 'market',
          details: { product: product.name, published: next }
        });
        showToast(next ? 'Producto publicado' : 'Producto pausado', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo cambiar el estado.', 'danger');
      }
    }

    if (action === 'delete') {
      const product = (getState().products || []).find((p) => p.id === id);
      if (!product) return;
      const ok = await confirmDialog({
        title: 'Eliminar producto',
        message: `Se eliminará "${product.name}" del catálogo. Si sólo quieres dejar de mostrarlo, mejor paúsalo.`,
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await deleteProduct(product.id);
        await logAudit({
          actor: me,
          action: 'market.delete',
          module: 'market',
          details: { product: product.name }
        });
        showToast('Producto eliminado', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo eliminar.', 'danger');
      }
    }
  });

  /* --------------------------------------------------------------------
     DRAWER
     -------------------------------------------------------------------- */
  function openDrawer({ product, me: actor }) {
    const isEdit = Boolean(product);

    drawerHost.innerHTML = drawer({
      id: 'clg-product-drawer',
      title: isEdit ? 'Editar producto' : 'Nuevo producto',
      body: `
        <form id="clg-product-form" class="clg-form" novalidate>
          <div class="clg-form-error" hidden></div>

          ${field({
            name: 'name',
            label: 'Nombre del producto',
            value: product?.name || '',
            required: true,
            placeholder: 'Ej. Camiseta "Jesús salva"',
            icon: 'fa-tag'
          })}

          <div class="clg-grid-2">
            ${field({
              name: 'price',
              label: 'Precio (COP)',
              type: 'number',
              value: product ? String(product.price) : '',
              required: true,
              min: '1',
              step: '1',
              placeholder: '85000',
              hint: 'Sólo el número, sin puntos ni símbolo.'
            })}
            ${field({
              name: 'stock',
              label: 'Unidades disponibles',
              type: 'number',
              value: product ? String(product.stock) : '0',
              min: '0',
              step: '1',
              hint: '0 se muestra como "Agotado".'
            })}
          </div>

          ${field({
            name: 'category',
            label: 'Categoría',
            options: MARKET_CATEGORIES,
            value: product?.category || 'ropa'
          })}

          ${field({
            name: 'badge',
            label: 'Distintivo',
            options: MARKET_BADGES.map((b) => ({ value: b, label: b || 'Sin distintivo' })),
            value: product?.badge || ''
          })}

          ${imageInput({
            name: 'imageUrl',
            label: 'Foto del producto',
            value: product?.imageUrl || '',
            hint: 'Pega una URL o elige un archivo de hasta 200 KB.'
          })}

          ${field({
            name: 'description',
            label: 'Descripción',
            type: 'textarea',
            rows: 3,
            value: product?.description || '',
            placeholder: 'Tela, talla, color, estado…'
          })}

          ${checkboxField({
            name: 'isActive',
            label: 'Publicado en la web',
            checked: product ? product.isActive : true,
            hint: 'Si lo despublicas, sigue guardado pero no se muestra.'
          })}
        </form>
      `,
      footer: `
        <div class="clg-drawer-actions">
          <button type="button" class="clg-btn clg-btn-ghost" data-close-drawer="clg-product-drawer">Cancelar</button>
          <button type="submit" form="clg-product-form" class="clg-btn clg-btn-primary">
            <i class="fas fa-check"></i><span>${isEdit ? 'Guardar cambios' : 'Crear producto'}</span>
          </button>
        </div>`
    });

    bindImageInputs(drawerHost);

    const form = qs('#clg-product-form', drawerHost);
    const overlay = drawerHost.querySelector('.clg-drawer-overlay');
    overlay?.classList.add('is-open');
    qs('#clg-product-drawer', drawerHost)?.classList.add('is-open');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearInvalid(form);

      const data = readForm(form);
      if (!data.name) return markInvalid(form, 'Escribe el nombre del producto.');
      if (!data.price || Number(data.price) <= 0) {
        return markInvalid(form, 'Ingresa un precio mayor que cero.');
      }

      let imageUrl = '';
      try {
        imageUrl = prepareImageValue(data.imageUrl, 'foto del producto');
      } catch (error) {
        return markInvalid(form, error.message);
      }

      const payload = {
        name: data.name,
        price: Number(data.price),
        stock: Number(data.stock) || 0,
        category: data.category,
        badge: data.badge,
        description: data.description,
        isActive: data.isActive,
        imageUrl
      };

      setLoading(form, true);
      try {
        if (isEdit) {
          await updateProduct(product.id, payload);
          await logAudit({
            actor,
            action: 'market.update',
            module: 'market',
            details: { product: payload.name, price: payload.price }
          });
          showToast('Producto actualizado', 'success');
        } else {
          await createProduct(payload);
          await logAudit({
            actor,
            action: 'market.create',
            module: 'market',
            details: { product: payload.name, price: payload.price }
          });
          showToast('Producto creado', 'success');
        }
        closeDrawer();
      } catch (error) {
        markInvalid(form, error.message || 'No se pudo guardar el producto.');
        setLoading(form, false);
      }
    });

    function closeDrawer() {
      overlay?.classList.remove('is-open');
      qs('#clg-product-drawer', drawerHost)?.classList.remove('is-open');
      setTimeout(() => {
        drawerHost.innerHTML = '';
      }, 200);
    }

    drawerHost.querySelectorAll('[data-close-drawer]').forEach((btn) => {
      btn.addEventListener('click', closeDrawer);
    });
  }

  return () => off();
}

/* --------------------------------------------------------------------------
   TARJETAS
   -------------------------------------------------------------------------- */

function renderGrid(products) {
  const cards = products
    .map(
      (p) => `
      <article class="clg-product-card${p.isActive ? '' : ' is-paused'}" data-id="${p.id}">
        <div class="clg-product-media">
          ${
            p.imageUrl
              ? `<img src="${escapeHTML(p.imageUrl)}" alt="${escapeHTML(p.name)}" loading="lazy">`
              : `<div class="clg-product-media-fallback" aria-hidden="true">
                   <i class="fas fa-gift"></i>
                 </div>`
          }
          ${p.badge ? `<span class="clg-product-badge">${escapeHTML(p.badge)}</span>` : ''}
          ${!p.isActive ? '<span class="clg-product-paused">Pausado</span>' : ''}
        </div>
        <div class="clg-product-body">
          <span class="clg-product-cat">${escapeHTML(CATEGORY_LABELS[p.category] || p.category)}</span>
          <h3>${escapeHTML(p.name)}</h3>
          <p class="clg-product-desc">${escapeHTML(p.description || 'Sin descripción.')}</p>
          <div class="clg-product-meta">
            <strong>${escapeHTML(formatPrice(p.price))}</strong>
            ${p.stock > 0 ? tag(`${p.stock} disp.`, 'neutral') : tag('Agotado', 'danger')}
          </div>
          <div class="clg-product-actions">
            <button type="button" class="clg-btn clg-btn-ghost clg-btn-sm" data-action="toggle" data-id="${p.id}">
              <i class="fas ${p.isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
              <span>${p.isActive ? 'Pausar' : 'Publicar'}</span>
            </button>
            <button type="button" class="clg-btn clg-btn-ghost clg-btn-sm" data-action="edit" data-id="${p.id}">
              <i class="fas fa-pen"></i><span>Editar</span>
            </button>
            <button type="button" class="clg-btn clg-btn-danger-soft" data-action="delete" data-id="${p.id}">
              <i class="fas fa-trash"></i><span>Eliminar</span>
            </button>
          </div>
        </div>
      </article>`
    )
    .join('');

  return `<div class="clg-product-grid">${cards}</div>`;
}