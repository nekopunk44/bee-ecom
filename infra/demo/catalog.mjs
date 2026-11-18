// Demo catalog: invented products with realistic names and prices in MDL, so the
// storefront has something to show. Prices are in bani (1/100 lei).
export const categories = [
  {
    slug: 'ulei',
    nameRu: 'Ульи и корпуса',
    nameRo: 'Stupi și corpuri',
    image: 'hive',
  },
  {
    slug: 'rame-vosk',
    nameRu: 'Рамки и вощина',
    nameRo: 'Rame și faguri artificiali',
    image: 'frame',
  },
  {
    slug: 'medogonki',
    nameRu: 'Медогонки',
    nameRo: 'Extractoare de miere',
    image: 'extractor',
  },
  {
    slug: 'dymari-instrumenty',
    nameRu: 'Дымари и инструмент',
    nameRo: 'Afumătoare și unelte',
    image: 'smoker',
  },
  {
    slug: 'odezhda-setki',
    nameRu: 'Защитная одежда',
    nameRo: 'Echipament de protecție',
    image: 'suit',
  },
  {
    slug: 'uhod-podkormka',
    nameRu: 'Уход и подкормка',
    nameRo: 'Îngrijire și hrănire',
    image: 'care',
  },
];

export const warehouses = [
  { code: 'chisinau', name: 'Кишинёв, основной склад' },
  { code: 'balti', name: 'Бельцы, пункт выдачи' },
];

const text = (name, description) => ({
  name,
  description,
  seoTitle: '',
  seoDescription: '',
});

// stock: units per warehouse code for each variant, in the order of `variants`.
export const products = [
  {
    slug: 'uley-dadan-12-ramok',
    category: 'ulei',
    ru: text(
      'Улей Дадан на 12 рамок',
      'Корпус из липы толщиной 35 мм, сетчатое дно с поддоном и утеплённая крыша. Рамки 435×300 в комплект не входят.',
    ),
    ro: text(
      'Stup Dadant pentru 12 rame',
      'Corp din tei de 35 mm, fund cu plasă și tavă, capac izolat. Ramele 435×300 nu sunt incluse.',
    ),
    variants: [
      {
        sku: 'HIVE-DAD12-RAW',
        name: 'Без окраски',
        priceMinor: 245000,
        stock: { chisinau: 6, balti: 2 },
      },
      {
        sku: 'HIVE-DAD12-PNT',
        name: 'Окрашенный',
        priceMinor: 279000,
        stock: { chisinau: 3 },
      },
    ],
  },
  {
    slug: 'korpus-ruta',
    category: 'ulei',
    ru: text(
      'Корпус улья Рута',
      'Корпус на 10 рамок 435×230 с фальцами под рамки. Подходит для наращивания многокорпусных ульев.',
    ),
    ro: text(
      'Corp de stup Langstroth',
      'Corp pentru 10 rame 435×230, cu falțuri pentru rame. Potrivit pentru stupii cu mai multe corpuri.',
    ),
    variants: [
      {
        sku: 'HIVE-RUTA-BODY',
        name: 'Стандарт',
        priceMinor: 89000,
        stock: { chisinau: 12, balti: 4 },
      },
    ],
  },
  {
    slug: 'uley-lezhak-20-ramok',
    category: 'ulei',
    ru: text(
      'Улей-лежак на 20 рамок',
      'Горизонтальный улей для спокойной работы без снятия корпусов. Две летковые задвижки, разделительная доска.',
    ),
    ro: text(
      'Stup orizontal pentru 20 de rame',
      'Stup orizontal pentru lucru liniștit, fără ridicarea corpurilor. Două urdinișuri reglabile și diafragmă.',
    ),
    variants: [
      {
        sku: 'HIVE-LEZ20',
        name: 'Стандарт',
        priceMinor: 320000,
        stock: { chisinau: 2 },
      },
    ],
  },
  {
    slug: 'ramka-dadan-435x300',
    category: 'rame-vosk',
    ru: text(
      'Рамка Дадан 435×300, 10 штук',
      'Рамки из сосны с отверстиями под проволоку. Собраны и готовы к натяжке.',
    ),
    ro: text(
      'Ramă Dadant 435×300, set de 10',
      'Rame din pin cu găuri pentru sârmă. Asamblate și gata de întins sârma.',
    ),
    variants: [
      {
        sku: 'FRAME-DAD-10',
        name: '10 штук',
        priceMinor: 23000,
        stock: { chisinau: 40, balti: 15 },
      },
    ],
  },
  {
    slug: 'voshchina-1-kg',
    category: 'rame-vosk',
    ru: text(
      'Вощина, 1 кг',
      'Вощина из натурального пчелиного воска, около 14 листов в килограмме. Выберите размер под свои рамки.',
    ),
    ro: text(
      'Fagure artificial, 1 kg',
      'Fagure artificial din ceară naturală de albine, circa 14 foi la kilogram. Alege dimensiunea potrivită ramelor.',
    ),
    variants: [
      {
        sku: 'WAX-DAD-1KG',
        name: 'Дадан 410×260',
        priceMinor: 32000,
        stock: { chisinau: 25, balti: 10 },
      },
      {
        sku: 'WAX-RUTA-1KG',
        name: 'Рута 410×200',
        priceMinor: 32000,
        stock: { chisinau: 18 },
      },
    ],
  },
  {
    slug: 'medogonka-4-ramki',
    category: 'medogonki',
    ru: text(
      'Медогонка на 4 рамки, нержавеющая сталь',
      'Хордиальная медогонка из пищевой нержавейки, кран для слива мёда, крышка из поликарбоната.',
    ),
    ro: text(
      'Extractor de miere pentru 4 rame, inox',
      'Extractor tangențial din inox alimentar, robinet pentru miere, capac din policarbonat.',
    ),
    variants: [
      {
        sku: 'EXT-4-MAN',
        name: 'Ручная',
        priceMinor: 485000,
        stock: { chisinau: 3, balti: 1 },
      },
      {
        sku: 'EXT-4-ELEC',
        name: 'С электроприводом',
        priceMinor: 890000,
        stock: { chisinau: 1 },
      },
    ],
  },
  {
    slug: 'otstoynik-dlya-myoda-50-l',
    category: 'medogonki',
    ru: text(
      'Отстойник для мёда, 50 л',
      'Ёмкость из нержавеющей стали с двойным ситом и краном. Мёд отстаивается и сразу разливается в тару.',
    ),
    ro: text(
      'Maturator pentru miere, 50 l',
      'Recipient din inox cu sită dublă și robinet. Mierea se limpezește și se îmbuteliază direct.',
    ),
    variants: [
      {
        sku: 'TANK-50',
        name: '50 л',
        priceMinor: 210000,
        stock: { chisinau: 4 },
      },
    ],
  },
  {
    slug: 'dymar-nerzhaveyushchiy',
    category: 'dymari-instrumenty',
    ru: text(
      'Дымарь из нержавеющей стали',
      'Дымарь с защитной решёткой и кожаными мехами. Долго держит ровный дым.',
    ),
    ro: text(
      'Afumător din inox',
      'Afumător cu grilaj de protecție și burduf din piele. Păstrează mult timp un fum constant.',
    ),
    variants: [
      {
        sku: 'SMOKER-S',
        name: 'Малый',
        priceMinor: 29000,
        stock: { chisinau: 15, balti: 6 },
      },
      {
        sku: 'SMOKER-L',
        name: 'Большой',
        priceMinor: 38000,
        stock: { chisinau: 9, balti: 3 },
      },
    ],
  },
  {
    slug: 'stameska-pchelovoda',
    category: 'dymari-instrumenty',
    ru: text(
      'Стамеска пчеловода',
      'Стальная стамеска с загнутым концом: отделяет рамки и счищает прополис.',
    ),
    ro: text(
      'Daltă apicolă',
      'Daltă din oțel cu capăt îndoit: desprinde ramele și curăță propolisul.',
    ),
    variants: [
      {
        sku: 'TOOL-CHISEL',
        name: '25 см',
        priceMinor: 12000,
        stock: { chisinau: 30, balti: 12 },
      },
    ],
  },
  {
    slug: 'nozh-dlya-raspechatyvaniya-elektricheskiy',
    category: 'dymari-instrumenty',
    ru: text(
      'Электронож для распечатывания сот',
      'Нагревается за минуту, лезвие из нержавеющей стали. Срезает забрус ровно и без рывков.',
    ),
    ro: text(
      'Cuțit electric pentru descăpăcire',
      'Se încălzește într-un minut, lamă din inox. Taie căpăcelele uniform, fără smucituri.',
    ),
    variants: [
      {
        sku: 'TOOL-KNIFE-EL',
        name: '220 В',
        priceMinor: 76000,
        stock: { chisinau: 0, balti: 0 },
      },
    ],
  },
  {
    slug: 'kurtka-pchelovoda-s-setkoy',
    category: 'odezhda-setki',
    ru: text(
      'Куртка пчеловода с лицевой сеткой',
      'Плотный хлопок, съёмная сетка-капюшон на молнии, резинки на манжетах.',
    ),
    ro: text(
      'Bluză apicolă cu mască',
      'Bumbac dens, mască-glugă detașabilă cu fermoar, manșete cu elastic.',
    ),
    variants: [
      {
        sku: 'SUIT-JKT-M',
        name: 'M',
        priceMinor: 69000,
        stock: { chisinau: 5 },
      },
      {
        sku: 'SUIT-JKT-L',
        name: 'L',
        priceMinor: 69000,
        stock: { chisinau: 7, balti: 2 },
      },
      {
        sku: 'SUIT-JKT-XL',
        name: 'XL',
        priceMinor: 69000,
        stock: { chisinau: 4 },
      },
    ],
  },
  {
    slug: 'perchatki-pchelovoda-kozhanye',
    category: 'odezhda-setki',
    ru: text(
      'Перчатки пчеловода, кожаные',
      'Мягкая кожа и длинные тканевые нарукавники с резинкой.',
    ),
    ro: text(
      'Mănuși apicole din piele',
      'Piele moale și manșete lungi din material textil, cu elastic.',
    ),
    variants: [
      {
        sku: 'GLOVES-M',
        name: 'M',
        priceMinor: 18000,
        stock: { chisinau: 10, balti: 4 },
      },
      {
        sku: 'GLOVES-L',
        name: 'L',
        priceMinor: 18000,
        stock: { chisinau: 12 },
      },
    ],
  },
  {
    slug: 'kormushka-potolochnaya-2-l',
    category: 'uhod-podkormka',
    ru: text(
      'Потолочная кормушка, 2 л',
      'Ставится на потолок улья, пчёлы берут сироп через проход и не тонут.',
    ),
    ro: text(
      'Hrănitor de capac, 2 l',
      'Se așază pe podișorul stupului; albinele iau siropul prin pasaj fără să se înece.',
    ),
    variants: [
      {
        sku: 'FEEDER-2L',
        name: '2 л',
        priceMinor: 15000,
        stock: { chisinau: 35, balti: 10 },
      },
    ],
  },
  {
    slug: 'kandi-dlya-podkormki-1-kg',
    category: 'uhod-podkormka',
    ru: text(
      'Канди для подкормки, 1 кг',
      'Сахарно-медовое тесто для зимней и ранневесенней подкормки.',
    ),
    ro: text(
      'Turtă candi pentru hrănire, 1 kg',
      'Pastă din zahăr și miere pentru hrănirea de iarnă și de primăvară timpurie.',
    ),
    variants: [
      {
        sku: 'CANDY-1KG',
        name: '1 кг',
        priceMinor: 6500,
        stock: { chisinau: 60, balti: 20 },
      },
    ],
  },
];
