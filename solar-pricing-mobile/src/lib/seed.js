// بيانات تجريبية أولية - تُدرج فقط إذا كان جدول المواد فارغاً (لا تُكرر الإدراج عند كل تشغيل)

function seedIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM materials').get().c;
  if (count > 0) return false;

  const insertMaterial = db.prepare(`
    INSERT INTO materials
      (category, brand, model, full_description, unit, watt_or_capacity, price, warranty_months, warranty_note, qty_per_panel, quantity_stock)
    VALUES (@category, @brand, @model, @full_description, @unit, @watt_or_capacity, @price, @warranty_months, @warranty_note, @qty_per_panel, @quantity_stock)
  `);

  const materials = [
    {
      category: 'panel',
      brand: 'JINKO SOLAR',
      model: 'JINKO 650W Bifacial',
      full_description:
        'تجهيز وتركيب وتنصيب ألواح شمسية ذو قدرة لا تقل عن 650 واط بقدرة ذات وجهين (Bifacial Module) نوع (JINKO SOLAR) بالمواصفات التالية:\n' +
        '• النوع والتقنية المستخدمة: LONGI HX10   • القدرة: 650+ واط لكل لوح   • الكفاءة 23%\n' +
        '• معامل الفقد الحراري 0.29% كل درجة مئوية   • نسبة تدهور الألواح 0.4% سنوياً\n' +
        '• مواصفات إضافية: Pmpp, bifacial, PID resistance\n' +
        '• الضمان: 10 سنوات لا يشمل الكسر',
      unit: 'عدد',
      watt_or_capacity: 650,
      price: 185000,
      warranty_months: 120,
      warranty_note: 'ضمان الألواح 10 سنوات لا يشمل الكسر',
      qty_per_panel: null,
      quantity_stock: 200,
    },
    {
      category: 'inverter',
      brand: 'COSPOWER',
      model: 'COSPOWER 6kW Hybrid Single Phase',
      full_description:
        'تجهيز وتركيب وتنصيب انفيرتر نوع Single Phase Hybrid Inverter (COSPOWER) قدرة (6) كيلو واط أحادي الطور Low Voltage بالمواصفات أدناه:\n' +
        '• منشأ الانفيرتر صيني أصلي   • 1MPPT   • شاشة LCD\n' +
        '• يحتوي الانفيرتر على نظام إدارة البطارية الذكي BMS   • IP65\n' +
        '• ضمان لا يقل عن 5 سنوات',
      unit: 'عدد',
      watt_or_capacity: 6000,
      price: 650000,
      warranty_months: 60,
      warranty_note: 'ضمان الانفيرتر 5 سنوات',
      qty_per_panel: null,
      quantity_stock: 50,
    },
    {
      category: 'battery',
      brand: 'COSPOWER',
      model: 'COSPOWER 16kWh Lithium',
      full_description:
        'تجهيز بطاريات ليثيوم نوع (COSPOWER) بالمواصفات أدناه:\n' +
        '• خلية ليثيوم فوسفات الحديد   • منشأ صيني أصلي   • تدعم البطارية نظام BMS من الانفيرتر\n' +
        '• قدرة خزن بطارية (16kWh) للوحدة الواحدة\n' +
        '• ضمان لا يقل عن 5 سنوات',
      unit: 'عدد',
      watt_or_capacity: 16,
      price: 2750000,
      warranty_months: 60,
      warranty_note: 'ضمان البطارية 5 سنوات',
      qty_per_panel: null,
      quantity_stock: 50,
    },
    {
      category: 'secondary',
      brand: null,
      model: 'هيكل ألواح مغلون',
      full_description: 'هيكل الألواح مغلون بسمك 1.92-2 ملم لكل لوح، مقاوم للرياح، لكل لوح محمل مثبت على الأرض',
      unit: 'عدد',
      watt_or_capacity: null,
      price: 65000,
      warranty_months: null,
      warranty_note: null,
      qty_per_panel: 1,
      quantity_stock: 500,
    },
    {
      category: 'secondary',
      brand: null,
      model: 'صبات تثبيت الهياكل',
      full_description: 'صبات لتثبيت الهياكل',
      unit: 'عدد',
      watt_or_capacity: null,
      price: 5000,
      warranty_months: null,
      warranty_note: null,
      qty_per_panel: 1,
      quantity_stock: 500,
    },
    {
      category: 'secondary',
      brand: null,
      model: 'كيبل ألواح-انفيرتر 6مم',
      full_description: 'كيبلات ناقلة من الألواح إلى الانفيرتر بحجم 6 ملم بلونين الأحمر والأسود وحسب المواصفات',
      unit: 'متر',
      watt_or_capacity: null,
      price: 2000,
      warranty_months: null,
      warranty_note: null,
      qty_per_panel: null,
      quantity_stock: 5000,
    },
    {
      category: 'secondary',
      brand: null,
      model: 'كيبل انفيرتر-بطارية',
      full_description: 'الكيبل الناقل من الانفيرتر إلى البطارية، يحسب حسب الذرعة الموقعية',
      unit: 'متر',
      watt_or_capacity: null,
      price: 2500,
      warranty_months: null,
      warranty_note: null,
      qty_per_panel: null,
      quantity_stock: 5000,
    },
    {
      category: 'secondary',
      brand: null,
      model: 'بوردة حماية DC',
      full_description: 'بوردات الحماية للألواح والانفيرترات (DC)، الحماية للدخول وخروج الحمل',
      unit: 'عدد',
      watt_or_capacity: null,
      price: 150000,
      warranty_months: null,
      warranty_note: null,
      qty_per_panel: 0, // 0 = وحدة ثابتة واحدة بغض النظر عن عدد الألواح (لا تتناسب مع العدد)
      quantity_stock: 100,
    },
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insertMaterial.run(row);
  });
  insertMany(materials);

  const insertLabor = db.prepare('INSERT INTO labor_tiers (system_amps, price, note) VALUES (?, ?, ?)');
  const insertLaborMany = db.transaction((rows) => {
    for (const row of rows) insertLabor.run(row.system_amps, row.price, row.note);
  });
  insertLaborMany([
    { system_amps: 10, price: 400000, note: null },
    { system_amps: 15, price: 550000, note: null },
    { system_amps: 20, price: 700000, note: null },
    { system_amps: 25, price: 850000, note: null },
    { system_amps: 30, price: 1000000, note: null },
  ]);

  return true;
}

export { seedIfEmpty };
