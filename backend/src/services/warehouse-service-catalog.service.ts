import { AppDataSource } from '../config/data-source';
import {
  WarehouseServiceDefinition,
  WarehouseServiceUnit,
} from '../models/warehouse-service-definition.model';

interface DefaultWarehouseService {
  code: string;
  name: string;
  unit: WarehouseServiceUnit;
  defaultQuantity: number | null;
  isOperational: boolean;
}

const DEFAULT_SERVICES: DefaultWarehouseService[] = [
  {
    code: 'storage_daily',
    name: 'Хранение за сутки',
    unit: 'day',
    defaultQuantity: 1,
    isOperational: false,
  },
  {
    code: 'refuel',
    name: 'Дозаправка топливом',
    unit: 'liter',
    defaultQuantity: null,
    isOperational: true,
  },
  {
    code: 'battery_charge_removal',
    name: 'Зарядка аккумулятора со снятием',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'battery_charge_no_removal',
    name: 'Зарядка аккумулятора без снятия',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'wheel_service',
    name: 'Подкачка колес, шиномонтаж, сервисное обслуживание',
    unit: 'wheel',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'engine_start_warmup',
    name: 'Запуск и отогрев двигателя',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'photo_report',
    name: 'Фотоотчет о состоянии техники',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'snow_leaf_cleaning',
    name: 'Очистка от снега и листвы',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'vehicle_show',
    name: 'Показ техники',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'vehicle_issue',
    name: 'Выдача техники',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'vehicle_acceptance',
    name: 'Приёмка техники',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'passenger_wash',
    name: 'Мойка легковая',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'truck_wash',
    name: 'Мойка грузовая',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'interior_cleaning',
    name: 'Уборка салона от мусора',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'interior_cleaning_wash_polish',
    name: 'Уборка салона с мойкой и полировкой',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
  {
    code: 'conservation',
    name: 'Консервация ТС на хранение',
    unit: 'operation',
    defaultQuantity: 1,
    isOperational: true,
  },
];

export const ensureWarehouseServiceCatalog = async (): Promise<void> => {
  const repository = AppDataSource.getRepository(WarehouseServiceDefinition);
  const existing = await repository.find();
  const byCode = new Map(existing.map((service) => [service.code, service]));

  for (const definition of DEFAULT_SERVICES) {
    const service = byCode.get(definition.code);
    if (service) continue;
    await repository.save(repository.create({
      ...definition,
      defaultQuantity: definition.defaultQuantity === null ? null : String(definition.defaultQuantity),
      isRepeatable: true,
      isActive: true,
    }));
  }
};
