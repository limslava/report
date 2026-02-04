import ExcelJS from 'exceljs';
import { MonthlyPlan, PlanCategory, PlanRegion } from '../models/monthly-plans.model';
import { PlanCalculator } from './plan-calculator.service';
import { AppDataSource } from '../config/data-source';
import { logger } from '../utils/logger';

const monthlyRepo = AppDataSource.getRepository(MonthlyPlan);

export class ExcelImportExportService {
  /**
   * Экспорт планов в Excel файл
   */
  static async exportPlansToExcel(year: number): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Logistics Reporting System';
    workbook.created = new Date();
    
    const categories = Object.values(PlanCategory);
    
    for (const category of categories) {
      const worksheet = workbook.addWorksheet(category);
      
      // Заголовки
      worksheet.columns = [
        { header: 'Месяц', key: 'month', width: 15 },
        { header: 'Базовый план', key: 'basePlan', width: 15 },
        { header: 'Факт', key: 'actual', width: 15 },
        { header: 'Перенесено с прошлого месяца', key: 'carriedOver', width: 25 },
        { header: 'План с переносом', key: 'adjustedPlan', width: 20 },
        { header: '% выполнения', key: 'completionPercentage', width: 15 },
        { header: 'Дата обновления', key: 'updatedAt', width: 20 },
      ];
      
      // Получаем данные
      const plans = await monthlyRepo.find({
        where: { category, year },
        order: { month: 'ASC' },
      });
      
      // Заполняем строки
      const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
      ];
      
      for (let month = 1; month <= 12; month++) {
        const plan = plans.find(p => p.month === month);
        
        worksheet.addRow({
          month: monthNames[month - 1],
          basePlan: plan?.basePlan || 0,
          actual: plan?.actual || '',
          carriedOver: plan?.carriedOver || 0,
          adjustedPlan: plan?.adjustedPlan || '',
          completionPercentage: plan?.completionPercentage 
            ? `${plan.completionPercentage.toFixed(1)}%` 
            : '',
          updatedAt: plan?.updatedAt ? new Date(plan.updatedAt).toLocaleDateString('ru-RU') : '',
        });
      }
      
      // Добавляем итоговую строку (временное решение: регион по умолчанию, подкатегория null)
      const summary = await PlanCalculator.getCategorySummary(category, year, PlanRegion.VLADIVOSTOK, null);
      
      worksheet.addRow({});
      worksheet.addRow({
        month: 'ИТОГО:',
        basePlan: summary.totalBasePlan,
        actual: summary.totalActual,
        carriedOver: summary.finalCarryOver,
        adjustedPlan: summary.totalAdjustedPlan,
        completionPercentage: `${summary.averageCompletion.toFixed(1)}%`,
      });
      
      // Стилизация
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(worksheet.rowCount).font = { bold: true };
      worksheet.getRow(worksheet.rowCount).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
    }
    
    // Сводный лист
    const summarySheet = workbook.addWorksheet('Сводка');
    summarySheet.columns = [
      { header: 'Категория', key: 'category', width: 20 },
      { header: 'Базовый план (год)', key: 'totalBasePlan', width: 20 },
      { header: 'План с переносом (год)', key: 'totalAdjustedPlan', width: 25 },
      { header: 'Факт (год)', key: 'totalActual', width: 20 },
      { header: 'Средний % выполнения', key: 'averageCompletion', width: 25 },
      { header: 'Остаток на конец года', key: 'finalCarryOver', width: 25 },
    ];
    
    for (const category of categories) {
      // Временное решение: регион по умолчанию, подкатегория null
      const summary = await PlanCalculator.getCategorySummary(category, year, PlanRegion.VLADIVOSTOK, null);
      
      summarySheet.addRow({
        category,
        totalBasePlan: summary.totalBasePlan,
        totalAdjustedPlan: summary.totalAdjustedPlan,
        totalActual: summary.totalActual,
        averageCompletion: `${summary.averageCompletion.toFixed(1)}%`,
        finalCarryOver: summary.finalCarryOver,
      });
    }
    
    summarySheet.getRow(1).font = { bold: true };
    
    // Генерируем буфер
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }
  
  /**
   * Импорт планов из Excel файла
   */
  static async importPlansFromExcel(buffer: ArrayBuffer, year: number): Promise<{
    importedCount: number;
    errors: string[];
    warnings: string[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const errors: string[] = [];
    const warnings: string[] = [];
    let importedCount = 0;
    
    // Проходим по всем листам
    workbook.eachSheet((worksheet, _sheetId) => {
      const sheetName = worksheet.name;
      
      // Пропускаем сводный лист
      if (sheetName === 'Сводка') return;
      
      // Определяем категорию по имени листа
      let category: PlanCategory | null = null;
      for (const cat of Object.values(PlanCategory)) {
        if (cat === sheetName) {
          category = cat;
          break;
        }
      }
      
      if (!category) {
        warnings.push(`Лист "${sheetName}" не соответствует ни одной категории планов`);
        return;
      }
      
      // Парсим строки (пропускаем заголовок)
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // Пропускаем заголовок
        
        const monthName = row.getCell(1).value?.toString() || '';
        const basePlanValue = row.getCell(2).value;
        const actualValue = row.getCell(3).value;
        
        // Определяем номер месяца по имени
        const month = this.parseMonthName(monthName);
        if (!month || month < 1 || month > 12) {
          errors.push(`Неверное название месяца "${monthName}" в листе "${sheetName}", строка ${rowNumber}`);
          return;
        }
        
        // Парсим числовые значения
        const basePlan = this.parseNumber(basePlanValue);
        const actual = this.parseNumber(actualValue, true); // actual может быть пустым
        
        if (basePlan === null) {
          errors.push(`Неверное значение базового плана в листе "${sheetName}", месяц ${monthName}`);
          return;
        }
        
        // Сохраняем план
        this.savePlan(category!, year, month, basePlan, actual)
          .then(() => {
            importedCount++;
          })
          .catch((error) => {
            errors.push(`Ошибка сохранения плана ${category} ${year}-${month}: ${error.message}`);
          });
      });
    });
    
    // После импорта пересчитываем все планы
    if (importedCount > 0) {
      await PlanCalculator.recalculateAllPlans(year);
    }
    
    return {
      importedCount,
      errors,
      warnings,
    };
  }
  
  /**
   * Парсит название месяца
   */
  private static parseMonthName(monthName: string): number | null {
    const monthMap: Record<string, number> = {
      'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4,
      'май': 5, 'июнь': 6, 'июль': 7, 'август': 8,
      'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
    };
    
    const normalized = monthName.toLowerCase().trim();
    return monthMap[normalized] || null;
  }
  
  /**
   * Парсит числовое значение
   */
  private static parseNumber(value: any, allowEmpty: boolean = false): number | null {
    if (value === null || value === undefined || value === '') {
      return allowEmpty ? null : 0;
    }
    
    if (typeof value === 'number') {
      return value;
    }
    
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(',', '.'));
      return isNaN(parsed) ? null : parsed;
    }
    
    return null;
  }
  
  /**
   * Сохраняет план в базу данных
   */
  private static async savePlan(
    category: PlanCategory,
    year: number,
    month: number,
    basePlan: number,
    actual: number | null
  ): Promise<void> {
    const existing = await monthlyRepo.findOne({
      where: { category, year, month },
    });
    
    if (existing) {
      existing.basePlan = basePlan;
      existing.actual = actual;
      await monthlyRepo.save(existing);
    } else {
      const newPlan = monthlyRepo.create({
        category,
        year,
        month,
        basePlan,
        actual,
      });
      await monthlyRepo.save(newPlan);
    }
    
    logger.info(`Imported plan: ${category} ${year}-${month}, basePlan: ${basePlan}, actual: ${actual}`);
  }
  
  /**
   * Генерирует шаблон Excel для импорта
   */
  static async generateImportTemplate(_year: number): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Logistics Reporting System';
    workbook.created = new Date();
    
    const categories = Object.values(PlanCategory);
    
    for (const category of categories) {
      const worksheet = workbook.addWorksheet(category);
      
      // Заголовки
      worksheet.columns = [
        { header: 'Месяц', key: 'month', width: 15 },
        { header: 'Базовый план', key: 'basePlan', width: 15 },
        { header: 'Факт', key: 'actual', width: 15 },
      ];
      
      // Заполняем месяцы
      const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
      ];
      
      monthNames.forEach((monthName, _index) => {
        worksheet.addRow({
          month: monthName,
          basePlan: '',
          actual: '',
        });
      });
      
      // Инструкция
      worksheet.addRow({});
      worksheet.addRow({ month: 'ИНСТРУКЦИЯ:' });
      worksheet.addRow({ month: '1. Заполните столбец "Базовый план" - обязательное поле' });
      worksheet.addRow({ month: '2. Заполните столбец "Факт" - можно оставить пустым' });
      worksheet.addRow({ month: '3. Не изменяйте названия месяцев' });
      worksheet.addRow({ month: '4. Сохраните файл и загрузите в систему' });
      
      // Стилизация
      worksheet.getRow(1).font = { bold: true };
      for (let i = 13; i <= 18; i++) {
        worksheet.getRow(i).font = { italic: true };
      }
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }
}