import api from './api';

export type DispatcherStatusOption = {
  id: string;
  name: string;
  color: string;
};

export type DispatcherOrderRow = {
  id: string;
  orderDate: string;
  status: string | null;
  info: string | null;
  client: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  ktkNumber: string | null;
  ktkType: string | null;
  grossWeight: string | null;
  comments: string | null;
  operation: string | null;
  terminalFrom: string | null;
  slotFrom: string | null;
  pinFrom: string | null;
  submitTime: string | null;
  deliveryAddress: string | null;
  terminalTo: string | null;
  slotTo: string | null;
  pinTo: string | null;
  driverRate: string | null;
  vat: string | null;
  clientRate: string | null;
  passes: string | null;
  extraAddress: string | null;
  demurrage: string | null;
  orderOnVehicle: boolean;
  invoiceSent: boolean;
  extraTon: string | null;
  seal: string | null;
  recoupling: boolean;
  driverRemarks: string | null;
  updatedAt: string | null;
};

export type DispatcherOrderPatch = Partial<
  Omit<DispatcherOrderRow, 'id' | 'orderDate' | 'updatedAt'>
>;

export const getDispatcherStatuses = () =>
  api.get<DispatcherStatusOption[]>('/dispatcher-journal/statuses');

export const getDispatcherOrders = (date: string) =>
  api.get<DispatcherOrderRow[]>('/dispatcher-journal/orders', { params: { date } });

export const createDispatcherOrder = (orderDate: string) =>
  api.post<DispatcherOrderRow>('/dispatcher-journal/orders', { orderDate });

export const updateDispatcherOrder = (id: string, patch: DispatcherOrderPatch) =>
  api.patch<DispatcherOrderRow>(`/dispatcher-journal/orders/${id}`, patch);

export const deleteDispatcherOrder = (id: string) =>
  api.delete<{ message: string }>(`/dispatcher-journal/orders/${id}`);
