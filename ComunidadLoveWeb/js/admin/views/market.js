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
  deleteProduct,
  watchMarketOrders,
  updateMarketOrderStatus,
  deleteMarketOrder
} from '../../services/market.js';
import { logAudit } from '../../services/audit.js';
import { escapeHTML, qs, showToast, confirmDialog } from '../../lib/dom.js';
import { subscribe, getState, removeLocalEntity } from '../store.js';
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
      subtitle: 'Administra los productos que se muestran en la web pública y gestiona los pedidos',
      icon: 'fa-store',
      actions: `<button class="clg-btn clg-btn-primary" type="button" data-action="new" id="btn-market-new-product">
                  <i class="fas fa-plus"></i><span>Nuevo producto</span>
                </button>`
    })}
    <div class="clg-stats-grid" id="clg-market-stats"></div>
    <div class="clg-tabs" id="clg-market-tabs" role="tablist">
      <button type="button" class="clg-tab is-active" data-market-tab="products">
        <i class="fas fa-boxes-stacked"></i>
        <span>Catálogo de Productos</span>
        <span class="clg-tab-badge" id="clg-tab-count-products">0</span>
      </button>
      <button type="button" class="clg-tab" data-market-tab="orders">
        <i class="fas fa-clipboard-list"></i>
        <span>Pedidos y Solicitudes</span>
        <span class="clg-tab-badge" id="clg-tab-count-orders">0</span>
      </button>
    </div>
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
  const tabsContainer = qs('#clg-market-tabs', container);

  let activeTab = 'products';
  let marketOrders = [];
  let productsList = [];
  let isReady = false;

  const renderCurrentView = () => {
    const bProd = qs('#clg-tab-count-products', container);
    const bOrd = qs('#clg-tab-count-orders', container);
    const pendingOrders = marketOrders.filter((o) => o.status === 'pendiente').length;

    if (bProd) bProd.textContent = productsList.length;
    if (bOrd) bOrd.textContent = pendingOrders > 0 ? `${pendingOrders} pend.` : marketOrders.length;

    const btnNew = qs('#btn-market-new-product', container);
    if (btnNew) btnNew.style.display = activeTab === 'products' ? 'inline-flex' : 'none';

    if (activeTab === 'products') {
      const active = productsList.filter((p) => p.isActive);
      statsHost.innerHTML = `
        ${statCard({ label: 'Productos', value: String(productsList.length), icon: 'fa-box', tone: 'primary' })}
        ${statCard({ label: 'Publicados', value: String(active.length), icon: 'fa-eye', tone: 'success' })}
        ${statCard({
          label: 'Pausados',
          value: String(productsList.length - active.length),
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

      if (!productsList.length && isReady) {
        body.innerHTML = emptyState({
          icon: 'fa-store',
          title: 'No hay productos todavía',
          message:
            'Crea el primero para que aparezca en la web. Mientras no haya productos, el sitio muestra los ejemplos de fábrica.',
          action: ''
        });
        return;
      }

      body.innerHTML = productsList.length ? renderGrid(productsList) : body.innerHTML;
    } else {
      const delivered = marketOrders.filter((o) => o.status === 'entregado').length;
      const totalAmount = marketOrders
        .filter((o) => o.status !== 'cancelado')
        .reduce((sum, o) => sum + (o.productPrice || 0), 0);

      statsHost.innerHTML = `
        ${statCard({ label: 'Total Pedidos', value: String(marketOrders.length), icon: 'fa-clipboard-list', tone: 'primary' })}
        ${statCard({ label: 'Pendientes', value: String(pendingOrders), icon: 'fa-clock', tone: 'warning' })}
        ${statCard({ label: 'Entregados', value: String(delivered), icon: 'fa-circle-check', tone: 'success' })}
        ${statCard({ label: 'Monto estimado', value: formatPrice(totalAmount), icon: 'fa-sack-dollar', tone: 'news' })}
      `;

      if (!marketOrders.length) {
        body.innerHTML = emptyState({
          icon: 'fa-clipboard-list',
          title: 'No hay solicitudes de pedidos todavía',
          message: 'Cuando las personas soliciten productos desde la landing pública ("¡Lo quiero!"), aparecerán aquí en tiempo real.'
        });
        return;
      }

      body.innerHTML = renderOrdersList(marketOrders);
    }
  };

  tabsContainer?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-market-tab]');
    if (!btn) return;
    tabsContainer.querySelectorAll('.clg-tab').forEach((t) => t.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeTab = btn.dataset.marketTab;
    renderCurrentView();
  });

  const off = subscribe(['products', 'ready'], (state) => {
    productsList = state.products || [];
    isReady = Boolean(state.ready);
    renderCurrentView();
  });

  const unsubOrders = watchMarketOrders((orders) => {
    marketOrders = orders;
    renderCurrentView();
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
        removeLocalEntity('products', product.id);
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

    if (action === 'set-order-status') {
      const newStatus = trigger.dataset.status;
      try {
        await updateMarketOrderStatus(id, newStatus);
        showToast(`Pedido marcado como ${newStatus}`, 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo actualizar el pedido.', 'danger');
      }
    }

    if (action === 'delete-order') {
      const ok = await confirmDialog({
        title: 'Eliminar pedido',
        message: '¿Estás seguro de eliminar este pedido del registro?',
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await deleteMarketOrder(id);
        showToast('Pedido eliminado del registro', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo eliminar el pedido.', 'danger');
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

  return () => {
    off();
    unsubOrders();
  };
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

function renderOrdersList(orders) {
  const cards = orders.map((o) => {
    const cleanPhone = String(o.customerPhone || '').replace(/\D/g, '');
    const waText = encodeURIComponent(`Hola ${o.customerName}, te escribimos de Comunidad Love respecto a tu solicitud de "${o.productName}".`);
    const waLink = `https://wa.me/57${cleanPhone}?text=${waText}`;

    const statusTone = o.status === 'entregado' ? 'success' : (o.status === 'cancelado' ? 'neutral' : 'warning');
    const statusText = o.status === 'entregado' ? 'Entregado' : (o.status === 'cancelado' ? 'Cancelado' : 'Pendiente');

    return `
      <article class="clg-card" style="padding: 18px; margin-bottom: 16px; border-left: 4px solid var(--clg-${statusTone === 'warning' ? 'primary' : (statusTone === 'success' ? 'success' : 'line')});" data-order-id="${o.id}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 1.05rem; color: var(--clg-secondary);">${escapeHTML(o.customerName)}</strong>
              ${tag(statusText, statusTone)}
            </div>
            <div style="font-size: 0.85rem; color: var(--clg-muted); margin-top: 4px;">
              <i class="fas fa-phone"></i> ${escapeHTML(o.customerPhone)} · <i class="fas fa-clock"></i> ${escapeHTML(o.createdAt ? o.createdAt.toLocaleString('es-CO') : 'Reciente')}
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="clg-btn clg-btn-sm" style="background: #25D366; color: white;" title="Escribir por WhatsApp">
              <i class="fab fa-whatsapp"></i><span>Chat WhatsApp</span>
            </a>
            ${o.status !== 'entregado' ? `
              <button type="button" class="clg-btn clg-btn-sm clg-btn-ghost" data-action="set-order-status" data-id="${o.id}" data-status="entregado" title="Marcar como entregado">
                <i class="fas fa-check" style="color: var(--clg-success);"></i><span>Entregar</span>
              </button>
            ` : ''}
            ${o.status !== 'cancelado' ? `
              <button type="button" class="clg-btn clg-btn-sm clg-btn-ghost" data-action="set-order-status" data-id="${o.id}" data-status="cancelado" title="Cancelar pedido">
                <i class="fas fa-ban" style="color: var(--clg-muted);"></i><span>Cancelar</span>
              </button>
            ` : ''}
            <button type="button" class="clg-btn clg-btn-sm clg-btn-danger-soft" data-action="delete-order" data-id="${o.id}" title="Eliminar registro">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--clg-line); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; font-size: 0.88rem;">
          <div>
            <div style="color: var(--clg-muted); font-size: 0.78rem; font-weight: 600;">PRODUCTO / VARIANTE:</div>
            <strong>${escapeHTML(o.productName)}</strong> ${o.variant ? `<span class="clg-badge" style="margin-left: 4px;">${escapeHTML(o.variant)}</span>` : ''}
            <div style="color: var(--clg-primary); font-weight: 700; margin-top: 2px;">${escapeHTML(formatPrice(o.productPrice))}</div>
          </div>
          <div>
            <div style="color: var(--clg-muted); font-size: 0.78rem; font-weight: 600;">MÉTODO DE PAGO:</div>
            <div>${o.paymentMethod === 'transfer' ? '<i class="fas fa-building-columns"></i> Transferencia (Nequi/Banco)' : '<i class="fas fa-money-bill-wave"></i> Efectivo en sede'}</div>
            ${o.receiptUrl ? `
              <div style="margin-top: 6px;">
                <a href="${escapeHTML(o.receiptUrl)}" target="_blank" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--clg-primary); font-weight: 600;">
                  <img src="${escapeHTML(o.receiptUrl)}" alt="Comprobante" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover; border: 1px solid var(--clg-line);">
                  <span>Ver Comprobante</span>
                </a>
              </div>
            ` : ''}
          </div>
          ${o.notes ? `
            <div>
              <div style="color: var(--clg-muted); font-size: 0.78rem; font-weight: 600;">NOTAS:</div>
              <div style="font-style: italic;">"${escapeHTML(o.notes)}"</div>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');

  return `<div class="clg-orders-list">${cards}</div>`;
}