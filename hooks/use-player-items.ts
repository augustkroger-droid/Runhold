"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type EquipmentSlotId,
  type ItemDefinition,
  type ItemDefinitionRow,
  type PlayerEquipment,
  type PlayerEquipmentRow,
  type PlayerItem,
  type PlayerItemRow,
  mapItemDefinitionRow,
  mapPlayerEquipmentRow,
  mapPlayerItemRow,
} from "@/lib/game/state/player-items";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerItemsState = {
  definitions: ItemDefinition[];
  items: PlayerItem[];
  equipment: PlayerEquipment[];
  loading: boolean;
  busySlotId: EquipmentSlotId | null;
  error: string | null;
};

function itemErrorMessage(message: string): string {
  if (/ITEM_NOT_OWNED/i.test(message)) {
    return "Du har inte det itemet.";
  }

  if (/ITEM_SLOT_MISMATCH|INVALID_EQUIPMENT_SLOT/i.test(message)) {
    return "Itemet passar inte i platsen.";
  }

  if (/permission denied/i.test(message)) {
    return "Saknar r\u00e4ttigheter f\u00f6r utrustning. K\u00f6r senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerItems(userId: string | null) {
  const [state, setState] = useState<PlayerItemsState>({
    definitions: [],
    items: [],
    equipment: [],
    loading: Boolean(userId),
    busySlotId: null,
    error: null,
  });

  const loadItems = useCallback(async () => {
    if (!userId) {
      setState({
        definitions: [],
        items: [],
        equipment: [],
        loading: false,
        busySlotId: null,
        error: null,
      });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    const supabase = getSupabaseClient();
    const [definitionsResult, itemsResult, equipmentResult] = await Promise.all([
      supabase.from("item_definitions").select("id,name,item_kind,rarity"),
      supabase
        .from("player_items")
        .select("item_id,quantity")
        .eq("user_id", userId)
        .gt("quantity", 0),
      supabase
        .from("player_equipment")
        .select("slot_id,item_id")
        .eq("user_id", userId),
    ]);

    const error =
      definitionsResult.error ?? itemsResult.error ?? equipmentResult.error;

    if (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: itemErrorMessage(error.message),
      }));
      return;
    }

    setState({
      definitions: ((definitionsResult.data ?? []) as ItemDefinitionRow[]).map(
        mapItemDefinitionRow,
      ),
      items: ((itemsResult.data ?? []) as PlayerItemRow[]).map(mapPlayerItemRow),
      equipment: ((equipmentResult.data ?? []) as PlayerEquipmentRow[]).map(
        mapPlayerEquipmentRow,
      ),
      loading: false,
      busySlotId: null,
      error: null,
    });
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadItems();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadItems]);

  const equipItem = useCallback(
    async (slotId: EquipmentSlotId, itemId: string) => {
      if (!userId) {
        throw new Error("Du beh\u00f6ver vara inloggad.");
      }

      setState((current) => ({ ...current, busySlotId: slotId, error: null }));

      const { error } = await getSupabaseClient().rpc("equip_player_item", {
        input_slot_id: slotId,
        input_item_id: itemId,
      });

      if (error) {
        const message = itemErrorMessage(error.message);
        setState((current) => ({
          ...current,
          busySlotId: null,
          error: message,
        }));
        throw new Error(message);
      }

      await loadItems();
    },
    [loadItems, userId],
  );

  const unequipSlot = useCallback(
    async (slotId: EquipmentSlotId) => {
      if (!userId) {
        throw new Error("Du beh\u00f6ver vara inloggad.");
      }

      setState((current) => ({ ...current, busySlotId: slotId, error: null }));

      const { error } = await getSupabaseClient().rpc("unequip_player_item", {
        input_slot_id: slotId,
      });

      if (error) {
        const message = itemErrorMessage(error.message);
        setState((current) => ({
          ...current,
          busySlotId: null,
          error: message,
        }));
        throw new Error(message);
      }

      await loadItems();
    },
    [loadItems, userId],
  );

  const itemsById = useMemo(
    () => new Map(state.items.map((item) => [item.itemId, item])),
    [state.items],
  );
  const definitionsById = useMemo(
    () =>
      new Map(
        state.definitions.map((definition) => [definition.id, definition]),
      ),
    [state.definitions],
  );
  const equipmentBySlot = useMemo(
    () =>
      new Map(state.equipment.map((equipment) => [equipment.slotId, equipment])),
    [state.equipment],
  );

  return {
    ...state,
    definitionsById,
    equipmentBySlot,
    itemsById,
    loadItems,
    equipItem,
    unequipSlot,
  };
}
