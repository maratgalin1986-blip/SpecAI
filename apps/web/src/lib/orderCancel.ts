// Why a matched order cannot be cancelled from the order itself, by the state
// of its booking. One neutral wording for the site and the app (the app has
// «Брони», not a «личный кабинет»): until the work starts the customer
// cancels the booking, and the order closes with it. Pure, unit-tested.
export function matchedOrderCancelError(bookingStatus: string | null | undefined): string {
  switch (bookingStatus) {
    case 'ACTIVE':
      return 'Работы по заявке уже идут — отменить её нельзя';
    case 'COMPLETED':
      return 'Заказ уже выполнен — отменить нельзя';
    default:
      return 'Исполнитель уже выбран — отмените бронь, заявка закроется вместе с ней';
  }
}
