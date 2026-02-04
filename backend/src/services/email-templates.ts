type Department = 'container_vladivostok' | 'container_moscow' | 'railway' | 'autotruck' | 'additional' | 'admin';

const departmentNames: Record<Department, string> = {
  container_vladivostok: 'Контейнерные перевозки - Владивосток',
  container_moscow: 'Контейнерные перевозки - Москва',
  railway: 'ЖД перевозки',
  autotruck: 'Автовозы',
  additional: 'Дополнительные услуги',
  admin: 'Администрация',
};

export const dailyReportTemplate = (
  department: Department,
  date: string,
  plan: number,
  actual: number,
  completion: number,
  metrics?: any
) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
    .metric { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .metric-value { font-weight: bold; }
    .completion { color: ${completion >= 90 ? '#27ae60' : completion >= 70 ? '#f39c12' : '#e74c3c'}; }
    .footer { margin-top: 30px; font-size: 0.9em; color: #7f8c8d; text-align: center; }
    .attachment { background: #ecf0f1; padding: 10px; border-radius: 3px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Отчёт по ${departmentNames[department]}</h1>
    <p>Дата: ${date}</p>
  </div>
  <div class="content">
    <h2>Ключевые показатели</h2>
    <div class="metric">
      <span>План на дату:</span>
      <span class="metric-value">${plan.toLocaleString('ru-RU')}</span>
    </div>
    <div class="metric">
      <span>Фактическое выполнение:</span>
      <span class="metric-value">${actual.toLocaleString('ru-RU')}</span>
    </div>
    <div class="metric">
      <span>Выполнение плана:</span>
      <span class="metric-value completion">${completion.toFixed(1)}%</span>
    </div>
    ${metrics ? `
    <h3>Детализация</h3>
    ${Object.entries(metrics).map(([key, value]) => `
      <div class="metric">
        <span>${key}:</span>
        <span>${value}</span>
      </div>
    `).join('')}
    ` : ''}
    <div class="attachment">
      <p><strong>Вложение:</strong> Детальный отчёт в формате Excel содержит все операционные данные за ${date}.</p>
    </div>
    <p>Отчёт сгенерирован автоматически системой мониторинга логистики.</p>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Система управления логистикой и отчётности</p>
    <p>Это письмо отправлено автоматически, пожалуйста, не отвечайте на него.</p>
  </div>
</body>
</html>
`;

export const monthlyReportTemplate = (
  department: Department,
  year: number,
  month: number,
  basePlan: number,
  actual: number,
  adjustedPlan: number,
  completion: number,
  summary?: any
) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: #2980b9; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
    .metric { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .metric-value { font-weight: bold; }
    .completion { color: ${completion >= 90 ? '#27ae60' : completion >= 70 ? '#f39c12' : '#e74c3c'}; }
    .footer { margin-top: 30px; font-size: 0.9em; color: #7f8c8d; text-align: center; }
    .attachment { background: #ecf0f1; padding: 10px; border-radius: 3px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Сводный отчёт по ${departmentNames[department]}</h1>
    <p>Период: ${month}/${year}</p>
  </div>
  <div class="content">
    <h2>Плановые и фактические показатели</h2>
    <div class="metric">
      <span>Базовый план:</span>
      <span class="metric-value">${basePlan.toLocaleString('ru-RU')}</span>
    </div>
    <div class="metric">
      <span>Фактическое выполнение:</span>
      <span class="metric-value">${actual.toLocaleString('ru-RU')}</span>
    </div>
    <div class="metric">
      <span>План с переносом:</span>
      <span class="metric-value">${adjustedPlan.toLocaleString('ru-RU')}</span>
    </div>
    <div class="metric">
      <span>% выполнения (по плану с переносом):</span>
      <span class="metric-value completion">${completion.toFixed(1)}%</span>
    </div>
    ${summary ? `
    <h3>Итоги за месяц</h3>
    ${Object.entries(summary).map(([key, value]) => `
      <div class="metric">
        <span>${key}:</span>
        <span>${value}</span>
      </div>
    `).join('')}
    ` : ''}
    <div class="attachment">
      <p><strong>Вложение:</strong> Полный отчёт в формате Excel содержит детализацию по дням и расчёт плана с переносом.</p>
    </div>
    <p>Отчёт сгенерирован автоматически системой мониторинга логистики.</p>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Система управления логистикой и отчётности</p>
    <p>Это письмо отправлено автоматически, пожалуйста, не отвечайте на него.</p>
  </div>
</body>
</html>
`;