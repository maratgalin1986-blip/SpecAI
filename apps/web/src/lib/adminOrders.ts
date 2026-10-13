// Which order statuses the admin may change (api/admin/orders/[id]). Pure,
// unit-tested. Publishing is only for chat imports waiting in moderation, so
// an erased (CANCELLED) order or a MATCHED one with a booking never goes back
// on the board; closing also takes an open order off the board (a stale one
// whose dates have passed).

export type AdminOrderTarget = 'OPEN' | 'CANCELLED';

export const ADMIN_ORDER_FROM: Record<AdminOrderTarget, readonly string[]> = {
  OPEN: ['PENDING_REVIEW'],
  CANCELLED: ['PENDING_REVIEW', 'OPEN'],
};

export function adminCanMoveOrder(from: string, to: AdminOrderTarget): boolean {
  return ADMIN_ORDER_FROM[to].includes(from);
}
