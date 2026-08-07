export type EquipmentSlotId = "tool" | "weapon" | "armor" | "artifact";

export type ItemDefinition = {
  id: string;
  name: string;
  itemKind: EquipmentSlotId;
  rarity: string;
};

export type PlayerItem = {
  itemId: string;
  quantity: number;
};

export type PlayerEquipment = {
  slotId: EquipmentSlotId;
  itemId: string | null;
};

export type ItemDefinitionRow = {
  id: string;
  name: string;
  item_kind: EquipmentSlotId;
  rarity: string;
};

export type PlayerItemRow = {
  item_id: string;
  quantity: number;
};

export type PlayerEquipmentRow = {
  slot_id: EquipmentSlotId;
  item_id: string | null;
};

export function mapItemDefinitionRow(row: ItemDefinitionRow): ItemDefinition {
  return {
    id: row.id,
    name: row.name,
    itemKind: row.item_kind,
    rarity: row.rarity,
  };
}

export function mapPlayerItemRow(row: PlayerItemRow): PlayerItem {
  return {
    itemId: row.item_id,
    quantity: row.quantity,
  };
}

export function mapPlayerEquipmentRow(row: PlayerEquipmentRow): PlayerEquipment {
  return {
    slotId: row.slot_id,
    itemId: row.item_id,
  };
}
