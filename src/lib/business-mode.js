export const BUSINESS_MODES = {
  STORE: 'store',
  RESTAURANT: 'restaurant',
};

export const isRestaurantBusiness = (business) =>
  business?.businessMode === BUSINESS_MODES.RESTAURANT;

export const isStoreBusiness = (business) =>
  !business?.businessMode || business?.businessMode === BUSINESS_MODES.STORE;
