import { AppDataSource } from '../config/data-source';
import { MonthlyPlan, PlanCategory, PlanRegion, PlanSubcategory } from '../models/monthly-plans.model';
import { logger } from '../utils/logger';

const monthlyRepo = AppDataSource.getRepository(MonthlyPlan);

export class PlanCalculator {
  /**
   * Основной метод расчета плана с переносом для категории за период
   */
  static async calculateAdjustedPlan(
    category: PlanCategory,
    year: number,
    region: PlanRegion,
    subcategory: PlanSubcategory | null = null,
    startMonth: number = 1,
    endMonth: number = 12
  ): Promise<MonthlyPlan[]> {
    const whereClause: any = {
      category,
      year,
      region
    };
    if (subcategory !== null) {
      whereClause.subcategory = subcategory;
    }
    
    const plans = await monthlyRepo.find({
      where: whereClause,
      order: { month: 'ASC' },
    });

    // Фильтруем планы по диапазону месяцев
    const filteredPlans = plans.filter(p => p.month >= startMonth && p.month <= endMonth);
    
    // Сортируем по месяцам
    filteredPlans.sort((a, b) => a.month - b.month);
    
    let carriedOver = 0;
    
    for (const plan of filteredPlans) {
      // Сохраняем перенесенное значение
      plan.carriedOver = carriedOver;
      
      // Вычисляем план с переносом
      plan.adjustedPlan = Math.max(0, plan.basePlan + carriedOver);
      
      // Вычисляем новый остаток для следующего месяца
      const actual = plan.actual || 0;
      carriedOver = Math.max(0, plan.adjustedPlan - actual);
      
      // Вычисляем % выполнения
      plan.completionPercentage = plan.adjustedPlan > 0
        ? (actual / plan.adjustedPlan) * 100
        : 0;
    }
    
    // Сохраняем обновленные планы
    await monthlyRepo.save(filteredPlans);
    
    logger.info(`Recalculated plans for ${category} ${year} region ${region} ${subcategory ? `subcategory ${subcategory}` : ''} months ${startMonth}-${endMonth}`);
    return filteredPlans;
  }

  /**
   * Пересчитать все планы для года (все категории, регионы и подкатегории)
   */
  static async recalculateAllPlans(year: number): Promise<void> {
    const categories = Object.values(PlanCategory);
    const regions = Object.values(PlanRegion);
    
    for (const category of categories) {
      for (const region of regions) {
        // Для категорий, которые имеют подкатегории
        if (category === PlanCategory.ADDITIONAL_SERVICES) {
          const subcategories = Object.values(PlanSubcategory);
          for (const subcategory of subcategories) {
            await this.calculateAdjustedPlan(category, year, region, subcategory);
          }
        } else {
          // Для категорий без подкатегорий
          await this.calculateAdjustedPlan(category, year, region, null);
        }
      }
    }
    
    logger.info(`Recalculated all plans for year ${year}`);
  }

  /**
   * Получить остаток на конец периода
   */
  static async getRemainingBalance(
    category: PlanCategory,
    year: number,
    region: PlanRegion,
    subcategory: PlanSubcategory | null,
    upToMonth: number
  ): Promise<number> {
    const whereClause: any = {
      category,
      year,
      region
    };
    if (subcategory !== null) {
      whereClause.subcategory = subcategory;
    }
    
    const plans = await monthlyRepo.find({
      where: whereClause,
      order: { month: 'ASC' }
    });

    let carriedOver = 0;
    
    for (const plan of plans) {
      if (plan.month > upToMonth) break;
      
      const adjustedPlan = Math.max(0, plan.basePlan + carriedOver);
      const actual = plan.actual || 0;
      carriedOver = Math.max(0, adjustedPlan - actual);
    }
    
    return carriedOver;
  }

  /**
   * Обновить план и пересчитать каскадно
   */
  static async updatePlanWithCascade(
    planId: string,
    updates: Partial<MonthlyPlan>
  ): Promise<MonthlyPlan> {
    const plan = await monthlyRepo.findOne({ where: { id: planId } });
    
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Зарезервировано для будущего использования: сохранение старых значений для истории

    // Применяем обновления
    Object.assign(plan, updates);
    await monthlyRepo.save(plan);

    // Пересчитываем планы начиная с этого месяца
    await this.calculateAdjustedPlan(
      plan.category,
      plan.year,
      plan.region,
      plan.subcategory,
      plan.month,
      12
    );

    logger.info(`Updated plan ${planId} with cascade recalculation`);
    return plan;
  }

  /**
   * Получить сводку по категории за год с учетом региона и подкатегории
   */
  static async getCategorySummary(
    category: PlanCategory,
    year: number,
    region: PlanRegion,
    subcategory: PlanSubcategory | null
  ): Promise<{
    totalBasePlan: number;
    totalAdjustedPlan: number;
    totalActual: number;
    averageCompletion: number;
    finalCarryOver: number;
  }> {
    const whereClause: any = { category, year, region };
    if (subcategory !== null) {
      whereClause.subcategory = subcategory;
    }
    
    const plans = await monthlyRepo.find({
      where: whereClause,
      order: { month: 'ASC' },
    });

    if (plans.length === 0) {
      return {
        totalBasePlan: 0,
        totalAdjustedPlan: 0,
        totalActual: 0,
        averageCompletion: 0,
        finalCarryOver: 0,
      };
    }

    const totalBasePlan = plans.reduce((sum, p) => sum + p.basePlan, 0);
    const totalAdjustedPlan = plans.reduce((sum, p) => sum + (p.adjustedPlan || 0), 0);
    const totalActual = plans.reduce((sum, p) => sum + (p.actual || 0), 0);
    
    const validCompletions = plans
      .filter(p => p.completionPercentage !== null && p.completionPercentage !== undefined)
      .map(p => p.completionPercentage!);
    
    const averageCompletion = validCompletions.length > 0
      ? validCompletions.reduce((sum, val) => sum + val, 0) / validCompletions.length
      : 0;

    // Вычисляем конечный остаток (после декабря)
    let carriedOver = 0;
    for (const plan of plans) {
      const adjustedPlan = Math.max(0, plan.basePlan + carriedOver);
      const actual = plan.actual || 0;
      carriedOver = Math.max(0, adjustedPlan - actual);
    }

    return {
      totalBasePlan,
      totalAdjustedPlan,
      totalActual,
      averageCompletion,
      finalCarryOver: carriedOver,
    };
  }
}