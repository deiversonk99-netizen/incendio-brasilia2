export interface CatalogPriceProduct {
  id: string;
  name: string;
  price: number | null;
  cost_price: number | null;
}

interface CatalogLinkedBudgetItem {
  id: string;
  name: string;
  item_type: string;
  unit_price: number;
  cost_price?: number | null;
  product_id?: string | null;
  sync_with_catalog?: boolean;
  apply_bdi?: boolean;
  apply_profit?: boolean;
}

interface SyncOptions {
  bdiPercent?: number;
  profitPercent?: number;
  applyProposalMarkup?: boolean;
}

const money = (value: number) => Number(value.toFixed(2));

export const normalizeCatalogProductName = (value: string) => value
  .replace(/^\[MODELO:[^\]]+\]\s*/i, '')
  .replace(/\s*\[INFRA:[^\]]+\]\s*$/i, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('pt-BR');

export const syncBudgetItemsWithCatalog = <T extends CatalogLinkedBudgetItem>(
  items: T[],
  catalog: CatalogPriceProduct[],
  options: SyncOptions = {}
) => {
  const catalogById = new Map(catalog.map(product => [product.id, product]));
  const catalogByName = new Map(catalog.map(product => [normalizeCatalogProductName(product.name), product]));
  const changedItems: T[] = [];

  const syncedItems = items.map(item => {
    if (item.item_type !== 'PRODUCT' || item.sync_with_catalog !== true) return item;

    const product = (item.product_id ? catalogById.get(item.product_id) : undefined)
      || catalogByName.get(normalizeCatalogProductName(item.name));

    if (!product) return item;

    const catalogCost = Number(product.cost_price) || 0;
    const catalogSale = Number(product.price) || 0;
    let unitPrice = catalogSale;

    if (options.applyProposalMarkup && catalogCost > 0) {
      const bdiFactor = item.apply_bdi !== false
        ? 1 + ((Number(options.bdiPercent) || 0) / 100)
        : 1;
      const profitFactor = item.apply_profit !== false
        ? 1 + ((Number(options.profitPercent) || 0) / 100)
        : 1;
      unitPrice = catalogCost * bdiFactor * profitFactor;
    }

    const nextItem = {
      ...item,
      product_id: product.id,
      cost_price: money(catalogCost),
      unit_price: money(unitPrice)
    };

    const changed = item.product_id !== nextItem.product_id
      || Math.abs((Number(item.cost_price) || 0) - nextItem.cost_price) >= 0.005
      || Math.abs((Number(item.unit_price) || 0) - nextItem.unit_price) >= 0.005;

    if (changed) changedItems.push(nextItem);
    return nextItem;
  });

  return { items: syncedItems, changedItems };
};
